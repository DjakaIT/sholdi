# Sholdi — Architecture

Verified against current releases as of **2 September 2026**. Where a version is pinned, it's pinned for a reason stated inline.

---

## 1. Stack decisions

| Layer | Choice | Why this and not the alternative |
|---|---|---|
| Framework | **Expo SDK 57**, pinned `>=57.0.9` | RN 0.86, React 19.2. SDK 57 is a small non-breaking release over 56. **Pin ≥57.0.9:** earlier 57.x inherited a Hermes V1 memory regression from SDK 56 that badly affects apps importing `react-native-reanimated` or `react-native-worklets` — which this app does. 57.0.9 ships RN 0.86.2 and fixes it. |
| Language | TypeScript, `strict: true` | Non-negotiable; the AI extraction layer depends on typed contracts. |
| Navigation | **Expo Router** (file-based) | As of SDK 56, Expo Router no longer depends on React Navigation. Do **not** install `@react-navigation/*` — you'd be fighting the framework. |
| Server state | **TanStack Query v5** | Caching, retries, optimistic updates for expense edits. |
| Client state | **Zustand** | Month selector, sheet open/closed, draft expense. Small stores only. |
| Backend | **Supabase** — Postgres + RLS, Auth, Storage, Edge Functions, `pg_cron` | One product covers database, auth, file storage for statements/receipts, and the server-side runtime for AI calls. |
| AI | **Anthropic API, server-side only** | See §4. |
| Charts | **`react-native-svg` only** | v1 needs one sparkline, some proportional bars, and a flexbox mosaic. Victory Native XL is excellent but is a Skia + Reanimated + Gesture Handler dependency chain for a curve you can draw with one `<Path>`. Add it later if a genuinely interactive chart appears. |
| Animation | `react-native-reanimated` (bundled with SDK 57) | Four animations total — see DESIGN.md §8. |
| Icons | `lucide-react-native` | Stroke-based, matches the 1.6px stroke language. |
| Fonts | `@expo-google-fonts/space-grotesk` | OFL licensed, free for commercial use. |
| Local cache | `react-native-mmkv` | Persist the TanStack Query cache so the app opens with last month's data offline. |
| Subscriptions | RevenueCat | **v2.** Do not build this in the first pass. |
| Analytics | PostHog | **v2.** |

**Build type:** you need a development build (`npx expo run:ios` / `run:android` or EAS Build). Not a blocker, just plan for it.

---

## 2. Project structure

```
app/                            # Expo Router — routes only, thin
  _layout.tsx                   # Fonts, providers, auth gate
  (auth)/
    sign-in.tsx
  (tabs)/
    _layout.tsx                 # Bottom nav (overline indicator)
    index.tsx                   # Home
    stats.tsx
    ask.tsx                     # Chat
    categories.tsx              # The Index (mosaic)
  add/
    _layout.tsx                 # Presented as a bottom sheet
    index.tsx                   # Four-tile chooser
    scan.tsx  speak.tsx  type.tsx  pdf.tsx
  import/[importId].tsx         # PDF review screen
  insight/[insightId].tsx
  month/[month].tsx             # Payday deep-link target

src/
  theme/
    tokens.ts                   # Colours, spacing, radii — from DESIGN.md
    type.ts                     # Type scale
    categoryColors.ts           # Category → colour map + auto-assign
  components/
    Caron.tsx                   # The brand mark. Used for every Sholdi utterance.
    Amount.tsx                  # Hero + inline money, tabular figures
    Sparkline.tsx
    CategoryBlock.tsx
    InsightCard.tsx
    Button.tsx                  # Fixed 43px height variants
    TabBar.tsx
  features/
    expenses/                   # queries, mutations, types
    imports/
    insights/
    chat/
    categories/
  lib/
    supabase.ts
    money.ts                    # Integer cents helpers. No floats. Ever.
    dates.ts
  stores/
    useMonthStore.ts
    useDraftExpenseStore.ts

supabase/
  migrations/
  functions/
    extract-statement/
    extract-receipt/
    extract-text/
    transcribe-voice/
    ask-sholdi/
    generate-insights/
```

Routes stay thin: fetch via a hook from `features/`, render components. No business logic in `app/`.

---

## 3. Data model

All money is **integer cents** (`amount_cents bigint`). Never floats, never `numeric` round-trips through JS. All tables carry `user_id uuid references auth.users` and have RLS enabled with a `user_id = auth.uid()` policy — no exceptions.

```sql
categories (
  id, user_id, name text, color_token text, icon text,
  is_system boolean default false, created_at
)

expenses (
  id, user_id,
  amount_cents bigint not null,
  currency char(3) default 'EUR',
  merchant text,
  description text,
  occurred_on date not null,
  category_id references categories,
  source text check (source in ('pdf','receipt','voice','text','photo','manual')),
  confidence real,                    -- 0..1 from the model
  import_id references imports,
  needs_review boolean default false, -- true when confidence < 0.8
  created_at
)

imports (
  id, user_id,
  source_type text,
  storage_path text,
  status text check (status in ('uploaded','extracting','ready','imported','failed')),
  period_start date, period_end date,
  expense_count int,
  error text,
  created_at
)

insights (
  id, user_id,
  kind text check (kind in ('trend','alternative','goal','celebration')),
  title text, body text,
  category_id references categories,
  payload jsonb,                      -- e.g. product comparison data
  status text check (status in ('pending','delivered','acted','dismissed')),
  deliver_after timestamptz,
  created_at
)

goals (
  id, user_id, name text,
  target_cents bigint, saved_cents bigint default 0,
  target_date date, created_at
)
```

Add a `monthly_category_totals` view (or materialised view refreshed on write) for the Index screen — do not compute the mosaic client-side over the raw expense table.

**Indexes:** `expenses (user_id, occurred_on desc)` and `expenses (user_id, category_id, occurred_on)`. The whole app queries by user+month.

---

## 4. The AI layer

### 4.1 The rule

**No Anthropic API key ever reaches the device.** Every AI call goes through a Supabase Edge Function holding the key as a secret. A key in an Expo bundle is a public key — `EXPO_PUBLIC_*` vars are readable by anyone with the APK.

### 4.2 The unifying contract

Every input path — PDF, receipt photo, voice, typed text, arbitrary photo — resolves to the same shape. This single decision is what keeps the architecture simple:

```ts
type ExtractedExpense = {
  amount_cents: number;
  currency: string;              // ISO 4217, default 'EUR'
  merchant: string | null;
  description: string | null;
  occurred_on: string;           // 'YYYY-MM-DD'
  suggested_category: string;    // matched to existing names where possible
  confidence: number;            // 0..1
};
```

Voice is just text with a transcription step in front. Photos are just receipts. Write the normalisation once.

### 4.3 Models and API details

- Extraction (PDF, receipts, text): **`claude-sonnet-5`** — the right accuracy/cost balance for structured extraction.
- Chat and insight generation: **`claude-sonnet-5`**.
- Use **structured outputs** so you never parse malformed JSON: pass `output_format` with `type: "json_schema"` and send the beta header `anthropic-beta: structured-outputs-2025-11-13`. Confirm current model support in the docs before wiring it, and keep a tool-use fallback (a single tool whose `input_schema` is your schema) since that path is stable and needs no beta header.
- **Structured outputs guarantee shape, not truth.** Always validate semantically: dates within the statement period, amounts positive, sum reconciles against the statement total when available.

### 4.4 PDF handling

Current API limits: **32MB max request size**, **600 pages** (100 for 200k-context models). Bank statements are far under this, but:
- Upload to Supabase Storage first, then have the Edge Function fetch and forward. Don't push base64 PDFs through the phone twice.
- For files over ~5MB or many pages, use the Files API and reference by `file_id` to keep payloads small.
- Reject encrypted/password-protected PDFs at upload with a clear message — the API can't read them.
- Dense statements can exhaust context before hitting the page limit. Chunk by page range and merge results.

### 4.5 Edge Functions

| Function | Trigger | Does |
|---|---|---|
| `extract-statement` | client, after upload | PDF → `ExtractedExpense[]` + proposed categories → writes `imports` row |
| `extract-receipt` | client | image → single `ExtractedExpense` |
| `extract-text` | client | free text → single `ExtractedExpense` |
| `transcribe-voice` | client | audio → transcript → calls `extract-text` |
| `ask-sholdi` | client | question + user's spending summary (not raw rows) → answer |
| `generate-insights` | `pg_cron`, weekly | pattern detection → writes `insights` rows |

For `ask-sholdi`, send an aggregated summary — monthly totals per category, trends, goals — not the full expense table. Cheaper, faster, and less personal data in flight.

### 4.6 The insight engine (the part that makes or breaks the product)

This must be **scheduled and rate-limited**, never reactive:

1. `pg_cron` runs `generate-insights` weekly.
2. Query aggregates for patterns: category rising ≥3 consecutive months; a single merchant repeated with above-median spend; a category down two months (a *celebration* insight — ship these, they're what earn trust).
3. Only create an insight when a threshold is crossed. **Hard cap: 3 delivered per calendar month.** Enforce in SQL, not in the prompt.
4. Insert with `deliver_after` so notifications are spaced out.
5. Push via Expo Notifications.

The product-comparison feature (the MyProtein example) needs a web search step server-side. **Defer to v2** — it is the flakiest, most expensive part and the PDF import is the feature that actually wins users.

---

## 5. The flow that must be perfect

```
Upload PDF → extract → review screen → confirm → done
```

Target: **under two minutes from install to a categorised month.** If a user has to correct more than a handful of the 47 rows, the promise is broken. Track extraction accuracy from day one — log every user edit on the review screen as a training signal for prompt tuning.

Design the review screen for correction speed: tapping a category label opens a picker inline, never a new screen.

---

## 6. Build order

1. Theme tokens, `Caron`, `Button`, `Amount`, tab bar. Static Home with mock data.
2. Supabase project, schema, RLS, auth, session persistence via `expo-secure-store`.
3. Manual expense entry + categories CRUD. **Now the app is usable without any AI.**
4. `extract-text` Edge Function → the "Type it" tile. Smallest possible AI loop, end to end.
5. PDF upload → `extract-statement` → review screen → bulk import. **This is the product.**
6. Receipt scan, then voice.
7. The Index mosaic and month comparison.
8. Insight engine + push notifications.
9. RevenueCat, analytics, polish.

Ship steps 1–5 before touching anything else.

---

## 7. Things that will bite you

- **Floats and money.** Integer cents everywhere, formatted only at render.
- **Timezones.** Store `occurred_on` as a `date`, not `timestamptz`. A purchase on the 31st must not become the 1st.
- **Bank statement variety.** Every Croatian bank formats differently. Build a fixture folder of real anonymised statements and test extraction against all of them before launch.
- **Duplicate imports.** A user will upload the same statement twice. Deduplicate on `(user_id, occurred_on, amount_cents, merchant)`.
- **Extraction failure.** The model will sometimes return nothing useful. The review screen needs an empty state that lets the user add manually rather than a dead end.
- **Optimistic edits.** Category changes on the review screen must feel instant; reconcile in the background.
- **RLS from the first migration.** Retrofitting row-level security onto an existing schema is miserable.

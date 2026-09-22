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
    transactions/               # queries, mutations, types (every statement line, not only purchases)
    shared/                     # shared-purchase detection results, review prompt, confirm flow
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
    detect-shared-purchases/
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

transactions (
  id, user_id,
  kind text not null check (kind in (
    'purchase',        -- card purchase (POS), receipt, voice, typed entry
    'bill',            -- utility / invoice payment
    'fee',             -- bank fee
    'roundup',         -- round-up donation, folded into its parent purchase
    'atm_withdrawal', 'atm_deposit',
    'salary', 'income',
    'transfer_in', 'transfer_out',   -- to/from other people
    'own_transfer',    -- between the user's own accounts (e.g. Revolut)
    'investment'       -- brokerage top-ups (e.g. Trading 212); never spending
  )),
  amount_cents bigint not null,       -- SIGNED: negative = money out
  currency char(3) default 'EUR',
  orig_amount_cents bigint,           -- foreign purchases: 60,00 BAM ...
  orig_currency char(3),              -- ... charged as 30,68 EUR
  merchant_raw text,                  -- exactly as printed on the statement
  merchant text,                      -- normalised; key into merchant_patterns
  counterparty text,                  -- person name, for transfer_in / transfer_out
  occurred_on date not null,          -- the PURCHASE date, not the value date
  value_date date,                    -- when the bank booked it
  auth_code text,                     -- card authorisation code (ACode)
  bank_ref text,                      -- statement reference number
  parent_id references transactions,  -- roundup -> the purchase it belongs to
  category_id references categories,
  user_share_cents bigint,            -- null = the whole amount is the user's
  source text check (source in ('pdf','receipt','voice','text','photo','manual')),
  confidence real,                    -- 0..1
  import_id references imports,
  needs_review boolean default false,
  created_at
)

-- Spending is a VIEW, never a table:
--   kind in ('purchase','bill','fee'), roundups folded into their parent,
--   effective cost = coalesce(user_share_cents, -amount_cents).
-- salary / income / transfers / own_transfer / atm / investment never count as spending or income by default.

shared_purchases (
  id, user_id,
  purchase_id references transactions unique,
  status text not null check (status in ('suggested','confirmed','rejected')),
  confidence text check (confidence in ('high','medium')),
  signals jsonb,                      -- why it was flagged; for debugging and tuning
  user_share_cents bigint,            -- written on confirm
  note text,                          -- e.g. "rođendanski poklon"
  created_at, resolved_at
)

shared_purchase_transfers (
  shared_purchase_id references shared_purchases on delete cascade,
  transfer_id references transactions,  -- transfer_in or transfer_out rows
  preselected boolean not null,         -- what the detector proposed
  confirmed boolean,                    -- what the user kept (null until resolved)
  primary key (shared_purchase_id, transfer_id)
)
-- A transfer can be confirmed against at most one shared purchase:
-- create unique index on shared_purchase_transfers (transfer_id) where confirmed;

shared_circles (
  id, user_id,
  members text[] not null,            -- normalised counterparty names
  times_confirmed int default 1,
  last_confirmed_on date
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

**Indexes:** `transactions (user_id, occurred_on desc)`, `transactions (user_id, kind, occurred_on)` and `transactions (user_id, category_id, occurred_on)`. The whole app queries by user+month.

**Deduplication keys:** card rows on `(user_id, auth_code, amount_cents)`; other statement rows on `(user_id, bank_ref, value_date)`. Never dedupe on `(occurred_on, amount, merchant)` — two identical €6,70 canteen lunches on the same day are two real purchases.

> The model above was validated against a real OTP banka statement (August 2026, 172 lines). Only 79 of the 172 lines were purchases; 57 were round-ups, 25 were person-to-person transfers. A purchases-only table cannot represent a real month.

---

## 4. The AI layer

> **Read `COST-CONTROLS.md` before implementing any Edge Function.** It defines the compact wire format, merchant memory, model routing, quotas and the circuit breaker. Those are not optimisations to add later — they change the shape of the code you write here.

### 4.1 The rule

**No Anthropic API key ever reaches the device.** Every AI call goes through a Supabase Edge Function holding the key as a secret. A key in an Expo bundle is a public key — `EXPO_PUBLIC_*` vars are readable by anyone with the APK.

Every Edge Function follows the same sequence: check quota → check circuit breaker → resolve locally what can be resolved → call the model with only the remainder → log to `usage_events`.

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

**Statements use a different path.** Text-based bank PDFs are parsed deterministically, not by the model — one parser per bank, each returning:

```ts
type ParsedTransaction = {
  kind: TransactionKind;         // see the transactions table
  amount_cents: number;          // signed
  currency: string;
  orig_amount_cents?: number;
  orig_currency?: string;
  merchant_raw?: string;
  counterparty?: string;         // transfers only
  occurred_on: string;           // purchase date from the descriptor, e.g. "(31.07.,ACode:…)"
  value_date: string;
  auth_code?: string;
  bank_ref: string;
  balance_after_cents: number;   // used for reconciliation, not stored
};
```

Before anything is written, the parser output must pass **three validations**, and the import fails loudly if any of them do:
1. `opening_balance + sum(amounts) == closing_balance`, to the cent.
2. The running balance matches `balance_after_cents` on every line.
3. Bank reference numbers are contiguous — no gaps.

This is not optional. On the first real statement tested, an early parser version silently found 27 of 172 transactions; validation 1 caught it immediately. The model is only ever sent the normalised names of merchants that `merchant_patterns` doesn't already know.

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
| `extract-statement` | client, after upload | PDF text → bank parser → `ParsedTransaction[]` → 3 validations → merchant memory → model categorises unknown names only → writes `imports` row, then calls `detect-shared-purchases` |
| `extract-receipt` | client | image → single `ExtractedExpense` |
| `extract-text` | client | free text → single `ExtractedExpense` |
| `transcribe-voice` | client | audio → transcript → calls `extract-text` |
| `ask-sholdi` | client | question + user's spending summary (not raw rows) → answer |
| `generate-insights` | `pg_cron`, weekly | pattern detection → writes `insights` rows |
| `detect-shared-purchases` | after every import + `pg_cron` daily | deterministic; no model call — see §4.7 |

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

### 4.7 Shared purchases

**The problem.** People regularly pay by card for something bought on behalf of a group — a birthday present, a dinner, tickets — and get paid back by transfer. Every expense app counts the full card amount as the user's spending and the paybacks as income. Both are wrong. On the real August statement used to validate this spec, two group birthday presents (€191,67 and €130,00) made up 28% of the month's apparent spending; the user's actual share was a small fraction of that.

**The principle: the code detects, the user decides.** Detection is reliable. Automatically computing the user's share is not (see "What does not work" below). So the app proposes, preselects its best guess, and asks — one tap to confirm.

#### Detection (deterministic — no model call)

`detect-shared-purchases` runs after every import and daily via `pg_cron`, over a **trailing 45-day window**. Paybacks often arrive after the purchase and can land on the *next* month's statement, so detection cannot be a one-shot step at import time.

1. **Anchor candidates.** Purchases where `-amount_cents >= 7500` (or ≥3× the user's median purchase, whichever is lower), whose category is not everyday spending (groceries, fuel, bills, subscriptions, telecom, pharmacy), and that have no `shared_purchases` row yet.
2. **Transfer window.** `transfer_in` and `transfer_out` rows from **5 days before** to **10 days after** the anchor's `occurred_on`. Exclude `own_transfer` — money from the user's own accounts is the user's share, not a payback.
3. **Net per person.** Sum transfers per `counterparty` inside the window. Someone who sent €10 and was later sent €10 back contributes €0. (Real data: four of the eleven people who chipped in for one present were refunded €10 days later.)
4. **Score.**
   - **High** — ≥3 *distinct* counterparties sent the *same* amount inside the window. This is the collection signature and was unambiguous on real data.
   - **Medium** — ≥2 distinct counterparties with positive net, together covering 50–110% of the purchase.
   - **Boost** — the counterparties overlap ≥50% with a confirmed `shared_circles` row. Promotes medium to high.
   - **Penalty** — a counterparty with ≥4 transfers per month in either direction is a routine cost-sharing partner; their transfers count at half weight, because they are weak evidence of any single purchase.
   - Anything else: **no suggestion**. Silence is better than a wrong question.
5. **Assign transfers once.** A transfer is preselected for at most one anchor — the nearest in time.

Write the result as `shared_purchases (status='suggested')` plus its `shared_purchase_transfers (preselected=true)`, with the raw signals in `signals` for tuning.

#### What does not work — do not build this

**Subset-sum matching** ("find the combination of nearby transfers that best adds up to the purchase") looks clever and is wrong. With a dozen transfers in the window there is almost always *some* combination close to any amount. On the real statement it matched the €130 purchase to exactly €130,00 by pulling in unrelated transfers, implying a user share of €0 — which was false. Use subset-sum only to *rank* preselection, never to decide or to compute a final share without confirmation.

Always check **distinct** counterparties. Two €50 transfers from the same person are not a group collection.

#### The question

Shown on the import review screen, **before** the month summary — a month whose largest block is an unresolved purchase is a wrong month. Also shown in the Notes feed if detected later. Copy and layout: `DESIGN.md` §6.9.

- **Yes** → a list of the candidate transfers, preselected ones already ticked. The user unticks what doesn't belong. Share = purchase − sum(confirmed nets). Optional free-text note.
- **No** → `status='rejected'`. Never ask about that purchase again.
- Ignored → stays `suggested`. Never re-notify.

Shared-purchase questions are review prompts, **not insights** — they do not count against the 3-per-month insight cap. They do have their own cap: at most 3 open questions at once, highest amount first.

#### On confirm

- `transactions.user_share_cents` on the purchase = the computed share. The spending view uses it automatically.
- Confirmed transfers are excluded from income for the month.
- Category suggestion: "Pokloni" if the note or merchant suggests it, otherwise keep the existing one.
- Upsert `shared_circles` with the confirmed counterparties; increment `times_confirmed`.

#### Where the model is used

Only for reading the optional free-text note ("poklon za rođendan, moj dio 20 €") into `{category, user_share_cents}` — one Haiku call, `max_tokens` 100, logged to `usage_events` like every other call. Detection and scoring never call the model.

#### Validation against the real statement

| Purchase | Detector result | Correct? |
|---|---|---|
| Supernova info pult €130,00 | High — 12 transfers of €10,00 from 11 distinct people within 2 days | Yes |
| SD Zadar €191,67 | Medium — paybacks mostly from one routine cost-sharing partner | Yes, correctly less certain |
| Lidl €54,74 | Not an anchor (groceries, under threshold) | Yes |

Put the anonymised version of this statement in `fixtures/` with the expected detection results, and keep this table passing.

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
2. Supabase project, schema, RLS, auth, session persistence via `expo-secure-store`. Include `usage_events`, `usage_quotas` and `merchant_patterns` from `COST-CONTROLS.md` in this first migration — retrofitting metering later means rewriting every Edge Function.
3. Manual expense entry + categories CRUD. **Now the app is usable without any AI.**
4. `extract-text` Edge Function → the "Type it" tile. Smallest possible AI loop, end to end — and the place to establish the shared helper that does quota check, breaker check, `max_tokens`, and `usage_events` logging. Every later function reuses it.
5. PDF upload → `extract-statement` → review screen → bulk import. **This is the product.** Merchant memory ships with this step, not after it: match locally first, send only unmatched lines to the model, and write user corrections back from the review screen.
6. Shared-purchase detection and the review question (§4.7). Without it, the month total is wrong for anyone who ever pays for a group — on the first real statement tested it overstated spending by roughly a quarter.
7. Receipt scan, then voice.
8. The Index mosaic and month comparison.
9. Insight engine + push notifications.
10. RevenueCat, analytics, polish.

Ship steps 1–6 before touching anything else.

---

## 7. Things that will bite you

- **Floats and money.** Integer cents everywhere, formatted only at render.
- **Timezones.** Store `occurred_on` as a `date`, not `timestamptz`. A purchase on the 31st must not become the 1st.
- **Bank statement variety.** Every Croatian bank formats differently. Build a fixture folder of real anonymised statements and test extraction against all of them before launch.
- **Duplicate imports.** A user will upload the same statement twice, and statements overlap at month boundaries. Deduplicate on the keys in §3 (`auth_code` for card rows), never on date + amount + merchant.
- **Not every line is spending.** Round-ups, transfers, own-account moves, cash, and brokerage top-ups must never reach the spending view. Classify `kind` before categorising anything.
- **Purchase date ≠ value date.** Card purchases carry their real date in the descriptor. On the real August statement, two purchases from 31 July appear — they belong to July.
- **Merchant normalisation leaks IDs.** Strip every token containing a digit. On real data, `MULLER 4983 ZADAR 2` became `muller 2` and Spotify kept its reference `p45cd86032` — both would have created duplicate "new" merchants the following month.
- **Public repos and real statements.** A real statement contains an OIB, an IBAN, an address, and other people's names. Only anonymised copies go in `fixtures/`.
- **Extraction failure.** The model will sometimes return nothing useful. The review screen needs an empty state that lets the user add manually rather than a dead end.
- **Optimistic edits.** Category changes on the review screen must feel instant; reconcile in the background.
- **RLS from the first migration.** Retrofitting row-level security onto an existing schema is miserable.

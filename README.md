# Sholdi

An expense tracker you never set up by hand. You upload the monthly PDF statement
from your banking app and it extracts, categorises and analyses every transaction.
You can also scan a receipt, speak, type plain words, or drop any photo — all five
inputs resolve to one normalised shape.

*Šoldi* is Dalmatian dialect for money, from Venetian *soldi*. The caron dropped when
the spelling was internationalised became the logo, and in-app it marks every line
Sholdi speaks.

**`DESIGN.md` and `ARCHITECTURE.md` are the source of truth.** They win over
framework defaults and over anything in this file. If something isn't covered there,
ask rather than invent it.

---

## Running the app

**A development build is required** — see ARCHITECTURE.md §1. Expo Go will not work:
`react-native-mmkv` v4 is a Nitro native module that Expo Go does not bundle, and it
loads at startup via the query cache, so the app crashes immediately.

### Android

One-time, if `ANDROID_HOME` is not already set (PowerShell, then reopen the terminal):

```powershell
[Environment]::SetEnvironmentVariable("ANDROID_HOME", "$env:LOCALAPPDATA\Android\Sdk", "User")
```

Then:

```powershell
emulator -avd <your-avd>     # or plug in a phone with USB debugging
npm run android              # expo run:android — generates android/ and builds
```

The first run is slow (full Gradle build); after that it is incremental. `android/`
and `ios/` are generated build artifacts and are gitignored — never edit them by hand,
since `expo prebuild` regenerates them from `app.json`.

### Web, for quick visual checks

```bash
npm run web
```

Useful for layout, copy and flow, and it is what the screenshots in this repo's
history came from. It is **not** a substitute for a device: the tab bar's safe-area
inset is always zero on web, the §6.3 sheet does not composite over a live Home the
way `transparentModal` does natively, and Reanimated takes a different path. Each of
those is somewhere web looks right and the phone may not.

| Command | What it does |
|---|---|
| `npm start` | Expo dev server |
| `npm run android` | Build + install the Android dev build |
| `npm run typecheck` | `tsc --noEmit` over the app (excludes `supabase/`, which is Deno) |
| `npm run web` | Web target, for visual checks |

---

## Backend — local-first

**Your spending never leaves the phone.** Every expense lives in SQLite on the device
(`src/lib/db.ts`). There is no cloud database, no account, and no sync.

This departs from ARCHITECTURE.md §3, which put expenses in Supabase Postgres behind
RLS. It was a considered change, not drift: the privacy story is the product.

What still leaves the device, and only for the duration of one request:

| What | When | Stored afterwards |
|---|---|---|
| A statement PDF | You import one | No |
| A receipt photo | You scan one | No |
| A typed note | You type one | No |
| Aggregated monthly totals | You ask a question, or an insight gets written | No |

Individual transactions are **never** sent for questions or insights — only totals per
category per month, which is what §4.5 asked for and is now enforced by what the app
sends rather than by what a server-side query chooses to select.

The one thing that cannot be local is the Anthropic API key. §4.1 is right that an
`EXPO_PUBLIC_*` var is readable by anyone with the APK, so a thin server holds the
key. It holds nothing else — the functions are stateless.

### Deploying the functions

```bash
cp .env.example .env      # functions URL and anon key
supabase link --project-ref <ref>
supabase secrets set ANTHROPIC_API_KEY=sk-ant-...

supabase functions deploy extract-text
supabase functions deploy extract-statement
supabase functions deploy extract-receipt
supabase functions deploy ask-sholdi
supabase functions deploy write-insight
```

No `supabase db push` — there is no schema to push.

| Function | Does |
|---|---|
| `extract-text` | free text → one expense |
| `extract-statement` | bank PDF → many |
| `extract-receipt` | photo → one (backs Scan and "drop any photo") |
| `ask-sholdi` | question + totals the device computed → answer |
| `write-insight` | a pattern the device detected → Sholdi's words for it |
| `transcribe-voice` | **not built** — see Open questions |

Insight *detection* runs on the device (`src/features/insights/patterns.ts`), so §4.6's
weekly `pg_cron` job is gone. What survives is what made it calm: detection is
threshold-first, so the model is never asked "is there anything here?", and the
3-per-month cap moved from a database trigger into device code.

**On protecting the endpoint:** with no accounts there is no per-user auth left. What
remains is Supabase's default JWT gate, satisfied by the anon key. That key ships
inside the APK and can be extracted, so it stops a passer-by, not a determined one.
Put a spend cap on the Anthropic key before launch.

### Tests

```bash
deno test --config tests/deno.json tests/      # 33 — app logic
cd supabase/functions
deno check --config deno.json */index.ts
deno test --config deno.json _shared/          # 14 — function logic
```

47 tests over the pure logic: money (integer cents, rounding, sign handling), dates,
insight pattern detection, semantic validation, and the byte/PDF helpers. The Deno
files are excluded from the app's `tsconfig.json`, which is React Native and knows
nothing about `npm:` specifiers or `Deno`.

---

## Where the build is

Following ARCHITECTURE.md §6:

- **1. Theme, primitives, static Home** — done.
- **2. Storage** — done, and rescoped. SQLite schema, seeded categories, and the
  repository that replaces the `monthly_category_totals` view. No auth needed.
- **3. Manual entry + categories CRUD** — not started. This is the next thing worth
  doing: it is what makes the app usable without any AI at all, and nothing can be
  seen on real data until there is a way to put data in.
- **4. `extract-text`** — written, unverified against the live API.
- **5. PDF upload → `extract-statement` → review → import** — function and review
  screen written; the upload step and bulk import are not wired.
- **6. Receipt, then voice** — `extract-receipt` written; voice blocked, see below.
- **7. Index mosaic and month comparison** — mosaic built; comparison not started.
- **8. Insight engine + push** — engine and weekly schedule written; push not wired,
  rows land as `pending` with a `deliver_after`.
- **9. RevenueCat, analytics** — not started, and explicitly v2 in §1.

Screens built against mock data: splash (§6.1), Home (§6.2), Add sheet (§6.3), import
review (§6.4), notes (§6.5), chat (§6.6), the Index (§6.7). Mock data lives in
`src/features/*/mockData.ts` and is designed to be replaced by a query, not rewritten —
the month figures reconcile across every screen (the totals sum to the hero amount,
and the deltas match the insight copy).

Nothing in the app talks to Supabase yet. Every screen reads a plain object, so
step 2 is a swap rather than a rewrite.

## Open questions

Things the documents don't settle. Each carries a chosen default rather than a
blocked task, but they are all one edit to change:

- **Voice input has no transcription provider.** §4.5 lists a `transcribe-voice`
  function ("audio → transcript → calls extract-text"), but the Claude API does not
  accept audio and no speech-to-text vendor is named anywhere. Rather than pick one
  silently, it is unbuilt. Worth considering: on-device recognition on both platforms
  removes the vendor, the cost, and the privacy surface entirely, and makes "Say it"
  just `extract-text` with a microphone in front — which is what §4.2 already says
  voice is.
- **The Stats tab has no design.** §5.2 puts Stats in the nav, but §6 specifies seven
  screens and Stats is not among them. It is an empty placeholder.
- **Category icons** (`src/theme/categoryIcons.ts`) — §6.7 requires an icon per
  category but never says which. Current picks are proposals.
- **Sparkline series** — currently the last 12 monthly totals, so the end dot is the
  current month. Could equally be daily spend within the month.
- **Sholdi's voice size** — §3 says 13.5, §6.2 says 12.5 for the home insight row.
  Using the screen-specific value; both are recorded in `src/theme/type.ts`.
- **`app/insight/index.tsx`** — §6.5 describes a two-card screen but §2 lists only
  `insight/[insightId]`. Added a list route; the deep-link target is still to build.
- **`ARCHITECTURE.md` §4.3 is out of date on structured outputs.** It specifies
  `output_format` plus a beta header; that parameter no longer exists, and the current
  API is `output_config: { format: … }` on the regular Messages API with no beta
  header. The code uses the current shape and keeps the tool-use fallback §4.3 asks
  for. Worth correcting in the document.

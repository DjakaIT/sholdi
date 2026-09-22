# Sholdi — AI Cost Controls

Companion to `ARCHITECTURE.md` §4. Every AI call in this app is governed by this document. Rates verified September 2026 — re-check against Anthropic's pricing page before relying on the numbers.

---

## 1. Where the money actually goes

Current rates per million tokens (input / output):

| Model | Input | Output |
|---|---|---|
| `claude-haiku-4-5-20251001` | $1 | $5 |
| `claude-sonnet-5` | $2 | $10 |
| `claude-opus-5` | $5 | $25 |

Sonnet 5's $2/$10 was introductory pricing through 31 August 2026; Anthropic made it the standard price, so the scheduled rise to $3/$15 did not happen.

**The non-obvious part: for statement extraction, output costs more than input.**

A 5-page PDF statement is roughly 12k input tokens (~$0.024 on Sonnet 5). Describing 47 transactions in verbose JSON is roughly 3.5k output tokens (~$0.035). The document is cheap. Describing it is not.

Optimise output first, input second.

---

## 2. Compact wire format (do this)

> **Update after testing on a real statement:** text-based bank PDFs no longer go through the model at all — a deterministic parser per bank extracts every line, and the model only receives the normalised names of merchants it hasn't seen (`ARCHITECTURE.md` §4.2). On the August 2026 OTP statement that was 6 names out of 79 purchases. The compact format below still applies to **scanned statements** (the vision fallback), receipts, and the merchant-categorisation batch.

**Never have the model emit the full `ExtractedExpense` object.** Have it emit positional arrays, then expand server-side where it costs nothing.

Model returns:

```json
{
  "period": ["2026-08-01", "2026-08-31"],
  "currency": "EUR",
  "tx": [
    [3820, "Konzum", "08-03", "GRO", 95],
    [6200, "INA", "08-05", "FUE", 98],
    [740, "Bolt", "08-09", "TRA", 92]
  ]
}
```

Field order is fixed and documented in the system prompt: `[amount_cents, merchant, MM-DD, category_code, confidence_pct]`.

- Year comes from `period`, so dates cost 5 characters not 10.
- `currency` is stated once, not per row.
- Category codes are three letters, mapped server-side.
- Omit `description` entirely — it's almost always redundant with `merchant` on a bank statement.
- Confidence is an integer 0–100, not a float.

This is roughly **60% fewer output tokens** than the expanded form for the same information. The Edge Function expands each row into `ExtractedExpense` before writing to Postgres. The app layer never sees the compact form.

Keep `max_tokens` capped per call type: receipts 300, text entry 200, statements 4000, chat 800.

---

## 3. Merchant memory — the biggest structural saving

After a user's first statement, most merchants repeat. Categorising Konzum for the fortieth time should cost nothing.

```sql
merchant_patterns (
  id, user_id,
  pattern text not null,          -- normalised merchant string
  category_id references categories,
  hit_count int default 1,
  last_seen_at timestamptz,
  source text check (source in ('ai','user')),  -- user corrections win forever
  created_at,
  unique (user_id, pattern)
)
```

**Resolution order for every extracted transaction:**

1. Normalise the merchant string: uppercase, strip punctuation, collapse whitespace, strip trailing store numbers and city names (`KONZUM 4471 ZADAR` → `KONZUM`).
2. Exact match against `merchant_patterns` → assign category, `confidence = 100`, **no AI call**.
3. Fuzzy match (trigram similarity ≥ 0.85, via `pg_trgm`) → assign, `confidence = 90`.
4. No match → include this row in the batch sent to the model.

When the user corrects a category on the review screen, upsert the pattern with `source = 'user'`. User-sourced patterns are never overwritten by AI suggestions.

**Effect:** month one, every merchant is unknown. Month three, typically 80%+ resolve locally, so you're only paying to classify genuinely new merchants. The app gets cheaper the longer someone uses it.

For a text-based PDF this means the flow becomes: parse text server-side → resolve known merchants in Postgres → send only the unknown remainder to Claude. A returning user's statement may cost under a cent.

---

## 4. Model routing

| Call | Model | Why |
|---|---|---|
| `extract-receipt` | `claude-haiku-4-5-20251001` | Single transaction from an image. Haiku is half the price and accurate enough. |
| `extract-text` | `claude-haiku-4-5-20251001` | "38 euro Konzum" needs no reasoning. |
| `transcribe-voice` → then `extract-text` | — | Transcription is a separate provider; the extraction step is Haiku. |
| `extract-statement` | `claude-sonnet-5` | Multi-page layout reasoning, table structure, many rows. Worth the quality. |
| `ask-sholdi` | `claude-sonnet-5` | User-facing quality matters. |
| `generate-insights` | `claude-sonnet-5` via **Batch API** | Asynchronous by nature — take the 50% discount. |

Put the model ID in a single config object, never inline at call sites, so routing can change in one edit.

**Never use Opus for anything in this app.** Nothing here needs it.

---

## 5. Prompt caching

The extraction system prompt, the JSON schema, and the user's category list are identical across calls. Cache them.

- Cache reads cost 10% of base input; 5-minute cache writes cost 1.25x base, 1-hour writes 2x.
- Mark the system prompt + schema + category list as the cached prefix; put the statement text after it.
- Caching and the Batch API stack — use both on the insight job.

Worth enabling from the first paying user, not "later at scale."

---

## 6. Preprocessing before the model sees anything

- **Extract text server-side first.** Most bank statements are text PDFs, not scans. If text extraction yields a plausible transaction table, send text and skip the vision path entirely. Only fall back to sending the PDF when text extraction comes back empty or garbled (a scanned statement).
- **Hash and deduplicate.** `sha256` of the uploaded file, stored on `imports`. Same hash for the same user → return the existing import, zero cost. Users re-upload constantly.
- **Validate client-side.** Reject empty input, missing amounts, and encrypted PDFs before any call.
- **Never ask the model for arithmetic.** Totals, percentages, month-over-month deltas, category shares — all SQL. The model extracts and interprets; Postgres counts.
- **Send aggregates, not rows, to `ask-sholdi`.** A monthly summary per category plus goals is a few hundred tokens. The raw expense table is tens of thousands.

---

## 7. Quotas

Enforced in Postgres with a check before the Edge Function calls out — never in the prompt, never client-side only.

| Limit | Free | Paid |
|---|---|---|
| Statement imports / month | 1 | 5 |
| Receipt scans / month | 10 | 200 (fair use) |
| Text or voice entries / day | 20 | 200 |
| Chat messages / day | 5 | 50 |
| Insights / month | 3 | 3 |

The free tier deliberately includes one statement import — that's the moment that sells the app, so don't paywall it.

The insight cap is a **product rule, not a cost rule**, and is identical on both tiers. `DESIGN.md` states "2–3 notes a month, max" in the UI; that promise is enforced here.

```sql
usage_quotas (
  user_id, period_start date,
  statements_used int default 0,
  receipts_used int default 0,
  entries_used int default 0,
  chat_used int default 0,
  unique (user_id, period_start)
)
```

Increment inside the same transaction that records the result. When a quota is hit, return a typed error the UI can render as a clear upgrade prompt — never a generic failure.

---

## 8. Metering

Log every call. Without this you cannot find the user who is costing you €40 a month.

```sql
usage_events (
  id, user_id,
  function_name text,
  model text,
  input_tokens int, output_tokens int,
  cache_read_tokens int, cache_write_tokens int,
  estimated_cost_usd numeric(10,6),
  latency_ms int,
  success boolean, error text,
  created_at
)
```

Read token counts from the API response `usage` block; don't estimate them. Compute `estimated_cost_usd` from a rates table you can update when prices change.

Two views worth having from day one: cost per user per month, and cost per function per day.

---

## 9. Circuit breaker

Set a hard spend limit in the Anthropic Console. That's the backstop, not the plan — hitting it takes the app down.

Implement your own daily budget check in a shared Edge Function helper:

| Spend today | Behaviour |
|---|---|
| < 70% of budget | Normal |
| 70–90% | Chat disabled with an honest message; extraction still works |
| 90–100% | Statement imports queue for overnight batch processing; everything else disabled |
| > 100% | All AI paused; app remains fully usable for manual entry and browsing |

Degrade, never crash. The app must stay useful with the AI switched off entirely — which is also why build step 3 in `ARCHITECTURE.md` §6 delivers manual entry before any AI exists.

Keep a per-feature kill switch in a config table so you can disable chat or insights remotely without shipping a release.

---

## 10. Expected unit economics

Per active paying user per month, before caching and merchant memory:

| Item | Cost |
|---|---|
| 1 statement (Sonnet 5) | ~$0.05 |
| 5 receipts (Haiku) | ~$0.02 |
| 3 insights (Sonnet, batched, from aggregates) | ~$0.01 |
| 10 chat turns (Sonnet) | ~$0.11 |
| **Total** | **~$0.19** |

With prompt caching and merchant memory active from month two, expect roughly half that.

Chat is the only unbounded component, which is why it carries the tightest quota and is the first thing the circuit breaker disables.

---

## 11. Rules for whoever implements this

- Model IDs live in one config object. No inline model strings.
- Every Edge Function: check quota → check circuit breaker → resolve what you can locally → call the model with only what's left → log to `usage_events`.
- Every call sets an explicit `max_tokens`.
- The compact wire format is mandatory for `extract-statement`. Do not "simplify" it back to verbose JSON.
- User corrections always beat AI suggestions in `merchant_patterns`.
- If you are about to ask the model to add, divide, or compare numbers, write SQL instead.

/**
 * Request guards. COST-CONTROLS.md §9, and the gap §9 leaves open.
 *
 * ── What this protects against ────────────────────────────────────────────────
 * The anon key ships inside the APK and can be extracted (see http.ts). Until now
 * nothing stood between an extracted key and the Anthropic bill: a script could
 * post statements in a loop and every one would be read by Sonnet at full price.
 *
 * Two brakes live here.
 *
 * 1. **Payload limits, applied before anything is decoded.** The size checks in the
 *    handlers ran *after* `fromBase64()` had already expanded the whole string into
 *    memory, so a 200MB body was allocated and only then rejected — the check could
 *    not fire before the damage. Length is now checked on the encoded string, which
 *    costs nothing and happens first.
 *
 * 2. **A per-IP rate limit — which, as deployed, does almost nothing.**
 *
 *    This was written expecting a warm worker to accumulate counts between
 *    requests. It was then measured against the deployed project, and it does not:
 *    9 sequential requests and 30 concurrent ones all passed a limit of 6, because
 *    Supabase handed each one a fresh isolate with an empty Map.
 *
 *    It is kept because it costs nothing and does fire if an isolate is ever
 *    reused, but it must NOT be counted as a control. Anything that says "rate
 *    limited" and cannot be shown to refuse a request is worse than nothing — it
 *    buys confidence it has not earned.
 *
 *    Real enforcement needs state shared across isolates. The project already has
 *    Postgres provisioned; a table of (hashed caller, window, count) holds no
 *    spending data and would not touch the local-first promise, which is about the
 *    user's transactions and not about counters. That is a pending decision, not
 *    something to assume.
 *
 *    Until then the only hard ceiling on spend is the cap on the Anthropic key
 *    itself, which §9 calls "the backstop, not the plan". Right now it is the plan.
 *
 * §7 wants quotas in a database keyed by user. There is no database and no user
 * (ARCHITECTURE deviation in src/lib/db.ts), so per-user quotas are enforced on the
 * device in `src/features/usage/quota.ts`. This is the server half: it cannot know
 * who is calling, only how fast.
 */
import { HttpError } from './http.ts';

/**
 * Base64 inflates by 4/3. These are ceilings on the *encoded* string, so the
 * decoded payload stays under the limit each handler documents.
 */
export const MAX_BODY_CHARS = {
  /**
   * 25MB decoded — MAX_PDF_BYTES — plus the JSON envelope around it.
   *
   * 25MB base64-encodes to ~34.95M chars, so a ceiling of 34M would have refused a
   * statement that MAX_PDF_BYTES allows, with a message telling the user to try a
   * smaller file that was already small enough.
   */
  statement: 36_000_000,
  /** 10MB decoded, encoded to ~13.98M chars, plus the envelope. */
  receipt: 15_000_000,
  /** Text endpoints carry no payload worth measuring in megabytes. */
  small: 100_000,
} as const;

/**
 * Read and parse a JSON body, refusing anything implausibly large first.
 *
 * `Content-Length` is checked before the body is read at all, so an oversized
 * request never reaches `req.json()`.
 */
export async function readJsonBody(
  req: Request,
  maxChars: number
): Promise<Record<string, unknown>> {
  const declared = Number(req.headers.get('content-length') ?? '0');
  if (Number.isFinite(declared) && declared > maxChars) {
    throw new HttpError(413, 'That request is too large.');
  }

  const raw = await req.text();
  if (raw.length > maxChars) {
    throw new HttpError(413, 'That request is too large.');
  }

  try {
    const parsed = JSON.parse(raw);
    // An array passes `typeof === 'object'`, so it has to be excluded explicitly —
    // otherwise a handler reading `body.text` off an array gets undefined and
    // reports a missing field rather than a malformed body.
    const usable = parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed);
    return usable ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/**
 * Length of a base64 field, checked before it is decoded.
 *
 * Returns the approximate decoded size so a handler can still report in bytes.
 */
export function assertBase64Size(value: string, maxChars: number, message: string): number {
  if (value.length > maxChars) throw new HttpError(413, message);
  // Every 4 encoded chars are 3 bytes, less whatever padding is on the end.
  const padding = value.endsWith('==') ? 2 : value.endsWith('=') ? 1 : 0;
  return Math.floor((value.length * 3) / 4) - padding;
}

// ── Rate limiting ────────────────────────────────────────────────────────────

type Bucket = { count: number; resetAt: number };

/**
 * Per-isolate, per-caller counters.
 *
 * A plain Map: when the isolate is recycled the counts go with it, which is the
 * documented limitation above rather than an oversight.
 */
const buckets = new Map<string, Bucket>();

/** Keeps the map from growing without bound on a long-lived isolate. */
function sweep(now: number): void {
  if (buckets.size < 1000) return;
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

/**
 * Identify the caller as well as we can.
 *
 * There are no accounts, so this is the forwarded client IP. It is spoofable by
 * anyone who can set the header upstream of Supabase's edge — which is why this is
 * a brake, not a gate.
 */
function callerKey(req: Request): string {
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  return req.headers.get('cf-connecting-ip') ?? 'unknown';
}

export type RateLimit = {
  /** Requests allowed per window. */
  limit: number;
  /** Window length in milliseconds. */
  windowMs: number;
};

/**
 * Per-endpoint limits, set by what the call costs.
 *
 * Statements are Sonnet over a multi-page PDF and are the most expensive thing the
 * app can do, so they get the tightest limit. A real person importing statements
 * does it a few times a month, never a few times a minute.
 */
export const RATE_LIMITS: Record<string, RateLimit> = {
  statement: { limit: 6, windowMs: 60 * 60 * 1000 },
  receipt: { limit: 30, windowMs: 60 * 60 * 1000 },
  text: { limit: 60, windowMs: 60 * 60 * 1000 },
  chat: { limit: 20, windowMs: 60 * 60 * 1000 },
  insight: { limit: 20, windowMs: 60 * 60 * 1000 },
};

/**
 * Consume one unit of the caller's allowance, or throw 429.
 *
 * `now` is a parameter so the window can be tested without waiting an hour.
 *
 * Reminder from the header: in production this rarely fires, because the Map it
 * counts in usually starts empty. The tests below prove the *arithmetic* is right,
 * which is not the same as proving the limit is enforced.
 */
export function enforceRateLimit(
  req: Request,
  kind: keyof typeof RATE_LIMITS | string,
  now: number = Date.now()
): void {
  const rule = RATE_LIMITS[kind];
  if (!rule) return;

  const key = `${kind}:${callerKey(req)}`;
  const bucket = buckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    sweep(now);
    buckets.set(key, { count: 1, resetAt: now + rule.windowMs });
    return;
  }

  if (bucket.count >= rule.limit) {
    const minutes = Math.max(1, Math.ceil((bucket.resetAt - now) / 60_000));
    throw new HttpError(429, `Too many requests. Try again in about ${minutes} minutes.`);
  }

  bucket.count += 1;
}

/** Test seam: forget every counter. */
export function resetRateLimits(): void {
  buckets.clear();
}

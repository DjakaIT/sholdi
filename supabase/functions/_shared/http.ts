/**
 * HTTP plumbing for the Edge Functions.
 *
 * These functions are now STATELESS. They hold the Anthropic key (§4.1 — it can
 * never be on the device), take bytes in, return structured expenses, and write
 * nothing anywhere. No database, no storage bucket, no user record. The phone is
 * the only place a user's spending is kept.
 *
 * ── On protecting the endpoint ────────────────────────────────────────────────
 * With no user accounts there is no per-user authentication left. What remains is
 * Supabase's own gate: Edge Functions verify a JWT by default, and the app's anon
 * key satisfies it. That stops a passer-by, and the key is revocable and
 * rate-limited per project.
 *
 * It is NOT strong: the anon key ships inside the APK and can be extracted, so a
 * determined person could spend your Anthropic credits. What now stands behind it:
 * per-IP rate limits and payload ceilings in `guard.ts`, per-user daily quotas on
 * the device in `src/features/usage/quota.ts`, and a spend cap on the Anthropic key
 * — which §9 rightly calls the backstop rather than the plan.
 *
 * ── Why CORS is closed ────────────────────────────────────────────────────────
 * These headers used to allow any origin. Nothing needs that: the only client is a
 * native app, and React Native's fetch is not subject to CORS at all — it never
 * sends a preflight and never checks the response header. So the wildcard bought
 * the app nothing while letting any web page in any browser spend an extracted key
 * on the user's behalf, from the visitor's own IP.
 *
 * Browsers are now refused. `OPTIONS` still answers, because a rejected preflight
 * should be a clear refusal rather than a hang, but it advertises no origin.
 */

/**
 * Sent on every response. No `Access-Control-Allow-Origin`: its absence is what
 * makes a browser refuse to hand the response to a page's JavaScript.
 */
export const corsHeaders: Record<string, string> = {
  Vary: 'Origin',
};

export class HttpError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

/**
 * Wraps a handler with CORS preflight and error translation, so no function leaks a
 * stack trace — or worse, key material — to the client.
 */
export function serveJson(handler: (req: Request) => Promise<Response>) {
  return async (req: Request): Promise<Response> => {
    // Answered, but grants nothing: no allowed origin, so a browser stops here.
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });

    // Everything here takes a body. Refusing other verbs early keeps a stray GET
    // from reaching a handler that would fail on a missing one.
    if (req.method !== 'POST') {
      return json({ error: 'Use POST.' }, 405);
    }

    try {
      return await handler(req);
    } catch (error) {
      if (error instanceof HttpError) {
        return json({ error: error.message }, error.status);
      }
      // A misconfigured project is the likeliest failure and the least guessable,
      // so it is named rather than swallowed. It leaks no key material.
      if (error instanceof Error && error.name === 'TruncatedResponseError') {
        console.error(error.message);
        return json({ error: error.message }, 413);
      }

      if (error instanceof Error && error.name === 'MissingApiKeyError') {
        console.error(error.message);
        return json({ error: error.message }, 500);
      }

      // Include the cause. These messages describe request shape, not secrets —
      // the API key never appears in one — and an opaque "Something went wrong"
      // makes a deployed function undebuggable without log access.
      console.error('Unhandled error:', error);
      const detail = error instanceof Error ? error.message : String(error);
      return json({ error: 'Something went wrong', detail: detail.slice(0, 500) }, 500);
    }
  };
}

/**
 * The user's category names, sent by the app so extraction can match what already
 * exists (§4.2). They arrive in the request because the server has no database to
 * look them up in — which is the point.
 */
export function categoryNamesFrom(body: unknown): string[] {
  if (typeof body !== 'object' || body === null) return [];
  const { categories } = body as { categories?: unknown };
  if (!Array.isArray(categories)) return [];

  return categories
    .filter((c): c is string => typeof c === 'string' && c.trim().length > 0)
    .map((c) => c.trim())
    .slice(0, 50);
}

/** 'YYYY-MM-DD' from the device, so "yesterday" resolves in the user's timezone (§7). */
export function todayFrom(body: unknown): string {
  if (typeof body === 'object' && body !== null) {
    const { today } = body as { today?: unknown };
    if (typeof today === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(today)) return today;
  }
  return new Date().toISOString().slice(0, 10);
}

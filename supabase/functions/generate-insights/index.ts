/**
 * generate-insights — the insight engine. ARCHITECTURE.md §4.6.
 *
 * "This must be scheduled and rate-limited, never reactive." It is invoked weekly by
 * pg_cron, not by the app, and it is the only function here that is not called on
 * behalf of a signed-in user — so it authenticates with a shared secret and runs
 * with the service role.
 *
 * The order of §4.6 matters and is followed literally:
 *   2. Query aggregates for patterns.
 *   3. Only create an insight when a threshold is crossed.
 *   4. Insert with deliver_after so notifications are spaced out.
 *
 * The 3-per-month cap is NOT enforced here. It lives in a database trigger
 * (..._insight_cap.sql) because §4.6 says to enforce it in SQL — a prompt, or a
 * function that might be invoked twice, cannot be trusted with a promise the UI has
 * already made to the user.
 *
 * Push delivery (§4.6 step 5) is not wired yet; rows land with `deliver_after` set
 * and status 'pending'.
 */
import { createClient } from 'npm:@supabase/supabase-js@^2.115.0';
import type { SupabaseClient } from 'npm:@supabase/supabase-js@^2.115.0';

import { anthropic, DEFAULT_MAX_TOKENS, EXTRACTION_MODEL } from '../_shared/anthropic.ts';
import { HttpError, json, serveJson } from '../_shared/auth.ts';
import { findPattern, toSeries } from '../_shared/patterns.ts';


const SYSTEM = `You are Sholdi. You write one short observation about a spending pattern.

Voice (DESIGN.md §7):
- Calm, brief, on the user's side. You observe; you do not instruct.
- Lead with the win.
- Never moralise. "No judgement, just worth a glance before pair four." is the register.
- Credit the user, not the app: "nice work", never "you followed our advice".
- Active voice, sentence case, plain verbs.

Never write: "AI", "smart", "powered by", "insights engine", exclamation marks, or emoji.

Return a title of at most six words and a body of one or two sentences. The body must
not repeat the title. Use only the figures given; never invent one.`;

const INSIGHT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['title', 'body'],
  properties: {
    title: { type: 'string', description: 'At most six words. Sentence case.' },
    body: { type: 'string', description: 'One or two sentences in Sholdi\'s voice.' },
  },
} as const;

Deno.serve(
  serveJson(async (req) => {
    // pg_cron calls this, not a user. A shared secret keeps it from being a public
    // endpoint that anyone can make expensive.
    const expected = Deno.env.get('CRON_SECRET');
    if (!expected) throw new HttpError(500, 'CRON_SECRET is not configured');
    if (req.headers.get('x-cron-secret') !== expected) {
      throw new HttpError(401, 'Not authorised');
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      // Service role: this runs for every user, so it deliberately bypasses RLS.
      // Every query below therefore filters by user_id explicitly.
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const body = await req.json().catch(() => ({}));
    const onlyUser = typeof body.userId === 'string' ? body.userId : null;

    const { data: users, error: usersError } = await supabase
      .from('categories')
      .select('user_id')
      .limit(10_000);

    if (usersError) throw new HttpError(500, `Could not list users: ${usersError.message}`);

    const userIds = [...new Set((users ?? []).map((r: { user_id: string }) => r.user_id))].filter(
      (id) => !onlyUser || id === onlyUser
    );

    let created = 0;
    let capped = 0;

    for (const userId of userIds) {
      try {
        created += await generateForUser(supabase, userId);
      } catch (error) {
        // One user's failure must not stop the weekly run for everyone else.
        if (isCapViolation(error)) {
          capped += 1;
          continue;
        }
        console.error(`generate-insights failed for ${userId}:`, error);
      }
    }

    return json({ users: userIds.length, created, capped });
  })
);

async function generateForUser(supabase: SupabaseClient, userId: string): Promise<number> {
  const { data, error } = await supabase
    .from('monthly_category_totals')
    .select('month, category_id, category_name, total_cents')
    .eq('user_id', userId)
    .order('month', { ascending: true });

  if (error) throw new Error(error.message);

  const series = toSeries(data ?? []);
  const pattern = findPattern(series);
  if (!pattern) return 0;

  // §4.6 step 3: only reach for the model once a threshold is actually crossed.
  const written = await anthropic.messages.create({
    model: EXTRACTION_MODEL,
    max_tokens: DEFAULT_MAX_TOKENS,
    system: SYSTEM,
    messages: [{ role: 'user', content: [{ type: 'text', text: pattern.brief }] }],
    output_config: { format: { type: 'json_schema', schema: INSIGHT_SCHEMA } },
  });

  const text = written.content.find((b) => b.type === 'text');
  if (!text || text.type !== 'text') return 0;

  const { title, body } = JSON.parse(text.text) as { title: string; body: string };

  const { error: insertError } = await supabase.from('insights').insert({
    user_id: userId,
    kind: pattern.kind,
    title,
    body,
    category_id: pattern.categoryId,
    status: 'pending',
    // §4.6 step 4: space deliveries out rather than firing on generation.
    deliver_after: nextDeliverySlot(),
  });

  // The cap trigger rejects a fourth insight in a month; that is the system working.
  if (insertError) throw insertError;

  return 1;
}

/**
 * Deliver on the next morning rather than the instant the cron fires — a note that
 * arrives at 3am is a notification, not an observation.
 */
function nextDeliverySlot(): string {
  const when = new Date();
  when.setUTCDate(when.getUTCDate() + 1);
  when.setUTCHours(9, 0, 0, 0);
  return when.toISOString();
}

/**
 * Did the cap trigger reject this insert?
 *
 * PostgREST surfaces a Postgres error as a plain object (`{ code, message, ... }`),
 * not an Error — so `String(error)` would be "[object Object]" and a capped user
 * would be logged as a failure. The trigger raises SQLSTATE 23514 (check_violation)
 * with a recognisable message; both are checked.
 */
function isCapViolation(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;

  const { code, message } = error as { code?: unknown; message?: unknown };
  if (code === '23514') return true;

  return typeof message === 'string' && message.includes('insight cap reached');
}

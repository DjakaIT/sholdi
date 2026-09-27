/**
 * Quota arithmetic. COST-CONTROLS.md §7.
 *
 * Pure: no database, no clock of its own. Every decision this makes is a function
 * of values handed to it, so the rules can be tested directly rather than by
 * waiting for midnight on a device.
 *
 * ── Where §7 is followed, and where it is not ─────────────────────────────────
 * §7 says quotas are "enforced in Postgres with a check before the Edge Function
 * calls out — never in the prompt, never client-side only", and gives a
 * `usage_quotas` table keyed by `user_id`.
 *
 * There is no Postgres and no `user_id`. The app is local-first: expenses live in
 * SQLite on the phone and the functions are stateless (see src/lib/db.ts). So the
 * per-user half of §7 is enforced on the device, which is the only place that knows
 * who the user is — there is exactly one per database.
 *
 * Being straight about what that costs: a device-side quota is a product rule, not
 * a security control. Someone who reinstalls the app, or moves the clock back, gets
 * a fresh allowance. It is not what stops an attacker; that is the per-IP limit in
 * `supabase/functions/_shared/guard.ts` and the spend cap on the Anthropic key. It
 * is what keeps an ordinary user's ordinary usage inside a budget, which is what §7
 * is for.
 */

/** The things a user can spend. §7 names these four. */
export type QuotaKind = 'statements' | 'receipts' | 'entries' | 'chat';

export type QuotaPeriod = 'day' | 'month';

export type QuotaRule = {
  limit: number;
  period: QuotaPeriod;
  /** Shown when the limit is hit. §7: "never a generic failure." */
  message: string;
};

/**
 * ── Deviation from §7, on instruction ─────────────────────────────────────────
 * §7's free tier allows 5 chat messages a day. The limit here is 3, which is what
 * was asked for. Noted rather than silently applied, because the table in §7 still
 * says 5 and the next person to read both will want to know which is intended.
 */
export const CHAT_MESSAGES_PER_DAY = 3;

/**
 * Only chat is enforced.
 *
 * §7 also caps statements (1/month free), receipts (10/month) and text entries
 * (20/day). Those are deliberately absent: enforcing a 1-statement-a-month limit
 * today would block the testing this app is currently in the middle of, and no one
 * asked for it. The ledger below counts every kind, so turning one on later is a
 * line in this table and nothing else.
 */
export const QUOTA_RULES: Partial<Record<QuotaKind, QuotaRule>> = {
  chat: {
    limit: CHAT_MESSAGES_PER_DAY,
    period: 'day',
    message: `That is ${CHAT_MESSAGES_PER_DAY} questions today. Ask me again tomorrow — your spending is all still here.`,
  },
};

/**
 * The period key a usage row is counted against.
 *
 * Local date, not UTC: "today" has to mean the user's today. Taking it from the
 * device's own calendar is the same reasoning §7 applies to `occurred_on` — a
 * question asked at 23:30 in Zagreb belongs to that day, not to the next one in
 * London.
 */
export function periodKey(period: QuotaPeriod, now: Date): string {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  if (period === 'month') return `${year}-${month}`;
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export type QuotaStatus = {
  kind: QuotaKind;
  used: number;
  limit: number;
  remaining: number;
  allowed: boolean;
  /** Present only when the limit is reached. */
  message?: string;
};

/**
 * Decide whether one more call of this kind is allowed.
 *
 * An unmetered kind is always allowed and reports an infinite limit, so a caller
 * never has to know which kinds are currently enforced.
 */
export function evaluateQuota(kind: QuotaKind, used: number): QuotaStatus {
  const rule = QUOTA_RULES[kind];
  if (!rule) {
    return { kind, used, limit: Infinity, remaining: Infinity, allowed: true };
  }

  const remaining = Math.max(0, rule.limit - used);
  const allowed = used < rule.limit;

  return {
    kind,
    used,
    limit: rule.limit,
    remaining,
    allowed,
    message: allowed ? undefined : rule.message,
  };
}

/** The period a kind is counted over, or null when it is not metered. */
export function periodFor(kind: QuotaKind): QuotaPeriod | null {
  return QUOTA_RULES[kind]?.period ?? null;
}

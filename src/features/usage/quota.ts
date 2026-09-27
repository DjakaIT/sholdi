/**
 * The usage ledger. COST-CONTROLS.md §7 and §8.
 *
 * Storage only — the rules are next door in `quotaRules.ts`, pure and tested.
 *
 * §7's table is keyed by `(user_id, period_start)`. There is no `user_id` here for
 * the same reason there is none anywhere else in this app: one database, one phone,
 * one person. So the key is `(kind, period_key)`.
 *
 * §8 wants every call metered — model, tokens, cost. That needs the response's
 * `usage` block, which the Edge Functions do not currently return to the device.
 * This counts calls, which is what the quota in §7 is defined in terms of; token
 * accounting is a separate piece of work and is not pretended at here.
 */
import { getDatabase } from '@/lib/db';
import {
  type QuotaKind,
  type QuotaStatus,
  evaluateQuota,
  periodFor,
  periodKey,
} from './quotaRules';

export { CHAT_MESSAGES_PER_DAY } from './quotaRules';
export type { QuotaKind, QuotaStatus } from './quotaRules';

/**
 * Thrown when a quota is spent.
 *
 * §7: "return a typed error the UI can render as a clear upgrade prompt — never a
 * generic failure." A distinct class is what lets the chat screen tell the
 * difference between "you have asked enough today" and "the network failed", which
 * deserve very different words.
 */
export class QuotaExceededError extends Error {
  readonly name = 'QuotaExceededError';

  constructor(readonly status: QuotaStatus) {
    super(status.message ?? 'That is enough for today.');
  }
}

/** How many calls of this kind have been made in the current period. */
export async function usedThisPeriod(kind: QuotaKind, now = new Date()): Promise<number> {
  const period = periodFor(kind);
  if (!period) return 0;

  const db = await getDatabase();
  const row = await db.getFirstAsync<{ used: number }>(
    'SELECT used FROM usage_quotas WHERE kind = ? AND period_key = ? LIMIT 1',
    [kind, periodKey(period, now)]
  );

  return row?.used ?? 0;
}

/** Current standing, without spending anything. Drives the UI's remaining count. */
export async function quotaStatus(kind: QuotaKind, now = new Date()): Promise<QuotaStatus> {
  return evaluateQuota(kind, await usedThisPeriod(kind, now));
}

/**
 * Spend one unit, or throw.
 *
 * Check and increment are one call on purpose. Splitting them invites a caller to
 * check, make the request, and forget to record it — which is how a quota quietly
 * stops counting.
 *
 * Recorded BEFORE the network call, so a request that is sent but whose reply is
 * lost still counts. The alternative — recording on success — means a user whose
 * connection drops mid-answer gets the call for free, and that is the shape of an
 * accidental infinite loop.
 */
export async function consumeQuota(kind: QuotaKind, now = new Date()): Promise<QuotaStatus> {
  const period = periodFor(kind);
  if (!period) return evaluateQuota(kind, 0);

  const key = periodKey(period, now);
  const used = await usedThisPeriod(kind, now);
  const status = evaluateQuota(kind, used);

  if (!status.allowed) throw new QuotaExceededError(status);

  const db = await getDatabase();
  await db.runAsync(
    `INSERT INTO usage_quotas (kind, period_key, used, updated_at)
     VALUES (?, ?, 1, ?)
     ON CONFLICT (kind, period_key)
     DO UPDATE SET used = used + 1, updated_at = excluded.updated_at`,
    [kind, key, now.toISOString()]
  );

  return evaluateQuota(kind, used + 1);
}

/**
 * Give back a unit that was never spent.
 *
 * Used when the call fails in a way that proves the model was never reached — a
 * quota is meant to ration what the app costs, and a request the server refused
 * before reading anything costs nothing. Never drops below zero.
 */
export async function refundQuota(kind: QuotaKind, now = new Date()): Promise<void> {
  const period = periodFor(kind);
  if (!period) return;

  const db = await getDatabase();
  await db.runAsync(
    `UPDATE usage_quotas SET used = MAX(0, used - 1), updated_at = ?
      WHERE kind = ? AND period_key = ?`,
    [now.toISOString(), kind, periodKey(period, now)]
  );
}

/**
 * Drop period rows that can no longer be reached.
 *
 * Ninety days keeps the table from growing forever while leaving enough history to
 * answer "how much have I used lately" if that is ever shown.
 */
export async function pruneOldUsage(now = new Date()): Promise<void> {
  const cutoff = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString();
  const db = await getDatabase();
  await db.runAsync('DELETE FROM usage_quotas WHERE updated_at < ?', [cutoff]);
}

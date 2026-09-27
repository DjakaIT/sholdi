/**
 * Chat quota arithmetic. COST-CONTROLS.md §7.
 *
 * The cap is three chat messages a day. These test the rules rather than the
 * storage: the SQLite side is exercised on device, but "is the fourth question
 * refused" and "does the count roll over at the user's midnight" are decidable
 * here, and they are the parts that would be wrong silently.
 *
 * Run: npm test
 */
import { assertEquals } from 'jsr:@std/assert@^1.0.0';

import {
  CHAT_MESSAGES_PER_DAY,
  QUOTA_RULES,
  evaluateQuota,
  periodFor,
  periodKey,
} from '../src/features/usage/quotaRules.ts';

// ── the cap itself ───────────────────────────────────────────────────────────

Deno.test('the chat cap is three a day', () => {
  assertEquals(CHAT_MESSAGES_PER_DAY, 3);
  assertEquals(QUOTA_RULES.chat?.limit, 3);
  assertEquals(QUOTA_RULES.chat?.period, 'day');
});

Deno.test('the first three questions are allowed and the fourth is not', () => {
  assertEquals(evaluateQuota('chat', 0).allowed, true);
  assertEquals(evaluateQuota('chat', 1).allowed, true);
  assertEquals(evaluateQuota('chat', 2).allowed, true);
  assertEquals(evaluateQuota('chat', 3).allowed, false);
});

Deno.test('remaining counts down and stops at zero', () => {
  assertEquals(evaluateQuota('chat', 0).remaining, 3);
  assertEquals(evaluateQuota('chat', 2).remaining, 1);
  assertEquals(evaluateQuota('chat', 3).remaining, 0);
  // A ledger that somehow over-counted must not report a negative allowance.
  assertEquals(evaluateQuota('chat', 9).remaining, 0);
});

Deno.test('a refusal carries a message, an allowance does not', () => {
  // §7: "never a generic failure" — the words are part of the rule.
  assertEquals(typeof evaluateQuota('chat', 3).message, 'string');
  assertEquals(evaluateQuota('chat', 0).message, undefined);
});

Deno.test('the refusal names the limit and does not scold', () => {
  const message = evaluateQuota('chat', 3).message ?? '';
  assertEquals(message.includes('3'), true);
  // DESIGN.md §7 bans these outright, and this string is user-facing.
  assertEquals(/!|AI|smart/.test(message), false);
});

// ── unmetered kinds ──────────────────────────────────────────────────────────

Deno.test('kinds that are not enforced never block', () => {
  // §7 also caps statements, receipts and entries. They are deliberately not
  // enforced yet, and must behave as unlimited rather than as zero.
  for (const kind of ['statements', 'receipts', 'entries'] as const) {
    assertEquals(evaluateQuota(kind, 0).allowed, true);
    assertEquals(evaluateQuota(kind, 10_000).allowed, true);
    assertEquals(periodFor(kind), null);
  }
});

Deno.test('chat is the one metered kind', () => {
  assertEquals(periodFor('chat'), 'day');
});

// ── period keys ──────────────────────────────────────────────────────────────

Deno.test('a daily key is the local calendar date', () => {
  assertEquals(periodKey('day', new Date(2026, 8, 25, 14, 30)), '2026-09-25');
});

Deno.test('a monthly key drops the day', () => {
  assertEquals(periodKey('month', new Date(2026, 8, 25, 14, 30)), '2026-09');
});

Deno.test('months and days are zero-padded', () => {
  // '2026-1-5' would sort and compare wrongly against '2026-10-05'.
  assertEquals(periodKey('day', new Date(2026, 0, 5, 9, 0)), '2026-01-05');
});

Deno.test('the allowance rolls over at the local midnight, not UTC', () => {
  // A question asked at 23:30 in Zagreb belongs to that day. Using UTC would move
  // it to the next day and hand the user a second allowance before midnight —
  // the same reasoning §7 applies to occurred_on.
  const lateEvening = periodKey('day', new Date(2026, 8, 25, 23, 30));
  const justAfterMidnight = periodKey('day', new Date(2026, 8, 26, 0, 10));

  assertEquals(lateEvening, '2026-09-25');
  assertEquals(justAfterMidnight, '2026-09-26');
});

Deno.test('every hour of one local day shares a key', () => {
  const keys = new Set<string>();
  for (let hour = 0; hour < 24; hour += 1) {
    keys.add(periodKey('day', new Date(2026, 8, 25, hour, 0)));
  }
  assertEquals(keys.size, 1);
});

Deno.test('a day boundary at the end of a month increments the month', () => {
  assertEquals(periodKey('day', new Date(2026, 7, 31, 23, 59)), '2026-08-31');
  assertEquals(periodKey('day', new Date(2026, 8, 1, 0, 1)), '2026-09-01');
});

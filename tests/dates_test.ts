/**
 * Dates are plain 'YYYY-MM' / 'YYYY-MM-DD' strings and never cross a timezone
 * (ARCHITECTURE.md §7: a purchase on the 31st must not become the 1st).
 *
 * Run: deno test tests/
 */
import { assertEquals } from 'jsr:@std/assert@^1.0.0';

import {
  currentMonthLocal,
  daysInMonth,
  monthName,
  monthNameUpper,
  monthShort,
  nextMonth,
  previousMonth,
  shortDate,
  switcherMonths,
  todayLocal,
} from '../src/lib/dates.ts';

Deno.test('monthName reads the month out of a YYYY-MM key', () => {
  assertEquals(monthName('2026-09'), 'September');
  assertEquals(monthName('2026-01'), 'January');
  assertEquals(monthName('2026-12'), 'December');
});

Deno.test('monthNameUpper drives the §6.2 eyebrow', () => {
  assertEquals(monthNameUpper('2026-09'), 'SEPTEMBER');
});

Deno.test('monthShort drives the month switcher', () => {
  assertEquals(monthShort('2026-09'), 'Sep');
  assertEquals(monthShort('2026-08'), 'Aug');
});

Deno.test('previousMonth steps back within a year', () => {
  assertEquals(previousMonth('2026-09'), '2026-08');
  assertEquals(previousMonth('2026-02'), '2026-01');
});

Deno.test('previousMonth crosses the year boundary', () => {
  // January's previous month is the December before it, not month zero.
  assertEquals(previousMonth('2026-01'), '2025-12');
});

Deno.test('previousMonth keeps the two-digit padding', () => {
  // '2026-9' would break the string comparisons the SQL layer relies on.
  assertEquals(previousMonth('2026-10'), '2026-09');
  assertEquals(previousMonth('2026-11'), '2026-10');
});

Deno.test('month keys stay sortable as plain strings', () => {
  // The repository orders and ranges on these without parsing them.
  const months = ['2026-10', '2025-12', '2026-01', '2026-09'];
  assertEquals(months.slice().sort(), ['2025-12', '2026-01', '2026-09', '2026-10']);
});

// ── nextMonth ────────────────────────────────────────────────────────────────

Deno.test('nextMonth steps forward and across a year', () => {
  assertEquals(nextMonth('2026-08'), '2026-09');
  assertEquals(nextMonth('2026-12'), '2027-01');
});

// ── the device calendar, not UTC ─────────────────────────────────────────────

Deno.test('todayLocal reads the local calendar', () => {
  assertEquals(todayLocal(new Date(2026, 8, 1, 0, 30)), '2026-09-01');
  assertEquals(todayLocal(new Date(2026, 0, 5, 23, 59)), '2026-01-05');
});

Deno.test('todayLocal is never the UTC date just after local midnight', () => {
  // 00:30 on the 1st, local. In any timezone east of UTC, toISOString() says the
  // 31st of the previous month; the local calendar must still say the 1st.
  const justAfterMidnight = new Date(2026, 8, 1, 0, 30);
  assertEquals(todayLocal(justAfterMidnight).slice(0, 7), '2026-09');
});

Deno.test('currentMonthLocal is the local month', () => {
  assertEquals(currentMonthLocal(new Date(2026, 8, 30, 23, 59)), '2026-09');
});

// ── the switcher window ──────────────────────────────────────────────────────

Deno.test('on the current month the switcher shows it and the two before', () => {
  assertEquals(switcherMonths('2026-09', '2026-09'), ['2026-07', '2026-08', '2026-09']);
});

Deno.test('one month back, the current month stays reachable', () => {
  // The bug: importing an August statement moved the window to Jun-Jul-Aug and
  // September could not be reached again.
  assertEquals(switcherMonths('2026-08', '2026-09'), ['2026-07', '2026-08', '2026-09']);
});

Deno.test('further back, the window keeps one month ahead of the selection', () => {
  assertEquals(switcherMonths('2026-05', '2026-09'), ['2026-04', '2026-05', '2026-06']);
});

Deno.test('the window always contains the selected month', () => {
  for (const selected of ['2025-12', '2026-01', '2026-07', '2026-08', '2026-09']) {
    assertEquals(switcherMonths(selected, '2026-09').includes(selected), true);
  }
});

Deno.test('the window never runs into the future', () => {
  for (const selected of ['2026-07', '2026-08', '2026-09']) {
    const window = switcherMonths(selected, '2026-09');
    assertEquals(window[2] <= '2026-09', true);
  }
});

Deno.test('the window crosses a year boundary', () => {
  assertEquals(switcherMonths('2026-01', '2026-09'), ['2025-12', '2026-01', '2026-02']);
});

// ── small formatters ─────────────────────────────────────────────────────────

Deno.test('daysInMonth handles short months and leap years', () => {
  assertEquals(daysInMonth('2026-02'), 28);
  assertEquals(daysInMonth('2028-02'), 29);
  assertEquals(daysInMonth('2026-08'), 31);
  assertEquals(daysInMonth('2026-09'), 30);
});

Deno.test('shortDate reads a stored date without a timezone', () => {
  assertEquals(shortDate('2026-08-29'), '29 Aug');
  assertEquals(shortDate('2026-09-01'), '1 Sep');
});

// ── monthRange ───────────────────────────────────────────────────────────────

import { monthRange } from '../src/lib/dates.ts';

Deno.test('a whole month runs from the 1st to a 31st bound', () => {
  assertEquals(monthRange('2026-08'), ['2026-08-01', '2026-08-31']);
});

Deno.test('a month to date stops at the given day', () => {
  assertEquals(monthRange('2026-08', 3), ['2026-08-01', '2026-08-03']);
});

Deno.test('a day beyond a short month still covers all of it', () => {
  // Comparing September the 30th against February: all of February, no error.
  const [, end] = monthRange('2026-02', 30);
  assertEquals('2026-02-28' <= end, true);
});

Deno.test('the day is clamped to something sane', () => {
  assertEquals(monthRange('2026-08', 0)[1], '2026-08-01');
  assertEquals(monthRange('2026-08', 45)[1], '2026-08-31');
});

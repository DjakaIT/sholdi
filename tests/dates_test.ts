/**
 * Dates are plain 'YYYY-MM' / 'YYYY-MM-DD' strings and never cross a timezone
 * (ARCHITECTURE.md §7: a purchase on the 31st must not become the 1st).
 *
 * Run: deno test tests/
 */
import { assertEquals } from 'jsr:@std/assert@^1.0.0';

import { monthName, monthNameUpper, monthShort, previousMonth } from '../src/lib/dates.ts';

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

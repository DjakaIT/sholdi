/**
 * Tests for insight pattern detection. Run with:
 *   deno test tests/patterns_test.ts
 *
 * These matter more than most: this logic decides what a user actually receives, and
 * ARCHITECTURE.md §4.6 caps that at three notes a month. Every false positive here
 * spends one of them.
 */
import { assertEquals } from 'jsr:@std/assert@^1.0.0';

import { findPattern, isRising, percentChange, toSeries } from '../src/features/insights/patterns.ts';
import type { CategorySeries } from '../src/features/insights/patterns.ts';

function series(name: string, cents: number[], categoryId = name): CategorySeries {
  return {
    categoryId,
    name,
    points: cents.map((c, i) => ({ month: `2026-0${i + 1}`, cents: c })),
  };
}

Deno.test('percentChange handles a zero baseline without dividing by zero', () => {
  assertEquals(percentChange(0, 0), 0);
  assertEquals(percentChange(500, 0), 100);
});

Deno.test('isRising needs three consecutive rises above the threshold', () => {
  // +20%, +20% across three points.
  assertEquals(isRising([{ month: 'a', cents: 100 }, { month: 'b', cents: 120 }, { month: 'c', cents: 144 }]), true);
});

Deno.test('isRising rejects a rise that stalls', () => {
  // Second step is only +2% — noise, not a pattern.
  assertEquals(isRising([{ month: 'a', cents: 100 }, { month: 'b', cents: 120 }, { month: 'c', cents: 122 }]), false);
});

Deno.test('isRising rejects too short a history', () => {
  assertEquals(isRising([{ month: 'a', cents: 100 }, { month: 'b', cents: 200 }]), false);
});

Deno.test('a category rising three months is a trend', () => {
  const found = findPattern([series('Shoes', [1000, 1300, 1700])]);
  assertEquals(found?.kind, 'trend');
  assertEquals(found?.categoryName, 'Shoes');
});

Deno.test('a category down two months is a celebration', () => {
  const found = findPattern([series('Eating out', [50000, 42000, 34000])]);
  assertEquals(found?.kind, 'celebration');
  assertEquals(found?.categoryName, 'Eating out');
});

Deno.test('a celebration outranks a trend — lead with the win (§7)', () => {
  const found = findPattern([
    series('Shoes', [1000, 1300, 1700], 'shoes'),        // rising
    series('Eating out', [50000, 42000, 34000], 'food'), // falling
  ]);
  assertEquals(found?.kind, 'celebration');
  assertEquals(found?.categoryName, 'Eating out');
});

Deno.test('flat spending produces nothing at all', () => {
  // The common case. Silence is the correct output.
  assertEquals(findPattern([series('Groceries', [60000, 60500, 59800, 60200])]), null);
});

Deno.test('a single spike is not a trend', () => {
  assertEquals(findPattern([series('Fuel', [10000, 10200, 40000])]), null);
});

Deno.test('a category with under three months is ignored', () => {
  assertEquals(findPattern([series('New', [1000, 5000])]), null);
});

Deno.test('detection uses only the most recent months', () => {
  // Rose long ago, flat since — MONTHS_OF_HISTORY is 6, and the last three are flat.
  const found = findPattern([series('Old', [100, 200, 400, 800, 800, 805, 803])]);
  assertEquals(found, null);
});

Deno.test('toSeries groups by category and orders oldest first', () => {
  const grouped = toSeries([
    { month: '2026-03-01', category_id: 'a', category_name: 'Groceries', total_cents: 300 },
    { month: '2026-01-01', category_id: 'a', category_name: 'Groceries', total_cents: 100 },
    { month: '2026-02-01', category_id: 'b', category_name: 'Fuel', total_cents: 50 },
  ]);

  assertEquals(grouped.length, 2);
  const groceries = grouped.find((g) => g.name === 'Groceries')!;
  assertEquals(groceries.points.map((p) => p.month), ['2026-01', '2026-03']);
  assertEquals(groceries.points.map((p) => p.cents), [100, 300]);
});

Deno.test('toSeries keeps uncategorised rows rather than dropping them', () => {
  const grouped = toSeries([
    { month: '2026-01-01', category_id: null, category_name: null, total_cents: 900 },
  ]);
  assertEquals(grouped.length, 1);
  assertEquals(grouped[0].name, 'Uncategorised');
  assertEquals(grouped[0].categoryId, null);
});

Deno.test('the brief carries figures the model must not invent', () => {
  const found = findPattern([series('Eating out', [50000, 42000, 34000])]);
  assertEquals(found!.brief.includes('34000 cents'), true);
  assertEquals(found!.brief.includes('42000 cents'), true);
});

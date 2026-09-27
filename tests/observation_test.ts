/**
 * Sholdi's line about a month. DESIGN.md §7.
 *
 * These hold the voice as much as the arithmetic: lead with the win, never
 * moralise, no exclamation marks, and never name "Uncategorised" as if it were a
 * category someone chose.
 *
 * Run: npm test
 */
import { assertEquals } from 'jsr:@std/assert@^1.0.0';

import {
  type ObservedCategory,
  type ObservedMonth,
  observeMonth,
} from '../src/features/insights/observation.ts';

function cat(name: string, cents: number, previousCents = 0, uncategorised = false): ObservedCategory {
  return { name, cents, previousCents, uncategorised };
}

function month(categories: ObservedCategory[], previousTotalCents?: number): ObservedMonth {
  const totalCents = categories.reduce((s, c) => s + c.cents, 0);
  return {
    month: '2026-09',
    previousMonth: '2026-08',
    totalCents,
    previousTotalCents: previousTotalCents ?? categories.reduce((s, c) => s + c.previousCents, 0),
    categories,
  };
}

const VOICE_VIOLATIONS = /!|AI|smart|powered by|should|must|you need|stop /i;

// ── wins come first ──────────────────────────────────────────────────────────

Deno.test('a category that came down leads', () => {
  const line = observeMonth(month([cat('Groceries', 60000, 55000), cat('Eating out', 30000, 45000)]));
  assertEquals(line, 'Eating out is down 33% on August — nice work.');
});

Deno.test('the biggest saving in euros wins, not the biggest percentage', () => {
  const line = observeMonth(
    month([cat('Fitness', 200, 1000), cat('Eating out', 30000, 40000), cat('Groceries', 50000, 50000)])
  );
  assertEquals(line?.startsWith('Eating out is down'), true);
});

Deno.test('a win is named even when a lot is unsorted', () => {
  // §7: lead with the win.
  const line = observeMonth(
    month([cat('Eating out', 20000, 40000), cat('Uncategorised', 90000, 0, true)])
  );
  assertEquals(line?.startsWith('Eating out is down'), true);
});

Deno.test('a whole month down is a win when no category stands out', () => {
  const line = observeMonth(
    month([cat('Groceries', 50000, 52000), cat('Eating out', 30000, 32000)], 100000)
  );
  assertEquals(line, 'You spent 20% less than in August — nice work.');
});

Deno.test('a tiny drop is not called a win', () => {
  // €1 off a €10 category is 10%, and nobody felt it.
  const line = observeMonth(month([cat('Fitness', 900, 1000), cat('Groceries', 50000, 50000)]));
  assertEquals(line?.includes('nice work'), false);
});

// ── unsorted spending ────────────────────────────────────────────────────────

Deno.test('a large unsorted share is stated as a fact', () => {
  // The first-import case: nothing to compare against, half the month unsorted.
  const line = observeMonth(
    month([cat('Uncategorised', 143328, 0, true), cat('Groceries', 69879), cat('Eating out', 62953)])
  );
  assertEquals(line, "52% of September isn't sorted into a category yet.");
});

Deno.test('Uncategorised is never named as the biggest category', () => {
  // The line this module replaced: "Your biggest category this month is Uncategorised."
  const line = observeMonth(
    month([cat('Uncategorised', 50000, 0, true), cat('Groceries', 45000), cat('Transport', 40000)])
  );
  assertEquals(line?.includes('Uncategorised'), false);
});

Deno.test('a month with no categories at all says so', () => {
  assertEquals(
    observeMonth(month([cat('Uncategorised', 5000, 0, true)])),
    "Nothing in September is sorted into a category yet."
  );
});

Deno.test('a small unsorted share is not mentioned', () => {
  const line = observeMonth(
    month([cat('Groceries', 90000), cat('Uncategorised', 5000, 0, true)])
  );
  assertEquals(line, 'Groceries took 95% of September.');
});

// ── rises ────────────────────────────────────────────────────────────────────

Deno.test('a sharp rise is worth a glance, without judgement', () => {
  const line = observeMonth(month([cat('Groceries', 70000, 50000), cat('Transport', 20000, 20000)]));
  assertEquals(line, 'Groceries is up 40% on August. No judgement, just worth a glance.');
});

Deno.test('a modest rise is not remarked on', () => {
  const line = observeMonth(month([cat('Groceries', 55000, 50000), cat('Transport', 20000, 20000)]));
  assertEquals(line?.includes('up'), false);
});

// ── the quiet default ────────────────────────────────────────────────────────

Deno.test('with nothing to compare, it says where the money went', () => {
  assertEquals(
    observeMonth(month([cat('Groceries', 60000), cat('Eating out', 40000)])),
    'Groceries took 60% of September.'
  );
});

Deno.test('an empty month has nothing to say', () => {
  assertEquals(observeMonth(month([])), null);
});

// ── the voice, everywhere ────────────────────────────────────────────────────

Deno.test('no line breaks the voice rules', () => {
  const cases = [
    month([cat('Groceries', 60000, 55000), cat('Eating out', 30000, 45000)]),
    month([cat('Groceries', 50000, 52000), cat('Eating out', 30000, 32000)], 100000),
    month([cat('Uncategorised', 50000, 0, true), cat('Groceries', 10000)]),
    month([cat('Uncategorised', 5000, 0, true)]),
    month([cat('Groceries', 70000, 50000), cat('Transport', 20000, 20000)]),
    month([cat('Groceries', 60000), cat('Eating out', 40000)]),
  ];
  for (const c of cases) {
    const line = observeMonth(c) ?? '';
    assertEquals(VOICE_VIOLATIONS.test(line), false, line);
    // Sentence case: starts with a capital or a digit.
    assertEquals(/^[A-Z0-9]/.test(line), true, line);
  }
});

// ── a month still in progress ────────────────────────────────────────────────

Deno.test('a month in progress is never praised', () => {
  // The 27th, statement not imported yet: €16 against August's €630.
  const line = observeMonth({
    ...month([cat('Eating out', 1650, 55000), cat('Groceries', 0, 60000)]),
    inProgress: true,
  });
  assertEquals(line?.includes('nice work'), false);
  assertEquals(line, 'Eating out is 100% of September so far.');
});

Deno.test('a month in progress is not flagged for rising either', () => {
  const line = observeMonth({
    ...month([cat('Groceries', 70000, 50000), cat('Transport', 20000, 20000)]),
    inProgress: true,
  });
  assertEquals(line?.includes('worth a glance'), false);
});

Deno.test('unsorted spending is still mentioned while a month runs', () => {
  const line = observeMonth({
    ...month([cat('Uncategorised', 5000, 0, true), cat('Groceries', 5000)]),
    inProgress: true,
  });
  assertEquals(line, "50% of September isn't sorted into a category yet.");
});

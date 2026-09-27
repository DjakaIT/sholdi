/**
 * What leaves the phone when a question is asked. ARCHITECTURE.md §4.5.
 *
 * Two things are being protected here, and they are different in kind:
 *
 *  1. Privacy. §4.5 allows aggregated monthly totals and nothing else. A merchant
 *     name reaching this string would leave the device, so the test for that is a
 *     test of the app's central promise, not a formatting check.
 *
 *  2. Arithmetic. The deltas are computed on the device precisely because the model
 *     got them backwards when asked to subtract mid-sentence.
 *
 * Run: npm test
 */
import { assertEquals } from 'jsr:@std/assert@^1.0.0';

import {
  type MonthTotals,
  formatDelta,
  renderSummary,
} from '../src/features/expenses/summaryFormat.ts';

const september: MonthTotals = {
  key: '2026-09',
  total: 120000,
  categories: [
    { name: 'Groceries', cents: 60000, expenseCount: 12 },
    { name: 'Eating out', cents: 30000, expenseCount: 8 },
  ],
};

const august: MonthTotals = {
  key: '2026-08',
  total: 140000,
  categories: [
    { name: 'Groceries', cents: 52000, expenseCount: 13 },
    { name: 'Eating out', cents: 45000, expenseCount: 14 },
  ],
};

// ── deltas ───────────────────────────────────────────────────────────────────

Deno.test('a rise reads as up, by the right amount', () => {
  assertEquals(formatDelta(60000, 52000), ' (up 8000 from 52000)');
});

Deno.test('a fall reads as down, and the amount is positive', () => {
  // The sign belongs in the word, not in the number: "down -15000" is unreadable.
  assertEquals(formatDelta(30000, 45000), ' (down 15000 from 45000)');
});

Deno.test('no change says so rather than showing zero', () => {
  assertEquals(formatDelta(5000, 5000), ' (unchanged)');
});

Deno.test('the earliest month has nothing to compare against', () => {
  // Not " (up 60000 from 0)" — there was no previous month, which is different from
  // a previous month of zero.
  assertEquals(formatDelta(60000, undefined), '');
});

Deno.test('the direction is never inverted', () => {
  // The exact bug this exists to remove: the model read a rise as a fall.
  for (const [current, previous] of [
    [100, 50],
    [1, 0],
    [999999, 999998],
  ]) {
    assertEquals(formatDelta(current, previous).includes('up'), true);
  }
  for (const [current, previous] of [
    [50, 100],
    [0, 1],
    [999998, 999999],
  ]) {
    assertEquals(formatDelta(current, previous).includes('down'), true);
  }
});

// ── rendering ────────────────────────────────────────────────────────────────

Deno.test('each month carries its change against the one before', () => {
  const rendered = renderSummary([september, august]);
  assertEquals(rendered.includes('2026-09 — total 120000 cents (down 20000 from 140000):'), true);
  assertEquals(rendered.includes('Groceries: 60000 cents (12) (up 8000 from 52000)'), true);
  assertEquals(rendered.includes('Eating out: 30000 cents (8) (down 15000 from 45000)'), true);
});

Deno.test('the oldest month shown carries no delta', () => {
  const rendered = renderSummary([september, august]);
  const augustLine = rendered.split('\n').find((l) => l.startsWith('2026-08')) ?? '';
  assertEquals(augustLine, '2026-08 — total 140000 cents:');
});

Deno.test('a category absent last month gets no delta', () => {
  // "up 4000 from 0" would claim a rise from a month the category did not exist in.
  const withNew: MonthTotals = {
    key: '2026-09',
    total: 4000,
    categories: [{ name: 'Transport', cents: 4000, expenseCount: 1 }],
  };
  const rendered = renderSummary([withNew, august]);
  assertEquals(rendered.includes('Transport: 4000 cents (1)\n') || rendered.endsWith('Transport: 4000 cents (1)'), true);
  assertEquals(rendered.includes('Transport: 4000 cents (1) (up'), false);
});

Deno.test('months with no spending are skipped, not rendered empty', () => {
  const empty: MonthTotals = { key: '2026-07', total: 0, categories: [] };
  const rendered = renderSummary([september, august, empty]);
  assertEquals(rendered.includes('2026-07'), false);
});

Deno.test('no spending at all says so plainly', () => {
  assertEquals(
    renderSummary([{ key: '2026-09', total: 0, categories: [] }]),
    'The user has no spending recorded yet.'
  );
});

Deno.test('goals are appended when there are any', () => {
  const rendered = renderSummary([september], [
    { name: 'Japan', target_cents: 500000, saved_cents: 120000 },
  ]);
  assertEquals(rendered.includes('Goals:'), true);
  assertEquals(rendered.includes('Japan: 120000 of 500000 cents saved'), true);
});

Deno.test('goals are omitted entirely when there are none', () => {
  assertEquals(renderSummary([september], []).includes('Goals:'), false);
});

// ── the privacy rule ─────────────────────────────────────────────────────────

Deno.test('no merchant, date or individual amount can reach the summary', () => {
  // §4.5 is the promise the whole app rests on: the model sees category totals and
  // nothing that identifies a purchase. The shape of MonthTotals has no field for a
  // merchant or a date, so this asserts the rendering adds none of its own.
  const rendered = renderSummary([september, august], [
    { name: 'Japan', target_cents: 500000, saved_cents: 120000 },
  ]);

  // A day-level date would look like this. Month keys (2026-09) are allowed.
  assertEquals(/\d{4}-\d{2}-\d{2}/.test(rendered), false);

  // Every line is either a month header, a category line, a goal line, or blank.
  for (const line of rendered.split('\n')) {
    if (line === '' || line === 'Goals:') continue;
    const isMonth = /^\d{4}-\d{2} — total \d+ cents( \(.+\))?:$/.test(line);
    const isCategory = /^ {2}.+: \d+ cents \(\d+\)( \(.+\))?$/.test(line);
    const isGoal = /^ {2}.+: \d+ of \d+ cents saved$/.test(line);
    assertEquals(isMonth || isCategory || isGoal, true, `unexpected line: ${line}`);
  }
});

Deno.test('amounts stay in integer cents, never formatted as euros', () => {
  // §4.5: cents cost fewer tokens and cannot be misread as a different currency.
  const rendered = renderSummary([september, august]);
  assertEquals(rendered.includes('€'), false);
  assertEquals(rendered.includes('.'), false);
});

/**
 * Compact wire format tests.
 *
 * This is the format a real 79-transaction statement depends on — the verbose form
 * exceeded the token cap and truncated, failing the whole import. Expansion has to
 * be exactly right, because every row the app stores comes through here.
 *
 * Run: npm run test:functions
 */
import { assertEquals } from 'jsr:@std/assert@^1.0.0';

import {
  buildCategoryCodes,
  describeCategoryCodes,
  expandCompact,
} from './compact.ts';
import type { CompactStatement } from './compact.ts';

const CODES = buildCategoryCodes(['Groceries', 'Fuel', 'Eating out', 'Transport', 'Fitness']);

function statement(tx: string[]): CompactStatement {
  return { period_start: '2026-08-01', period_end: '2026-08-31', currency: 'EUR', tx };
}

Deno.test('codes are the first three letters', () => {
  assertEquals(CODES['GRO'], 'Groceries');
  assertEquals(CODES['FUE'], 'Fuel');
  assertEquals(CODES['EAT'], 'Eating out');
  assertEquals(CODES['TRA'], 'Transport');
  assertEquals(CODES['FIT'], 'Fitness');
});

Deno.test('codes are stable across calls', () => {
  // A code that drifts between calls would silently recategorise rows.
  const a = buildCategoryCodes(['Groceries', 'Fuel', 'Fitness']);
  const b = buildCategoryCodes(['Groceries', 'Fuel', 'Fitness']);
  assertEquals(a, b);
});

Deno.test('colliding names get distinct codes', () => {
  const codes = buildCategoryCodes(['Food', 'Football', 'Footwear']);
  const values = Object.values(codes).sort();
  assertEquals(values, ['Food', 'Football', 'Footwear']);
  // Three names, three codes — none swallowed by a collision.
  assertEquals(Object.keys(codes).length, 3);
});

Deno.test('a name with no letters still yields a code', () => {
  const codes = buildCategoryCodes(['123', '!!!']);
  assertEquals(Object.values(codes).length >= 1, true);
});

Deno.test('expands a row into the §4.2 contract', () => {
  const { expenses } = expandCompact(statement(['3820|Konzum|08-03|GRO|95']), CODES);

  assertEquals(expenses.length, 1);
  assertEquals(expenses[0], {
    amount_cents: 3820,
    currency: 'EUR',
    merchant: 'Konzum',
    description: null,
    occurred_on: '2026-08-03',
    suggested_category: 'Groceries',
    confidence: 0.95,
  });
});

Deno.test('the year comes from the period, not the row', () => {
  const { expenses } = expandCompact(
    { period_start: '2025-11-01', period_end: '2025-11-30', currency: 'EUR', tx: ['100|X|11-15|GRO|90'] },
    CODES
  );
  assertEquals(expenses[0].occurred_on, '2025-11-15');
});

Deno.test('a period spanning new year puts January in the later year', () => {
  // A December statement listing 01-02 means the following January.
  const { expenses } = expandCompact(
    {
      period_start: '2026-12-20',
      period_end: '2027-01-19',
      currency: 'EUR',
      tx: ['100|A|12-28|GRO|90', '200|B|01-05|GRO|90'],
    },
    CODES
  );
  assertEquals(expenses[0].occurred_on, '2026-12-28');
  assertEquals(expenses[1].occurred_on, '2027-01-05');
});

Deno.test('confidence percent becomes a 0..1 fraction', () => {
  const { expenses } = expandCompact(
    statement(['100|A|08-01|GRO|100', '100|B|08-02|GRO|0', '100|C|08-03|GRO|73']),
    CODES
  );
  assertEquals(expenses.map((e) => e.confidence), [1, 0, 0.73]);
});

Deno.test('an out-of-range confidence is clamped', () => {
  const { expenses } = expandCompact(statement(['100|A|08-01|GRO|900']), CODES);
  assertEquals(expenses[0].confidence, 1);
});

Deno.test('an unknown code falls back rather than dropping the row', () => {
  // Losing a real purchase is worse than mislabelling it; the review screen fixes
  // a category in one tap.
  const { expenses, dropped } = expandCompact(
    statement(['100|A|08-01|ZZZ|90']),
    CODES
  );
  assertEquals(dropped, 0);
  assertEquals(expenses[0].suggested_category, 'Uncategorised');
});

Deno.test('a non-integer amount is dropped, not rounded', () => {
  const { expenses, dropped } = expandCompact(
    statement(['12.3|A|08-01|GRO|90']),
    CODES
  );
  assertEquals(expenses.length, 0);
  assertEquals(dropped, 1);
});

Deno.test('a malformed date is dropped and counted', () => {
  const { expenses, dropped } = expandCompact(
    statement(['100|A|not-a-date|GRO|90', '100|B|13-01|GRO|90', '100|C|08-04|GRO|90']),
    CODES
  );
  assertEquals(expenses.length, 1);
  assertEquals(dropped, 2);
});

Deno.test('a short row is dropped rather than misread positionally', () => {
  const { dropped } = expandCompact(
    statement(['100|A|08-01']),
    CODES
  );
  assertEquals(dropped, 1);
});

Deno.test('a blank merchant becomes null', () => {
  const { expenses } = expandCompact(statement(['100|   |08-01|GRO|90']), CODES);
  assertEquals(expenses[0].merchant, null);
});

Deno.test('currency is taken once from the envelope', () => {
  const { expenses } = expandCompact(
    { period_start: '2026-08-01', period_end: '2026-08-31', currency: 'USD', tx: ['100|A|08-01|GRO|90'] },
    CODES
  );
  assertEquals(expenses[0].currency, 'USD');
});

Deno.test('a junk currency falls back to EUR', () => {
  const { expenses } = expandCompact(
    { period_start: '2026-08-01', period_end: '2026-08-31', currency: 'nonsense', tx: ['100|A|08-01|GRO|90'] },
    CODES
  );
  assertEquals(expenses[0].currency, 'EUR');
});

Deno.test('the code description names every category plus a fallback', () => {
  const described = describeCategoryCodes(CODES);
  assertEquals(described.includes('GRO=Groceries'), true);
  assertEquals(described.includes('UNC=anything else'), true);
});

Deno.test('79 rows expand without loss', () => {
  // The size that broke the verbose format.
  const rows = Array.from(
    { length: 79 },
    (_, i) => `${(i + 1) * 100}|Merchant ${i}|08-${String((i % 28) + 1).padStart(2, '0')}|GRO|90`
  );

  const { expenses, dropped } = expandCompact(statement(rows), CODES);
  assertEquals(expenses.length, 79);
  assertEquals(dropped, 0);
});

Deno.test('a merchant containing the separator is reconstructed', () => {
  // Naive splitting would shift every field after the merchant.
  const { expenses, dropped } = expandCompact(statement(['1500|M|S Fashion|08-09|GRO|88']), CODES);
  assertEquals(dropped, 0);
  assertEquals(expenses[0].merchant, 'M|S Fashion');
  assertEquals(expenses[0].amount_cents, 1500);
  assertEquals(expenses[0].occurred_on, '2026-08-09');
  assertEquals(expenses[0].confidence, 0.88);
});

Deno.test('a zero or negative amount is dropped', () => {
  const { expenses, dropped } = expandCompact(
    statement(['0|A|08-01|GRO|90', '-500|B|08-02|GRO|90']),
    CODES
  );
  assertEquals(expenses.length, 0);
  assertEquals(dropped, 2);
});

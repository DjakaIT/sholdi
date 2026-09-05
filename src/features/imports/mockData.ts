/**
 * Mock extraction result for the §6.4 review screen.
 *
 * The shape is `ExtractedExpense` from ARCHITECTURE.md §4.2 plus the category the
 * suggestion resolved to, because the review screen renders the category in its own
 * colour. Replaced by the real `extract-statement` response at build-order step 5.
 *
 * 47 rows, matching the worked example in DESIGN.md §6.4 — the screen shows the
 * first few and then "and 43 more".
 */
import type { CategoryColorToken } from '@/theme/categoryColors';
import type { ExtractedExpense } from '@/features/expenses/types';

export type ReviewRow = ExtractedExpense & {
  id: string;
  /** Resolved from `suggested_category`; drives the row's colour. */
  color_token: CategoryColorToken;
};

export type MockImport = {
  id: string;
  /** 'YYYY-MM' — the statement's period, for the eyebrow. */
  period: string;
  currency: string;
  totalCount: number;
  rows: ReviewRow[];
};

export const MOCK_IMPORT: MockImport = {
  id: 'imp_demo',
  period: '2026-08',
  currency: 'EUR',
  totalCount: 47,
  rows: [
    {
      id: 'r1',
      amount_cents: 4_732,
      currency: 'EUR',
      merchant: 'Konzum',
      description: null,
      occurred_on: '2026-08-29',
      suggested_category: 'Groceries',
      color_token: 'sage',
      confidence: 0.96,
    },
    {
      id: 'r2',
      amount_cents: 1_890,
      currency: 'EUR',
      merchant: 'Pekara Dubravica',
      description: null,
      occurred_on: '2026-08-28',
      suggested_category: 'Eating out',
      color_token: 'plum',
      confidence: 0.91,
    },
    {
      id: 'r3',
      amount_cents: 6_500,
      currency: 'EUR',
      merchant: 'INA',
      description: null,
      occurred_on: '2026-08-27',
      suggested_category: 'Fuel',
      color_token: 'olive',
      confidence: 0.98,
    },
    {
      id: 'r4',
      amount_cents: 1_200,
      currency: 'EUR',
      merchant: 'ZET',
      description: null,
      occurred_on: '2026-08-26',
      suggested_category: 'Transport',
      color_token: 'slate',
      confidence: 0.88,
    },
  ],
};

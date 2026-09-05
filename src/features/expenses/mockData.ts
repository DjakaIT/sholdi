/**
 * Mock month for the static screens — build order step 1 (ARCHITECTURE.md §6).
 *
 * One month, one source of truth: Home (§6.2) shows the top three categories and
 * the Index (§6.7) shows all five, so they must agree. The headline figures are the
 * worked example from DESIGN.md §6.2 (€1,842.60, down 12% on August) and the
 * category totals sum to exactly that.
 *
 * This file goes away at step 2, when Supabase and TanStack Query land; the shape
 * is deliberately close to the `monthly_category_totals` view in §3 so the swap is
 * a query, not a rewrite.
 *
 * All money is integer cents.
 */
import type { CategoryColorToken } from '@/theme/categoryColors';

export type CategoryTotal = {
  name: string;
  colorToken: CategoryColorToken;
  cents: number;
  /** Same category, previous month — drives the delta figures on the Index. */
  previousCents: number;
};

export type MonthSummary = {
  /** 'YYYY-MM'. */
  month: string;
  currency: string;
  totalCents: number;
  previousTotalCents: number;
  /** Monthly totals, oldest first, ending at this month. Drives the sparkline. */
  trailingTotals: number[];
  /** Every category, largest first. Home slices the top three. */
  categories: CategoryTotal[];
  /** One observation. Sholdi's voice: leads with the win, no exclamation, no emoji (§7). */
  insight: string;
  /** The line that closes the Index (§6.7). Always ends that screen in Sholdi's voice. */
  indexClosingLine: string;
};

export const MOCK_MONTHS = ['2026-07', '2026-08', '2026-09'];

export const MOCK_MONTH_SUMMARY: MonthSummary = {
  month: '2026-09',
  currency: 'EUR',
  totalCents: 184_260,
  previousTotalCents: 209_386,
  trailingTotals: [
    162_300, 171_450, 158_900, 183_200, 176_400, 194_100,
    187_650, 201_300, 178_900, 196_750, 209_386, 184_260,
  ],
  // Sums to 184_260 this month and 209_386 last month.
  categories: [
    { name: 'Groceries',  colorToken: 'sage',    cents: 77_390, previousCents: 74_000 },
    { name: 'Eating out', colorToken: 'plum',    cents: 38_815, previousCents: 47_300 },
    { name: 'Transport',  colorToken: 'slate',   cents: 31_920, previousCents: 41_100 },
    { name: 'Fuel',       colorToken: 'olive',   cents: 22_400, previousCents: 31_000 },
    { name: 'Fitness',    colorToken: 'heather', cents: 13_735, previousCents: 15_986 },
  ],
  insight: 'Eating out is down 18% on August — nice work.',
  indexClosingLine:
    'Eating out is down for the second month in a row — nice work.',
};

/** A goal, for the Index strip. Goals carry no category colour (DESIGN.md §4.3). */
export const MOCK_GOAL = {
  name: 'Trip to Vis',
  targetCents: 120_000,
  savedCents: 46_500,
};

/**
 * Building the aggregate that Sholdi is allowed to see.
 *
 * ARCHITECTURE.md §4.5: send "an aggregated summary — monthly totals per category,
 * trends, goals — not the full expense table. Cheaper, faster, and less personal
 * data in flight."
 *
 * Because the database is on the device, that rule is enforced by what this function
 * chooses to include rather than by what a server query happens to select. Merchants,
 * dates and individual amounts never appear here, so they cannot leave the phone.
 *
 * This module reads; `summaryFormat.ts` renders and is pure, so what actually leaves
 * the phone is decided by code that can be tested without one.
 */
import { previousMonth } from '@/lib/dates';
import { getMonthTotal, getMonthTotals } from './repository';
import { getDatabase } from '@/lib/db';
import { type GoalLine, type MonthTotals, renderSummary } from './summaryFormat';

/** How many months of history the model gets. Enough to see a trend. */
const MONTHS = 6;

/** A compact, token-cheap rendering of the user's spending. */
export async function buildSpendingSummary(month: string): Promise<string> {
  const months: MonthTotals[] = [];

  let cursor = month;
  for (let i = 0; i < MONTHS; i += 1) {
    months.push({
      key: cursor,
      total: await getMonthTotal(cursor),
      categories: await getMonthTotals(cursor),
    });
    cursor = previousMonth(cursor);
  }

  const hasSpending = months.some((m) => m.categories.length > 0);
  // Goals are only worth fetching when there is spending to attach them to.
  const goals = hasSpending ? await listGoalsForSummary() : [];

  return renderSummary(months, goals);
}

async function listGoalsForSummary(): Promise<GoalLine[]> {
  const db = await getDatabase();
  return await db.getAllAsync<GoalLine>(
    'SELECT name, target_cents, saved_cents FROM goals'
  );
}

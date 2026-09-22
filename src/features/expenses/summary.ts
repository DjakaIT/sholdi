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
 * If you are tempted to add a merchant name for context, don't — that is the whole
 * point of this file.
 */
import { previousMonth } from '@/lib/dates';
import { getMonthTotal, getMonthTotals } from './repository';
import { getDatabase } from '@/lib/db';

/** How many months of history the model gets. Enough to see a trend. */
const MONTHS = 6;

/**
 * A compact, token-cheap rendering of the user's spending.
 *
 * Amounts stay in integer cents; the system prompt tells the model to render them
 * as euros. Sending "77390" rather than "€773.90" costs fewer tokens and removes
 * any chance of the model reinterpreting a formatted string.
 */
export async function buildSpendingSummary(month: string): Promise<string> {
  const lines: string[] = [];

  let cursor = month;
  for (let i = 0; i < MONTHS; i += 1) {
    const totals = await getMonthTotals(cursor);
    const total = await getMonthTotal(cursor);

    if (totals.length > 0) {
      lines.push(`${cursor} — total ${total} cents:`);
      for (const row of totals) {
        lines.push(`  ${row.name}: ${row.cents} cents (${row.expenseCount})`);
      }
    }

    cursor = previousMonth(cursor);
  }

  if (lines.length === 0) return 'The user has no spending recorded yet.';

  const goals = await listGoalsForSummary();
  if (goals.length > 0) {
    lines.push('', 'Goals:');
    for (const goal of goals) {
      lines.push(`  ${goal.name}: ${goal.saved_cents} of ${goal.target_cents} cents saved`);
    }
  }

  return lines.join('\n');
}

async function listGoalsForSummary(): Promise<
  { name: string; target_cents: number; saved_cents: number }[]
> {
  const db = await getDatabase();
  return await db.getAllAsync<{ name: string; target_cents: number; saved_cents: number }>(
    'SELECT name, target_cents, saved_cents FROM goals'
  );
}

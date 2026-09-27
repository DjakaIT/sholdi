/**
 * Rendering the aggregate Sholdi is allowed to see. ARCHITECTURE.md §4.5.
 *
 * Pure: no database, no platform. Split out from `summary.ts` for the same reason
 * `resolveMerchant.ts` was split from `merchantMemory.ts` — this decides what leaves
 * the phone and how the model reads it, which is worth testing directly rather than
 * through a device.
 *
 * THE RULE THIS FILE KEEPS: monthly totals per category, and nothing else. No
 * merchants, no dates, no individual amounts. If you are tempted to add a merchant
 * name for context, don't — that is the whole point.
 */

export type MonthTotals = {
  key: string;
  total: number;
  categories: { name: string; cents: number; expenseCount: number }[];
};

export type GoalLine = { name: string; target_cents: number; saved_cents: number };

/**
 * The change against the month before, worked out here rather than by the model.
 *
 * Not cosmetic. Asked "did groceries go up?", the model was subtracting two cent
 * figures in the middle of composing a sentence, getting it backwards, and then
 * correcting itself in the reply — "€520 to €600 wait". A reply that visibly changes
 * its mind about the user's own money is the one thing DESIGN.md §7's voice cannot
 * survive.
 *
 * Subtraction is free on the device and exact. Doing it here leaves the model the
 * job it is good at — saying the result plainly — which is the same threshold-first
 * principle COST-CONTROLS.md applies to insights: never ask the model a question
 * arithmetic has already answered.
 */
export function formatDelta(current: number, previous: number | undefined): string {
  if (previous === undefined) return '';
  const change = current - previous;
  if (change === 0) return ' (unchanged)';
  return change > 0 ? ` (up ${change} from ${previous})` : ` (down ${-change} from ${previous})`;
}

/**
 * Render months into the compact text the model receives.
 *
 * `months` runs newest first, which is the order the caller walks them in.
 *
 * Amounts stay in integer cents; the system prompt renders them as euros. Sending
 * "77390" rather than "€773.90" costs fewer tokens and removes any chance of the
 * model reinterpreting a formatted string.
 */
export function renderSummary(months: MonthTotals[], goals: GoalLine[] = []): string {
  const lines: string[] = [];

  months.forEach((entry, index) => {
    if (entry.categories.length === 0) return;

    // The month before this one is the NEXT element: the list runs backwards in time.
    const earlier = months[index + 1];

    lines.push(
      `${entry.key} — total ${entry.total} cents${formatDelta(entry.total, earlier?.total)}:`
    );

    for (const row of entry.categories) {
      // Matched by category name, because that is the only identity a category has
      // in this rendering. A category absent last month has no previous figure and
      // correctly gets no delta rather than a spurious "up from 0".
      const before = earlier?.categories.find((r) => r.name === row.name)?.cents;
      lines.push(
        `  ${row.name}: ${row.cents} cents (${row.expenseCount})${formatDelta(row.cents, before)}`
      );
    }
  });

  if (lines.length === 0) return 'The user has no spending recorded yet.';

  if (goals.length > 0) {
    lines.push('', 'Goals:');
    for (const goal of goals) {
      lines.push(`  ${goal.name}: ${goal.saved_cents} of ${goal.target_cents} cents saved`);
    }
  }

  return lines.join('\n');
}

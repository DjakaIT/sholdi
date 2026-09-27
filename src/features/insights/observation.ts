/**
 * The one line Sholdi says about a month. DESIGN.md §6.2, §6.7 and §7.
 *
 * Pure arithmetic, no model call. Home's observation row and the line that closes
 * the Index both come from here, so the two screens never disagree about the same
 * month — and neither costs anything to render.
 *
 * It replaces "Your biggest category this month is Uncategorised", which was true,
 * useless, and the first thing a user saw after importing a statement.
 *
 * Voice rules (§7), which the tests hold it to:
 *  - Lead with the win. What got better comes before anything else.
 *  - Observe, never instruct. Never moralise.
 *  - Credit the user: "nice work".
 *  - No exclamation marks, no emoji, sentence case.
 */
// Relative, not '@/': this module is pure and runs under Deno in the tests.
import { monthName } from '../../lib/dates';

export type ObservedCategory = {
  name: string;
  cents: number;
  /** Same category last month; 0 when it had none. */
  previousCents: number;
  /** Spending with no category. It is reported on, never praised or compared. */
  uncategorised: boolean;
};

export type ObservedMonth = {
  /** 'YYYY-MM'. */
  month: string;
  /** 'YYYY-MM'. */
  previousMonth: string;
  totalCents: number;
  previousTotalCents: number;
  categories: ObservedCategory[];
  /**
   * The month is still running. Nothing is praised or flagged until it ends: in an
   * app fed by monthly statements, a month in progress is usually a month not yet
   * imported, and "Eating out is down 97% — nice work" on the 27th is praise for
   * missing data.
   */
  inProgress?: boolean;
};

/** A drop smaller than this is noise, not a win worth naming. */
export const WIN_PERCENT = 10;
/** A rise has to be this large before it is worth a glance. */
export const RISE_PERCENT = 25;
/** Below this share, unsorted spending is not worth mentioning. */
export const UNSORTED_SHARE = 0.25;
/** Changes smaller than a euro and a half are not changes anyone feels. */
const MIN_MOVE_CENTS = 150;

function percent(current: number, previous: number): number {
  return Math.round(((current - previous) / previous) * 100);
}

/** Sholdi's line for the month, or null when there is nothing in it. */
export function observeMonth(month: ObservedMonth): string | null {
  if (month.totalCents <= 0) return null;

  const current = monthName(month.month);
  const prior = monthName(month.previousMonth);
  const named = month.categories.filter((c) => !c.uncategorised && c.cents > 0);
  const judge = !month.inProgress;

  // 1. A category that came down. The largest saving in euros wins, not the largest
  //    percentage — "Fitness down 60%" on a €5 gym day is not the headline.
  const wins = month.categories
    .filter(
      (c) =>
        !c.uncategorised &&
        c.previousCents > 0 &&
        c.previousCents - c.cents >= MIN_MOVE_CENTS &&
        percent(c.cents, c.previousCents) <= -WIN_PERCENT
    )
    .sort((a, b) => b.previousCents - b.cents - (a.previousCents - a.cents));

  if (judge && wins.length > 0) {
    const win = wins[0];
    return `${win.name} is down ${-percent(win.cents, win.previousCents)}% on ${prior} — nice work.`;
  }

  // 2. The month as a whole came down.
  if (
    judge &&
    month.previousTotalCents > 0 &&
    month.previousTotalCents - month.totalCents >= MIN_MOVE_CENTS &&
    percent(month.totalCents, month.previousTotalCents) <= -5
  ) {
    const drop = -percent(month.totalCents, month.previousTotalCents);
    return `You spent ${drop}% less than in ${prior} — nice work.`;
  }

  // 3. A large share of the month has no category, which makes every other figure
  //    on the screen less true. Said as a fact, not a chore.
  const unsorted = month.categories
    .filter((c) => c.uncategorised)
    .reduce((sum, c) => sum + c.cents, 0);
  const unsortedShare = unsorted / month.totalCents;

  if (named.length === 0) {
    return `Nothing in ${current} is sorted into a category yet.`;
  }
  if (unsortedShare >= UNSORTED_SHARE) {
    return `${Math.round(unsortedShare * 100)}% of ${current} isn't sorted into a category yet.`;
  }

  // 4. A category that rose sharply. §7's own register: no judgement.
  const rises = named
    .filter(
      (c) =>
        c.previousCents > 0 &&
        c.cents - c.previousCents >= MIN_MOVE_CENTS &&
        percent(c.cents, c.previousCents) >= RISE_PERCENT
    )
    .sort((a, b) => b.cents - b.previousCents - (a.cents - a.previousCents));

  if (judge && rises.length > 0) {
    const rise = rises[0];
    return `${rise.name} is up ${percent(rise.cents, rise.previousCents)}% on ${prior}. No judgement, just worth a glance.`;
  }

  // 5. Nothing moved much: say where the money went.
  const biggest = [...named].sort((a, b) => b.cents - a.cents)[0];
  const share = Math.round((biggest.cents / month.totalCents) * 100);
  return month.inProgress
    ? `${biggest.name} is ${share}% of ${current} so far.`
    : `${biggest.name} took ${share}% of ${current}.`;
}

/**
 * Pattern detection for the insight engine. ARCHITECTURE.md §4.6 step 2.
 *
 * This is the part §4.6 calls make-or-break, so it lives here as pure functions with
 * no database or model access — it can be tested exhaustively, and it is (patterns_test.ts).
 *
 * The rule it enforces: an insight is only *considered* once a threshold is crossed.
 * The model is never asked "is there something to say here?" — that question is
 * answered by arithmetic first, which is what keeps the engine quiet.
 */

/** §4.6: "category rising >= 3 consecutive months". */
export const RISING_MONTHS = 3;

/** A move smaller than this is noise, not a pattern. */
export const MIN_MOVE_PERCENT = 10;

/** Never look further back than this. */
export const MONTHS_OF_HISTORY = 6;

export type MonthPoint = {
  /** 'YYYY-MM'. */
  month: string;
  cents: number;
};

export type CategorySeries = {
  categoryId: string | null;
  name: string;
  /** Oldest first. */
  points: MonthPoint[];
};

export type Pattern = {
  kind: 'trend' | 'celebration';
  categoryId: string | null;
  categoryName: string;
  /** The prompt describing what was found. Figures only — no adjectives. */
  brief: string;
};

export type TotalsRow = {
  month: string;
  category_id: string | null;
  category_name: string | null;
  total_cents: number;
};

/** Group flat view rows into one ordered series per category. */
export function toSeries(rows: TotalsRow[]): CategorySeries[] {
  const map = new Map<string, CategorySeries>();

  for (const row of rows) {
    const key = row.category_id ?? 'uncategorised';
    if (!map.has(key)) {
      map.set(key, {
        categoryId: row.category_id,
        name: row.category_name ?? 'Uncategorised',
        points: [],
      });
    }
    map.get(key)!.points.push({ month: row.month.slice(0, 7), cents: row.total_cents });
  }

  for (const entry of map.values()) {
    entry.points.sort((a, b) => a.month.localeCompare(b.month));
  }

  return [...map.values()];
}

/**
 * Find at most one pattern worth writing about.
 *
 * Two ship in v1:
 *  - a category down two months running — a *celebration*. §4.6: "ship these,
 *    they're what earn trust".
 *  - a category rising for RISING_MONTHS consecutive months — a *trend*.
 *
 * Celebrations win outright, even when a rising category also qualifies, because
 * DESIGN.md §7 says to lead with the win.
 *
 * Returns null when nothing crosses a threshold — the common and correct outcome.
 */
export function findPattern(series: CategorySeries[]): Pattern | null {
  let rising: Pattern | null = null;

  for (const category of series) {
    const points = category.points.slice(-MONTHS_OF_HISTORY);
    if (points.length < 3) continue;

    const last = points[points.length - 1];
    const previous = points[points.length - 2];
    const beforeThat = points[points.length - 3];

    const downTwice =
      percentChange(last.cents, previous.cents) <= -MIN_MOVE_PERCENT &&
      percentChange(previous.cents, beforeThat.cents) <= -MIN_MOVE_PERCENT;

    if (downTwice) {
      return {
        kind: 'celebration',
        categoryId: category.categoryId,
        categoryName: category.name,
        brief: [
          `${category.name} has fallen two months running.`,
          `${beforeThat.month}: ${beforeThat.cents} cents.`,
          `${previous.month}: ${previous.cents} cents.`,
          `${last.month}: ${last.cents} cents.`,
          'Write a short celebration note.',
        ].join('\n'),
      };
    }

    if (!rising && isRising(points)) {
      const window = points.slice(-RISING_MONTHS);
      rising = {
        kind: 'trend',
        categoryId: category.categoryId,
        categoryName: category.name,
        brief: [
          `${category.name} has risen ${RISING_MONTHS} months in a row.`,
          ...window.map((p) => `${p.month}: ${p.cents} cents.`),
          'Write a short, non-judgemental note pointing this out.',
        ].join('\n'),
      };
    }
  }

  return rising;
}

/** Rising by at least MIN_MOVE_PERCENT at every step of the window. */
export function isRising(points: MonthPoint[]): boolean {
  const window = points.slice(-RISING_MONTHS);
  if (window.length < RISING_MONTHS) return false;

  for (let i = 1; i < window.length; i += 1) {
    if (percentChange(window[i].cents, window[i - 1].cents) < MIN_MOVE_PERCENT) return false;
  }
  return true;
}

export function percentChange(current: number, previous: number): number {
  if (previous === 0) return current === 0 ? 0 : 100;
  return ((current - previous) / previous) * 100;
}

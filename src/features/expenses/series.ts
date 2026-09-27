/**
 * Shaping a monthly series for the §5.4 sparkline.
 *
 * Pure, and tested in tests/series_test.ts.
 */

/**
 * Drop the months before anything was recorded.
 *
 * The sparkline spans twelve months. Before this, a first statement drew eleven
 * months of flat zero and then a cliff — which reads as "spending exploded", when
 * the truth is "Sholdi has one month of history". Months of zero AFTER the first
 * recorded one are kept: those are real quiet months.
 */
export function trimLeadingEmpty(values: number[]): number[] {
  const first = values.findIndex((v) => v > 0);
  return first === -1 ? [] : values.slice(first);
}

/** A line needs two points. One month of history is a number, not a trend. */
export function isDrawable(values: number[]): boolean {
  return trimLeadingEmpty(values).length >= 2;
}

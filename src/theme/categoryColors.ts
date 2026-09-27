/**
 * Category → colour. DESIGN.md §4.3.
 *
 * A category's colour follows it everywhere: dot on home rows, label in import
 * review, block in the mosaic, delta figures. New categories are auto-assigned by
 * cycling the fixed palette — never a free colour picker.
 */
import { categoryPalette, colors, defaultCategoryColors, assignCategoryColor } from './tokens';
import type { CategoryColorToken } from './tokens';

export { categoryPalette, defaultCategoryColors, assignCategoryColor };
export type { CategoryColorToken };

export type CategoryColors = {
  accent: string;
  block: string;
  title: string;
  amount: string;
};

/**
 * What a colour can be ON SCREEN: one of the five category colours, or `none`.
 *
 * `none` is for spending that has no category yet. It used to borrow `sage`, which
 * is Groceries' colour — so after a statement import, "Uncategorised" and Groceries
 * sat next to each other with identical dots and read as the same thing. Unsorted
 * spending is not a category, and §4.1's rule applies: it stays on the neutral
 * ramp, in ink, with no colour of its own.
 */
export type DisplayColorToken = CategoryColorToken | 'none';

const NEUTRAL: CategoryColors = {
  accent: colors.muted,
  block: colors.raised,
  title: colors.ink2,
  amount: colors.ink3,
};

/** Resolve a stored `color_token` to its four-role colour set. */
export function categoryColors(token: DisplayColorToken): CategoryColors {
  if (token === 'none') return NEUTRAL;
  return categoryPalette[token] ?? NEUTRAL;
}

/** The accent — the one used for dots, labels and delta figures. */
export function categoryAccent(token: DisplayColorToken): string {
  return categoryColors(token).accent;
}

/**
 * The palette colour for a NEW category: whichever is used least, ties going to
 * palette order.
 *
 * Still §4.3 — assigned from the fixed palette, never chosen freely. It replaces
 * plain cycling by count, which ignores what is actually in use: delete two
 * categories and the next one could still land on a colour three others share.
 * With five colours a sixth category must share one; this at least makes it the
 * least crowded one.
 */
export function leastUsedCategoryColor(inUse: string[]): CategoryColorToken {
  const order = Object.keys(categoryPalette) as CategoryColorToken[];
  let best = order[0];
  let bestCount = Infinity;
  for (const token of order) {
    const count = inUse.filter((t) => t === token).length;
    if (count < bestCount) {
      best = token;
      bestCount = count;
    }
  }
  return best;
}

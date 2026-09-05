/**
 * Category → colour. DESIGN.md §4.3.
 *
 * A category's colour follows it everywhere: dot on home rows, label in import
 * review, block in the mosaic, delta figures. New categories are auto-assigned by
 * cycling the fixed palette — never a free colour picker.
 */
import { categoryPalette, defaultCategoryColors, assignCategoryColor } from './tokens';
import type { CategoryColorToken } from './tokens';

export { categoryPalette, defaultCategoryColors, assignCategoryColor };
export type { CategoryColorToken };

export type CategoryColors = (typeof categoryPalette)[CategoryColorToken];

/** Resolve a stored `color_token` to its four-role colour set. */
export function categoryColors(token: CategoryColorToken): CategoryColors {
  return categoryPalette[token];
}

/** The accent — the one used for dots, labels and delta figures. */
export function categoryAccent(token: CategoryColorToken): string {
  return categoryPalette[token].accent;
}

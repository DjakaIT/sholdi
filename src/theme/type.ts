/**
 * Type scale. DESIGN.md §3.
 *
 * The scale itself lives in `tokens.ts` (the drop-in artefact); this module is the
 * import site ARCHITECTURE.md §2 names, and adds the two things the raw scale can't
 * express as static objects: the Index size ramp and the screen-local overrides.
 *
 * Space Grotesk only. Weights 400 and 500 only. Never italic.
 */
export { fonts, tabular, type, indexTypeSize, INDEX_TYPE_MIN, INDEX_TYPE_MAX } from './tokens';

/**
 * Sizes that a screen section in DESIGN.md §6 specifies at odds with the global
 * §3 scale. Kept explicit rather than silently overriding the scale inline, so the
 * divergence is visible and easy to reconcile if §3 wins later.
 */
export const screenType = {
  /** §6.2: the home insight row is 12.5, where §3 lists Sholdi voice at 13.5. */
  homeInsightSize: 12.5,
  /** §6.5: insight card body is 13 / line-height 1.65. */
  insightCardSize: 13,
  insightCardLineHeight: 21.5,
} as const;

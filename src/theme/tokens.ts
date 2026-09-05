/**
 * Sholdi design tokens.
 * Source of truth: DESIGN.md. Do not add colours here without updating that file.
 *
 * The governing rule: colour lives in ink, never in surfaces.
 * Every background below is on one neutral ramp with a ~3% warm-plum undertone.
 */

export const colors = {
  // Neutral ramp — surfaces
  page: '#131114',
  pageDeep: '#0F0E11',
  surface: '#1C1A1E',
  raised: '#262430',
  line: '#2E2C32',
  hairline: '#232128',

  // Ink
  ink: '#EFEDEA',
  ink2: '#DAD8DC',
  ink3: '#C9C7CC',
  muted: '#8B8890',
  faint: '#5E5C64',
  onInk: '#191715',
} as const;

/**
 * Category identity. A category's colour follows it everywhere:
 * dot on home rows, label in import review, block in the mosaic, delta figures.
 *
 * New categories are auto-assigned from this list by cycling through the keys.
 * Never expose a free colour picker — the fixed palette is what keeps the app coherent.
 */
export const categoryPalette = {
  sage:    { accent: '#9DBE8C', block: '#28331F', title: '#D5E6C8', amount: '#C2D6B4' },
  slate:   { accent: '#89A7CC', block: '#232E42', title: '#CBDCF2', amount: '#B8CCE6' },
  plum:    { accent: '#B58BB1', block: '#39293C', title: '#EAD2E8', amount: '#DCC0DA' },
  olive:   { accent: '#A8B380', block: '#333A22', title: '#DEE6C4', amount: '#CFD8B0' },
  heather: { accent: '#9D8FD0', block: '#2C2745', title: '#DAD2F2', amount: '#C8BFE8' },
} as const;

export type CategoryColorToken = keyof typeof categoryPalette;

export const defaultCategoryColors: Record<string, CategoryColorToken> = {
  Groceries: 'sage',
  Transport: 'slate',
  'Eating out': 'plum',
  Fuel: 'olive',
  Fitness: 'heather',
};

const TOKEN_CYCLE = Object.keys(categoryPalette) as CategoryColorToken[];

/** Assign a colour to a newly created category, cycling through the fixed palette. */
export function assignCategoryColor(existingCount: number): CategoryColorToken {
  return TOKEN_CYCLE[existingCount % TOKEN_CYCLE.length];
}

export const fonts = {
  regular: 'SpaceGrotesk_400Regular',
  medium: 'SpaceGrotesk_500Medium',
} as const;

/** Money must always render with tabular figures or right-aligned columns jitter. */
export const tabular = { fontVariant: ['tabular-nums' as const] };

export const type = {
  heroAmount:   { fontFamily: fonts.medium,  fontSize: 44,   letterSpacing: -1.3, ...tabular },
  heroSymbol:   { fontFamily: fonts.regular, fontSize: 20,   ...tabular },
  heroCents:    { fontFamily: fonts.regular, fontSize: 17,   ...tabular },
  title:        { fontFamily: fonts.medium,  fontSize: 22,   letterSpacing: -0.22 },
  body:         { fontFamily: fonts.regular, fontSize: 13.5, lineHeight: 23 },
  rowLabel:     { fontFamily: fonts.regular, fontSize: 13.5 },
  amount:       { fontFamily: fonts.regular, fontSize: 13,   ...tabular },
  secondary:    { fontFamily: fonts.regular, fontSize: 11 },
  eyebrow:      { fontFamily: fonts.regular, fontSize: 11, letterSpacing: 1.5, textTransform: 'uppercase' as const },
  micro:        { fontFamily: fonts.regular, fontSize: 10.5, ...tabular },
} as const;

/** Index screen: type size scales with spend share, clamped so outliers don't dominate. */
export const INDEX_TYPE_MIN = 13;
export const INDEX_TYPE_MAX = 19;

export function indexTypeSize(share: number): number {
  const clamped = Math.max(0, Math.min(1, share));
  return INDEX_TYPE_MIN + clamped * (INDEX_TYPE_MAX - INDEX_TYPE_MIN);
}

export const radii = {
  tile: 14,
  card: 16,
  block: 12,
  sheet: 20,
  sheetBottom: 24,
  pill: 999,
  phone: 26,
} as const;

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 22, xxl: 28 } as const;

/** Buttons use a FIXED height + flex centring. Padding-based centring misaligns the label. */
export const BUTTON_HEIGHT = 43;

export const nav = {
  iconSize: 20,
  iconStroke: 1.6,
  tabWidth: 40,
  gap: 9,
  indicatorWidth: 16,
  indicatorHeight: 2,
  paddingBottom: 6,
} as const;

/** The caron — Sholdi's voice mark. Render only where Sholdi is speaking. */
export const CARON_PATH = 'M2 1 L7 5.5 L12 1';
export const CARON_VIEWBOX = '0 0 14 7';
export const CARON_STROKE_WIDTH = 2.2;

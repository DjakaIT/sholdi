/**
 * One block of the Index mosaic. DESIGN.md §6.7.
 *
 * This is the one place a *surface* carries category colour, and it is deliberate:
 * §4.3 gives each category a block background, title colour and amount colour of its
 * own. Everywhere else the rule in §4.1 holds — colour lives in ink, never surfaces.
 *
 * Top row: category name + small icon. Bottom row: amount + delta, the delta in the
 * category's own accent. The largest block also carries its share of the month.
 */
import { createElement } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { formatMoneyWhole } from '@/lib/money';
import { categoryColors } from '@/theme/categoryColors';
import type { DisplayColorToken } from '@/theme/categoryColors';
import { categoryIcon } from '@/theme/categoryIcons';
import { fonts, radii, tabular } from '@/theme/tokens';

const ICON_SIZE = 13;
const ICON_STROKE = 1.6;

export type CategoryBlockProps = {
  name: string;
  colorToken: DisplayColorToken;
  cents: number;
  currency?: string;
  /**
   * Whole percent change on the previous month. Negative means spending fell.
   * Null when there is no previous month to compare with — which used to render as
   * "↑ 0%", a claim about a month that has no data.
   */
  deltaPercent: number | null;
  /** Type size for the name, already clamped to 13–19 by the caller (§6.7). */
  nameSize: number;
  height: number;
  /** Only the largest block shows this, e.g. "42% of month". */
  shareLabel?: string;
};

export function CategoryBlock({
  name,
  colorToken,
  cents,
  currency,
  deltaPercent,
  nameSize,
  height,
  shareLabel,
}: CategoryBlockProps) {
  const palette = categoryColors(colorToken);
  // Looked up from a module-level map, then rendered with createElement: assigning
  // it to a capitalised local and using it as JSX reads to the linter as a
  // component defined during render.
  const icon = categoryIcon(name);

  const delta =
    deltaPercent === null
      ? null
      : deltaPercent === 0
        ? 'same'
        : `${deltaPercent < 0 ? '↓' : '↑'} ${Math.abs(deltaPercent)}%`;

  return (
    <View style={[styles.block, { backgroundColor: palette.block, height }]}>
      <View style={styles.topRow}>
        <Text style={[styles.name, { color: palette.title, fontSize: nameSize }]} numberOfLines={1}>
          {name}
        </Text>
        {icon && createElement(icon, { size: ICON_SIZE, strokeWidth: ICON_STROKE, color: palette.title })}
      </View>

      <View style={styles.bottom}>
        {shareLabel && <Text style={[styles.share, { color: palette.amount }]}>{shareLabel}</Text>}
        <View style={styles.bottomRow}>
          <Text style={[styles.amount, { color: palette.amount }]}>
            {formatMoneyWhole(cents, currency)}
          </Text>
          {/* Delta in the category's own colour (§6.7). */}
          {delta && <Text style={[styles.delta, { color: palette.accent }]}>{delta}</Text>}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  block: {
    flex: 1,
    borderRadius: radii.block,
    padding: 11,
    justifyContent: 'space-between',
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
  },
  name: {
    fontFamily: fonts.regular,
    letterSpacing: -0.19,
    flexShrink: 1,
  },
  bottom: {
    gap: 2,
  },
  bottomRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: 6,
  },
  amount: {
    fontFamily: fonts.regular,
    fontSize: 13,
    ...tabular,
  },
  delta: {
    fontFamily: fonts.regular,
    fontSize: 10.5,
    ...tabular,
  },
  share: {
    fontFamily: fonts.regular,
    fontSize: 10.5,
    opacity: 0.75,
  },
});

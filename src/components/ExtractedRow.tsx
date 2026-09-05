/**
 * One extracted transaction on the import review screen. DESIGN.md §6.4.
 *
 * Merchant in `ink2` 13, the suggested category beneath it in that category's own
 * colour behind a 5px dot, amount and date right-aligned.
 *
 * §5: "Design the review screen for correction speed: tapping a category label
 * opens a picker inline, never a new screen." `onPressCategory` is that hook — the
 * label is its own touch target, separate from the row.
 */
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Amount } from '@/components/Amount';
import { categoryAccent } from '@/theme/categoryColors';
import type { CategoryColorToken } from '@/theme/categoryColors';
import { colors, fonts, type as typeScale } from '@/theme/tokens';

/** §6.4: "prefixed by a 5px dot". */
const DOT = 5;

export type ExtractedRowProps = {
  merchant: string;
  category: string;
  colorToken: CategoryColorToken;
  cents: number;
  currency?: string;
  /** 'YYYY-MM-DD'. */
  occurredOn: string;
  onPressCategory?: () => void;
};

export function ExtractedRow({
  merchant,
  category,
  colorToken,
  cents,
  currency,
  occurredOn,
  onPressCategory,
}: ExtractedRowProps) {
  const accent = categoryAccent(colorToken);

  return (
    <View style={styles.row}>
      <View style={styles.left}>
        <Text style={styles.merchant} numberOfLines={1}>
          {merchant}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Category: ${category}. Tap to change.`}
          onPress={onPressCategory}
          style={styles.categoryRow}>
          <View style={[styles.dot, { backgroundColor: accent }]} />
          <Text style={[styles.category, { color: accent }]}>{category}</Text>
        </Pressable>
      </View>

      <View style={styles.right}>
        <Amount cents={cents} currency={currency} color={colors.ink} />
        <Text style={styles.date}>{shortDate(occurredOn)}</Text>
      </View>
    </View>
  );
}

/** '2026-08-29' -> '29 Aug'. Local formatting only; the value stays a date string. */
function shortDate(occurredOn: string): string {
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const day = Number(occurredOn.slice(8, 10));
  const month = MONTHS[Number(occurredOn.slice(5, 7)) - 1] ?? '';
  return `${day} ${month}`;
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 11,
    gap: 12,
  },
  left: {
    flex: 1,
    gap: 4,
  },
  merchant: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: colors.ink2,
  },
  categoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  dot: {
    width: DOT,
    height: DOT,
    borderRadius: DOT / 2,
  },
  category: {
    fontFamily: fonts.regular,
    fontSize: 11,
  },
  right: {
    alignItems: 'flex-end',
    gap: 3,
  },
  date: {
    ...typeScale.secondary,
    color: colors.muted,
  },
});

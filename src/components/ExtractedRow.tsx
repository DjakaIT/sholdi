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
import { ChevronDown } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Amount } from '@/components/Amount';
import { shortDate } from '@/lib/dates';
import { categoryAccent } from '@/theme/categoryColors';
import type { DisplayColorToken } from '@/theme/categoryColors';
import { colors, fonts, type as typeScale } from '@/theme/tokens';

/** §6.4: "prefixed by a 5px dot". */
const DOT = 5;

export type ExtractedRowProps = {
  merchant: string;
  category: string;
  colorToken: DisplayColorToken;
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
          disabled={!onPressCategory}
          hitSlop={{ top: 8, bottom: 8, left: 4, right: 24 }}
          style={styles.categoryRow}>
          <View style={[styles.dot, { backgroundColor: accent }]} />
          <Text style={[styles.category, { color: accent }]}>{category}</Text>
          {/* Says "this opens" without a word of copy. */}
          {onPressCategory && <ChevronDown size={11} strokeWidth={1.6} color={accent} />}
        </Pressable>
      </View>

      <View style={styles.right}>
        <Amount cents={cents} currency={currency} color={colors.ink} />
        <Text style={styles.date}>{shortDate(occurredOn)}</Text>
      </View>
    </View>
  );
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

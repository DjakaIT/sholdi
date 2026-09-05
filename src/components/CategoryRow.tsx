/**
 * A top-category row on Home. DESIGN.md §6.2, card spec §5.3.
 *
 * `surface` card, 14 radius, 12x13 padding, space-between. The only colour is the
 * category's own accent dot — the surface stays neutral (§4.1).
 */
import { StyleSheet, Text, View } from 'react-native';

import { Amount } from '@/components/Amount';
import { categoryAccent } from '@/theme/categoryColors';
import type { CategoryColorToken } from '@/theme/categoryColors';
import { colors, radii, type as typeScale } from '@/theme/tokens';

/** §6.4 sizes the category dot at 5px; Home reuses it so the mark reads the same. */
const DOT = 5;

export type CategoryRowProps = {
  name: string;
  colorToken: CategoryColorToken;
  /** Integer cents. */
  cents: number;
  currency?: string;
};

export function CategoryRow({ name, colorToken, cents, currency }: CategoryRowProps) {
  return (
    <View style={styles.row}>
      <View style={styles.left}>
        <View style={[styles.dot, { backgroundColor: categoryAccent(colorToken) }]} />
        <Text style={styles.label}>{name}</Text>
      </View>
      <Amount cents={cents} currency={currency} color={colors.ink2} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    backgroundColor: colors.surface,
    borderRadius: radii.tile,
    paddingVertical: 12,
    paddingHorizontal: 13,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  left: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
  },
  dot: {
    width: DOT,
    height: DOT,
    borderRadius: DOT / 2,
  },
  label: {
    ...typeScale.rowLabel,
    color: colors.ink2,
  },
});

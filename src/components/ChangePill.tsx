/**
 * Month-over-month change, under the hero amount. DESIGN.md §6.2.
 *
 * 1px `line` border, pill radius, `ink3` at 11. Chrome, so it is monochrome even
 * when the number is bad news — colour belongs to categories, not to judgement (§4.1).
 */
import { StyleSheet, Text, View } from 'react-native';

import { monthShort } from '@/lib/dates';
import { colors, fonts, radii } from '@/theme/tokens';

export type ChangePillProps = {
  /** Whole percent. Negative means spending fell. */
  percent: number;
  /** The month being compared against, as 'YYYY-MM'. */
  comparedTo: string;
};

export function ChangePill({ percent, comparedTo }: ChangePillProps) {
  const arrow = percent < 0 ? '\u2193' : '\u2191';
  const magnitude = Math.abs(percent);

  return (
    <View style={styles.pill}>
      <Text style={styles.text}>
        {arrow} {magnitude}% vs {monthShort(comparedTo)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radii.pill,
    paddingVertical: 5,
    paddingHorizontal: 11,
  },
  text: {
    fontFamily: fonts.regular,
    fontSize: 11,
    color: colors.ink3,
  },
});

/**
 * The single Sholdi observation on Home. DESIGN.md §6.2.
 *
 * Same `surface` card as the rows, caron prefix, text `ink3` at 12.5.
 * The caron is what marks this as Sholdi speaking; it appears here and nowhere
 * decorative (§2).
 */
import { StyleSheet, Text, View } from 'react-native';

import { Caron } from '@/components/Caron';
import { colors, fonts, radii } from '@/theme/tokens';
import { screenType } from '@/theme/type';

const CARON_WIDTH = 12;

export type InsightRowProps = {
  /** Sholdi's line. Sentence case, no exclamation marks, no emoji (§7). */
  text: string;
};

export function InsightRow({ text }: InsightRowProps) {
  return (
    <View style={styles.card}>
      <View style={styles.caron}>
        <Caron width={CARON_WIDTH} color={colors.ink3} />
      </View>
      <Text style={styles.text}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.tile,
    paddingVertical: 12,
    paddingHorizontal: 13,
    flexDirection: 'row',
    gap: 9,
  },
  // Nudges the mark onto the first line's cap height instead of its box top.
  caron: {
    paddingTop: 7,
  },
  text: {
    flex: 1,
    fontFamily: fonts.regular,
    fontSize: screenType.homeInsightSize,
    lineHeight: screenType.homeInsightSize * 1.7,
    color: colors.ink3,
  },
});

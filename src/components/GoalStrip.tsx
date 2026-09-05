/**
 * The goal strip that closes the Index mosaic. DESIGN.md §6.7.
 *
 * Full width, height 58, `surface` background, 1px border. Crucially it carries NO
 * category colour: §4.3 is explicit that "goals are not categories", so this renders
 * outlined in ink/muted and is the one block in the mosaic that stays monochrome.
 */
import { StyleSheet, Text, View } from 'react-native';

import { formatMoneyWhole } from '@/lib/money';
import { colors, fonts, radii, tabular } from '@/theme/tokens';

/** §6.7 specifies this border colour inline; it is not part of the neutral ramp. */
const GOAL_BORDER = '#3E3C44';

const HEIGHT = 58;
const BAR_HEIGHT = 2;

export type GoalStripProps = {
  name: string;
  savedCents: number;
  targetCents: number;
  currency?: string;
};

export function GoalStrip({ name, savedCents, targetCents, currency }: GoalStripProps) {
  const progress = targetCents > 0 ? Math.min(1, savedCents / targetCents) : 0;

  return (
    <View style={styles.strip}>
      <View style={styles.row}>
        <Text style={styles.name} numberOfLines={1}>
          {name}
        </Text>
        <Text style={styles.amount}>
          {formatMoneyWhole(savedCents, currency)} of {formatMoneyWhole(targetCents, currency)}
        </Text>
      </View>

      {/* §5.4: proportional bars are plain Views with percentage widths. */}
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${progress * 100}%` }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  strip: {
    height: HEIGHT,
    borderRadius: radii.block,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: GOAL_BORDER,
    paddingHorizontal: 11,
    justifyContent: 'center',
    gap: 9,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: 8,
  },
  name: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: colors.ink2,
    flexShrink: 1,
  },
  amount: {
    fontFamily: fonts.regular,
    fontSize: 11,
    color: colors.muted,
    ...tabular,
  },
  track: {
    height: BAR_HEIGHT,
    borderRadius: 1,
    backgroundColor: colors.line,
    overflow: 'hidden',
  },
  fill: {
    height: BAR_HEIGHT,
    borderRadius: 1,
    backgroundColor: colors.ink,
  },
});

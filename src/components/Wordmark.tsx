/**
 * The Sholdi wordmark. DESIGN.md §2.
 *
 * "The caron floats above the 'S' of Sholdi" — above that one letter, not centred
 * over the whole word. So the S is its own element with the mark positioned over it,
 * and the remaining letters follow on the same baseline.
 *
 * Splitting the word across two Text nodes is safe here: Space Grotesk has no
 * ligature spanning S-h, so the pair renders identically to a single string.
 */
import { StyleSheet, Text, View } from 'react-native';

import { Caron } from '@/components/Caron';
import { colors, fonts } from '@/theme/tokens';

export type WordmarkProps = {
  /** §6.1 sets the splash wordmark at 36. */
  size?: number;
  color?: string;
  /** Draw the caron on. Splash only (§8). */
  drawIn?: boolean;
};

export function Wordmark({ size = 36, color = colors.ink, drawIn = false }: WordmarkProps) {
  const caronWidth = size * 0.42;
  // Clears the cap height of the S without drifting away from it.
  const caronLift = size * 0.3;

  return (
    <View style={styles.row} accessibilityRole="header" accessibilityLabel="Sholdi">
      <View>
        <View style={[styles.caron, { top: -caronLift }]} pointerEvents="none">
          <Caron width={caronWidth} color={color} drawIn={drawIn} />
        </View>
        <Text style={[styles.word, { fontSize: size, color }]}>S</Text>
      </View>
      <Text style={[styles.word, { fontSize: size, color }]}>holdi</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
  word: {
    fontFamily: fonts.medium,
    letterSpacing: -0.5,
  },
  caron: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
  },
});

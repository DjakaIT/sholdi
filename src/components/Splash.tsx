/**
 * Splash. DESIGN.md §6.1.
 *
 * Centred wordmark with the floating caron at 36/500, tagline "Money, sorted." in
 * `muted` 12.5 sitting 12px below.
 *
 * This is the *in-app* splash, shown once the fonts have loaded — it has to be,
 * since the wordmark is Space Grotesk. The native splash covers the moment before
 * that. The caron drawing itself in is the first of the four animations DESIGN.md §8
 * permits; under reduced motion the mark simply appears and the hold shortens.
 */
import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';

import { Wordmark } from '@/components/Wordmark';
import { colors, fonts } from '@/theme/tokens';

/** The ~600ms draw (§8) plus a beat to read the tagline. */
const HOLD_MS = 1400;
const REDUCED_HOLD_MS = 400;

export type SplashProps = {
  /** Called once the splash has had its moment. */
  onDone: () => void;
};

export function Splash({ onDone }: SplashProps) {
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    const timer = setTimeout(onDone, reduceMotion ? REDUCED_HOLD_MS : HOLD_MS);
    return () => clearTimeout(timer);
  }, [onDone, reduceMotion]);

  return (
    <View style={styles.screen}>
      <Wordmark size={36} drawIn />
      <Text style={styles.tagline}>Money, sorted.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  // An overlay, not a flow sibling: it covers the navigator while it is up rather
  // than sharing the screen with it.
  screen: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 10,
    backgroundColor: colors.page,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tagline: {
    fontFamily: fonts.regular,
    fontSize: 12.5,
    color: colors.muted,
    marginTop: 12,
  },
});

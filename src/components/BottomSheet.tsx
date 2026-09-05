/**
 * Bottom sheet chrome. DESIGN.md §5.3, motion §8 item 3.
 *
 * Sheet: `surface`, radius 20/20/24/24, with a 32x3 grabber centred above a 16px
 * bottom margin. The backdrop is the screen behind at 35% opacity on `pageDeep` —
 * i.e. a `pageDeep` scrim at 65% over the live screen.
 *
 * Motion budget: this is one of the four places DESIGN.md allows animation. The
 * sheet springs open and the backdrop fades; nothing else moves.
 */
import { useEffect } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, radii, spacing } from '@/theme/tokens';

/** §6.3: "the home screen at 35% opacity on pageDeep". */
const SCRIM_OPACITY = 0.65;

const GRABBER_WIDTH = 32;
const GRABBER_HEIGHT = 3;

export type BottomSheetProps = {
  children: React.ReactNode;
  /** Tapping the backdrop dismisses. */
  onDismiss: () => void;
};

export function BottomSheet({ children, onDismiss }: BottomSheetProps) {
  const insets = useSafeAreaInsets();
  const reduceMotion = useReducedMotion();

  const progress = useSharedValue(0);

  useEffect(() => {
    if (reduceMotion) {
      progress.value = 1;
      return;
    }
    progress.value = withSpring(1, { damping: 20, stiffness: 220, mass: 0.6 });
  }, [progress, reduceMotion]);

  const scrimStyle = useAnimatedStyle(() => ({
    opacity: reduceMotion
      ? SCRIM_OPACITY
      : withTiming(progress.value * SCRIM_OPACITY, { duration: 180 }),
  }));

  const sheetStyle = useAnimatedStyle(() => ({
    // Springs up from just below its own height.
    transform: [{ translateY: (1 - progress.value) * 420 }],
  }));

  return (
    <View style={styles.root}>
      <Animated.View style={[styles.scrim, scrimStyle]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Dismiss"
          onPress={onDismiss}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>

      <Animated.View
        style={[styles.sheet, { paddingBottom: spacing.xl + insets.bottom }, sheetStyle]}>
        <View style={styles.grabber} />
        {children}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  scrim: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.pageDeep,
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radii.sheet,
    borderTopRightRadius: radii.sheet,
    borderBottomLeftRadius: radii.sheetBottom,
    borderBottomRightRadius: radii.sheetBottom,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
  },
  grabber: {
    width: GRABBER_WIDTH,
    height: GRABBER_HEIGHT,
    borderRadius: GRABBER_HEIGHT / 2,
    backgroundColor: colors.line,
    alignSelf: 'center',
    marginBottom: spacing.lg,
  },
});

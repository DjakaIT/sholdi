/**
 * The caron — Sholdi's brand mark and voice indicator. DESIGN.md §2.
 *
 * Two strokes, a shallow V. It prefixes every line of text Sholdi speaks and
 * MUST NEVER be used decoratively anywhere else.
 *
 * Minimum render size is 12x6; the `width` prop is clamped to that floor.
 */
import { useEffect } from 'react';
import Animated, {
  useAnimatedProps,
  useReducedMotion,
  useSharedValue,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';

import { CARON_PATH, CARON_STROKE_WIDTH, CARON_VIEWBOX, colors } from '@/theme/tokens';

/** DESIGN.md §2: "Minimum render size 12x6px." */
const MIN_WIDTH = 12;
const ASPECT = 7 / 14;

/**
 * Length of `M2 1 L7 5.5 L12 1` in viewBox units — two segments of
 * sqrt(5² + 4.5²). Used as the dash length for the draw-in.
 */
const PATH_LENGTH = 13.4536;

/** DESIGN.md §8: the draw-in is ~600ms, and only on the splash. */
const DRAW_MS = 600;

const AnimatedPath = Animated.createAnimatedComponent(Path);

export type CaronProps = {
  /** Mark width in px. Height follows the 14:7 viewBox. Clamped to >= 12. */
  width?: number;
  /** Defaults to `ink`, the wordmark colour. */
  color?: string;
  /**
   * Draw the strokes on rather than appearing instantly. DESIGN.md §8 spends the
   * motion budget on this in exactly one place — the splash. Do not enable it
   * elsewhere. Ignored when the user has asked for reduced motion.
   */
  drawIn?: boolean;
};

export function Caron({ width = 14, color = colors.ink, drawIn = false }: CaronProps) {
  const w = Math.max(MIN_WIDTH, width);
  const h = w * ASPECT;

  const reduceMotion = useReducedMotion();
  // 0 = fully hidden, 1 = fully drawn.
  const progress = useSharedValue(drawIn ? 0 : 1);

  useEffect(() => {
    if (!drawIn || reduceMotion) {
      progress.value = 1;
      return;
    }
    progress.value = withTiming(1, {
      duration: DRAW_MS,
      easing: Easing.out(Easing.cubic),
    });
  }, [drawIn, reduceMotion, progress]);

  const animatedProps = useAnimatedProps(() => ({
    strokeDashoffset: PATH_LENGTH * (1 - progress.value),
  }));

  return (
    <Svg width={w} height={h} viewBox={CARON_VIEWBOX} fill="none">
      <AnimatedPath
        d={CARON_PATH}
        stroke={color}
        strokeWidth={CARON_STROKE_WIDTH}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeDasharray={drawIn ? PATH_LENGTH : undefined}
        animatedProps={drawIn ? animatedProps : undefined}
      />
    </Svg>
  );
}

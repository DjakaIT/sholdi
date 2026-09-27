/**
 * Empty states. Not specified in DESIGN.md — a proposal built from its rules.
 *
 * A screen with nothing on it reads as broken. Each empty screen gets a ghost of
 * what will be there — the Stats bars, the Index mosaic, the Home sparkline, the
 * Notes cards — drawn on the neutral ramp only (§4.1: colour lives in ink, never
 * surfaces, and there is no data yet to colour anything with), then one line in
 * Sholdi's voice and the action that fills it.
 *
 * ── On motion, since §8 is strict ─────────────────────────────────────────────
 * §8 spends the motion budget in four places and says everything else is instant.
 * The ghost drawing itself in once was asked for explicitly, so it is done in the
 * most §8-shaped way available: the SAME gesture as the splash caron (a stroke that
 * draws on, ease-out, well under a second), exactly once per mount, never looping,
 * and skipped entirely when the user has asked for reduced motion.
 *
 * The caron is NOT part of any illustration. §2: it "MUST NEVER be used
 * decoratively". It appears only in front of the line Sholdi speaks.
 */
import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  interpolate,
  Extrapolation,
  useAnimatedProps,
  useReducedMotion,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import Svg, { Circle, Line, Path, Rect } from 'react-native-svg';

import { Caron } from '@/components/Caron';
import { colors, fonts, spacing } from '@/theme/tokens';

const AnimatedRect = Animated.createAnimatedComponent(Rect);
const AnimatedPath = Animated.createAnimatedComponent(Path);
const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const AnimatedLine = Animated.createAnimatedComponent(Line);

/** Illustration box. Wide and short so it never dominates the screen. */
const W = 176;
const H = 100;

/** The whole drawing, start to finish. Under a second, like the splash caron. */
const DRAW_MS = 900;

const STROKE = colors.faint;
const FILL = colors.surface;
const FILL_STRONG = colors.raised;

export type EmptyIllustration = 'bars' | 'mosaic' | 'line' | 'notes';

export type EmptyStateProps = {
  illustration: EmptyIllustration;
  /** Sholdi's line. Sentence case, no exclamation, no emoji (§7). */
  line: string;
  /** Buttons, stacked full width beneath the line. */
  children?: React.ReactNode;
};

export function EmptyState({ illustration, line, children }: EmptyStateProps) {
  const reduceMotion = useReducedMotion();
  const progress = useSharedValue(reduceMotion ? 1 : 0);

  useEffect(() => {
    if (reduceMotion) {
      progress.value = 1;
      return;
    }
    progress.value = withTiming(1, { duration: DRAW_MS, easing: Easing.out(Easing.cubic) });
  }, [progress, reduceMotion]);

  return (
    <View style={styles.root}>
      <View
        style={styles.art}
        // The drawing is decoration; the line below carries the meaning.
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants">
        <Svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
          {illustration === 'bars' && <Bars progress={progress} />}
          {illustration === 'mosaic' && <Mosaic progress={progress} />}
          {illustration === 'line' && <Sparkline progress={progress} />}
          {illustration === 'notes' && <Notes progress={progress} />}
        </Svg>
      </View>

      <View style={styles.voice}>
        <View style={styles.caron}>
          <Caron width={12} color={colors.ink3} />
        </View>
        <Text style={styles.line}>{line}</Text>
      </View>

      {children && <View style={styles.actions}>{children}</View>}
    </View>
  );
}

// ── pieces ───────────────────────────────────────────────────────────────────

type Stage = { progress: SharedValue<number>; from: number; to: number };

/** A rounded rectangle whose outline draws itself on. */
function DrawnRect({
  progress,
  from,
  to,
  x,
  y,
  width,
  height,
  fill = FILL,
}: Stage & { x: number; y: number; width: number; height: number; fill?: string }) {
  // Perimeter of the rounded rect, slightly over-estimated so the dash never shows
  // a gap at the end of the draw.
  const length = 2 * (width + height);

  const animatedProps = useAnimatedProps(() => {
    const t = interpolate(progress.value, [from, to], [0, 1], Extrapolation.CLAMP);
    return { strokeDashoffset: length * (1 - t), fillOpacity: t };
  });

  return (
    <AnimatedRect
      x={x}
      y={y}
      width={width}
      height={height}
      rx={5}
      fill={fill}
      stroke={STROKE}
      strokeWidth={1}
      strokeDasharray={[length, length]}
      animatedProps={animatedProps}
    />
  );
}

/** A short rule — a line of ghost text. */
function DrawnRule({
  progress,
  from,
  to,
  x,
  y,
  width,
}: Stage & { x: number; y: number; width: number }) {
  const animatedProps = useAnimatedProps(() => ({
    x2: x + width * interpolate(progress.value, [from, to], [0, 1], Extrapolation.CLAMP),
  }));
  return (
    <AnimatedLine
      x1={x}
      y1={y}
      y2={y}
      stroke={colors.line}
      strokeWidth={3}
      strokeLinecap="round"
      animatedProps={animatedProps}
    />
  );
}

/** A bar that grows up from the baseline. */
function GrowBar({
  progress,
  from,
  to,
  x,
  height,
  width,
  baseline,
  strong,
}: Stage & { x: number; height: number; width: number; baseline: number; strong?: boolean }) {
  const animatedProps = useAnimatedProps(() => {
    const h = height * interpolate(progress.value, [from, to], [0, 1], Extrapolation.CLAMP);
    return { y: baseline - h, height: h };
  });
  return (
    <AnimatedRect
      x={x}
      width={width}
      rx={3}
      fill={strong ? FILL_STRONG : FILL}
      stroke={strong ? STROKE : colors.line}
      strokeWidth={1}
      animatedProps={animatedProps}
    />
  );
}

// ── illustrations ────────────────────────────────────────────────────────────

/** Stats: six months of bars, the last one — this month — a shade stronger. */
function Bars({ progress }: { progress: SharedValue<number> }) {
  const heights = [34, 52, 40, 66, 48, 80];
  const barW = 16;
  const gap = 12;
  const total = heights.length * barW + (heights.length - 1) * gap;
  const left = (W - total) / 2;
  const baseline = H - 6;

  return (
    <>
      <Line x1={8} y1={baseline + 0.5} x2={W - 8} y2={baseline + 0.5} stroke={colors.line} strokeWidth={1} />
      {heights.map((h, i) => (
        <GrowBar
          key={i}
          progress={progress}
          from={i * 0.08}
          to={i * 0.08 + 0.55}
          x={left + i * (barW + gap)}
          width={barW}
          height={h}
          baseline={baseline}
          strong={i === heights.length - 1}
        />
      ))}
    </>
  );
}

/** Index: the §6.7 mosaic — one wide block, then two rows of two. */
function Mosaic({ progress }: { progress: SharedValue<number> }) {
  const g = 5;
  const rows = [
    { y: 2, h: 34, split: [1] },
    { y: 2 + 34 + g, h: 28, split: [17, 14] },
    { y: 2 + 34 + g + 28 + g, h: 26, split: [12, 9] },
  ];
  const blocks: { x: number; y: number; w: number; h: number }[] = [];
  const inner = W - 4;

  for (const row of rows) {
    const sum = row.split.reduce((a, b) => a + b, 0);
    const usable = inner - g * (row.split.length - 1);
    let x = 2;
    for (const part of row.split) {
      const w = (usable * part) / sum;
      blocks.push({ x, y: row.y, w, h: row.h });
      x += w + g;
    }
  }

  return (
    <>
      {blocks.map((b, i) => (
        <DrawnRect
          key={i}
          progress={progress}
          from={i * 0.1}
          to={i * 0.1 + 0.5}
          x={b.x}
          y={b.y}
          width={b.w}
          height={b.h}
          fill={i === 0 ? FILL_STRONG : FILL}
        />
      ))}
    </>
  );
}

/** Home: a ghost of the §5.4 sparkline, ending in its dot. */
function Sparkline({ progress }: { progress: SharedValue<number> }) {
  // A gentle drift, not a squiggle: it should read as "a line goes here".
  const values = [0.55, 0.48, 0.58, 0.5, 0.42, 0.47, 0.33];
  const inset = 6;
  const pts = values.map((v, i) => ({
    x: inset + (i / (values.length - 1)) * (W - inset * 2),
    y: inset + v * (H - inset * 2),
  }));

  let d = `M${pts[0].x},${pts[0].y}`;
  let length = 0;
  for (let i = 0; i < pts.length - 1; i += 1) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;
    d += ` C${p1.x + (p2.x - p0.x) / 6},${p1.y + (p2.y - p0.y) / 6} ${p2.x - (p3.x - p1.x) / 6},${p2.y - (p3.y - p1.y) / 6} ${p2.x},${p2.y}`;
    length += Math.hypot(p2.x - p1.x, p2.y - p1.y);
  }
  // A curve is a little longer than its chords.
  length *= 1.08;
  const last = pts[pts.length - 1];

  const lineProps = useAnimatedProps(() => ({
    strokeDashoffset: length * (1 - interpolate(progress.value, [0, 0.85], [0, 1], Extrapolation.CLAMP)),
  }));
  const dotProps = useAnimatedProps(() => ({
    opacity: interpolate(progress.value, [0.8, 1], [0, 1], Extrapolation.CLAMP),
  }));

  return (
    <>
      <AnimatedPath
        d={d}
        stroke={STROKE}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
        strokeDasharray={[length, length]}
        animatedProps={lineProps}
      />
      <AnimatedCircle cx={last.x} cy={last.y} r={2.5} fill={colors.muted} animatedProps={dotProps} />
    </>
  );
}

/** Notes: two §6.5 cards, each with a couple of lines of ghost text. */
function Notes({ progress }: { progress: SharedValue<number> }) {
  const cardH = 44;
  const cards = [4, 4 + cardH + 8];
  return (
    <>
      {cards.map((y, i) => (
        <DrawnRect
          key={`c${i}`}
          progress={progress}
          from={i * 0.2}
          to={i * 0.2 + 0.5}
          x={2}
          y={y}
          width={W - 4}
          height={cardH}
        />
      ))}
      {cards.map((y, i) => (
        <DrawnRule
          key={`a${i}`}
          progress={progress}
          from={0.35 + i * 0.2}
          to={0.65 + i * 0.2}
          x={14}
          y={y + 16}
          width={i === 0 ? 96 : 120}
        />
      ))}
      {cards.map((y, i) => (
        <DrawnRule
          key={`b${i}`}
          progress={progress}
          from={0.45 + i * 0.2}
          to={0.75 + i * 0.2}
          x={14}
          y={y + 29}
          width={i === 0 ? 64 : 80}
        />
      ))}
    </>
  );
}

const styles = StyleSheet.create({
  root: {
    alignItems: 'center',
    paddingVertical: spacing.xl,
  },
  art: {
    width: W,
    height: H,
  },
  voice: {
    flexDirection: 'row',
    gap: 9,
    marginTop: spacing.xl,
    maxWidth: 300,
  },
  caron: {
    paddingTop: 7,
  },
  line: {
    flexShrink: 1,
    fontFamily: fonts.regular,
    fontSize: 13,
    lineHeight: 13 * 1.7,
    color: colors.ink3,
  },
  actions: {
    alignSelf: 'stretch',
    marginTop: spacing.xl,
    gap: spacing.sm,
  },
});

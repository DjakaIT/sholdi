/**
 * Sparkline. DESIGN.md §5.4.
 *
 * One cubic bezier path, stroke `muted` at 1.5, with a single 2.5r `ink` dot at
 * the final point. There is deliberately NO fill under the curve — a colour-filled
 * area was explicitly rejected (§9) — and deliberately no charting library.
 */
import { useState } from 'react';
import { View } from 'react-native';
import type { LayoutChangeEvent, StyleProp, ViewStyle } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';

import { colors } from '@/theme/tokens';

const STROKE = 1.5;
const DOT_R = 2.5;

export type SparklineProps = {
  /** Series in integer cents, oldest first. The last point gets the dot. */
  values: number[];
  height?: number;
  style?: StyleProp<ViewStyle>;
};

export function Sparkline({ values, height = 40, style }: SparklineProps) {
  const [width, setWidth] = useState(0);

  const onLayout = (event: LayoutChangeEvent) => {
    const next = event.nativeEvent.layout.width;
    setWidth((prev) => (prev === next ? prev : next));
  };

  const points = width > 0 ? layoutPoints(values, width, height) : [];
  const last = points[points.length - 1];

  return (
    <View onLayout={onLayout} style={[{ height }, style]}>
      {points.length > 1 && (
        <Svg width={width} height={height}>
          <Path
            d={smoothPath(points)}
            stroke={colors.muted}
            strokeWidth={STROKE}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
          {last && <Circle cx={last.x} cy={last.y} r={DOT_R} fill={colors.ink} />}
        </Svg>
      )}
    </View>
  );
}

type Point = { x: number; y: number };

/** Map the series into the box, insetting so the stroke and end dot never clip. */
function layoutPoints(values: number[], width: number, height: number): Point[] {
  if (values.length < 2) return [];

  const inset = Math.max(DOT_R, STROKE / 2);
  const usableW = Math.max(1, width - inset * 2);
  const usableH = Math.max(1, height - inset * 2);

  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min;

  return values.map((value, i) => ({
    x: inset + (i / (values.length - 1)) * usableW,
    // A flat series sits on the centre line rather than dividing by zero.
    y: inset + (span === 0 ? usableH / 2 : (1 - (value - min) / span) * usableH),
  }));
}

/**
 * Catmull-Rom through the points, emitted as cubic bezier segments so the whole
 * series is one `d` string in one <Path>.
 */
function smoothPath(points: Point[]): string {
  let d = `M${round(points[0].x)},${round(points[0].y)}`;

  for (let i = 0; i < points.length - 1; i += 1) {
    const p0 = points[i - 1] ?? points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] ?? p2;

    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;

    d += ` C${round(c1x)},${round(c1y)} ${round(c2x)},${round(c2y)} ${round(p2.x)},${round(p2.y)}`;
  }

  return d;
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

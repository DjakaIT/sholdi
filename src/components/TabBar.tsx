/**
 * Bottom navigation. DESIGN.md §5.2.
 *
 * Flat, edge-to-edge, five icon tabs. No floating pill, no FAB, no labels, no
 * filled squares — every one of those was explicitly rejected (§9).
 *
 * Composition: `TabBar` is the target of Expo Router's `<TabList asChild>` and
 * `TabBarItem` the target of `<TabTrigger asChild>`, so the router owns routing
 * and this file owns nothing but the look. `TabBarItem` also works *outside* a
 * trigger — that is how the Add tab opens the sheet without becoming a route.
 *
 * The overline is a single 16x2 bar that SLIDES between tabs. That slide is the
 * only animation the nav gets: icons never fill, scale or bounce (§5.2, §8).
 */
import {
  Children,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import type { LayoutChangeEvent, StyleProp, ViewStyle } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { LucideIcon } from 'lucide-react-native';

import { colors, nav } from '@/theme/tokens';

const SLIDE_MS = 180;

type BarContext = {
  /** An item tells the bar it holds the focus, so the overline can slide to it. */
  reportFocus: (index: number) => void;
};

const BarContext = createContext<BarContext | null>(null);
const CellIndexContext = createContext(-1);

export type TabBarProps = {
  children: React.ReactNode;
  /** Supplied by `<TabList asChild>`. */
  style?: StyleProp<ViewStyle>;
};

export function TabBar({ children, style }: TabBarProps) {
  const insets = useSafeAreaInsets();
  const reduceMotion = useReducedMotion();

  const cells = Children.toArray(children);
  const [positions, setPositions] = useState<Record<number, number>>({});
  const [focusedIndex, setFocusedIndex] = useState(-1);

  const indicatorX = useSharedValue(0);
  const placed = useRef(false);

  const reportFocus = useCallback((index: number) => setFocusedIndex(index), []);
  const context = useMemo(() => ({ reportFocus }), [reportFocus]);

  const onCellLayout = useCallback(
    (index: number) => (event: LayoutChangeEvent) => {
      const { x, width } = event.nativeEvent.layout;
      // Centre the 16px indicator over the 40px tab column.
      const centred = x + (width - nav.indicatorWidth) / 2;
      setPositions((prev) => (prev[index] === centred ? prev : { ...prev, [index]: centred }));
    },
    []
  );

  const target = positions[focusedIndex];

  useEffect(() => {
    if (target === undefined) return;
    if (!placed.current) {
      // First measurement: land in place, never slide in from the left edge.
      indicatorX.value = target;
      placed.current = true;
      return;
    }
    indicatorX.value = reduceMotion ? target : withTiming(target, { duration: SLIDE_MS });
  }, [target, reduceMotion, indicatorX]);

  const indicatorStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: indicatorX.value }],
  }));

  return (
    <View
      // TabList supplies its own row styles; ours must win (it defaults to space-between).
      style={[style, styles.container, { paddingBottom: nav.paddingBottom + insets.bottom }]}>
      <Animated.View
        pointerEvents="none"
        style={[styles.indicator, indicatorStyle, target === undefined && styles.hidden]}
      />
      <BarContext.Provider value={context}>
        {cells.map((cell, index) => (
          // eslint-disable-next-line react/no-array-index-key -- the bar is a fixed list
          <View key={index} style={styles.cell} onLayout={onCellLayout(index)}>
            <CellIndexContext.Provider value={index}>{cell}</CellIndexContext.Provider>
          </View>
        ))}
      </BarContext.Provider>
    </View>
  );
}

export type TabBarItemProps = {
  icon: LucideIcon;
  /** Read by screen readers. The bar itself is deliberately unlabelled (§5.2). */
  label: string;
  /** Injected by `<TabTrigger asChild>`. Absent for items that are not tabs. */
  isFocused?: boolean;
  onPress?: () => void;
};

export function TabBarItem({ icon: Icon, label, isFocused = false, onPress }: TabBarItemProps) {
  const bar = useContext(BarContext);
  const index = useContext(CellIndexContext);

  useEffect(() => {
    if (isFocused) bar?.reportFocus(index);
  }, [isFocused, bar, index]);

  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityLabel={label}
      accessibilityState={{ selected: isFocused }}
      onPress={onPress}
      style={styles.item}>
      {/* Reserves the indicator's row so the icons never shift. */}
      <View style={styles.indicatorSlot} />
      <Icon
        size={nav.iconSize}
        strokeWidth={nav.iconStroke}
        color={isFocused ? colors.ink : colors.faint}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: 'auto',
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'flex-start',
    borderTopWidth: 1,
    borderTopColor: colors.hairline,
    backgroundColor: colors.page,
  },
  cell: {
    width: nav.tabWidth,
  },
  item: {
    alignItems: 'center',
    gap: nav.gap,
  },
  indicatorSlot: {
    width: nav.indicatorWidth,
    height: nav.indicatorHeight,
  },
  indicator: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: nav.indicatorWidth,
    height: nav.indicatorHeight,
    borderRadius: 1,
    backgroundColor: colors.ink,
  },
  hidden: {
    opacity: 0,
  },
});

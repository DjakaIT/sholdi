/**
 * Segmented month switcher. DESIGN.md §6.2.
 *
 * A `surface` pill; the active segment is `raised`. Interface chrome, so it stays
 * monochrome — no category colour reaches it (§4.1).
 */
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { monthName, monthShort } from '@/lib/dates';
import { colors, fonts, radii } from '@/theme/tokens';

export type MonthSwitcherProps = {
  /** Months as 'YYYY-MM', oldest first. */
  months: string[];
  activeMonth: string;
  onSelect?: (month: string) => void;
};

export function MonthSwitcher({ months, activeMonth, onSelect }: MonthSwitcherProps) {
  return (
    <View style={styles.container}>
      {months.map((month) => {
        const active = month === activeMonth;
        return (
          <Pressable
            key={month}
            accessibilityRole="button"
            accessibilityLabel={monthName(month)}
            accessibilityState={{ selected: active }}
            onPress={() => onSelect?.(month)}
            style={[styles.segment, active && styles.segmentActive]}>
            <Text style={[styles.label, active && styles.labelActive]}>
              {monthShort(month)}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: radii.pill,
    padding: 3,
    gap: 2,
  },
  segment: {
    paddingVertical: 6,
    paddingHorizontal: 13,
    borderRadius: radii.pill,
  },
  segmentActive: {
    backgroundColor: colors.raised,
  },
  label: {
    fontFamily: fonts.regular,
    fontSize: 11.5,
    color: colors.muted,
  },
  labelActive: {
    color: colors.ink,
  },
});

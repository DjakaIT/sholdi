/**
 * One of the four input tiles. DESIGN.md §6.3, tile spec §5.3.
 *
 * `raised` background, radius 14, padding 12x11. All four tiles are weighted
 * identically — highlighting the Bank PDF tile above the others was explicitly
 * rejected (§9), so this component takes no "primary" or "featured" variant and
 * must not grow one.
 *
 * The sub-label is functional, not decorative: "38 euro, Konzum" teaches the user
 * that voice takes plain speech, which removes the "what do I say?" hesitation.
 */
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { LucideIcon } from 'lucide-react-native';

import { colors, fonts, radii, spacing } from '@/theme/tokens';

const ICON_SIZE = 19;
const ICON_STROKE = 1.6;

export type InputTileProps = {
  icon: LucideIcon;
  title: string;
  subLabel: string;
  onPress?: () => void;
};

export function InputTile({ icon: Icon, title, subLabel, onPress }: InputTileProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${title}, ${subLabel}`}
      onPress={onPress}
      style={({ pressed }) => [styles.tile, pressed && styles.pressed]}>
      <Icon size={ICON_SIZE} strokeWidth={ICON_STROKE} color={colors.ink2} />
      <View style={styles.text}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.subLabel}>{subLabel}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tile: {
    flex: 1,
    backgroundColor: colors.raised,
    borderRadius: radii.tile,
    paddingVertical: 12,
    paddingHorizontal: 11,
    gap: spacing.md,
  },
  pressed: {
    opacity: 0.85,
  },
  text: {
    gap: 3,
  },
  title: {
    fontFamily: fonts.regular,
    fontSize: 13.5,
    color: colors.ink,
  },
  subLabel: {
    fontFamily: fonts.regular,
    fontSize: 11,
    color: colors.muted,
  },
});

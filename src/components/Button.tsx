/**
 * Buttons. DESIGN.md §5.1.
 *
 * CRITICAL: `primary` and `secondary` use a FIXED 43px height with
 * `alignItems: 'center'` — not vertical padding. Padding-based centring made the
 * label ride up in the container. The pill variants are the documented exception:
 * they are padding-sized because they wrap short inline text.
 *
 * The primary button is ivory with dark text. Never colour it (§4.4).
 */
import { Pressable, StyleSheet, Text } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';

import { BUTTON_HEIGHT, colors, fonts, radii } from '@/theme/tokens';

export type ButtonVariant = 'primary' | 'secondary' | 'pill' | 'dismiss';

export type ButtonProps = {
  label: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
};

export function Button({
  label,
  onPress,
  variant = 'primary',
  disabled = false,
  style,
}: ButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        variantContainer[variant],
        pressed && styles.pressed,
        disabled && styles.disabled,
        style,
      ]}>
      <Text style={[styles.label, variantLabel[variant]]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
  // Fixed height. See the note at the top of this file before changing it.
  fixedHeight: {
    height: BUTTON_HEIGHT,
  },
  label: {
    fontFamily: fonts.regular,
  },
  pressed: {
    opacity: 0.82,
  },
  disabled: {
    opacity: 0.4,
  },
});

const variantContainer: Record<ButtonVariant, StyleProp<ViewStyle>> = {
  primary: [styles.fixedHeight, { backgroundColor: colors.ink, paddingHorizontal: 20 }],
  secondary: [
    styles.fixedHeight,
    {
      backgroundColor: 'transparent',
      borderWidth: 1,
      borderColor: colors.line,
      paddingHorizontal: 20,
    },
  ],
  pill: [
    {
      backgroundColor: 'transparent',
      borderWidth: 1,
      borderColor: colors.line,
      paddingVertical: 8,
      paddingHorizontal: 14,
    },
  ],
  dismiss: [
    {
      backgroundColor: 'transparent',
      borderWidth: 1,
      borderColor: colors.hairline,
      paddingVertical: 8,
      paddingHorizontal: 14,
    },
  ],
};

const variantLabel = StyleSheet.create({
  primary: { color: colors.onInk, fontFamily: fonts.medium, fontSize: 12.5 },
  secondary: { color: colors.ink, fontSize: 12.5 },
  pill: { color: colors.ink, fontSize: 12 },
  dismiss: { color: colors.muted, fontSize: 12 },
});

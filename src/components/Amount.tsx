/**
 * Money on screen. DESIGN.md §3 and §6.2.
 *
 * `hero` is the lockup: a faint currency symbol at 20, the integer in ink at
 * 44/500, and faint cents at 17 — baseline-aligned, not centre-aligned.
 * `inline` is the single-run form for rows.
 *
 * Every variant carries tabular figures. Without them right-aligned columns jitter.
 */
import { StyleSheet, Text, View } from 'react-native';
import type { TextStyle } from 'react-native';

import { formatMoney, formatMoneyWhole, moneyParts } from '@/lib/money';
import { colors, type as typeScale } from '@/theme/tokens';

export type AmountProps = {
  /** Integer cents. Never a float. */
  cents: number;
  currency?: string;
  variant?: 'hero' | 'inline';
  /** `inline` only — defaults to `ink`. */
  color?: string;
  /** `inline` only — drop the cents where they are noise (§6.2 category rows). */
  hideCents?: boolean;
  style?: TextStyle;
};

export function Amount({
  cents,
  currency = 'EUR',
  variant = 'inline',
  color = colors.ink,
  hideCents = false,
  style,
}: AmountProps) {
  if (variant === 'hero') {
    const parts = moneyParts(cents, currency);
    return (
      <View style={styles.hero}>
        <Text style={styles.heroSymbol}>
          {parts.sign}
          {parts.symbol}
        </Text>
        <Text style={styles.heroInteger}>{parts.integer}</Text>
        <Text style={styles.heroCents}>{parts.cents}</Text>
      </View>
    );
  }

  const text = hideCents
    ? formatMoneyWhole(cents, currency)
    : formatMoney(cents, currency);

  return <Text style={[styles.inline, { color }, style]}>{text}</Text>;
}

const styles = StyleSheet.create({
  hero: {
    flexDirection: 'row',
    // Baseline, not centre: DESIGN.md §6.2 specifies the three runs sit on one baseline.
    alignItems: 'baseline',
  },
  heroSymbol: {
    ...typeScale.heroSymbol,
    color: colors.faint,
  },
  heroInteger: {
    ...typeScale.heroAmount,
    color: colors.ink,
  },
  heroCents: {
    ...typeScale.heroCents,
    color: colors.faint,
  },
  inline: {
    ...typeScale.amount,
  },
});

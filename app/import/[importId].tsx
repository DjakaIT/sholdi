/**
 * PDF import review. DESIGN.md §6.4.
 *
 * ARCHITECTURE.md §5 calls the flow this screen sits in "the flow that must be
 * perfect": upload -> extract -> review -> confirm, under two minutes. The screen is
 * built for correction speed, so the primary action imports everything and the
 * secondary one steps through.
 *
 * Mock data until `extract-statement` exists (build-order step 5).
 */
import { StyleSheet, Text, View } from 'react-native';
import { ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/Button';
import { ExtractedRow } from '@/components/ExtractedRow';
import { MOCK_IMPORT } from '@/features/imports/mockData';
import { monthName } from '@/lib/dates';
import { colors, fonts, spacing, type as typeScale } from '@/theme/tokens';

export default function ImportReviewScreen() {
  const data = MOCK_IMPORT;
  const remaining = data.totalCount - data.rows.length;

  return (
    <SafeAreaView edges={['top']} style={styles.screen}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}>
        <Text style={styles.eyebrow}>{monthName(data.period)} statement</Text>
        <Text style={styles.title}>{data.totalCount} expenses found</Text>
        <Text style={styles.subtitle}>Categories are a suggestion. Tap any to change.</Text>

        <View style={styles.list}>
          {data.rows.map((row) => (
            <ExtractedRow
              key={row.id}
              merchant={row.merchant ?? 'Unknown'}
              category={row.suggested_category}
              colorToken={row.color_token}
              cents={row.amount_cents}
              currency={row.currency}
              occurredOn={row.occurred_on}
            />
          ))}
        </View>

        {remaining > 0 && <Text style={styles.more}>and {remaining} more</Text>}
      </ScrollView>

      <View style={styles.footer}>
        <Button label="Review each" variant="secondary" style={styles.reviewButton} />
        <Button
          label={`Import all ${data.totalCount}`}
          variant="primary"
          style={styles.importButton}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.page,
  },
  content: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xl,
    paddingBottom: spacing.lg,
  },
  eyebrow: {
    ...typeScale.eyebrow,
    color: colors.muted,
  },
  title: {
    ...typeScale.title,
    color: colors.ink,
    marginTop: spacing.sm,
  },
  subtitle: {
    fontFamily: fonts.regular,
    fontSize: 11.5,
    color: colors.muted,
    marginTop: 6,
  },
  list: {
    marginTop: spacing.lg,
  },
  more: {
    fontFamily: fonts.regular,
    fontSize: 11.5,
    color: colors.muted,
    textAlign: 'center',
    marginTop: spacing.md,
  },
  footer: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    paddingBottom: spacing.xl,
  },
  // §6.4 weights the footer explicitly: secondary 1, primary 1.4.
  reviewButton: {
    flex: 1,
  },
  importButton: {
    flex: 1.4,
  },
});

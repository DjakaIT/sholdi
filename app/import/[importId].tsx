/**
 * PDF import review. DESIGN.md §6.4.
 *
 * ARCHITECTURE.md §5: "the flow that must be perfect" — upload, extract, review,
 * confirm, under two minutes. This is the confirm step, and the only place
 * statement rows are written.
 *
 * Reads the pending extraction from the import store. Nothing reaches the database
 * until "Import all" is pressed: an extraction the user has not agreed to is not
 * their data yet.
 */
import { useState } from 'react';
import { useRouter } from 'expo-router';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQueryClient } from '@tanstack/react-query';

import { Button } from '@/components/Button';
import { ExtractedRow } from '@/components/ExtractedRow';
import { useCategories } from '@/features/expenses/hooks';
import { importExpenses } from '@/features/expenses/repository';
import { monthName } from '@/lib/dates';
import { useImportStore } from '@/stores/useImportStore';
import { useMonthStore } from '@/stores/useMonthStore';
import type { CategoryColorToken } from '@/theme/categoryColors';
import { colors, fonts, spacing, type as typeScale } from '@/theme/tokens';

/** How many rows to show before "and N more" (§6.4). */
const VISIBLE_ROWS = 8;

export default function ImportReviewScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();

  const rows = useImportStore((state) => state.rows);
  const issues = useImportStore((state) => state.issues);
  const period = useImportStore((state) => state.period);
  const clear = useImportStore((state) => state.clear);

  const { data: categories } = useCategories();
  const setMonth = useMonthStore((state) => state.setMonth);

  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const colourFor = (categoryId: string | null): CategoryColorToken => {
    const found = (categories ?? []).find((c) => c.id === categoryId);
    return found?.color_token ?? 'sage';
  };

  const nameFor = (categoryId: string | null, suggested: string): string => {
    const found = (categories ?? []).find((c) => c.id === categoryId);
    return found?.name ?? suggested;
  };

  async function importAll() {
    setImporting(true);
    setError(null);

    try {
      const result = await importExpenses(
        rows.map((row) => ({ ...row, categoryId: row.categoryId, needsReview: row.needs_review })),
        null,
        'pdf'
      );

      // Land the user on the month they just imported, not whatever they were on.
      if (period) setMonth(period);

      await queryClient.invalidateQueries();
      clear();
      router.replace('/');

      if (result.duplicates > 0) {
        console.info(`Skipped ${result.duplicates} rows already present.`);
      }
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : 'That did not import.');
      setImporting(false);
    }
  }

  function discard() {
    clear();
    router.replace('/');
  }

  if (rows.length === 0) {
    // §7: extraction failure needs an empty state that lets the user move on.
    return (
      <SafeAreaView edges={['top']} style={styles.screen}>
        <View style={styles.content}>
          <Text style={styles.title}>Nothing to review</Text>
          <Text style={styles.subtitle}>
            There is no statement waiting. Add one from the Add tab.
          </Text>
          <View style={styles.emptyAction}>
            <Button label="Back to Home" variant="secondary" onPress={discard} />
          </View>
        </View>
      </SafeAreaView>
    );
  }

  const remaining = rows.length - VISIBLE_ROWS;

  return (
    <SafeAreaView edges={['top']} style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.eyebrow}>
          {period ? `${monthName(period)} statement` : 'Statement'}
        </Text>
        <Text style={styles.title}>{rows.length} expenses found</Text>
        <Text style={styles.subtitle}>Categories are a suggestion. Tap any to change.</Text>

        {issues.length > 0 && (
          <Text style={styles.issues}>
            {issues.length} line{issues.length === 1 ? '' : 's'} could not be read and
            {issues.length === 1 ? ' was' : ' were'} left out.
          </Text>
        )}

        <View style={styles.list}>
          {rows.slice(0, VISIBLE_ROWS).map((row) => (
            <ExtractedRow
              key={row.id}
              merchant={row.merchant ?? 'Unknown'}
              category={nameFor(row.categoryId, row.suggested_category)}
              colorToken={colourFor(row.categoryId)}
              cents={row.amount_cents}
              currency={row.currency}
              occurredOn={row.occurred_on}
            />
          ))}
        </View>

        {remaining > 0 && <Text style={styles.more}>and {remaining} more</Text>}

        {error && <Text style={styles.error}>{error}</Text>}
      </ScrollView>

      <View style={styles.footer}>
        {importing ? (
          <View style={styles.busy}>
            <ActivityIndicator color={colors.faint} />
          </View>
        ) : (
          <>
            <Button
              label="Discard"
              variant="secondary"
              onPress={discard}
              style={styles.discardButton}
            />
            <Button
              label={`Import all ${rows.length}`}
              variant="primary"
              onPress={importAll}
              style={styles.importButton}
            />
          </>
        )}
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
  issues: {
    fontFamily: fonts.regular,
    fontSize: 11.5,
    color: colors.ink3,
    marginTop: spacing.md,
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
  error: {
    fontFamily: fonts.regular,
    fontSize: 11.5,
    color: colors.ink3,
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
  discardButton: {
    flex: 1,
  },
  importButton: {
    flex: 1.4,
  },
  busy: {
    flex: 1,
    height: 43,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyAction: {
    marginTop: spacing.lg,
    alignItems: 'flex-start',
  },
});

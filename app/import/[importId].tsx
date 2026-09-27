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
 *
 * §5: "Design the review screen for correction speed: tapping a category label
 * opens a picker inline, never a new screen." The subtitle has always promised
 * "Tap any to change"; until now tapping did nothing. It opens the picker beneath
 * the row, and one answer applies to every row from the same shop that the user
 * has not already placed themselves.
 */
import { useCallback, useRef, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import {
  ActivityIndicator,
  Alert,
  BackHandler,
  KeyboardAvoidingView,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQueryClient } from '@tanstack/react-query';

import { Button } from '@/components/Button';
import { CategoryPicker } from '@/components/CategoryPicker';
import { ExtractedRow } from '@/components/ExtractedRow';
import { useCategories, useCreateCategory } from '@/features/expenses/hooks';
import { importExpenses } from '@/features/expenses/repository';
import { rememberAll } from '@/features/transactions/merchantMemory';
import { sameMerchantAs } from '@/features/transactions/resolveMerchant';
import { monthName } from '@/lib/dates';
import { useImportStore } from '@/stores/useImportStore';
import { useMonthStore } from '@/stores/useMonthStore';
import type { DisplayColorToken } from '@/theme/categoryColors';
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
  const setRowCategory = useImportStore((state) => state.setRowCategory);

  const { data: categories } = useCategories();
  const createCategory = useCreateCategory();
  const setMonth = useMonthStore((state) => state.setMonth);

  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [openRowId, setOpenRowId] = useState<string | null>(null);
  /** Rows the user placed by hand. Their merchants are remembered as 'user' (§3). */
  const [userPlaced, setUserPlaced] = useState<Set<string>>(() => new Set());

  // A second tap before the first re-render would start a second transaction on
  // the same connection while the first is open — SQLite refuses that outright.
  const importingRef = useRef(false);

  const colourFor = (categoryId: string | null): DisplayColorToken => {
    const found = (categories ?? []).find((c) => c.id === categoryId);
    return found?.color_token ?? 'none';
  };

  const nameFor = (categoryId: string | null): string => {
    const found = (categories ?? []).find((c) => c.id === categoryId);
    return found?.name ?? 'Uncategorised';
  };

  function place(rowId: string, categoryId: string) {
    const row = rows.find((r) => r.id === rowId);
    if (!row) return;

    const same = sameMerchantAs(row.merchant);
    const placed = new Set(userPlaced);

    setRowCategory(rowId, categoryId);
    placed.add(rowId);

    // Same shop, not yet placed by hand: they follow. A row the user already
    // decided on is never moved by a decision about another row.
    for (const other of rows) {
      if (other.id !== rowId && !placed.has(other.id) && same(other.merchant)) {
        setRowCategory(other.id, categoryId);
        placed.add(other.id);
      }
    }

    setUserPlaced(placed);
    setOpenRowId(null);
  }

  async function importAll() {
    if (importingRef.current) return;
    importingRef.current = true;
    setImporting(true);
    setError(null);

    try {
      const result = await importExpenses(
        rows.map((row) => ({ ...row, categoryId: row.categoryId, needsReview: row.needs_review })),
        null,
        'pdf'
      );

      if (result.inserted === 0 && result.duplicates > 0) {
        // Leaving silently here looked exactly like a failed import.
        setError(
          `All ${result.duplicates} of these are already in Sholdi — this statement was imported before.`
        );
        return;
      }

      // COST-CONTROLS.md §3: what the user accepted becomes memory, so the same
      // merchants cost nothing next month. A row placed by hand is a correction and
      // is remembered as 'user'; the rest are model suggestions the user let stand.
      await rememberAll(
        rows
          .filter((row) => userPlaced.has(row.id))
          .map((row) => ({ merchant: row.merchant, categoryId: row.categoryId })),
        'user'
      );
      await rememberAll(
        rows
          .filter((row) => !userPlaced.has(row.id))
          .map((row) => ({ merchant: row.merchant, categoryId: row.categoryId })),
        'ai'
      );

      // Land the user on the month they just imported, not whatever they were on.
      if (period) setMonth(period);

      await queryClient.invalidateQueries();
      clear();
      router.replace('/');
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : 'That did not import.');
    } finally {
      importingRef.current = false;
      setImporting(false);
    }
  }

  function discard() {
    clear();
    router.replace('/');
  }

  // Android's back button used to pop this screen silently, throwing away a
  // statement the user may have spent minutes sorting. It now asks — the same
  // question the Discard button answers, never a surprise.
  useFocusEffect(
    useCallback(() => {
      const sub = BackHandler.addEventListener('hardwareBackPress', () => {
        if (rows.length === 0 || importingRef.current) return false;
        Alert.alert('Leave this statement?', 'Nothing from it has been saved yet.', [
          { text: 'Keep reviewing', style: 'cancel' },
          {
            text: 'Discard',
            style: 'destructive',
            onPress: () => {
              clear();
              router.replace('/');
            },
          },
        ]);
        return true;
      });
      return () => sub.remove();
    }, [rows.length, clear, router])
  );

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

  const visible = expanded ? rows : rows.slice(0, VISIBLE_ROWS);
  const remaining = rows.length - visible.length;
  const unsorted = rows.filter((r) => r.categoryId === null).length;

  return (
    <SafeAreaView edges={['top']} style={styles.screen}>
      {/* The new-category field opens inline; keep it above the keyboard (Android 15+
          is edge to edge and no longer resizes the window on its own). */}
      <KeyboardAvoidingView behavior="padding" style={styles.flex}>
        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled">
          <View style={styles.headerRow}>
            <Text style={styles.eyebrow}>
              {period ? `${monthName(period)} statement` : 'Statement'}
            </Text>
            <Button label="Discard" variant="dismiss" onPress={discard} disabled={importing} />
          </View>
          <Text style={styles.title}>{rows.length} expenses found</Text>
          <Text style={styles.subtitle}>
            Categories are a suggestion. Tap any to change.
            {unsorted > 0 ? ` ${unsorted} have none yet.` : ''}
          </Text>

          {issues.length > 0 && (
            <Text style={styles.issues}>
              {issues.length} line{issues.length === 1 ? '' : 's'} could not be read and
              {issues.length === 1 ? ' was' : ' were'} left out.
            </Text>
          )}

          <View style={styles.list}>
            {visible.map((row) => (
              <View key={row.id}>
                <ExtractedRow
                  merchant={row.merchant ?? 'Unknown'}
                  category={nameFor(row.categoryId)}
                  colorToken={colourFor(row.categoryId)}
                  cents={row.amount_cents}
                  currency={row.currency}
                  occurredOn={row.occurred_on}
                  onPressCategory={() => setOpenRowId((open) => (open === row.id ? null : row.id))}
                />
                {openRowId === row.id && (
                  <CategoryPicker
                    categories={categories ?? []}
                    selectedId={row.categoryId}
                    onSelect={(categoryId) => place(row.id, categoryId)}
                    onCreate={(name) => createCategory.mutateAsync(name)}
                  />
                )}
              </View>
            ))}
          </View>

          {remaining > 0 && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Show the other ${remaining}`}
              onPress={() => setExpanded(true)}
              hitSlop={8}>
              <Text style={styles.more}>and {remaining} more</Text>
            </Pressable>
          )}

          {error && <Text style={styles.error}>{error}</Text>}
        </ScrollView>

        <View style={styles.footer}>
          {importing ? (
            <View style={styles.busy}>
              <ActivityIndicator color={colors.faint} />
              <Text style={styles.busyText}>Saving {rows.length} expenses</Text>
            </View>
          ) : (
            <>
              {!expanded && remaining > 0 && (
                <Button
                  label="Review each"
                  variant="secondary"
                  onPress={() => setExpanded(true)}
                  style={styles.reviewButton}
                />
              )}
              <Button
                label={`Import all ${rows.length}`}
                variant="primary"
                onPress={importAll}
                style={styles.importButton}
              />
            </>
          )}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.page,
  },
  flex: {
    flex: 1,
  },
  content: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xl,
    paddingBottom: spacing.lg,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
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
    lineHeight: 11.5 * 1.6,
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
    paddingVertical: 6,
  },
  error: {
    fontFamily: fonts.regular,
    fontSize: 11.5,
    lineHeight: 11.5 * 1.6,
    color: colors.ink3,
    marginTop: spacing.md,
  },
  footer: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    paddingBottom: spacing.xl,
    borderTopWidth: 1,
    borderTopColor: colors.hairline,
  },
  // §6.4 weights the footer explicitly: secondary 1, primary 1.4.
  reviewButton: {
    flex: 1,
  },
  importButton: {
    flex: 1.4,
  },
  busy: {
    flex: 1,
    height: 43,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  busyText: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: colors.muted,
  },
  emptyAction: {
    marginTop: spacing.lg,
    alignItems: 'flex-start',
  },
});

/**
 * One category, one month: every purchase in it, each re-sortable in place.
 *
 * ⚠ Not in DESIGN.md §6. It exists because without it the app had no way to change
 * a category once a statement was imported — and a first statement typically
 * lands with a large share unsorted, which Home now says out loud. Saying "52% of
 * August isn't sorted" with nowhere to go and sort it would be nagging (§7).
 *
 * Built from the review screen's parts (§6.4): the same rows, the same inline
 * picker, the same rule that one answer about a shop sorts every unsorted purchase
 * from it. `none` as the id means the unsorted list.
 */
import { useState } from 'react';
import { ChevronLeft } from 'lucide-react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Amount } from '@/components/Amount';
import { CategoryPicker } from '@/components/CategoryPicker';
import { EmptyState } from '@/components/EmptyState';
import { ExtractedRow } from '@/components/ExtractedRow';
import {
  useCategories,
  useCreateCategory,
  useExpensesInCategory,
  useRecategorise,
} from '@/features/expenses/hooks';
import { monthName } from '@/lib/dates';
import { useMonthStore } from '@/stores/useMonthStore';
import { colors, fonts, spacing, type as typeScale } from '@/theme/tokens';

export default function CategoryScreen() {
  const router = useRouter();
  const { categoryId: param } = useLocalSearchParams<{ categoryId: string }>();
  const categoryId = !param || param === 'none' ? null : param;
  const month = useMonthStore((state) => state.month);

  const { data: categories } = useCategories();
  const { data: expenses, isPending } = useExpensesInCategory(month, categoryId);
  const recategorise = useRecategorise();
  const createCategory = useCreateCategory();

  const [openId, setOpenId] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const category = (categories ?? []).find((c) => c.id === categoryId);
  const name = categoryId === null ? 'Uncategorised' : (category?.name ?? 'Category');
  const total = (expenses ?? []).reduce((sum, e) => sum + e.amount_cents, 0);

  async function move(expenseId: string, merchant: string | null, to: string) {
    setOpenId(null);
    if (to === categoryId) return;
    const changed = await recategorise.mutateAsync({ expenseId, merchant, categoryId: to });
    const target = (categories ?? []).find((c) => c.id === to)?.name ?? 'that category';
    // Said once, plainly, so a list that suddenly shrinks by six is not a mystery.
    setNote(
      changed > 1
        ? `Moved ${changed} purchases from ${merchant ?? 'that shop'} to ${target}.`
        : `Moved to ${target}.`
    );
  }

  return (
    <SafeAreaView edges={['top']} style={styles.screen}>
      {/* The new-category field opens inline; keep it above the keyboard (Android 15+
          is edge to edge and no longer resizes the window on its own). */}
      <KeyboardAvoidingView behavior="padding" style={styles.flex}>
        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Back"
            onPress={() => router.back()}
            hitSlop={12}
            style={styles.back}>
            <ChevronLeft size={18} strokeWidth={1.6} color={colors.ink3} />
          </Pressable>

          <Text style={styles.eyebrow}>
            {name} · {monthName(month)}
          </Text>

          {isPending ? (
            <View style={styles.loading}>
              <ActivityIndicator color={colors.faint} />
            </View>
          ) : (expenses ?? []).length === 0 ? (
            <EmptyState
              illustration="notes"
              line={
                categoryId === null
                  ? `Everything in ${monthName(month)} is sorted — nice work.`
                  : `Nothing in ${name} for ${monthName(month)}.`
              }
            />
          ) : (
            <>
              <View style={styles.totalRow}>
                <Amount variant="hero" cents={total} />
              </View>
              <Text style={styles.subtitle}>
                {expenses?.length} purchase{expenses?.length === 1 ? '' : 's'}. Tap a category to
                move one — the rest from the same shop follow.
              </Text>

              {note && <Text style={styles.note}>{note}</Text>}

              <View style={styles.list}>
                {(expenses ?? []).map((expense) => (
                  <View key={expense.id}>
                    <ExtractedRow
                      merchant={expense.merchant ?? 'Unknown'}
                      category={name}
                      colorToken={category?.color_token ?? 'none'}
                      cents={expense.amount_cents}
                      currency={expense.currency}
                      occurredOn={expense.occurred_on}
                      onPressCategory={() =>
                        setOpenId((open) => (open === expense.id ? null : expense.id))
                      }
                    />
                    {openId === expense.id && (
                      <CategoryPicker
                        categories={categories ?? []}
                        selectedId={expense.category_id}
                        onSelect={(to) => void move(expense.id, expense.merchant, to)}
                        onCreate={(newName) => createCategory.mutateAsync(newName)}
                      />
                    )}
                  </View>
                ))}
              </View>
            </>
          )}
        </ScrollView>
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
    paddingTop: spacing.md,
    paddingBottom: spacing.xxl,
  },
  back: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  eyebrow: {
    ...typeScale.eyebrow,
    color: colors.muted,
    marginTop: spacing.xl,
  },
  loading: {
    paddingTop: spacing.xl,
  },
  totalRow: {
    marginTop: spacing.sm,
  },
  subtitle: {
    fontFamily: fonts.regular,
    fontSize: 11.5,
    lineHeight: 11.5 * 1.6,
    color: colors.muted,
    marginTop: spacing.sm,
  },
  note: {
    fontFamily: fonts.regular,
    fontSize: 11.5,
    lineHeight: 11.5 * 1.6,
    color: colors.ink3,
    marginTop: spacing.md,
  },
  list: {
    marginTop: spacing.lg,
  },
});

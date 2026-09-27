/**
 * The Index. DESIGN.md §6.7.
 *
 * A mosaic where block area maps to spend share: one full-width block for the
 * largest category, then two rows of two at decreasing heights. Built with flexbox
 * and no charting library, as §5.4 requires.
 *
 * The screen always ends in Sholdi's voice — that closing line is what stops it
 * being a table.
 *
 * This screen used to render a mock month — five invented categories and a goal
 * called "Trip to Vis" — whatever the user had actually spent. It now reads the
 * same local month as Home, so the two can never disagree. Categories beyond the
 * five blocks are listed underneath rather than hidden, the goal strip appears only
 * when a goal exists, and every block opens its purchases for re-sorting.
 */
import { useState } from 'react';
import { Plus } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/Button';
import { Caron } from '@/components/Caron';
import { CategoryBlock } from '@/components/CategoryBlock';
import { CategoryRow } from '@/components/CategoryRow';
import { EmptyState } from '@/components/EmptyState';
import { GoalStrip } from '@/components/GoalStrip';
import { InsightRow } from '@/components/InsightRow';
import { NewCategorySheet } from '@/components/NewCategorySheet';
import {
  type CategoryTotal,
  useGoals,
  useHasAnyExpenses,
  useMonthSummary,
} from '@/features/expenses/hooks';
import { observeMonth } from '@/features/insights/observation';
import { currentMonthLocal, monthName, previousMonth } from '@/lib/dates';
import { percentChange } from '@/lib/money';
import { useMonthStore } from '@/stores/useMonthStore';
import { colors, fonts, indexTypeSize, spacing, type as typeScale } from '@/theme/tokens';

/** §6.7 fixes the row heights; they are the clamp that stops an outlier dominating. */
const ROW_HEIGHTS = { first: 92, second: 76, third: 68 };

const ADD_BUTTON = 30;

export default function IndexScreen() {
  const router = useRouter();
  const month = useMonthStore((state) => state.month);
  const { data: summary, isPending } = useMonthSummary(month);
  const { data: goals } = useGoals();
  const { data: hasAny } = useHasAnyExpenses();
  const [adding, setAdding] = useState(false);

  const total = summary?.totalCents ?? 0;
  const ranked = [...(summary?.categories ?? [])].sort((a, b) => b.cents - a.cents);
  const [largest, ...rest] = ranked;
  const secondRow = rest.slice(0, 2);
  const thirdRow = rest.slice(2, 4);
  const beyond = rest.slice(4);

  // §3 puts the largest category's name at 19 and the smallest at 13. Sizing off the
  // raw share would never reach 19, so position within the visible set is what is
  // normalised, then clamped by indexTypeSize.
  const max = ranked[0]?.cents ?? 0;
  const min = ranked[Math.min(ranked.length, 5) - 1]?.cents ?? 0;
  const nameSize = (cents: number) =>
    indexTypeSize(max === min ? 1 : (cents - min) / (max - min));

  // No previous month for this category means no comparison — not "↑ 0%".
  const delta = (category: CategoryTotal) =>
    category.previousCents > 0 ? percentChange(category.cents, category.previousCents) : null;
  const share = (cents: number) => (total > 0 ? Math.round((cents / total) * 100) : 0);

  const open = (category: CategoryTotal) =>
    router.push({
        pathname: '/category/[categoryId]',
        params: { categoryId: category.categoryId ?? 'none' },
      });

  const closing = summary
    ? observeMonth({
        month,
        previousMonth: previousMonth(month),
        inProgress: month === currentMonthLocal(),
        totalCents: summary.totalCents,
        previousTotalCents: summary.previousTotalCents,
        categories: summary.categories.map((c) => ({
          name: c.name,
          cents: c.cents,
          previousCents: c.previousCents,
          uncategorised: c.categoryId === null,
        })),
      })
    : null;

  const block = (category: CategoryTotal, height: number, withShare = false) => (
    <Pressable
      key={category.categoryId ?? 'none'}
      accessibilityRole="button"
      accessibilityLabel={`${category.name}, open its purchases`}
      onPress={() => open(category)}
      style={({ pressed }) => [{ flex: withShare ? 1 : category.cents }, pressed && styles.pressed]}>
      <CategoryBlock
        name={category.name}
        colorToken={category.colorToken}
        cents={category.cents}
        currency={summary?.currency}
        deltaPercent={category.categoryId === null ? null : delta(category)}
        nameSize={nameSize(category.cents)}
        height={height}
        shareLabel={withShare ? `${share(category.cents)}% of month` : undefined}
      />
    </Pressable>
  );

  return (
    <SafeAreaView edges={['top']} style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Text style={styles.eyebrow}>Index · {monthName(month)}</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Add category"
            hitSlop={8}
            onPress={() => setAdding(true)}
            style={({ pressed }) => [styles.addButton, pressed && styles.pressed]}>
            <Plus size={15} strokeWidth={1.6} color={colors.ink} />
          </Pressable>
        </View>

        {isPending ? (
          <View style={styles.loading}>
            <ActivityIndicator color={colors.faint} />
          </View>
        ) : hasAny === false ? (
          <View style={styles.emptyWrap}>
            <EmptyState
              illustration="mosaic"
              line="Your categories land here, each block sized by what you spend on it.">
              <Button
                label="Import a bank statement"
                variant="primary"
                onPress={() => router.push('/add/pdf')}
              />
              <Button label="Add spending" variant="secondary" onPress={() => router.push('/add')} />
            </EmptyState>
          </View>
        ) : ranked.length === 0 ? (
          <View style={styles.quiet}>
            <InsightRow text={`Nothing recorded in ${monthName(month)} yet.`} />
          </View>
        ) : (
          <>
            <View style={styles.mosaic}>
              {largest && <View style={styles.row}>{block(largest, ROW_HEIGHTS.first, true)}</View>}
              {secondRow.length > 0 && (
                <View style={styles.row}>{secondRow.map((c) => block(c, ROW_HEIGHTS.second))}</View>
              )}
              {thirdRow.length > 0 && (
                <View style={styles.row}>{thirdRow.map((c) => block(c, ROW_HEIGHTS.third))}</View>
              )}

              {/* §6.7: the goal strip closes the mosaic — when there is a goal. */}
              {(goals ?? []).slice(0, 1).map((goal) => (
                <GoalStrip
                  key={goal.id}
                  name={goal.name}
                  savedCents={goal.savedCents}
                  targetCents={goal.targetCents}
                  currency={summary?.currency}
                />
              ))}
            </View>

            {beyond.length > 0 && (
              <View style={styles.beyond}>
                {beyond.map((category) => (
                  <Pressable
                    key={category.categoryId ?? 'none'}
                    accessibilityRole="button"
                    accessibilityLabel={`${category.name}, open its purchases`}
                    onPress={() => open(category)}
                    style={({ pressed }) => pressed && styles.pressed}>
                    <CategoryRow
                      name={category.name}
                      colorToken={category.colorToken}
                      cents={category.cents}
                      currency={summary?.currency}
                    />
                  </Pressable>
                ))}
              </View>
            )}

            {closing && (
              <View style={styles.closing}>
                <View style={styles.caron}>
                  <Caron width={12} color={colors.ink3} />
                </View>
                <Text style={styles.closingText}>{closing}</Text>
              </View>
            )}
          </>
        )}
      </ScrollView>

      <NewCategorySheet visible={adding} onClose={() => setAdding(false)} />
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
    paddingTop: spacing.md,
    paddingBottom: spacing.xl,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  eyebrow: {
    ...typeScale.eyebrow,
    color: colors.muted,
  },
  addButton: {
    width: ADD_BUTTON,
    height: ADD_BUTTON,
    borderRadius: ADD_BUTTON / 2,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.82,
  },
  loading: {
    paddingTop: spacing.xl,
  },
  emptyWrap: {
    marginTop: spacing.xl,
  },
  quiet: {
    marginTop: spacing.lg,
  },
  mosaic: {
    marginTop: spacing.lg,
    gap: 6,
  },
  row: {
    flexDirection: 'row',
    gap: 6,
  },
  beyond: {
    marginTop: spacing.sm,
    gap: spacing.sm,
  },
  closing: {
    flexDirection: 'row',
    gap: 9,
    marginTop: spacing.lg,
  },
  caron: {
    paddingTop: 7,
  },
  closingText: {
    flex: 1,
    fontFamily: fonts.regular,
    fontSize: 12,
    lineHeight: 12 * 1.7,
    color: colors.ink3,
  },
});

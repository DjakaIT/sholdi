/**
 * Home. DESIGN.md §6.2.
 *
 * Order is fixed by the spec: month switcher + bell, eyebrow, hero lockup, change
 * pill, sparkline, two-to-three category rows, one Sholdi observation.
 *
 * Reads the local database. The month comes from the store so the switcher, the
 * Index and any deep link all agree on which month is being looked at.
 *
 * Two kinds of empty, which DESIGN.md does not specify and which are treated
 * differently on purpose:
 *  - First run, nothing ever recorded: the observation row becomes an empty state
 *    with the two ways in (see components/EmptyState.tsx for why it looks as it does).
 *  - A quiet month in an app that has history: just the zero and one calm line. A
 *    month with nothing in it is not a problem to be solved.
 */
import { Bell } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Amount } from '@/components/Amount';
import { Button } from '@/components/Button';
import { CategoryRow } from '@/components/CategoryRow';
import { ChangePill } from '@/components/ChangePill';
import { EmptyState } from '@/components/EmptyState';
import { InsightRow } from '@/components/InsightRow';
import { MonthSwitcher } from '@/components/MonthSwitcher';
import { Sparkline } from '@/components/Sparkline';
import { useHasAnyExpenses, useMonthSummary } from '@/features/expenses/hooks';
import { isDrawable, trimLeadingEmpty } from '@/features/expenses/series';
import { observeMonth } from '@/features/insights/observation';
import { currentMonthLocal, monthName, previousMonth, switcherMonths } from '@/lib/dates';
import { percentChange } from '@/lib/money';
import { useMonthStore } from '@/stores/useMonthStore';
import { colors, spacing, type as typeScale } from '@/theme/tokens';

const BELL_SIZE = 32;

export default function HomeScreen() {
  const router = useRouter();
  const month = useMonthStore((state) => state.month);
  const setMonth = useMonthStore((state) => state.setMonth);

  const { data: summary, isPending } = useMonthSummary(month);
  const { data: hasAny } = useHasAnyExpenses();

  const rawChange =
    summary && summary.previousTotalCents > 0 && summary.totalCents > 0
      ? percentChange(summary.totalCents, summary.previousTotalCents)
      : null;

  // The pill compares a running month with the same days of the last one, which is
  // what §6.2 draws. One exception: a running month more than half down on last
  // month is, in an app fed by monthly statements, almost always a month whose
  // statement has not arrived — not a person who halved their spending. Showing
  // "↓ 99% vs Aug" every day until the import is a false alarm, so it waits.
  const inProgress = month === currentMonthLocal();
  const change = rawChange !== null && inProgress && rawChange <= -50 ? null : rawChange;

  const trend = trimLeadingEmpty(summary?.trailingTotals ?? []);

  const observation = summary
    ? observeMonth({
        month,
        previousMonth: previousMonth(month),
        inProgress,
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

  const firstRun = hasAny === false;

  return (
    <SafeAreaView edges={['top']} style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.topRow}>
          <MonthSwitcher
            months={switcherMonths(month, currentMonthLocal())}
            activeMonth={month}
            onSelect={setMonth}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Notes from Sholdi"
            hitSlop={8}
            onPress={() => router.push('/insight')}
            style={styles.bell}>
            <Bell size={15} strokeWidth={1.6} color={colors.ink3} />
          </Pressable>
        </View>

        {/* `eyebrow` carries textTransform: 'uppercase' — DESIGN.md §3. */}
        <Text style={styles.eyebrow}>Spent in {monthName(month)}</Text>

        {isPending ? (
          <View style={styles.loading}>
            <ActivityIndicator color={colors.faint} />
          </View>
        ) : (
          <>
            <Amount
              variant="hero"
              cents={summary?.totalCents ?? 0}
              currency={summary?.currency ?? 'EUR'}
            />

            {change !== null && (
              <View style={styles.changeRow}>
                <ChangePill percent={change} comparedTo={previousMonth(month)} />
              </View>
            )}

            {isDrawable(trend) && <Sparkline values={trend} style={styles.sparkline} />}

            {firstRun ? (
              <EmptyState
                illustration="line"
                line="Nothing here yet. Add a purchase, or hand me a bank statement and I will sort the month out.">
                <Button label="Add spending" variant="primary" onPress={() => router.push('/add')} />
                <Button
                  label="Import a bank statement"
                  variant="secondary"
                  onPress={() => router.push('/add/pdf')}
                />
              </EmptyState>
            ) : (
              <>
                <View style={styles.rows}>
                  {/* §6.2: "two-to-three top category rows". */}
                  {(summary?.categories ?? []).slice(0, 3).map((category) => (
                    <Pressable
                      key={category.categoryId ?? 'none'}
                      accessibilityRole="button"
                      accessibilityLabel={`${category.name}, open its purchases`}
                      onPress={() => router.push({
        pathname: '/category/[categoryId]',
        params: { categoryId: category.categoryId ?? 'none' },
      })}
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

                <View style={styles.insight}>
                  <InsightRow
                    text={observation ?? `Nothing recorded in ${monthName(month)} yet.`}
                  />
                </View>
              </>
            )}
          </>
        )}
      </ScrollView>
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
    paddingBottom: spacing.xxl,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  bell: {
    width: BELL_SIZE,
    height: BELL_SIZE,
    borderRadius: BELL_SIZE / 2,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  eyebrow: {
    ...typeScale.eyebrow,
    color: colors.muted,
    marginTop: spacing.xxl,
  },
  loading: {
    paddingTop: spacing.xl,
    alignItems: 'flex-start',
  },
  changeRow: {
    marginTop: spacing.md,
  },
  sparkline: {
    marginTop: spacing.xl,
  },
  rows: {
    marginTop: spacing.xl,
    gap: spacing.sm,
  },
  pressed: {
    opacity: 0.82,
  },
  // Sits apart from the category group: it is Sholdi speaking, not another row.
  insight: {
    marginTop: spacing.lg,
  },
});

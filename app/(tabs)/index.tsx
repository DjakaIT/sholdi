/**
 * Home. DESIGN.md §6.2.
 *
 * Order is fixed by the spec: month switcher + bell, eyebrow, hero lockup, change
 * pill, sparkline, two-to-three category rows, one Sholdi observation.
 *
 * Reads the local database. The month comes from the store so the switcher, the
 * Index and any deep link all agree on which month is being looked at.
 *
 * ⚠ DESIGN.md does not specify an empty state, and a new install has one. Rather
 * than invent a screen, this renders the same layout at zero and replaces the
 * insight row — the one place Sholdi speaks — with a line pointing at the Add tab.
 * Worth replacing with a designed state.
 */
import { Bell } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Amount } from '@/components/Amount';
import { CategoryRow } from '@/components/CategoryRow';
import { ChangePill } from '@/components/ChangePill';
import { InsightRow } from '@/components/InsightRow';
import { MonthSwitcher } from '@/components/MonthSwitcher';
import { Sparkline } from '@/components/Sparkline';
import { useMonthSummary } from '@/features/expenses/hooks';
import { monthName, previousMonth } from '@/lib/dates';
import { percentChange } from '@/lib/money';
import { useMonthStore } from '@/stores/useMonthStore';
import { colors, spacing, type as typeScale } from '@/theme/tokens';

const BELL_SIZE = 32;

/** The switcher shows this month and the two before it. */
function recentMonths(month: string): string[] {
  const before = previousMonth(month);
  return [previousMonth(before), before, month];
}

export default function HomeScreen() {
  const router = useRouter();
  const month = useMonthStore((state) => state.month);
  const setMonth = useMonthStore((state) => state.setMonth);

  const { data: summary, isPending } = useMonthSummary(month);

  const change =
    summary && summary.previousTotalCents > 0
      ? percentChange(summary.totalCents, summary.previousTotalCents)
      : null;

  return (
    <SafeAreaView edges={['top']} style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.topRow}>
          <MonthSwitcher months={recentMonths(month)} activeMonth={month} onSelect={setMonth} />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Notes from Sholdi"
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

            {!summary?.isEmpty && (
              <Sparkline values={summary?.trailingTotals ?? []} style={styles.sparkline} />
            )}

            <View style={styles.rows}>
              {/* §6.2: "two-to-three top category rows". */}
              {(summary?.categories ?? []).slice(0, 3).map((category) => (
                <CategoryRow
                  key={category.name}
                  name={category.name}
                  colorToken={category.colorToken}
                  cents={category.cents}
                  currency={summary?.currency}
                />
              ))}
            </View>

            <View style={styles.insight}>
              <InsightRow
                text={
                  summary?.isEmpty
                    ? 'Nothing here yet. Add an expense, or hand me a bank statement and I will sort the month out.'
                    : `Your biggest category this month is ${summary?.categories[0]?.name ?? '—'}.`
                }
              />
            </View>
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
  // Sits apart from the category group: it is Sholdi speaking, not another row.
  insight: {
    marginTop: spacing.lg,
  },
});

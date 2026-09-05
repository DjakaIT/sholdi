/**
 * Home. DESIGN.md §6.2.
 *
 * Order is fixed by the spec: month switcher + bell, eyebrow, hero lockup, change
 * pill, sparkline, two-to-three category rows, one Sholdi observation.
 *
 * Mock data for now (build-order step 1). The screen reads a `MonthSummary` and
 * nothing else, so step 2 swaps the constant for a TanStack Query hook.
 */
import { Bell } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Amount } from '@/components/Amount';
import { CategoryRow } from '@/components/CategoryRow';
import { ChangePill } from '@/components/ChangePill';
import { InsightRow } from '@/components/InsightRow';
import { MonthSwitcher } from '@/components/MonthSwitcher';
import { Sparkline } from '@/components/Sparkline';
import { MOCK_MONTHS, MOCK_MONTH_SUMMARY } from '@/features/expenses/mockData';
import { monthName, previousMonth } from '@/lib/dates';
import { percentChange } from '@/lib/money';
import { colors, radii, spacing, type as typeScale } from '@/theme/tokens';

const BELL_SIZE = 32;

export default function HomeScreen() {
  const router = useRouter();
  const summary = MOCK_MONTH_SUMMARY;
  const change = percentChange(summary.totalCents, summary.previousTotalCents);

  return (
    <SafeAreaView edges={['top']} style={styles.screen}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}>
        <View style={styles.topRow}>
          <MonthSwitcher months={MOCK_MONTHS} activeMonth={summary.month} />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Notes from Sholdi"
            onPress={() => router.push('/insight')}
            style={styles.bell}>
            <Bell size={15} strokeWidth={1.6} color={colors.ink3} />
          </Pressable>
        </View>

        {/* `eyebrow` carries textTransform: 'uppercase' — DESIGN.md §3. */}
        <Text style={styles.eyebrow}>Spent in {monthName(summary.month)}</Text>

        <Amount variant="hero" cents={summary.totalCents} currency={summary.currency} />

        {change !== null && (
          <View style={styles.changeRow}>
            <ChangePill percent={change} comparedTo={previousMonth(summary.month)} />
          </View>
        )}

        <Sparkline values={summary.trailingTotals} style={styles.sparkline} />

        <View style={styles.rows}>
          {/* §6.2: "two-to-three top category rows". */}
          {summary.categories.slice(0, 3).map((category) => (
            <CategoryRow
              key={category.name}
              name={category.name}
              colorToken={category.colorToken}
              cents={category.cents}
              currency={summary.currency}
            />
          ))}
        </View>

        <View style={styles.insight}>
          <InsightRow text={summary.insight} />
        </View>
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

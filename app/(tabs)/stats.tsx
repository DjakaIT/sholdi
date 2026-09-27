/**
 * Stats. The second tab in DESIGN.md §5.2's bar — and the one screen §6 never
 * describes.
 *
 * ⚠ UNSPECIFIED LAYOUT. Built only from parts DESIGN.md already defines, so it is
 * at least of a piece with the rest: §5.4's proportional bars (plain Views, 2px,
 * radius 1 — no charting library), §5.3's row cards, the eyebrow, and a closing
 * line in Sholdi's voice as §6.7 asks of the Index. A proposal, not a design.
 *
 * It used to be an empty View. On a screen someone taps from the nav bar, nothing
 * at all reads as broken rather than empty, so it now always shows something true:
 * the last six months, where this month went, and three plain facts about it.
 *
 * Everything is computed locally. Nothing here calls a model.
 */
import { useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/Button';
import { Caron } from '@/components/Caron';
import { EmptyState } from '@/components/EmptyState';
import { InsightRow } from '@/components/InsightRow';
import {
  useHasAnyExpenses,
  useMonthFacts,
  useMonthHistory,
  useMonthSummary,
} from '@/features/expenses/hooks';
import { observeMonth } from '@/features/insights/observation';
import {
  currentMonthLocal,
  daysInMonth,
  monthName,
  monthShort,
  previousMonth,
  shortDate,
  todayLocal,
} from '@/lib/dates';
import { formatMoneyWhole } from '@/lib/money';
import { useMonthStore } from '@/stores/useMonthStore';
import { categoryAccent } from '@/theme/categoryColors';
import { colors, fonts, radii, spacing, tabular, type as typeScale } from '@/theme/tokens';

const HISTORY_MONTHS = 6;
const BAR = 2;

export default function StatsScreen() {
  const router = useRouter();
  const month = useMonthStore((state) => state.month);
  const setMonth = useMonthStore((state) => state.setMonth);

  const { data: hasAny, isPending: checking } = useHasAnyExpenses();
  const { data: summary } = useMonthSummary(month);
  const { data: history } = useMonthHistory(month, HISTORY_MONTHS);
  const { data: facts } = useMonthFacts(month);

  if (checking) {
    return (
      <SafeAreaView edges={['top']} style={styles.screen}>
        <View style={styles.loading}>
          <ActivityIndicator color={colors.faint} />
        </View>
      </SafeAreaView>
    );
  }

  if (hasAny === false) {
    return (
      <SafeAreaView edges={['top']} style={styles.screen}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <Text style={styles.eyebrow}>Stats</Text>
          <View style={styles.emptyWrap}>
            <EmptyState
              illustration="bars"
              line="Stats fill in as the months do. Hand me a bank statement and you will see where the whole month went.">
              <Button
                label="Import a bank statement"
                variant="primary"
                onPress={() => router.push('/add/pdf')}
              />
              <Button label="Add spending" variant="secondary" onPress={() => router.push('/add')} />
            </EmptyState>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  const total = summary?.totalCents ?? 0;
  const monthEmpty = total === 0;

  // History: only months from the first one with spending, so a new user is not
  // shown five empty rows before their first real month.
  const rows = history ?? [];
  const firstWithData = rows.findIndex((r) => r.cents > 0);
  const shownHistory = firstWithData === -1 ? [] : rows.slice(firstWithData);
  const historyMax = Math.max(1, ...shownHistory.map((r) => r.cents));
  // The month in progress is left out of the average: half a month would drag it
  // down and make every finished month look expensive by comparison.
  const active = shownHistory.filter((r) => r.cents > 0 && r.month !== currentMonthLocal());
  const average =
    active.length > 1 ? Math.round(active.reduce((s, r) => s + r.cents, 0) / active.length) : null;

  // Per day: a month still in progress is divided by the days so far, not by 30 —
  // otherwise the figure is quietly too low on every day but the last.
  const isCurrent = month === currentMonthLocal();
  const days = isCurrent ? Number(todayLocal().slice(8, 10)) : daysInMonth(month);
  const perDay = days > 0 ? Math.round(total / days) : 0;

  const observation = summary
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

  return (
    <SafeAreaView edges={['top']} style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.eyebrow}>Stats · {monthName(month)}</Text>

        {/* ── Month by month ─────────────────────────────────────────── */}
        {shownHistory.length > 0 && (
          <>
            <Text style={styles.section}>Month by month</Text>
            <View style={styles.card}>
              {shownHistory.map((row) => {
                const selected = row.month === month;
                return (
                  <Pressable
                    key={row.month}
                    accessibilityRole="button"
                    accessibilityLabel={`${monthName(row.month)}, ${formatMoneyWhole(row.cents)}`}
                    accessibilityState={{ selected }}
                    onPress={() => setMonth(row.month)}
                    style={styles.monthRow}>
                    <Text style={[styles.monthLabel, selected && styles.selectedText]}>
                      {monthShort(row.month)}
                    </Text>
                    <View style={styles.track}>
                      <View
                        style={[
                          styles.fill,
                          {
                            width: `${(row.cents / historyMax) * 100}%`,
                            backgroundColor: selected ? colors.ink : colors.faint,
                          },
                        ]}
                      />
                    </View>
                    <Text style={[styles.monthAmount, selected && styles.selectedText]}>
                      {formatMoneyWhole(row.cents)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            {average !== null && (
              <Text style={styles.caption}>
                {formatMoneyWhole(average)} a month on average, across {active.length} months.
              </Text>
            )}
          </>
        )}

        {monthEmpty ? (
          <View style={styles.block}>
            <InsightRow text={`Nothing recorded in ${monthName(month)} yet.`} />
          </View>
        ) : (
          <>
            {/* ── Where it went ──────────────────────────────────────── */}
            <Text style={styles.section}>Where it went</Text>
            <View style={styles.card}>
              {(summary?.categories ?? []).map((category, index) => {
                const share = total > 0 ? category.cents / total : 0;
                const accent = categoryAccent(category.colorToken);
                return (
                  <Pressable
                    key={category.categoryId ?? 'none'}
                    accessibilityRole="button"
                    accessibilityLabel={`${category.name}, ${Math.round(share * 100)} percent, open its purchases`}
                    onPress={() => router.push({
        pathname: '/category/[categoryId]',
        params: { categoryId: category.categoryId ?? 'none' },
      })}
                    style={({ pressed }) => [
                      styles.categoryRow,
                      index > 0 && styles.divided,
                      pressed && styles.pressed,
                    ]}>
                    <View style={styles.categoryTop}>
                      <View style={styles.categoryName}>
                        <View style={[styles.dot, { backgroundColor: accent }]} />
                        <Text style={styles.categoryLabel} numberOfLines={1}>
                          {category.name}
                        </Text>
                      </View>
                      <Text style={styles.share}>{Math.round(share * 100)}%</Text>
                      <Text style={styles.categoryAmount}>{formatMoneyWhole(category.cents)}</Text>
                    </View>
                    {/* §5.4: proportional bar, category colour in ink, never on a surface. */}
                    <View style={styles.track}>
                      <View
                        style={[styles.fill, { width: `${share * 100}%`, backgroundColor: accent }]}
                      />
                    </View>
                  </Pressable>
                );
              })}
            </View>

            {/* ── The month in numbers ───────────────────────────────── */}
            <Text style={styles.section}>The month in numbers</Text>
            <View style={styles.facts}>
              <Fact value={String(facts?.purchaseCount ?? 0)} label="purchases" />
              <Fact value={formatMoneyWhole(perDay)} label={isCurrent ? 'a day so far' : 'a day'} />
              <Fact
                value={facts?.largest ? formatMoneyWhole(facts.largest.cents) : '—'}
                label={
                  facts?.largest
                    ? `largest · ${facts.largest.merchant ?? shortDate(facts.largest.occurredOn)}`
                    : 'largest'
                }
              />
            </View>

            {observation && (
              <View style={styles.closing}>
                <View style={styles.caron}>
                  <Caron width={12} color={colors.ink3} />
                </View>
                <Text style={styles.closingText}>{observation}</Text>
              </View>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function Fact({ value, label }: { value: string; label: string }) {
  return (
    <View style={styles.fact}>
      <Text style={styles.factValue} numberOfLines={1}>
        {value}
      </Text>
      <Text style={styles.factLabel} numberOfLines={2}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.page,
  },
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    paddingBottom: spacing.xxl,
  },
  eyebrow: {
    ...typeScale.eyebrow,
    color: colors.muted,
    paddingTop: 8,
  },
  emptyWrap: {
    marginTop: spacing.xxl,
  },
  section: {
    fontFamily: fonts.regular,
    fontSize: 11.5,
    color: colors.muted,
    marginTop: spacing.xl,
    marginBottom: spacing.sm,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.tile,
    paddingHorizontal: 13,
    paddingVertical: 6,
  },
  caption: {
    fontFamily: fonts.regular,
    fontSize: 11,
    color: colors.muted,
    marginTop: spacing.sm,
    ...tabular,
  },
  monthRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    // 44px keeps each month a comfortable tap target.
    minHeight: 44,
  },
  monthLabel: {
    width: 30,
    fontFamily: fonts.regular,
    fontSize: 12,
    color: colors.muted,
  },
  monthAmount: {
    minWidth: 64,
    textAlign: 'right',
    fontFamily: fonts.regular,
    fontSize: 12.5,
    color: colors.ink3,
    ...tabular,
  },
  selectedText: {
    color: colors.ink,
  },
  track: {
    flex: 1,
    height: BAR,
    borderRadius: 1,
    backgroundColor: colors.line,
    overflow: 'hidden',
  },
  fill: {
    height: BAR,
    borderRadius: 1,
  },
  block: {
    marginTop: spacing.xl,
  },
  pressed: {
    opacity: 0.82,
  },
  categoryRow: {
    paddingVertical: 11,
    gap: 9,
  },
  divided: {
    borderTopWidth: 1,
    borderTopColor: colors.hairline,
  },
  categoryTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  categoryName: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
  categoryLabel: {
    ...typeScale.rowLabel,
    color: colors.ink2,
    flexShrink: 1,
  },
  share: {
    fontFamily: fonts.regular,
    fontSize: 11,
    color: colors.muted,
    ...tabular,
  },
  categoryAmount: {
    minWidth: 60,
    textAlign: 'right',
    fontFamily: fonts.regular,
    fontSize: 13,
    color: colors.ink2,
    ...tabular,
  },
  facts: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  fact: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radii.tile,
    paddingVertical: 12,
    paddingHorizontal: 13,
    gap: 4,
  },
  factValue: {
    fontFamily: fonts.medium,
    fontSize: 16,
    color: colors.ink,
    ...tabular,
  },
  factLabel: {
    fontFamily: fonts.regular,
    fontSize: 11,
    lineHeight: 15,
    color: colors.muted,
  },
  closing: {
    flexDirection: 'row',
    gap: 9,
    marginTop: spacing.xl,
  },
  caron: {
    paddingTop: 7,
  },
  closingText: {
    flex: 1,
    fontFamily: fonts.regular,
    fontSize: 12.5,
    lineHeight: 12.5 * 1.7,
    color: colors.ink3,
  },
});

/**
 * The Index. DESIGN.md §6.7.
 *
 * A mosaic where block area maps to spend share: one full-width block for the
 * largest category, then two rows of two at decreasing heights. Built with flexbox
 * and no charting library, as §5.4 requires.
 *
 * The screen always ends in Sholdi's voice — that closing line is what stops it
 * being a table.
 */
import { Plus } from 'lucide-react-native';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Caron } from '@/components/Caron';
import { CategoryBlock } from '@/components/CategoryBlock';
import { GoalStrip } from '@/components/GoalStrip';
import { MOCK_GOAL, MOCK_MONTH_SUMMARY } from '@/features/expenses/mockData';
import { monthName } from '@/lib/dates';
import { percentChange } from '@/lib/money';
import { colors, fonts, indexTypeSize, spacing, type as typeScale } from '@/theme/tokens';

/** §6.7 fixes the row heights; they are the clamp that stops an outlier dominating. */
const ROW_HEIGHTS = { first: 92, second: 76, third: 68 };

const ADD_BUTTON = 30;

export default function IndexScreen() {
  const summary = MOCK_MONTH_SUMMARY;
  const total = summary.totalCents;

  const ranked = [...summary.categories].sort((a, b) => b.cents - a.cents);
  const [largest, ...rest] = ranked;
  const secondRow = rest.slice(0, 2);
  const thirdRow = rest.slice(2, 4);

  // §3 puts the largest category's name at 19 and the smallest at 13. Sizing off the
  // raw share would never reach 19, so position within the visible set is what is
  // normalised, then clamped by indexTypeSize.
  const max = ranked[0]?.cents ?? 0;
  const min = ranked[ranked.length - 1]?.cents ?? 0;
  const nameSize = (cents: number) =>
    indexTypeSize(max === min ? 1 : (cents - min) / (max - min));

  const delta = (cents: number, previous: number) => percentChange(cents, previous) ?? 0;
  const share = (cents: number) => Math.round((cents / total) * 100);

  return (
    <SafeAreaView edges={['top']} style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Text style={styles.eyebrow}>Index · {monthName(summary.month)}</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Add category"
            style={styles.addButton}>
            <Plus size={15} strokeWidth={1.6} color={colors.ink} />
          </Pressable>
        </View>

        <View style={styles.mosaic}>
          {largest && (
            <View style={styles.row}>
              <CategoryBlock
                name={largest.name}
                colorToken={largest.colorToken}
                cents={largest.cents}
                currency={summary.currency}
                deltaPercent={delta(largest.cents, largest.previousCents)}
                nameSize={nameSize(largest.cents)}
                height={ROW_HEIGHTS.first}
                shareLabel={`${share(largest.cents)}% of month`}
              />
            </View>
          )}

          {secondRow.length > 0 && (
            <View style={styles.row}>
              {secondRow.map((category) => (
                <View key={category.name} style={{ flex: category.cents }}>
                  <CategoryBlock
                    name={category.name}
                    colorToken={category.colorToken}
                    cents={category.cents}
                    currency={summary.currency}
                    deltaPercent={delta(category.cents, category.previousCents)}
                    nameSize={nameSize(category.cents)}
                    height={ROW_HEIGHTS.second}
                  />
                </View>
              ))}
            </View>
          )}

          {thirdRow.length > 0 && (
            <View style={styles.row}>
              {thirdRow.map((category) => (
                <View key={category.name} style={{ flex: category.cents }}>
                  <CategoryBlock
                    name={category.name}
                    colorToken={category.colorToken}
                    cents={category.cents}
                    currency={summary.currency}
                    deltaPercent={delta(category.cents, category.previousCents)}
                    nameSize={nameSize(category.cents)}
                    height={ROW_HEIGHTS.third}
                  />
                </View>
              ))}
            </View>
          )}

          <GoalStrip
            name={MOCK_GOAL.name}
            savedCents={MOCK_GOAL.savedCents}
            targetCents={MOCK_GOAL.targetCents}
            currency={summary.currency}
          />
        </View>

        <View style={styles.closing}>
          <View style={styles.caron}>
            <Caron width={12} color={colors.ink3} />
          </View>
          <Text style={styles.closingText}>{summary.indexClosingLine}</Text>
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
  mosaic: {
    marginTop: spacing.lg,
    gap: 6,
  },
  row: {
    flexDirection: 'row',
    gap: 6,
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

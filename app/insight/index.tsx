/**
 * Notes from Sholdi. DESIGN.md §6.5.
 *
 * ⚠ Route not in ARCHITECTURE.md §2, which lists only `insight/[insightId]` (the
 * push-notification deep-link target). §6.5 describes a screen showing *two* cards
 * plus the cadence promise, so it needs a list route to live at. Flagged for
 * confirmation; the deep-link route is still to build (step 8).
 *
 * The footer line is load-bearing, not decoration: it turns the anti-nagging
 * principle into a promise the user can see, and the database enforces it
 * (see supabase/migrations/..._insight_cap.sql).
 */
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/Button';
import { InsightCard } from '@/components/InsightCard';
import { MOCK_INSIGHTS } from '@/features/insights/mockData';
import { colors, fonts, spacing, type as typeScale } from '@/theme/tokens';

export default function InsightsScreen() {
  return (
    <SafeAreaView edges={['top']} style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.eyebrow}>Notes from Sholdi</Text>

        <View style={styles.cards}>
          {MOCK_INSIGHTS.map((insight) => (
            <InsightCard key={insight.id} meta={insight.meta} body={insight.body}>
              {insight.actions.map((action) => (
                <Button key={action.label} label={action.label} variant={action.variant} />
              ))}
            </InsightCard>
          ))}
        </View>

        {/* DESIGN.md §6.5: "keep this line". */}
        <Text style={styles.promise}>2–3 notes a month, max.</Text>
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
    paddingTop: spacing.xl,
    paddingBottom: spacing.xl,
  },
  eyebrow: {
    ...typeScale.eyebrow,
    color: colors.muted,
  },
  cards: {
    marginTop: spacing.lg,
    gap: spacing.md,
  },
  promise: {
    fontFamily: fonts.regular,
    fontSize: 11.5,
    color: colors.muted,
    textAlign: 'center',
    marginTop: spacing.xl,
  },
});

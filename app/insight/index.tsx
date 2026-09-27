/**
 * Notes from Sholdi. DESIGN.md §6.5.
 *
 * ⚠ Route not in ARCHITECTURE.md §2, which lists only `insight/[insightId]` (the
 * push-notification deep-link target). §6.5 describes a screen showing cards plus
 * the cadence promise, so it needs a list route to live at.
 *
 * This used to show two invented notes — three pairs of shoes, €85 back on eating
 * out — to everyone, whatever they had spent. It now shows only notes that were
 * actually written and stored, which today is none: writing them is build step 8
 * and is not wired yet. So the honest screen is an empty one that says what will
 * appear here and how often.
 *
 * The footer line is load-bearing, not decoration: it turns the anti-nagging
 * principle into a promise the user can see.
 */
import { ChevronLeft } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/Button';
import { EmptyState } from '@/components/EmptyState';
import { InsightCard } from '@/components/InsightCard';
import { useDismissInsight, useInsights } from '@/features/expenses/hooks';
import { colors, fonts, spacing, type as typeScale } from '@/theme/tokens';

export default function InsightsScreen() {
  const router = useRouter();
  const { data: insights, isPending } = useInsights();
  const dismiss = useDismissInsight();

  return (
    <SafeAreaView edges={['top']} style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back"
          onPress={() => router.back()}
          hitSlop={12}
          style={styles.back}>
          <ChevronLeft size={18} strokeWidth={1.6} color={colors.ink3} />
        </Pressable>

        <Text style={styles.eyebrow}>Notes from Sholdi</Text>

        {isPending ? (
          <View style={styles.loading}>
            <ActivityIndicator color={colors.faint} />
          </View>
        ) : (insights ?? []).length === 0 ? (
          <EmptyState
            illustration="notes"
            line="No notes yet. When a month has something worth a glance — a category easing off, a habit forming — I will write it here."
          />
        ) : (
          <View style={styles.cards}>
            {(insights ?? []).map((insight) => (
              <InsightCard key={insight.id} meta={insight.title} body={insight.body}>
                <Button
                  label="Dismiss"
                  variant="dismiss"
                  onPress={() => dismiss.mutate(insight.id)}
                />
              </InsightCard>
            ))}
          </View>
        )}

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
    paddingTop: spacing.md,
    paddingBottom: spacing.xl,
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

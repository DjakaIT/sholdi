/**
 * Type it. DESIGN.md §6.3 names the tile and its promise — "plain words work" —
 * but does not specify this screen.
 *
 * ⚠ UNSPECIFIED. Built from existing primitives and the §6.3 sheet so it is at least
 * consistent, but it is a proposal, not a design. Worth replacing.
 *
 * The important behaviour: it works with no AI. A note is parsed locally first, and
 * the model is only asked when it is configured — so the promise on the tile holds
 * offline, with no key, and at no cost. When the model does answer, it wins, because
 * it reads merchant and date far better than a regex can.
 */
import { useState } from 'react';
import { useRouter } from 'expo-router';
import { ActivityIndicator, StyleSheet, Text, TextInput, View } from 'react-native';

import { BottomSheet } from '@/components/BottomSheet';
import { Button } from '@/components/Button';
import { useAddExpense, useCategories } from '@/features/expenses/hooks';
import { parseNote } from '@/features/expenses/parseText';
import { NEEDS_REVIEW_BELOW } from '@/features/expenses/types';
import { extractText } from '@/lib/functions';
import { isAiConfigured } from '@/lib/functions';
import { colors, fonts, radii, spacing } from '@/theme/tokens';

export default function TypeItScreen() {
  const router = useRouter();
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const { data: categories } = useCategories();
  const addExpense = useAddExpense();

  const dismiss = () => router.back();

  async function submit() {
    const text = note.trim();
    if (!text) return;

    setBusy(true);
    setError(null);

    try {
      const today = new Date().toISOString().slice(0, 10);
      const names = (categories ?? []).map((c) => c.name);

      // Local read first: it always works and costs nothing.
      const local = parseNote(text);

      if (isAiConfigured) {
        try {
          const extracted = await extractText({ text, categories: names, today });
          const match = (categories ?? []).find(
            (c) => c.name.toLowerCase() === extracted.suggested_category.toLowerCase()
          );

          await addExpense.mutateAsync({
            amountCents: extracted.amount_cents,
            currency: extracted.currency,
            merchant: extracted.merchant,
            description: extracted.description,
            occurredOn: extracted.occurred_on,
            categoryId: match?.id ?? null,
            source: 'text',
            confidence: extracted.confidence,
            needsReview: extracted.confidence < NEEDS_REVIEW_BELOW,
          });

          dismiss();
          return;
        } catch (aiError) {
          // The model was configured but unreachable or unhappy. Fall through to the
          // local read rather than losing what the user typed.
          console.warn('extract-text failed, using the local read:', aiError);
        }
      }

      if (!local) {
        setError('Add an amount, like "38 euro Konzum".');
        return;
      }

      await addExpense.mutateAsync({
        amountCents: local.amountCents,
        merchant: local.merchant,
        occurredOn: today,
        categoryId: null,
        source: 'text',
        confidence: local.confidence,
        needsReview: local.confidence < NEEDS_REVIEW_BELOW,
      });

      dismiss();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'That did not save.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <BottomSheet onDismiss={dismiss}>
      <Text style={styles.title}>Type it</Text>
      <Text style={styles.subtitle}>Plain words work.</Text>

      <View style={styles.field}>
        <TextInput
          autoFocus
          value={note}
          onChangeText={(value) => {
            setNote(value);
            if (error) setError(null);
          }}
          placeholder="38 euro, Konzum"
          placeholderTextColor={colors.faint}
          style={styles.input}
          onSubmitEditing={submit}
          returnKeyType="done"
          editable={!busy}
        />
      </View>

      {error && <Text style={styles.error}>{error}</Text>}

      <View style={styles.actions}>
        {busy ? (
          <View style={styles.busy}>
            <ActivityIndicator color={colors.faint} />
          </View>
        ) : (
          <Button label="Add it" variant="primary" onPress={submit} style={styles.submit} />
        )}
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  title: {
    fontFamily: fonts.medium,
    fontSize: 16,
    color: colors.ink,
  },
  subtitle: {
    fontFamily: fonts.regular,
    fontSize: 11.5,
    color: colors.muted,
    marginTop: 4,
  },
  field: {
    marginTop: spacing.lg,
    backgroundColor: colors.raised,
    borderRadius: radii.tile,
    paddingHorizontal: 13,
    height: 48,
    justifyContent: 'center',
  },
  input: {
    fontFamily: fonts.regular,
    fontSize: 15,
    color: colors.ink,
    padding: 0,
  },
  error: {
    fontFamily: fonts.regular,
    fontSize: 11.5,
    color: colors.ink3,
    marginTop: spacing.sm,
  },
  actions: {
    marginTop: spacing.lg,
  },
  submit: {
    width: '100%',
  },
  busy: {
    height: 43,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

/**
 * Bank PDF upload. DESIGN.md §6.3 names the tile; this screen is not specified.
 *
 * ⚠ UNSPECIFIED LAYOUT. Built from existing primitives.
 *
 * ARCHITECTURE.md §5 calls the flow this starts "the flow that must be perfect":
 * upload → extract → review → confirm, under two minutes. This screen owns the
 * first two steps and then hands off to the §6.4 review screen, which is where the
 * user confirms. Nothing is written to the database from here.
 *
 * ⚠ Known gap: §4.2 now says text-based bank PDFs should be parsed deterministically
 * on-device, one parser per bank, with only unknown merchant names reaching the
 * model. That parser does not exist yet, so this sends the PDF to the model — the
 * older, more expensive path. Correct output, wrong economics; the parser is the
 * next piece of work.
 */
import { useState } from 'react';
import { useRouter } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { BottomSheet } from '@/components/BottomSheet';
import { Button } from '@/components/Button';
import { useCategories } from '@/features/expenses/hooks';
import { NEEDS_REVIEW_BELOW } from '@/features/expenses/types';
import { extractStatement, isAiConfigured } from '@/lib/functions';
import { newId } from '@/lib/db';
import { useImportStore } from '@/stores/useImportStore';
import { colors, fonts, spacing } from '@/theme/tokens';

export default function PdfScreen() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data: categories } = useCategories();
  const setExtraction = useImportStore((state) => state.setExtraction);

  const dismiss = () => router.back();

  async function pickAndExtract() {
    setError(null);

    if (!isAiConfigured) {
      setError('Reading statements needs the AI service. It is not configured yet.');
      return;
    }

    try {
      const picked = await DocumentPicker.getDocumentAsync({
        type: 'application/pdf',
        copyToCacheDirectory: true,
      });

      if (picked.canceled || !picked.assets?.[0]) return;
      const file = picked.assets[0];

      setBusy(true);
      // A statement takes real time to read. Saying so beats a silent spinner —
      // DESIGN.md §8 asks for a calm progress treatment, never a spinner with sparkles.
      setStatus('Reading your statement. This takes a moment.');

      const names = (categories ?? []).map((c) => c.name);
      const result = await extractStatement({ uri: file.uri, categories: names });

      if (result.expenses.length === 0) {
        // §7: extraction failure needs an exit, not a dead end.
        setError(
          "Sholdi couldn't find any transactions in that PDF. If it's a scan rather " +
            'than a text statement, try adding a few by hand.'
        );
        return;
      }

      const rows = result.expenses.map((expense) => {
        const match = (categories ?? []).find(
          (c) => c.name.toLowerCase() === expense.suggested_category.toLowerCase()
        );
        return {
          ...expense,
          id: newId(),
          needs_review: expense.confidence < NEEDS_REVIEW_BELOW,
          categoryId: match?.id ?? null,
        };
      });

      setExtraction({
        rows,
        issues: result.issues ?? [],
        period: rows[0]?.occurred_on?.slice(0, 7) ?? null,
        sourceName: file.name ?? null,
      });

      // Replace rather than push: the sheet should not sit behind the review screen.
      router.replace('/import/new');
    } catch (pdfError) {
      setError(
        pdfError instanceof Error ? pdfError.message : "Couldn't read that statement."
      );
    } finally {
      setBusy(false);
      setStatus(null);
    }
  }

  return (
    <BottomSheet onDismiss={dismiss}>
      <Text style={styles.title}>Bank PDF</Text>
      <Text style={styles.subtitle}>Whole month at once.</Text>

      {error && <Text style={styles.error}>{error}</Text>}

      {busy ? (
        <View style={styles.busy}>
          <ActivityIndicator color={colors.faint} />
          {status && <Text style={styles.status}>{status}</Text>}
        </View>
      ) : (
        <View style={styles.actions}>
          <Button
            label="Choose a statement"
            variant="primary"
            onPress={pickAndExtract}
            style={styles.action}
          />
          <Text style={styles.hint}>
            The monthly PDF from your banking app. It is read once and never stored.
          </Text>
        </View>
      )}
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
  error: {
    fontFamily: fonts.regular,
    fontSize: 11.5,
    color: colors.ink3,
    lineHeight: 11.5 * 1.6,
    marginTop: spacing.md,
  },
  actions: {
    marginTop: spacing.lg,
    gap: spacing.md,
  },
  action: {
    width: '100%',
  },
  hint: {
    fontFamily: fonts.regular,
    fontSize: 11,
    color: colors.muted,
    textAlign: 'center',
    lineHeight: 11 * 1.6,
  },
  busy: {
    marginTop: spacing.xl,
    alignItems: 'center',
    gap: spacing.md,
  },
  status: {
    fontFamily: fonts.regular,
    fontSize: 11.5,
    color: colors.muted,
    textAlign: 'center',
  },
});

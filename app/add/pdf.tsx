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
import { File } from 'expo-file-system';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { BottomSheet } from '@/components/BottomSheet';
import { Button } from '@/components/Button';
import { useCategories } from '@/features/expenses/hooks';
import { NEEDS_REVIEW_BELOW } from '@/features/expenses/types';
import { extractStatement, isAiConfigured } from '@/lib/functions';
import { newId } from '@/lib/db';
import { listPatterns, resolveMerchant } from '@/features/transactions/merchantMemory';
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
      // expo-file-system's own picker, not expo-document-picker. Expo Go sandboxes
      // BOTH file APIs away from DocumentPicker's cache folder, so a file it returns
      // cannot be read at all in Expo Go. A File produced here is one this library
      // already owns, so reading it needs no second resolution.
      const picked = await File.pickFileAsync({ mimeTypes: ['application/pdf'] });
      if (picked.canceled || !picked.result) return;
      const file = picked.result;

      setBusy(true);
      // A statement takes real time to read. Saying so beats a silent spinner —
      // DESIGN.md §8 asks for a calm progress treatment, never a spinner with sparkles.
      setStatus('Reading your statement. This takes a moment.');

      const names = (categories ?? []).map((c) => c.name);
      const base64 = await file.base64();
      const result = await extractStatement({ base64, categories: names });

      if (result.expenses.length === 0) {
        // §7: extraction failure needs an exit, not a dead end.
        setError(
          "Sholdi couldn't find any transactions in that PDF. If it's a scan rather " +
            'than a text statement, try adding a few by hand.'
        );
        return;
      }

      // COST-CONTROLS.md §3: a merchant the device already recognises is assigned
      // locally and costs nothing. The model's suggestion is only used where memory
      // has nothing to say.
      const patterns = await listPatterns();

      const rows = result.expenses.map((expense) => {
        const remembered = resolveMerchant(expense.merchant, patterns);

        const suggested = (categories ?? []).find(
          (c) => c.name.toLowerCase() === expense.suggested_category.toLowerCase()
        );
        const categoryId = remembered.categoryId ?? suggested?.id ?? null;

        // A remembered merchant is more trustworthy than a fresh guess, so it
        // raises confidence rather than inheriting the model's.
        const confidence = remembered.via === 'none' ? expense.confidence : remembered.confidence;

        return {
          ...expense,
          id: newId(),
          confidence,
          needs_review: confidence < NEEDS_REVIEW_BELOW,
          categoryId,
        };
      });

      setExtraction({
        rows,
        issues: result.issues ?? [],
        period: rows[0]?.occurred_on?.slice(0, 7) ?? null,
        sourceName: null,
      });

      // Close the sheet stack first. Navigating from inside a transparentModal
      // leaves the destination rendering on that modal's transparent card, which
      // reads as a blank screen.
      router.dismissAll();
      router.push('/import/new');
    } catch (pdfError) {
      console.error('Bank PDF import failed:', pdfError);
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

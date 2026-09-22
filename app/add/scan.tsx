/**
 * Scan a receipt. DESIGN.md §6.3 names the tile; this screen is not specified.
 *
 * ⚠ UNSPECIFIED LAYOUT. Built from existing primitives so it is at least
 * consistent with the §6.3 sheet. A proposal, not a design.
 *
 * Also backs "or drop any photo" — §4.2 is explicit that photos are just receipts,
 * so there is one path, not two. `mode` only changes which picker opens first.
 *
 * This screen needs AI: a photo cannot be read offline. When it is not configured
 * it says so plainly rather than failing at the moment of upload.
 */
import { useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { BottomSheet } from '@/components/BottomSheet';
import { Button } from '@/components/Button';
import { useAddExpense, useCategories } from '@/features/expenses/hooks';
import { NEEDS_REVIEW_BELOW } from '@/features/expenses/types';
import { prepareImageForModel } from '@/features/transactions/prepareImage';
import { extractReceipt, isAiConfigured } from '@/lib/functions';
import { colors, fonts, spacing } from '@/theme/tokens';

export default function ScanScreen() {
  const router = useRouter();
  const { mode } = useLocalSearchParams<{ mode?: string }>();
  const fromLibrary = mode === 'photo';

  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data: categories } = useCategories();
  const addExpense = useAddExpense();

  const dismiss = () => router.back();

  async function pickAndRead(useCamera: boolean) {
    setError(null);

    if (!isAiConfigured) {
      setError('Reading photos needs the AI service. Add an expense with Type it instead.');
      return;
    }

    try {
      // Permission is requested at the moment of use, not on mount — asking before
      // the user has chosen anything is how apps get denied by reflex.
      const permission = useCamera
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (!permission.granted) {
        setError(
          useCamera
            ? 'Sholdi needs camera access to scan a receipt.'
            : 'Sholdi needs photo access to read a photo.'
        );
        return;
      }

      const picked = useCamera
        ? await ImagePicker.launchCameraAsync({ quality: 1, exif: false })
        : await ImagePicker.launchImageLibraryAsync({
            quality: 1,
            exif: false,
            mediaTypes: ['images'],
          });

      if (picked.canceled || !picked.assets?.[0]) return;
      const asset = picked.assets[0];

      setBusy(true);
      setStatus('Getting the photo ready');

      // HEIC becomes JPEG here, and the image is downscaled before it costs tokens.
      const prepared = await prepareImageForModel(asset.uri, asset.width, asset.height);

      setStatus('Reading it');
      const today = new Date().toISOString().slice(0, 10);
      const names = (categories ?? []).map((c) => c.name);

      const extracted = await extractReceipt({
        uri: prepared.uri,
        mimeType: prepared.mimeType,
        categories: names,
        today,
      });

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
        source: fromLibrary ? 'photo' : 'receipt',
        confidence: extracted.confidence,
        needsReview: extracted.confidence < NEEDS_REVIEW_BELOW,
      });

      dismiss();
    } catch (scanError) {
      setError(
        scanError instanceof Error
          ? scanError.message
          : "Couldn't read that photo. Try again, or add it by hand."
      );
    } finally {
      setBusy(false);
      setStatus(null);
    }
  }

  return (
    <BottomSheet onDismiss={dismiss}>
      <Text style={styles.title}>{fromLibrary ? 'Read a photo' : 'Scan a receipt'}</Text>
      <Text style={styles.subtitle}>
        {fromLibrary
          ? 'Any photo with a price on it.'
          : 'Point at the total. Sholdi reads the rest.'}
      </Text>

      {error && <Text style={styles.error}>{error}</Text>}

      {busy ? (
        <View style={styles.busy}>
          <ActivityIndicator color={colors.faint} />
          {status && <Text style={styles.status}>{status}</Text>}
        </View>
      ) : (
        <View style={styles.actions}>
          {!fromLibrary && (
            <Button
              label="Take a photo"
              variant="primary"
              onPress={() => pickAndRead(true)}
              style={styles.action}
            />
          )}
          <Button
            label={fromLibrary ? 'Choose a photo' : 'Choose from photos'}
            variant="secondary"
            onPress={() => pickAndRead(false)}
            style={styles.action}
          />
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
    marginTop: spacing.md,
  },
  actions: {
    marginTop: spacing.lg,
    gap: spacing.sm,
  },
  action: {
    width: '100%',
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
  },
});

/**
 * Universal input. DESIGN.md §6.3.
 *
 * Four tiles, all weighted identically — no highlighting of Bank PDF (§9) — over a
 * dimmed Home. The catch-all below is the fifth path: drop any photo.
 */
import { FileText, Keyboard, Mic, Scan } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { BottomSheet } from '@/components/BottomSheet';
import { InputTile } from '@/components/InputTile';
import { colors, fonts, radii, spacing } from '@/theme/tokens';

export default function AddScreen() {
  const router = useRouter();
  const dismiss = () => router.back();

  return (
    <BottomSheet onDismiss={dismiss}>
      <Text style={styles.title}>Add spending</Text>
      <Text style={styles.subtitle}>Any way you like. Sholdi sorts it out.</Text>

      <View style={styles.grid}>
        <View style={styles.row}>
          <InputTile icon={Scan} title="Scan" subLabel="a receipt" />
          <InputTile icon={Mic} title="Say it" subLabel={'“38 euro, Konzum”'} />
        </View>
        <View style={styles.row}>
          <InputTile icon={Keyboard} title="Type it" subLabel="plain words work" />
          <InputTile icon={FileText} title="Bank PDF" subLabel="whole month at once" />
        </View>
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="or drop any photo"
        style={styles.catchAll}>
        <Text style={styles.catchAllText}>or drop any photo</Text>
      </Pressable>
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
  grid: {
    marginTop: spacing.lg,
    gap: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  catchAll: {
    marginTop: spacing.sm,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.line,
    borderRadius: radii.block,
    paddingVertical: 14,
    alignItems: 'center',
  },
  catchAllText: {
    fontFamily: fonts.regular,
    fontSize: 11.5,
    color: colors.muted,
  },
});

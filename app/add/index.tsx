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
          <InputTile
            icon={Scan}
            title="Scan"
            subLabel="a receipt"
            onPress={() => router.push('/add/scan')}
          />
          {/*
            Speech-to-text is not built yet (the free, on-device option is noted for
            later). Until then the tile opens the note field with the keyboard up:
            every phone keyboard has a dictation mic, and the words land in the
            same parser. Nothing leaves the app that the keyboard did not already
            handle. A dead tile was worse than this.
          */}
          <InputTile
            icon={Mic}
            title="Say it"
            subLabel={'“38 euro, Konzum”'}
            onPress={() => router.push({ pathname: '/add/type', params: { mode: 'voice' } })}
          />
        </View>
        <View style={styles.row}>
          <InputTile
            icon={Keyboard}
            title="Type it"
            subLabel="plain words work"
            onPress={() => router.push('/add/type')}
          />
          <InputTile
            icon={FileText}
            title="Bank PDF"
            subLabel="whole month at once"
            onPress={() => router.push('/add/pdf')}
          />
        </View>
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="or drop any photo"
        onPress={() => router.push('/add/scan?mode=photo')}
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

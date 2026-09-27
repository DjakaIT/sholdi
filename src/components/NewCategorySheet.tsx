/**
 * New category. Behind the §6.7 "+" button, which until now did nothing.
 *
 * A name and nothing else: the colour is assigned by cycling the fixed palette,
 * because §4.3 forbids a free colour picker — that constraint is what keeps the
 * Index coherent however many categories someone makes.
 *
 * Presented in a transparent Modal over the Index, inside the same BottomSheet the
 * Add flow uses, so it opens and dims exactly like every other sheet (§8 item 3).
 */
import { useState } from 'react';
import { ActivityIndicator, Modal, StyleSheet, Text, TextInput, View } from 'react-native';

import { BottomSheet } from '@/components/BottomSheet';
import { Button } from '@/components/Button';
import { useCreateCategory } from '@/features/expenses/hooks';
import { colors, fonts, radii, spacing } from '@/theme/tokens';

export type NewCategorySheetProps = {
  visible: boolean;
  onClose: () => void;
};

export function NewCategorySheet({ visible, onClose }: NewCategorySheetProps) {
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const createCategory = useCreateCategory();

  function close() {
    setName('');
    setError(null);
    onClose();
  }

  async function submit() {
    if (!name.trim() || createCategory.isPending) return;
    setError(null);
    try {
      await createCategory.mutateAsync(name);
      close();
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : 'That did not save.');
    }
  }

  return (
    <Modal visible={visible} transparent animationType="none" statusBarTranslucent onRequestClose={close}>
      <BottomSheet onDismiss={close}>
        <Text style={styles.title}>New category</Text>
        <Text style={styles.subtitle}>A name is all it needs. Sholdi picks the colour.</Text>

        <View style={styles.field}>
          <TextInput
            autoFocus
            value={name}
            onChangeText={(value) => {
              setName(value);
              if (error) setError(null);
            }}
            placeholder="e.g. Bills, Shopping, Health"
            placeholderTextColor={colors.faint}
            style={styles.input}
            maxLength={32}
            returnKeyType="done"
            onSubmitEditing={submit}
            editable={!createCategory.isPending}
          />
        </View>

        {error && <Text style={styles.error}>{error}</Text>}

        <View style={styles.actions}>
          {createCategory.isPending ? (
            <View style={styles.busy}>
              <ActivityIndicator color={colors.faint} />
            </View>
          ) : (
            <Button
              label="Add category"
              variant="primary"
              onPress={submit}
              disabled={!name.trim()}
              style={styles.submit}
            />
          )}
        </View>
      </BottomSheet>
    </Modal>
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

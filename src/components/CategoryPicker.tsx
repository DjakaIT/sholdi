/**
 * The inline category picker. ARCHITECTURE.md §5: "tapping a category label opens a
 * picker inline, never a new screen."
 *
 * A wrap of §5.1 inline pills, each led by its category's 5px dot, opened directly
 * beneath the row being changed. The last pill turns into a name field for a new
 * category — whose colour is assigned, never chosen (§4.3: "Never expose a free
 * colour picker").
 *
 * Used on the import review screen, before anything is saved, and on a category's
 * own list, after.
 */
import { useState } from 'react';
import { Plus } from 'lucide-react-native';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import type { Category } from '@/features/expenses/types';
import { categoryAccent } from '@/theme/categoryColors';
import { colors, fonts, radii } from '@/theme/tokens';

export type CategoryPickerProps = {
  categories: Category[];
  selectedId: string | null;
  onSelect: (categoryId: string) => void;
  /** Creates (or finds) a category by name and returns it. */
  onCreate: (name: string) => Promise<Category>;
};

export function CategoryPicker({ categories, selectedId, onSelect, onCreate }: CategoryPickerProps) {
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create() {
    if (!name.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const category = await onCreate(name);
      setNaming(false);
      setName('');
      onSelect(category.id);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : 'That did not save.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.root}>
      <View style={styles.wrap}>
        {categories.map((category) => {
          const selected = category.id === selectedId;
          return (
            <Pressable
              key={category.id}
              accessibilityRole="button"
              accessibilityLabel={category.name}
              accessibilityState={{ selected }}
              onPress={() => onSelect(category.id)}
              style={({ pressed }) => [styles.pill, selected && styles.pillSelected, pressed && styles.pressed]}>
              <View style={[styles.dot, { backgroundColor: categoryAccent(category.color_token) }]} />
              <Text style={[styles.pillText, selected && styles.pillTextSelected]}>{category.name}</Text>
            </Pressable>
          );
        })}

        {!naming && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="New category"
            onPress={() => setNaming(true)}
            style={({ pressed }) => [styles.pill, styles.newPill, pressed && styles.pressed]}>
            <Plus size={12} strokeWidth={1.6} color={colors.muted} />
            <Text style={styles.newText}>New</Text>
          </Pressable>
        )}
      </View>

      {naming && (
        <View style={styles.nameRow}>
          <View style={styles.field}>
            <TextInput
              autoFocus
              value={name}
              onChangeText={(value) => {
                setName(value);
                if (error) setError(null);
              }}
              placeholder="Name, e.g. Bills"
              placeholderTextColor={colors.faint}
              style={styles.input}
              returnKeyType="done"
              onSubmitEditing={create}
              maxLength={32}
              editable={!busy}
            />
          </View>
          {busy ? (
            <ActivityIndicator color={colors.faint} />
          ) : (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Add category"
              onPress={create}
              disabled={!name.trim()}
              style={({ pressed }) => [
                styles.addButton,
                !name.trim() && styles.disabled,
                pressed && styles.pressed,
              ]}>
              <Text style={styles.addText}>Add</Text>
            </Pressable>
          )}
        </View>
      )}

      {error && <Text style={styles.error}>{error}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    paddingTop: 4,
    paddingBottom: 10,
    gap: 10,
  },
  wrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  // §5.1 inline pill.
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radii.pill,
    paddingVertical: 8,
    paddingHorizontal: 13,
  },
  pillSelected: {
    backgroundColor: colors.raised,
    borderColor: colors.raised,
  },
  pressed: {
    opacity: 0.82,
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
  pillText: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: colors.ink3,
  },
  pillTextSelected: {
    color: colors.ink,
  },
  newPill: {
    borderStyle: 'dashed',
    gap: 5,
  },
  newText: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: colors.muted,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  field: {
    flex: 1,
    backgroundColor: colors.raised,
    borderRadius: radii.pill,
    paddingHorizontal: 14,
    height: 38,
    justifyContent: 'center',
  },
  input: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: colors.ink,
    padding: 0,
  },
  addButton: {
    height: 38,
    paddingHorizontal: 16,
    borderRadius: radii.pill,
    backgroundColor: colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addText: {
    fontFamily: fonts.medium,
    fontSize: 12.5,
    color: colors.onInk,
  },
  disabled: {
    opacity: 0.4,
  },
  error: {
    fontFamily: fonts.regular,
    fontSize: 11.5,
    color: colors.ink3,
  },
});

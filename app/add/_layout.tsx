/**
 * The Add flow. ARCHITECTURE.md §2 — presented as a bottom sheet over Home, so
 * every screen in here draws on a transparent background and lets the dimmed Home
 * screen show through.
 */
import { Stack } from 'expo-router';

export default function AddLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: 'transparent' },
        animation: 'none',
      }}
    />
  );
}

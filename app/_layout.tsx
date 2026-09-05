/**
 * Root layout: fonts, providers, and the dark shell.
 *
 * The auth gate ARCHITECTURE.md §2 calls for arrives with the Supabase project;
 * there is nothing to gate until then.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  SpaceGrotesk_400Regular,
  SpaceGrotesk_500Medium,
  useFonts,
} from '@expo-google-fonts/space-grotesk';
import { DarkTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClientProvider } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';

import { Splash } from '@/components/Splash';
import { CACHE_BUSTER, createCachePersister, queryClient } from '@/lib/queryClient';
import { colors } from '@/theme/tokens';

SplashScreen.preventAutoHideAsync();

/**
 * The navigator paints its own container behind every screen. Left unset it uses
 * react-navigation's light default (#F2F2F2), which showed through the §6.3 sheet's
 * translucent scrim and turned it grey. v1 ships dark only, so the theme is built
 * from Sholdi's ramp rather than inherited from the system scheme.
 */
const sholdiNavigationTheme = {
  ...DarkTheme,
  dark: true,
  colors: {
    ...DarkTheme.colors,
    background: colors.page,
    card: colors.surface,
    text: colors.ink,
    border: colors.hairline,
    primary: colors.ink,
    notification: colors.ink,
  },
};

export default function RootLayout() {
  // Space Grotesk is the only typeface, at 400 and 500 only (DESIGN.md §3).
  const [loaded, error] = useFonts({
    SpaceGrotesk_400Regular,
    SpaceGrotesk_500Medium,
  });

  useEffect(() => {
    if (loaded || error) SplashScreen.hideAsync();
  }, [loaded, error]);

  // Null where MMKV is unavailable (the static render pass); the app then runs
  // with an in-memory cache instead of failing to boot.
  const persister = useMemo(() => createCachePersister(), []);

  // The in-app splash (§6.1) runs after the fonts land, because the wordmark is
  // Space Grotesk. The native splash covers everything before that.
  const [splashDone, setSplashDone] = useState(false);
  const finishSplash = useCallback(() => setSplashDone(true), []);

  if (!loaded && !error) return null;

  const tree = (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.page }}>
      <SafeAreaProvider>
        <ThemeProvider value={sholdiNavigationTheme}>
          <StatusBar style="light" />
          {!splashDone && <Splash onDone={finishSplash} />}
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: colors.page },
            }}>
            <Stack.Screen name="(tabs)" />
            {/*
              DESIGN.md §6.3: the input chooser is a bottom sheet over a dimmed Home,
              so it is presented, not pushed.
            */}
            <Stack.Screen
              name="add"
              options={{
                presentation: 'transparentModal',
                animation: 'fade',
                // Explicitly transparent: the card must not paint over Home, which is
                // what the scrim dims to 35%.
                contentStyle: { backgroundColor: 'transparent' },
              }}
            />
          </Stack>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );

  return persister ? (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{ persister, buster: CACHE_BUSTER }}>
      {tree}
    </PersistQueryClientProvider>
  ) : (
    <QueryClientProvider client={queryClient}>{tree}</QueryClientProvider>
  );
}

/**
 * TanStack Query client and its MMKV-backed cache. ARCHITECTURE.md §1.
 *
 * The cache is persisted so "the app opens with last month's data offline".
 * A month that has already closed does not change, so the defaults lean towards
 * trusting cached data rather than refetching on every focus.
 */
import { createMMKV } from 'react-native-mmkv';
import { QueryClient } from '@tanstack/react-query';
import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister';
import type { Persister } from '@tanstack/react-query-persist-client';

// react-native-mmkv v4 exports a factory; `MMKV` is a type, not a constructor.
// Created lazily: the web build is backed by localStorage, which does not exist
// during Expo's static render pass.
let storage: ReturnType<typeof createMMKV> | null = null;

function getStorage() {
  if (!storage) storage = createMMKV({ id: 'sholdi.cache' });
  return storage;
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // A closed month's totals do not change. Five minutes of freshness avoids a
      // refetch every time the user flicks between tabs.
      staleTime: 5 * 60 * 1000,
      gcTime: 7 * 24 * 60 * 60 * 1000,
      retry: 2,
      refetchOnWindowFocus: false,
    },
  },
});

/**
 * MMKV is synchronous, so the sync persister is the right one. It is created
 * defensively: a storage failure should cost the offline cache, never the app.
 */
export function createCachePersister(): Persister | null {
  try {
    const mmkv = getStorage();
    return createSyncStoragePersister({
      storage: {
        getItem: (key) => mmkv.getString(key) ?? null,
        setItem: (key, value) => mmkv.set(key, value),
        removeItem: (key) => void mmkv.remove(key),
      },
      throttleTime: 1000,
    });
  } catch {
    return null;
  }
}

/** Bump to invalidate every persisted cache after a shape change. */
export const CACHE_BUSTER = 'v1';

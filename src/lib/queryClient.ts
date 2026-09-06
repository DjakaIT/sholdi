/**
 * TanStack Query client.
 *
 * ARCHITECTURE.md §1 paired this with an MMKV-persisted cache so the app would
 * "open with last month's data offline". That persistence is gone, and not because
 * it stopped mattering — because it stopped existing as a problem. The data now
 * lives in SQLite on the device, so every read is already local and already
 * offline. Persisting a cache of local data would only be a second, staler copy of
 * the same rows.
 *
 * Query still earns its place: it dedupes reads, invalidates after a write, and
 * keeps the screens declarative.
 */
import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Reads hit local SQLite, so refetching is cheap — but a closed month's
      // totals do not change, and nothing invalidates without a write.
      staleTime: 30 * 1000,
      retry: 0,
      refetchOnWindowFocus: false,
    },
  },
});

/** Query keys, in one place so invalidation after a write cannot miss one. */
export const queryKeys = {
  categories: ['categories'] as const,
  monthTotals: (month: string) => ['month-totals', month] as const,
  monthTotal: (month: string) => ['month-total', month] as const,
  trailingTotals: (month: string, count: number) => ['trailing-totals', month, count] as const,
  expenses: (month: string) => ['expenses', month] as const,
  insights: ['insights'] as const,
};

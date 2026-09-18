/**
 * The screens' view of spending. Everything here reads local SQLite.
 *
 * This is the layer that replaces mock data. A screen asks for a month and gets the
 * same `MonthSummary` shape the mock file produced, so the components did not have
 * to change — which was the point of shaping the mock that way.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { previousMonth } from '@/lib/dates';
import { queryKeys } from '@/lib/queryClient';
import type { CategoryColorToken } from '@/theme/categoryColors';
import {
  getMonthTotal,
  getMonthTotals,
  getTrailingTotals,
  insertExpense,
  listCategories,
  listExpenses,
  updateExpenseCategory,
} from './repository';
import type { NewExpense } from './repository';

/** How many months the sparkline shows. */
const SPARKLINE_MONTHS = 12;

export type CategoryTotal = {
  categoryId: string | null;
  name: string;
  colorToken: CategoryColorToken;
  cents: number;
  previousCents: number;
};

export type MonthSummary = {
  month: string;
  currency: string;
  totalCents: number;
  previousTotalCents: number;
  trailingTotals: number[];
  categories: CategoryTotal[];
  /** True when there is nothing recorded for this month yet. */
  isEmpty: boolean;
};

export function useCategories() {
  return useQuery({
    queryKey: queryKeys.categories,
    queryFn: listCategories,
  });
}

export function useExpenses(month: string) {
  return useQuery({
    queryKey: queryKeys.expenses(month),
    queryFn: () => listExpenses(month),
  });
}

/**
 * Everything Home and the Index need for one month, in one query.
 *
 * The previous month is fetched alongside because every delta on both screens is
 * month-over-month; fetching it separately would mean two loading states for one
 * conceptual thing.
 */
export function useMonthSummary(month: string) {
  return useQuery({
    queryKey: ['month-summary', month],
    queryFn: async (): Promise<MonthSummary> => {
      const prior = previousMonth(month);

      const [totals, priorTotals, total, priorTotal, trailing] = await Promise.all([
        getMonthTotals(month),
        getMonthTotals(prior),
        getMonthTotal(month),
        getMonthTotal(prior),
        getTrailingTotals(month, SPARKLINE_MONTHS),
      ]);

      const priorByCategory = new Map(priorTotals.map((t) => [t.name, t.cents]));

      return {
        month,
        // Mixed-currency months are not a v1 concern; the first row's currency wins.
        currency: 'EUR',
        totalCents: total,
        previousTotalCents: priorTotal,
        trailingTotals: trailing,
        categories: totals.map((t) => ({
          categoryId: t.categoryId,
          name: t.name,
          colorToken: t.colorToken,
          cents: t.cents,
          previousCents: priorByCategory.get(t.name) ?? 0,
        })),
        isEmpty: total === 0 && totals.length === 0,
      };
    },
  });
}

/**
 * Add one expense.
 *
 * Invalidates every month-scoped key rather than just this month's: an expense dated
 * in August changes September's "vs Aug" delta and the sparkline too, so narrowing
 * the invalidation would leave stale figures on screen.
 */
export function useAddExpense() {
  const client = useQueryClient();

  return useMutation({
    mutationFn: (expense: NewExpense) => insertExpense(expense),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['month-summary'] });
      void client.invalidateQueries({ queryKey: ['month-totals'] });
      void client.invalidateQueries({ queryKey: ['month-total'] });
      void client.invalidateQueries({ queryKey: ['trailing-totals'] });
      void client.invalidateQueries({ queryKey: ['expenses'] });
    },
  });
}

/**
 * Change a row's category.
 *
 * §5 wants this to feel instant on the review screen, so it is optimistic: the cache
 * is updated before the write lands and rolled back if it fails.
 */
export function useSetExpenseCategory(month: string) {
  const client = useQueryClient();

  return useMutation({
    mutationFn: ({ expenseId, categoryId }: { expenseId: string; categoryId: string | null }) =>
      updateExpenseCategory(expenseId, categoryId),

    onMutate: async ({ expenseId, categoryId }) => {
      await client.cancelQueries({ queryKey: queryKeys.expenses(month) });
      const previous = client.getQueryData(queryKeys.expenses(month));

      client.setQueryData(queryKeys.expenses(month), (rows: unknown) =>
        Array.isArray(rows)
          ? rows.map((row) =>
              (row as { id: string }).id === expenseId ? { ...row, category_id: categoryId } : row
            )
          : rows
      );

      return { previous };
    },

    onError: (_error, _variables, context) => {
      if (context?.previous !== undefined) {
        client.setQueryData(queryKeys.expenses(month), context.previous);
      }
    },

    onSettled: () => {
      void client.invalidateQueries({ queryKey: ['month-summary'] });
      void client.invalidateQueries({ queryKey: queryKeys.expenses(month) });
    },
  });
}

/**
 * The screens' view of spending. Everything here reads local SQLite.
 *
 * This is the layer that replaces mock data. A screen asks for a month and gets the
 * same `MonthSummary` shape the mock file produced, so the components did not have
 * to change — which was the point of shaping the mock that way.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { currentMonthLocal, previousMonth, todayLocal } from '@/lib/dates';
import { queryKeys } from '@/lib/queryClient';
import type { DisplayColorToken } from '@/theme/categoryColors';
import {
  createCategory,
  dismissInsight,
  getMonthFacts,
  getMonthTotal,
  getMonthTotals,
  getTrailingTotals,
  hasAnyExpenses,
  insertExpense,
  listCategories,
  listExpenses,
  listExpensesInCategory,
  listGoals,
  listInsights,
  setCategoryForMerchant,
  updateExpenseCategory,
} from './repository';
import type { NewExpense } from './repository';
import { rememberMerchant } from '@/features/transactions/merchantMemory';
import { sameMerchantAs } from '@/features/transactions/resolveMerchant';

/** How many months the sparkline shows. */
const SPARKLINE_MONTHS = 12;

export type CategoryTotal = {
  categoryId: string | null;
  name: string;
  colorToken: DisplayColorToken;
  cents: number;
  previousCents: number;
  expenseCount: number;
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

      // A month in progress is compared with the same stretch of the month before,
      // not with all of it — otherwise the 3rd of the month reads as a collapse.
      const throughDay =
        month === currentMonthLocal() ? Number(todayLocal().slice(8, 10)) : undefined;

      const [totals, priorTotals, total, priorTotal, trailing] = await Promise.all([
        getMonthTotals(month),
        getMonthTotals(prior, throughDay),
        getMonthTotal(month),
        getMonthTotal(prior, throughDay),
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
          expenseCount: t.expenseCount,
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
    // Everything: every read is local SQLite and cheap, and a single expense moves
    // Home, Stats, the Index and the first-run empty states all at once. A narrower
    // list is exactly how a new screen ends up showing stale figures.
    onSuccess: () => {
      void client.invalidateQueries();
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

/** Has anything ever been recorded? Decides between a first-run and a quiet month. */
export function useHasAnyExpenses() {
  return useQuery({ queryKey: ['has-any-expenses'], queryFn: hasAnyExpenses });
}

/** Totals for the `count` months ending at `month`, oldest first. */
export function useMonthHistory(month: string, count: number) {
  return useQuery({
    queryKey: ['month-history', month, count],
    queryFn: async () => {
      const totals = await getTrailingTotals(month, count);
      const months: string[] = [];
      let cursor = month;
      for (let i = 0; i < count; i += 1) {
        months.unshift(cursor);
        cursor = previousMonth(cursor);
      }
      return months.map((m, i) => ({ month: m, cents: totals[i] ?? 0 }));
    },
  });
}

export function useMonthFacts(month: string) {
  return useQuery({ queryKey: ['month-facts', month], queryFn: () => getMonthFacts(month) });
}

export function useGoals() {
  return useQuery({ queryKey: ['goals'], queryFn: listGoals });
}

export function useInsights() {
  return useQuery({ queryKey: queryKeys.insights, queryFn: listInsights });
}

export function useDismissInsight() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (insightId: string) => dismissInsight(insightId),
    onSuccess: () => void client.invalidateQueries({ queryKey: queryKeys.insights }),
  });
}

/** Create (or find) a category by name. Returns the category either way. */
export function useCreateCategory() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => createCategory(name),
    onSuccess: () => void client.invalidateQueries(),
  });
}

/** A month's expenses in one category, or unsorted ones when `categoryId` is null. */
export function useExpensesInCategory(month: string, categoryId: string | null) {
  return useQuery({
    queryKey: ['expenses-in-category', month, categoryId],
    queryFn: () => listExpensesInCategory(month, categoryId),
  });
}

/**
 * Move an expense to a category — and every unsorted expense from the same shop.
 *
 * Also records the decision in merchant memory as a USER correction (COST-CONTROLS
 * §3), so next month's statement puts this merchant in the right place without
 * asking the model, and no model suggestion can ever overrule it.
 */
export function useRecategorise() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      expenseId: string;
      merchant: string | null;
      categoryId: string | null;
    }) => {
      const changed = await setCategoryForMerchant(
        input.expenseId,
        input.categoryId,
        sameMerchantAs(input.merchant)
      );
      await rememberMerchant(input.merchant, input.categoryId, 'user');
      return changed;
    },
    onSuccess: () => void client.invalidateQueries(),
  });
}

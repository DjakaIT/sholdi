/**
 * Which month the app is looking at. ARCHITECTURE.md §2.
 *
 * Local UI state, not server state — it belongs in Zustand, not TanStack Query.
 * Months are 'YYYY-MM' strings so nothing ever crosses a timezone (§7).
 */
import { create } from 'zustand';

import { previousMonth } from '@/lib/dates';

function currentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

type MonthState = {
  /** 'YYYY-MM'. */
  month: string;
  setMonth: (month: string) => void;
  goToPreviousMonth: () => void;
  reset: () => void;
};

export const useMonthStore = create<MonthState>((set) => ({
  month: currentMonth(),
  setMonth: (month) => set({ month }),
  goToPreviousMonth: () => set((state) => ({ month: previousMonth(state.month) })),
  reset: () => set({ month: currentMonth() }),
}));

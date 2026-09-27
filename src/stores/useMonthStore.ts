/**
 * Which month the app is looking at. ARCHITECTURE.md §2.
 *
 * Local UI state, not server state — it belongs in Zustand, not TanStack Query.
 * Months are 'YYYY-MM' strings so nothing ever crosses a timezone (§7).
 */
import { create } from 'zustand';

import { currentMonthLocal, previousMonth } from '@/lib/dates';

const currentMonth = () => currentMonthLocal();

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

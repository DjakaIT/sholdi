/**
 * The expense currently being added. ARCHITECTURE.md §2.
 *
 * Every input path — PDF, receipt, voice, text, photo — normalises to the same
 * `ExtractedExpense` shape (§4.2), so the draft held here is that shape with the
 * fields a user may still be filling in left optional.
 */
import { create } from 'zustand';

import type { ExtractedExpense, ExpenseSource } from '@/features/expenses/types';

export type DraftExpense = Partial<ExtractedExpense> & {
  /** Which of the five inputs produced this draft. */
  source?: ExpenseSource;
};

type DraftState = {
  draft: DraftExpense | null;
  /** Replace the draft outright — what an extraction returns. */
  setDraft: (draft: DraftExpense) => void;
  /** Merge a field the user edited. */
  patchDraft: (patch: Partial<DraftExpense>) => void;
  clearDraft: () => void;
};

export const useDraftExpenseStore = create<DraftState>((set) => ({
  draft: null,
  setDraft: (draft) => set({ draft }),
  patchDraft: (patch) =>
    set((state) => ({ draft: state.draft ? { ...state.draft, ...patch } : patch })),
  clearDraft: () => set({ draft: null }),
}));

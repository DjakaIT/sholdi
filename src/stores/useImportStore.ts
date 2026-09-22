/**
 * The statement currently being reviewed.
 *
 * A PDF import produces dozens of rows that the review screen (DESIGN.md §6.4) then
 * lets the user correct before anything is written. Those rows are held here rather
 * than passed as route params — a route param is a string, and serialising 47
 * transactions through the URL would be both lossy and absurd.
 *
 * Cleared once the import is confirmed or abandoned. Nothing here is persisted: an
 * unconfirmed extraction is not data the user has agreed to keep.
 */
import { create } from 'zustand';

import type { ExtractedExpense } from '@/features/expenses/types';

export type ReviewRow = ExtractedExpense & {
  /** Local id for list keys and edits before anything is written. */
  id: string;
  needs_review: boolean;
  /** Resolved against the user's categories; null when nothing matched. */
  categoryId: string | null;
};

export type ImportIssue = { index: number; field: string; message: string };

type ImportState = {
  rows: ReviewRow[];
  /** Rows the extractor rejected, surfaced rather than silently dropped. */
  issues: ImportIssue[];
  /** 'YYYY-MM' of the statement, when it could be determined. */
  period: string | null;
  sourceName: string | null;

  setExtraction: (payload: {
    rows: ReviewRow[];
    issues: ImportIssue[];
    period: string | null;
    sourceName: string | null;
  }) => void;
  setRowCategory: (rowId: string, categoryId: string | null) => void;
  removeRow: (rowId: string) => void;
  clear: () => void;
};

export const useImportStore = create<ImportState>((set) => ({
  rows: [],
  issues: [],
  period: null,
  sourceName: null,

  setExtraction: ({ rows, issues, period, sourceName }) =>
    set({ rows, issues, period, sourceName }),

  setRowCategory: (rowId, categoryId) =>
    set((state) => ({
      rows: state.rows.map((row) => (row.id === rowId ? { ...row, categoryId } : row)),
    })),

  removeRow: (rowId) =>
    set((state) => ({ rows: state.rows.filter((row) => row.id !== rowId) })),

  clear: () => set({ rows: [], issues: [], period: null, sourceName: null }),
}));

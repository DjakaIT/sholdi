/**
 * Expense domain types. ARCHITECTURE.md §3 (tables) and §4.2 (the AI contract).
 *
 * All money is integer cents. `occurred_on` is a plain 'YYYY-MM-DD' date string,
 * never a Date or a timestamp — a purchase on the 31st must not become the 1st (§7).
 */
import type { CategoryColorToken } from '@/theme/categoryColors';

/** §3: the `source` check constraint on `expenses`. */
export type ExpenseSource = 'pdf' | 'receipt' | 'voice' | 'text' | 'photo' | 'manual';

/** §3: the `status` check constraint on `imports`. */
export type ImportStatus = 'uploaded' | 'extracting' | 'ready' | 'imported' | 'failed';

export type Category = {
  id: string;
  name: string;
  color_token: CategoryColorToken;
  icon: string | null;
  is_system: boolean;
};

export type Expense = {
  id: string;
  amount_cents: number;
  currency: string;
  merchant: string | null;
  description: string | null;
  /** 'YYYY-MM-DD'. */
  occurred_on: string;
  category_id: string | null;
  source: ExpenseSource;
  confidence: number | null;
  import_id: string | null;
  needs_review: boolean;
  created_at: string;
};

/**
 * §4.2 — the unifying contract. Every input path (PDF, receipt photo, voice,
 * typed text, arbitrary photo) resolves to this exact shape. Voice is text with a
 * transcription step in front; photos are receipts. The normalisation is written
 * once, and this is it.
 *
 * Mirrored for Deno in `supabase/functions/_shared/extracted.ts`. Keep the two in
 * step; §4.2 is the source of truth for both.
 */
export type ExtractedExpense = {
  amount_cents: number;
  /** ISO 4217, defaults to 'EUR'. */
  currency: string;
  merchant: string | null;
  description: string | null;
  /** 'YYYY-MM-DD'. */
  occurred_on: string;
  /** Matched to an existing category name where possible. */
  suggested_category: string;
  /** 0..1, from the model. */
  confidence: number;
};

/** §3: below this, the row is flagged for the review screen. */
export const NEEDS_REVIEW_BELOW = 0.8;

export function needsReview(confidence: number): boolean {
  return confidence < NEEDS_REVIEW_BELOW;
}

/** A category total for one month, from the `monthly_category_totals` view (§3). */
export type MonthlyCategoryTotal = {
  /** 'YYYY-MM-DD', the first of the month. */
  month: string;
  category_id: string | null;
  category_name: string | null;
  color_token: CategoryColorToken | null;
  icon: string | null;
  total_cents: number;
  expense_count: number;
};

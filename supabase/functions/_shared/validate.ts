/**
 * Semantic validation. ARCHITECTURE.md §4.3.
 *
 * "Structured outputs guarantee shape, not truth." A response can satisfy the schema
 * perfectly and still be wrong: a date outside the statement period, a negative
 * amount, cents that arrived as euros. Everything the model returns passes through
 * here before it goes anywhere near the database.
 */
import type { ExtractedExpense } from './extracted.ts';
import { NEEDS_REVIEW_BELOW } from './extracted.ts';

export type ValidationIssue = {
  index: number;
  field: string;
  message: string;
};

export type ValidationResult = {
  /** Rows that passed. Confidence is clamped and `needs_review` decided here. */
  valid: (ExtractedExpense & { needs_review: boolean })[];
  /** Rows dropped, with why. Surfaced to the review screen, never silently binned. */
  issues: ValidationIssue[];
};

export type PeriodBounds = {
  /** 'YYYY-MM-DD' inclusive. */
  start?: string;
  end?: string;
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const CURRENCY_RE = /^[A-Z]{3}$/;

/** A statement line above this is almost certainly euros mistaken for cents. */
const IMPLAUSIBLE_CENTS = 100_000_000; // €1,000,000

export function validateExtracted(
  rows: unknown,
  period: PeriodBounds = {}
): ValidationResult {
  const valid: (ExtractedExpense & { needs_review: boolean })[] = [];
  const issues: ValidationIssue[] = [];

  if (!Array.isArray(rows)) {
    return { valid, issues: [{ index: -1, field: 'expenses', message: 'not an array' }] };
  }

  rows.forEach((raw, index) => {
    const row = raw as Partial<ExtractedExpense>;
    const fail = (field: string, message: string) => issues.push({ index, field, message });

    // Money. Integer cents, positive, plausible.
    if (typeof row.amount_cents !== 'number' || !Number.isInteger(row.amount_cents)) {
      fail('amount_cents', 'not an integer — the model may have returned a decimal amount');
      return;
    }
    if (row.amount_cents <= 0) {
      fail('amount_cents', 'must be positive');
      return;
    }
    if (row.amount_cents > IMPLAUSIBLE_CENTS) {
      fail('amount_cents', 'implausibly large — likely euros returned where cents were asked for');
      return;
    }

    // Date. A plain calendar date, real, and inside the statement period.
    if (typeof row.occurred_on !== 'string' || !DATE_RE.test(row.occurred_on)) {
      fail('occurred_on', 'not a YYYY-MM-DD date');
      return;
    }
    if (!isRealDate(row.occurred_on)) {
      fail('occurred_on', `not a real calendar date: ${row.occurred_on}`);
      return;
    }
    if (period.start && row.occurred_on < period.start) {
      fail('occurred_on', `before the statement period (${period.start})`);
      return;
    }
    if (period.end && row.occurred_on > period.end) {
      fail('occurred_on', `after the statement period (${period.end})`);
      return;
    }

    const currency =
      typeof row.currency === 'string' && CURRENCY_RE.test(row.currency)
        ? row.currency
        : 'EUR';

    // Confidence drives the review flag, so an absent or silly value is clamped
    // to zero rather than trusted.
    const confidence =
      typeof row.confidence === 'number' && Number.isFinite(row.confidence)
        ? Math.min(1, Math.max(0, row.confidence))
        : 0;

    valid.push({
      amount_cents: row.amount_cents,
      currency,
      merchant: typeof row.merchant === 'string' ? row.merchant.trim() || null : null,
      description: typeof row.description === 'string' ? row.description.trim() || null : null,
      occurred_on: row.occurred_on,
      suggested_category:
        typeof row.suggested_category === 'string' && row.suggested_category.trim()
          ? row.suggested_category.trim()
          : 'Uncategorised',
      confidence,
      needs_review: confidence < NEEDS_REVIEW_BELOW,
    });
  });

  return { valid, issues };
}

/**
 * §4.3: "sum reconciles against the statement total when available".
 * Returns the discrepancy in cents, or null when there is no total to check.
 */
export function reconcile(
  rows: { amount_cents: number }[],
  statementTotalCents?: number
): { ok: boolean; differenceCents: number } | null {
  if (typeof statementTotalCents !== 'number') return null;
  const sum = rows.reduce((total, row) => total + row.amount_cents, 0);
  const difference = sum - statementTotalCents;
  return { ok: difference === 0, differenceCents: difference };
}

/** Rejects 2026-02-30 and friends, which the regex alone would let through. */
function isRealDate(value: string): boolean {
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(5, 7));
  const day = Number(value.slice(8, 10));
  if (month < 1 || month > 12 || day < 1) return false;
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return day <= daysInMonth;
}

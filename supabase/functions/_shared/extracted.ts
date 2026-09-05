/**
 * The unifying contract. ARCHITECTURE.md §4.2.
 *
 * Every input path — PDF, receipt photo, voice, typed text, arbitrary photo —
 * resolves to this one shape. Writing the normalisation once is what keeps the rest
 * of the architecture simple, so this file is the single definition on the server
 * side. Its twin in the app is `src/features/expenses/types.ts`; keep them in step.
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
  /** 0..1. */
  confidence: number;
};

/**
 * JSON Schema for the contract above.
 *
 * `additionalProperties: false` and a complete `required` list are mandatory for
 * both structured outputs and `strict: true` tool use — without them the API
 * rejects the schema.
 *
 * Money is an integer count of cents. The description says so in as many words
 * because the model is the one producing it, and "12.30" arriving where 1230 was
 * meant is the single most damaging error this pipeline can make.
 */
export const EXTRACTED_EXPENSE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'amount_cents',
    'currency',
    'merchant',
    'description',
    'occurred_on',
    'suggested_category',
    'confidence',
  ],
  properties: {
    amount_cents: {
      type: 'integer',
      description:
        'The amount as a whole number of cents. 12.30 EUR is 1230. Never a decimal.',
    },
    currency: {
      type: 'string',
      description: 'ISO 4217 code, e.g. EUR. Use EUR when the statement does not say.',
    },
    merchant: {
      type: ['string', 'null'],
      description: 'Merchant name as printed, tidied of reference numbers. Null if absent.',
    },
    description: {
      type: ['string', 'null'],
      description: 'Any extra detail on the line. Null if there is none.',
    },
    occurred_on: {
      type: 'string',
      description: 'Date of the purchase as YYYY-MM-DD. Never a timestamp.',
    },
    suggested_category: {
      type: 'string',
      description:
        'Best-matching category name. Prefer one of the names supplied in the prompt.',
    },
    confidence: {
      type: 'number',
      description: 'How certain this row is correct, 0 to 1.',
    },
  },
} as const;

/** A statement yields many rows, so the batch schema wraps the row schema. */
export const EXTRACTED_EXPENSE_LIST_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['expenses'],
  properties: {
    expenses: {
      type: 'array',
      items: EXTRACTED_EXPENSE_SCHEMA,
    },
  },
} as const;

/** §3: below this the row is flagged for the review screen. */
export const NEEDS_REVIEW_BELOW = 0.8;

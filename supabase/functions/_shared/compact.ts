/**
 * The compact wire format. COST-CONTROLS.md §2.
 *
 * §11 makes this mandatory for extract-statement and says not to "simplify" it back
 * to verbose JSON. It is not a micro-optimisation — it is what makes the call work:
 *
 * Output is the expensive half of extraction. Describing 47 transactions as full
 * ExtractedExpense objects costs more than reading the PDF does, and at 79
 * transactions the verbose form exceeded the 4000-token cap, truncated mid-object,
 * and failed the whole import with unparseable JSON. That was a real failure.
 *
 * ── One deviation from §2, forced by the API ─────────────────────────────────
 * §2 specifies positional JSON arrays: [amount_cents, merchant, "MM-DD", code, pct].
 * The Messages API rejects the schema that describes them:
 *
 *   tools.0.custom: For 'array' type, 'minItems' values other than 0 or 1
 *   are not supported (got: [2, 5])
 *
 * A fixed-arity tuple cannot be expressed. So each transaction is one delimited
 * string instead, which keeps every property §2 actually wants — fixed field order,
 * no repeated keys, no per-row currency, expansion server-side — and costs *fewer*
 * tokens than the array form, since it drops the brackets and per-field quotes.
 *
 *   "3820|Konzum|08-03|GRO|95"
 */
import type { ExtractedExpense } from './extracted.ts';

export const FIELD_SEPARATOR = '|';
export const UNCATEGORISED_CODE = 'UNC';

/** What the model returns. */
export type CompactStatement = {
  /** 'YYYY-MM-DD' — supplies the year for every row. */
  period_start: string;
  period_end: string;
  currency: string;
  /** One string per purchase: amount_cents|merchant|MM-DD|CODE|confidence_pct */
  tx: string[];
};

export const COMPACT_STATEMENT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['period_start', 'period_end', 'currency', 'tx'],
  properties: {
    period_start: { type: 'string', description: 'Statement start date, YYYY-MM-DD.' },
    period_end: { type: 'string', description: 'Statement end date, YYYY-MM-DD.' },
    currency: { type: 'string', description: 'ISO 4217, stated once for all rows.' },
    tx: {
      type: 'array',
      description:
        'One string per purchase, fields separated by | in this exact order: ' +
        'amount_cents|merchant|MM-DD|category_code|confidence_pct. ' +
        'Example: 3820|Konzum|08-03|GRO|95',
      items: { type: 'string' },
    },
  },
} as const;

/**
 * Three-letter codes for the user's categories.
 *
 * Generated rather than hardcoded, because categories are the user's own.
 * Collisions resolve deterministically: the same list always yields the same codes,
 * since a code that drifted between calls would silently recategorise rows.
 */
export function buildCategoryCodes(names: string[]): Record<string, string> {
  const byCode: Record<string, string> = {};

  for (const name of names) {
    const letters = name.toUpperCase().replace(/[^A-Z]/g, '');
    let code = (letters.slice(0, 3) || 'CAT').padEnd(3, 'X');

    if (byCode[code] && byCode[code] !== name) {
      let resolved = false;
      for (let i = 3; i < letters.length && !resolved; i += 1) {
        const candidate = (letters.slice(0, 2) + letters[i]).padEnd(3, 'X');
        if (!byCode[candidate]) {
          code = candidate;
          resolved = true;
        }
      }
      for (let n = 2; n < 10 && !resolved; n += 1) {
        const candidate = letters.slice(0, 2).padEnd(2, 'X') + n;
        if (!byCode[candidate]) {
          code = candidate;
          resolved = true;
        }
      }
    }

    byCode[code] = name;
  }

  return byCode;
}

/** The line handed to the model describing what the codes mean. */
export function describeCategoryCodes(byCode: Record<string, string>): string {
  const pairs = Object.entries(byCode).map(([code, name]) => `${code}=${name}`);
  pairs.push(`${UNCATEGORISED_CODE}=anything else`);
  return pairs.join(', ');
}

/**
 * Expand the compact rows into the contract the rest of the app speaks (§4.2).
 *
 * Rows that cannot be expanded are dropped rather than guessed at, and counted so
 * nothing disappears silently.
 */
export function expandCompact(
  payload: CompactStatement,
  byCode: Record<string, string>
): { expenses: ExtractedExpense[]; dropped: number } {
  const expenses: ExtractedExpense[] = [];
  let dropped = 0;

  const year = yearFromPeriod(payload?.period_start, payload?.period_end);
  const currency =
    typeof payload?.currency === 'string' && /^[A-Z]{3}$/.test(payload.currency)
      ? payload.currency
      : 'EUR';

  for (const row of payload?.tx ?? []) {
    const parsed = parseRow(row);
    if (!parsed) {
      dropped += 1;
      continue;
    }

    const occurredOn = toIsoDate(year, parsed.monthDay);
    if (!occurredOn) {
      dropped += 1;
      continue;
    }

    expenses.push({
      amount_cents: parsed.cents,
      currency,
      merchant: parsed.merchant,
      // §2: omitted on purpose. On a bank statement it restates the merchant.
      description: null,
      occurred_on: occurredOn,
      suggested_category: byCode[parsed.code] ?? 'Uncategorised',
      confidence: parsed.confidence,
    });
  }

  return { expenses, dropped };
}

type ParsedRow = {
  cents: number;
  merchant: string | null;
  monthDay: string;
  code: string;
  confidence: number;
};

/**
 * Split one delimited row.
 *
 * The merchant is the one field that might legitimately contain the separator, so
 * it is reconstructed from whatever sits between the first field and the last
 * three — all of which have rigid shapes. Splitting naively would corrupt a
 * merchant like "M|S Fashion" and silently shift every field after it.
 */
function parseRow(row: unknown): ParsedRow | null {
  if (typeof row !== 'string') return null;

  const parts = row.split(FIELD_SEPARATOR).map((p) => p.trim());
  if (parts.length < 5) return null;

  const cents = Number(parts[0]);
  if (!Number.isInteger(cents) || cents <= 0) return null;

  const confidencePct = Number(parts[parts.length - 1]);
  const code = parts[parts.length - 2];
  const monthDay = parts[parts.length - 3];
  const merchant = parts.slice(1, parts.length - 3).join(FIELD_SEPARATOR).trim();

  return {
    cents,
    merchant: merchant || null,
    monthDay,
    code,
    confidence: Number.isFinite(confidencePct)
      ? Math.min(1, Math.max(0, confidencePct / 100))
      : 0,
  };
}

/**
 * 'MM-DD' plus the statement's year.
 *
 * A statement can straddle a year boundary — a December statement listing 01-02
 * means the following January — so the month decides which end it belongs to.
 */
function toIsoDate(year: { start: number; end: number }, monthDay: string): string | null {
  const match = /^(\d{1,2})-(\d{1,2})$/.exec(monthDay);
  if (!match) return null;

  const month = Number(match[1]);
  const day = Number(match[2]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;

  const chosen = year.start === year.end ? year.start : month <= 6 ? year.end : year.start;

  return `${chosen}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function yearFromPeriod(start: unknown, end: unknown): { start: number; end: number } {
  const fallback = new Date().getUTCFullYear();
  const parse = (v: unknown) => {
    const n = Number(String(v ?? '').slice(0, 4));
    return Number.isFinite(n) && n > 1970 ? n : fallback;
  };
  return { start: parse(start), end: parse(end) };
}

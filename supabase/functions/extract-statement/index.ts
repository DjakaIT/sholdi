/**
 * extract-statement — a bank PDF to many ExtractedExpenses. ARCHITECTURE.md §4.4, §4.5.
 *
 * §5 calls the flow this sits in "the flow that must be perfect".
 *
 * Stateless. The phone posts the PDF, this reads it, returns rows, and keeps
 * nothing — no Storage bucket, no database, no copy. The statement exists here only
 * for the duration of one request.
 *
 * §4.4 said to upload to Storage first so the file would not cross the phone twice.
 * With no Storage there is nothing to upload to, and the phone sends it exactly
 * once — which satisfies the intent of that rule more directly than following it
 * would have.
 *
 * Input:  multipart/form-data with `file` (the PDF), and optional
 *         `categories` (JSON array) and `period` ({start, end}) fields
 * Output: { "expenses": ExtractedExpense[], "issues": [...] }
 *
 * Not handled, and flagged rather than faked: §4.4's page-range chunking for dense
 * statements that exhaust context before the page limit.
 */
import { extractStructured } from '../_shared/anthropic.ts';
import { MAX_TOKENS, MODELS } from '../_shared/models.ts';
import { EXTRACTED_EXPENSE_LIST_SCHEMA } from '../_shared/extracted.ts';
import { HttpError, json, serveJson } from '../_shared/http.ts';
import { fromBase64 } from '../_shared/encoding.ts';
import { MAX_PDF_BYTES, isEncryptedPdf, isPdf } from '../_shared/pdf.ts';
import { reconcile, validateExtracted } from '../_shared/validate.ts';

const SYSTEM = `You read a bank statement and return every purchase on it.

Rules:
- amount_cents is a whole number of cents. 12.30 EUR is 1230. Never a decimal.
- Return only money leaving the account. Skip incoming transfers, salary, refunds,
  interest, and the account's own balance lines.
- occurred_on is the transaction date as YYYY-MM-DD, taken from the statement.
- Clean the merchant name: drop card numbers, terminal ids and reference codes,
  keep the recognisable name.
- Pick suggested_category from the user's existing categories when one fits.
- confidence per row. Lower it when a line is ambiguous or the amount is unclear.
- Do not invent transactions. If a line is unreadable, leave it out rather than guess.`;

Deno.serve(
  serveJson(async (req) => {
    const body = await req.json().catch(() => null);
    if (!body || typeof body.pdfBase64 !== 'string' || !body.pdfBase64) {
      throw new HttpError(400, 'No statement was sent');
    }

    // Decoded only so the checks below can run; the API is handed the original
    // base64 string, so nothing is re-encoded.
    const bytes = fromBase64(body.pdfBase64);

    if (bytes.length > MAX_PDF_BYTES) {
      throw new HttpError(413, 'That statement is too large. Try a single month.');
    }
    if (!isPdf(bytes)) {
      // A renamed .docx or a photo would otherwise fail deep inside the model call
      // with nothing useful to tell the user.
      throw new HttpError(415, "That file isn't a PDF. Upload the statement your bank gives you.");
    }
    if (isEncryptedPdf(bytes)) {
      // §4.4: reject at the door with a message the user can act on.
      throw new HttpError(
        422,
        'That PDF is password-protected. Save an unprotected copy and upload it again.'
      );
    }

    const categories = Array.isArray(body.categories)
      ? body.categories.filter((c: unknown): c is string => typeof c === 'string').slice(0, 50)
      : [];
    const period = parsePeriod(body.period);

    const result = await extractStructured<{ expenses: unknown }>({
      system: SYSTEM,
      schema: EXTRACTED_EXPENSE_LIST_SCHEMA as unknown as Record<string, unknown>,
      schemaName: 'extracted_expenses',
      model: MODELS.statement,
      maxTokens: MAX_TOKENS.statement,
      content: [
        {
          type: 'document',
          source: { type: 'base64', media_type: 'application/pdf', data: body.pdfBase64 },
        },
        {
          type: 'text',
          text: [
            categories.length
              ? `The user's categories are: ${categories.join(', ')}.`
              : 'The user has no categories yet.',
            'List every purchase on this statement.',
          ].join('\n'),
        },
      ],
    });

    const { valid, issues } = validateExtracted(result.expenses, period);

    const statementTotal = Number(body.statementTotalCents);
    const check = reconcile(valid, Number.isFinite(statementTotal) ? statementTotal : undefined);
    if (check && !check.ok) {
      // Not fatal: the review screen is where a human resolves it.
      console.warn(`Statement does not reconcile: off by ${check.differenceCents} cents`);
    }

    return json({ expenses: valid, issues, reconciliation: check });
  })
);


function parsePeriod(value: unknown): { start?: string; end?: string } {
  if (typeof value !== 'object' || value === null) return {};
  const { start, end } = value as { start?: unknown; end?: unknown };
  const iso = (v: unknown) =>
    typeof v === 'string' && /^d{4}-d{2}-d{2}$/.test(v) ? v : undefined;
  return { start: iso(start), end: iso(end) };
}

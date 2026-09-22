/**
 * extract-statement — a bank PDF to many transactions. ARCHITECTURE.md §4.4, §4.5.
 *
 * §5 calls the flow this sits in "the flow that must be perfect".
 *
 * Stateless. The phone posts the PDF, this reads it, returns rows, and keeps
 * nothing — no Storage bucket, no database, no copy. The statement exists here only
 * for the duration of one request.
 *
 * Output uses the COMPACT wire format (COST-CONTROLS.md §2), which §11 makes
 * mandatory for this function. That is not a micro-optimisation: on a real
 * 79-transaction statement the verbose ExtractedExpense form exceeded the 4000-token
 * cap, truncated mid-object, and failed the entire import with unparseable JSON.
 * Expansion back to the §4.2 contract happens here, where it is free.
 *
 * Input:  { pdfBase64, categories?: string[], period?: {start,end}, statementTotalCents? }
 * Output: { expenses: ExtractedExpense[], issues, reconciliation, dropped }
 *
 * ⚠ Known gap: §4.2 now wants text-based bank PDFs parsed deterministically
 * on-device, one parser per bank, with only unknown merchant names reaching the
 * model. That parser does not exist yet, so the PDF still goes to the model.
 */
import { extractStructured } from '../_shared/anthropic.ts';
import { MAX_TOKENS, MODELS } from '../_shared/models.ts';
import {
  COMPACT_STATEMENT_SCHEMA,
  buildCategoryCodes,
  describeCategoryCodes,
  expandCompact,
} from '../_shared/compact.ts';
import type { CompactStatement } from '../_shared/compact.ts';
import { HttpError, json, serveJson } from '../_shared/http.ts';
import { fromBase64 } from '../_shared/encoding.ts';
import { MAX_PDF_BYTES, isEncryptedPdf, isPdf } from '../_shared/pdf.ts';
import { reconcile, validateExtracted } from '../_shared/validate.ts';

const SYSTEM = `You read a bank statement and return every purchase on it.

Return each purchase as a positional array, in EXACTLY this order:
  [amount_cents, merchant, "MM-DD", category_code, confidence_pct]

Rules:
- amount_cents is a POSITIVE whole number of cents. 12,30 EUR is 1230. Never a decimal.
- merchant is the recognisable name only. Drop card numbers, terminal ids, city names
  and reference codes: "KONZUM 4471 ZADAR" becomes "Konzum".
- "MM-DD" is the transaction date. Never include the year; it comes from the period.
- category_code is one of the codes supplied below.
- confidence_pct is an integer from 0 to 100.
- Return only money leaving the account. Skip incoming transfers, salary, refunds,
  interest, round-ups, and the account's own balance lines.
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

    const categories: string[] = Array.isArray(body.categories)
      ? body.categories.filter((c: unknown): c is string => typeof c === 'string').slice(0, 50)
      : [];
    const period = parsePeriod(body.period);

    const codeMap = buildCategoryCodes(categories);

    const compact = await extractStructured<CompactStatement>({
      system: SYSTEM,
      schema: COMPACT_STATEMENT_SCHEMA as unknown as Record<string, unknown>,
      schemaName: 'statement',
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
            `Category codes: ${describeCategoryCodes(codeMap)}`,
            'List every purchase on this statement.',
          ].join('\n'),
        },
      ],
    });

    // Positional arrays back into the §4.2 contract.
    const { expenses, dropped } = expandCompact(compact, codeMap);

    // Shape is guaranteed by the schema; truth is not (§4.3).
    const { valid, issues } = validateExtracted(expenses, period);

    const statementTotal = Number(body.statementTotalCents);
    const check = reconcile(valid, Number.isFinite(statementTotal) ? statementTotal : undefined);
    if (check && !check.ok) {
      // Not fatal: the review screen is where a human resolves it.
      console.warn(`Statement does not reconcile: off by ${check.differenceCents} cents`);
    }

    console.log(
      `extract-statement: ${valid.length} kept, ${issues.length} rejected, ${dropped} unexpandable`
    );

    return json({ expenses: valid, issues, reconciliation: check, dropped });
  })
);

function parsePeriod(value: unknown): { start?: string; end?: string } {
  if (typeof value !== 'object' || value === null) return {};
  const { start, end } = value as { start?: unknown; end?: unknown };
  const iso = (v: unknown) =>
    typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined;
  return { start: iso(start), end: iso(end) };
}

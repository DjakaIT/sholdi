/**
 * extract-statement — a bank PDF to many ExtractedExpenses. ARCHITECTURE.md §4.4, §4.5.
 *
 * Build-order step 5. §5 calls the flow this sits in "the flow that must be
 * perfect", so the shape here matters:
 *
 * - The client uploads to Storage first and sends a path, never the file. §4.4:
 *   "Don't push base64 PDFs through the phone twice."
 * - The function downloads server-side and forwards to Anthropic.
 * - Encrypted PDFs are rejected with a clear message — the API cannot read them.
 * - Every row is validated semantically before it is written (§4.3).
 *
 * Input:  { "importId": "uuid" }  — an `imports` row whose storage_path is set
 * Output: { "importId", "expenses": ExtractedExpense[], "issues": [...] }
 *
 * Not yet handled, and flagged rather than faked: §4.4's page-range chunking for
 * dense statements that exhaust context before the page limit. Single-request
 * extraction covers a normal monthly statement; chunking is a follow-up.
 */
import { extractStructured } from '../_shared/anthropic.ts';
import { EXTRACTED_EXPENSE_LIST_SCHEMA } from '../_shared/extracted.ts';
import { HttpError, categoryNames, json, requireCaller, serveJson } from '../_shared/auth.ts';
import type { Caller } from '../_shared/auth.ts';
import { reconcile, validateExtracted } from '../_shared/validate.ts';
import { MAX_PDF_BYTES, isEncryptedPdf, isPdf } from '../_shared/pdf.ts';
import { toBase64 } from '../_shared/encoding.ts';

const STATEMENT_BUCKET = 'statements';

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
    const caller = await requireCaller(req);

    const body = await req.json().catch(() => ({}));
    const importId = typeof body.importId === 'string' ? body.importId : '';
    if (!importId) throw new HttpError(400, 'importId is required');

    // RLS scopes this to the caller, so a foreign importId simply is not found.
    const { data: importRow, error: importError } = await caller.supabase
      .from('imports')
      .select('id, storage_path, period_start, period_end, status')
      .eq('id', importId)
      .single();

    if (importError || !importRow) throw new HttpError(404, 'Import not found');
    if (!importRow.storage_path) throw new HttpError(400, 'Import has no uploaded file');

    await setStatus(caller, importId, 'extracting');

    try {
      const { data: file, error: downloadError } = await caller.supabase.storage
        .from(STATEMENT_BUCKET)
        .download(importRow.storage_path);

      if (downloadError || !file) {
        throw new HttpError(404, 'Could not read the uploaded statement');
      }
      if (file.size > MAX_PDF_BYTES) {
        throw new HttpError(413, 'That statement is too large. Try a single month.');
      }

      const bytes = new Uint8Array(await file.arrayBuffer());
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

      const categories = await categoryNames(caller);

      const result = await extractStructured<{ expenses: unknown }>({
        system: SYSTEM,
        schema: EXTRACTED_EXPENSE_LIST_SCHEMA as unknown as Record<string, unknown>,
        schemaName: 'extracted_expenses',
        content: [
          {
            type: 'document',
            source: {
              type: 'base64',
              media_type: 'application/pdf',
              data: toBase64(bytes),
            },
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

      const { valid, issues } = validateExtracted(result.expenses, {
        start: importRow.period_start ?? undefined,
        end: importRow.period_end ?? undefined,
      });

      const check = reconcile(valid, body.statementTotalCents);
      if (check && !check.ok) {
        // Not fatal: the review screen is where a human resolves it. Logged so
        // extraction accuracy can be tracked from day one (§5).
        console.warn(
          `Import ${importId} does not reconcile: off by ${check.differenceCents} cents`
        );
      }

      await caller.supabase
        .from('imports')
        .update({ status: 'ready', expense_count: valid.length })
        .eq('id', importId);

      return json({ importId, expenses: valid, issues, reconciliation: check });
    } catch (error) {
      const message = error instanceof HttpError ? error.message : 'Extraction failed';
      await setStatus(caller, importId, 'failed', message);
      throw error;
    }
  })
);

async function setStatus(
  caller: Caller,
  importId: string,
  status: string,
  error?: string
): Promise<void> {
  await caller.supabase
    .from('imports')
    .update(error ? { status, error } : { status })
    .eq('id', importId);
}


/**
 * extract-text — free text to one ExtractedExpense. ARCHITECTURE.md §4.5.
 *
 * Stateless: text in, one expense out, nothing stored. The app writes the result to
 * its own SQLite database.
 *
 * It backs the "Type it" tile, and voice will reuse it — voice is text with a
 * transcription step in front (§4.2).
 *
 * Input:  { "text": "38 euro konzum yesterday",
 *           "categories": ["Groceries", ...],   // the device's own category names
 *           "today": "2026-09-05" }             // the device's date
 * Output: { "expense": ExtractedExpense }
 */
import { extractStructured } from '../_shared/anthropic.ts';
import { MAX_TOKENS, MODELS } from '../_shared/models.ts';
import { EXTRACTED_EXPENSE_SCHEMA } from '../_shared/extracted.ts';
import { HttpError, categoryNamesFrom, json, serveJson, todayFrom } from '../_shared/http.ts';
import { validateExtracted } from '../_shared/validate.ts';

const MAX_TEXT_LENGTH = 500;

const SYSTEM = `You turn a short note about a purchase into one structured expense.

The user types casually: "38 euro konzum", "12.50 coffee yesterday", "gas 60".
Read it the way a person would.

Rules:
- amount_cents is a whole number of cents. "38 euro" is 3800. "12.50" is 1250.
- Resolve relative dates ("yesterday", "last Friday") against the supplied today's date.
  If no date is mentioned, use today.
- Pick suggested_category from the user's existing categories when one fits.
  Only invent a name when nothing fits.
- confidence reflects how sure you are. Lower it when the amount or date is a guess.
- Never invent a merchant that is not implied by the text; use null instead.`;

Deno.serve(
  serveJson(async (req) => {
    const body = await req.json().catch(() => ({}));

    const text = typeof body.text === 'string' ? body.text.trim() : '';
    if (!text) throw new HttpError(400, 'Provide some text describing the expense');
    if (text.length > MAX_TEXT_LENGTH) {
      throw new HttpError(400, 'That is a bit long for one expense.');
    }

    const categories = categoryNamesFrom(body);
    const today = todayFrom(body);

    const extracted = await extractStructured<Record<string, unknown>>({
      system: SYSTEM,
      schema: EXTRACTED_EXPENSE_SCHEMA as unknown as Record<string, unknown>,
      schemaName: 'extracted_expense',
      model: MODELS.text,
      maxTokens: MAX_TOKENS.text,
      content: [
        {
          type: 'text',
          text: [
            `Today is ${today}.`,
            categories.length
              ? `The user's categories are: ${categories.join(', ')}.`
              : 'The user has no categories yet.',
            '',
            `Note: ${text}`,
          ].join('\n'),
        },
      ],
    });

    // Shape is guaranteed; truth is not (§4.3).
    const { valid, issues } = validateExtracted([extracted]);
    if (valid.length === 0) {
      console.warn('extract-text rejected its own output:', issues);
      throw new HttpError(422, 'Could not read an expense from that. Try adding an amount.');
    }

    return json({ expense: valid[0] });
  })
);

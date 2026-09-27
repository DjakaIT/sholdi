/**
 * extract-receipt — a photo to one ExtractedExpense. ARCHITECTURE.md §4.5.
 *
 * Backs both the "Scan" tile and the "or drop any photo" catch-all: §4.2 is explicit
 * that "photos are just receipts", so there is one path, not two.
 *
 * Stateless. The photo is posted, read, and discarded — never stored.
 *
 * Input:  multipart/form-data with `file` (the image), optional `categories`
 *         (JSON array) and `today` fields
 * Output: { "expense": ExtractedExpense }
 */
import { extractStructured } from '../_shared/anthropic.ts';
import { MAX_TOKENS, MODELS } from '../_shared/models.ts';
import { EXTRACTED_EXPENSE_SCHEMA } from '../_shared/extracted.ts';
import { HttpError, categoryNamesFrom, json, serveJson, todayFrom } from '../_shared/http.ts';
import { normaliseImageMedia } from '../_shared/encoding.ts';
import { MAX_BODY_CHARS, assertBase64Size, enforceRateLimit, readJsonBody } from '../_shared/guard.ts';
import { validateExtracted } from '../_shared/validate.ts';

const SYSTEM = `You read a photo and return the single purchase it shows.

It is usually a receipt, but it may be any photo the user took — a price tag, a menu,
a card terminal screen.

Rules:
- amount_cents is a whole number of cents. 12.30 EUR is 1230. Never a decimal.
- Take the TOTAL paid, not a line item, not the subtotal before tax.
- occurred_on is the date printed on the receipt as YYYY-MM-DD. If no date is
  visible, use the supplied today's date and lower your confidence.
- Pick suggested_category from the user's existing categories when one fits.
- Lower confidence when the image is blurred, cropped, or the total is ambiguous.
  A wrong amount silently entered is worse than one flagged for review.
- If the photo shows no purchase at all, return confidence 0.`;

Deno.serve(
  serveJson(async (req) => {
    enforceRateLimit(req, 'receipt');

    const body = await readJsonBody(req, MAX_BODY_CHARS.receipt);
    const imageBase64 = typeof body.imageBase64 === 'string' ? body.imageBase64 : '';
    if (!imageBase64) throw new HttpError(400, 'No photo was sent');

    const mediaType = normaliseImageMedia(
      typeof body.mimeType === 'string' ? body.mimeType : undefined
    );
    if (!mediaType) {
      // HEIC lands here: the iPhone default, which the API cannot read. The app
      // converts to JPEG before sending (see _shared/encoding.ts).
      throw new HttpError(415, "That photo format isn't supported. Try a JPEG or PNG.");
    }

    // Measured on the encoded string. The old check decoded the whole payload into
    // memory first, so an oversized photo was fully allocated before being refused.
    assertBase64Size(
      imageBase64,
      MAX_BODY_CHARS.receipt,
      'That photo is too large. Try again at a smaller size.'
    );

    const categories = categoryNamesFrom(body);
    // Shared with the other handlers rather than re-implemented. The local copy had
    // `/^d{4}-d{2}-d{2}$/` — no backslashes — so it matched the literal text "dddd-dd-dd"
    // and nothing else. Every device date failed it and the server's UTC date was
    // used instead, which in UTC+2 dates an undated receipt scanned before 02:00 to
    // the previous day, and on the 1st to the previous month (§7).
    const today = todayFrom(body);

    const extracted = await extractStructured<Record<string, unknown>>({
      system: SYSTEM,
      schema: EXTRACTED_EXPENSE_SCHEMA as unknown as Record<string, unknown>,
      schemaName: 'extracted_expense',
      model: MODELS.receipt,
      maxTokens: MAX_TOKENS.receipt,
      content: [
        {
          type: 'image',
          source: { type: 'base64', media_type: mediaType, data: body.imageBase64 },
        },
        {
          type: 'text',
          text: [
            `Today is ${today}.`,
            categories.length
              ? `The user's categories are: ${categories.join(', ')}.`
              : 'The user has no categories yet.',
          ].join('\n'),
        },
      ],
    });

    const { valid, issues } = validateExtracted([extracted]);
    if (valid.length === 0) {
      console.warn('extract-receipt rejected its own output:', issues);
      throw new HttpError(422, "Couldn't read a total from that photo. Try adding it by hand.");
    }

    return json({ expense: valid[0] });
  })
);


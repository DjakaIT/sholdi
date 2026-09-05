/**
 * extract-receipt — a photo to one ExtractedExpense. ARCHITECTURE.md §4.5.
 *
 * This backs both the "Scan" tile and the "or drop any photo" catch-all: §4.2 is
 * explicit that "photos are just receipts", so there is one path, not two.
 *
 * Like extract-statement, the client uploads to Storage first and sends a path —
 * the image crosses the phone once (§4.4).
 *
 * Input:  { "storagePath": "<user-id>/receipt.jpg", "source": "receipt" | "photo" }
 * Output: { "expense": ExtractedExpense }
 */
import { extractStructured } from '../_shared/anthropic.ts';
import { EXTRACTED_EXPENSE_SCHEMA } from '../_shared/extracted.ts';
import { HttpError, categoryNames, json, requireCaller, serveJson } from '../_shared/auth.ts';
import { normaliseImageMedia, toBase64 } from '../_shared/encoding.ts';
import { validateExtracted } from '../_shared/validate.ts';

const RECEIPT_BUCKET = 'receipts';

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

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
    const caller = await requireCaller(req);

    const body = await req.json().catch(() => ({}));
    const storagePath = typeof body.storagePath === 'string' ? body.storagePath : '';
    if (!storagePath) throw new HttpError(400, 'storagePath is required');

    const { data: file, error: downloadError } = await caller.supabase.storage
      .from(RECEIPT_BUCKET)
      .download(storagePath);

    if (downloadError || !file) throw new HttpError(404, 'Could not read that photo');
    if (file.size > MAX_IMAGE_BYTES) {
      throw new HttpError(413, 'That photo is too large. Try again at a smaller size.');
    }

    const mediaType = normaliseImageMedia(file.type);
    if (!mediaType) {
      // HEIC lands here: the iPhone default, which the API cannot read. The app
      // converts to JPEG before upload (see _shared/encoding.ts).
      throw new HttpError(415, "That photo format isn't supported. Try a JPEG or PNG.");
    }

    const categories = await categoryNames(caller);
    const today =
      typeof body.today === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.today)
        ? body.today
        : new Date().toISOString().slice(0, 10);

    const bytes = new Uint8Array(await file.arrayBuffer());

    const extracted = await extractStructured<Record<string, unknown>>({
      system: SYSTEM,
      schema: EXTRACTED_EXPENSE_SCHEMA as unknown as Record<string, unknown>,
      schemaName: 'extracted_expense',
      maxTokens: 1024,
      content: [
        {
          type: 'image',
          source: { type: 'base64', media_type: mediaType, data: toBase64(bytes) },
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


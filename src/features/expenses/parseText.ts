/**
 * Reading a typed note without the model.
 *
 * DESIGN.md §6.3 promises "plain words work" on the Type it tile. That promise
 * should not depend on a network round trip, a configured API key, or a bill — so
 * this parses the common shapes locally, and the model is the upgrade rather than
 * the requirement.
 *
 * It handles what people actually type: "38 euro konzum", "12.50 coffee",
 * "gas 60", "konzum 47,32". It is deliberately conservative — when it is not sure,
 * it returns a low confidence and lets the review flow deal with it rather than
 * guessing a merchant out of stray words.
 *
 * Money is parsed to integer cents. A decimal never survives this function.
 */

export type ParsedNote = {
  amountCents: number;
  merchant: string | null;
  /** 0..1, the same scale the model uses, so both paths feed one review rule. */
  confidence: number;
};

/**
 * Words that are never a merchant: currency names and symbols, and the filler that
 * surrounds an amount. Croatian and English, because that is who types here.
 */
const NOISE = new Set([
  'eur', 'euro', 'euros', 'eura', 'e', '€',
  'kn', 'kuna', 'kune',
  'for', 'at', 'on', 'in', 'to', 'the', 'a', 'an',
  'za', 'u', 'na', 'kod',
  'spent', 'paid', 'bought', 'cost', 'costs',
  'potrosio', 'potrošio', 'platio', 'kupio',
]);

/**
 * An amount: optional currency symbol, digits, optional decimal with , or . and
 * one or two places. Croatian writes 47,32 where English writes 47.32.
 */
const AMOUNT = /(?:^|[\s€$£])(?:€|\$|£)?(\d{1,3}(?:[.\s]\d{3})*|\d+)(?:[.,](\d{1,2}))?(?=\s|$|€|[a-zA-Z])/;

export function parseNote(input: string): ParsedNote | null {
  const text = input.trim();
  if (!text) return null;

  const match = AMOUNT.exec(text);
  if (!match) return null;

  const [whole, fraction] = [match[1], match[2]];

  // Strip thousands separators before parsing: "1.200" and "1 200" are 1200.
  const wholeDigits = whole.replace(/[.\s]/g, '');
  const units = Number(wholeDigits);
  if (!Number.isFinite(units)) return null;

  // "5" -> 50 cents, "50" -> 50 cents. A single digit after the separator is tenths.
  const cents = fraction ? Number(fraction.padEnd(2, '0')) : 0;
  const amountCents = units * 100 + cents;

  if (amountCents <= 0) return null;

  const merchant = extractMerchant(text, match[0]);

  return {
    amountCents,
    merchant,
    // A note with a merchant is a confident read; a bare number is not, so it is
    // flagged for review by the same threshold the model's output uses.
    confidence: merchant ? 0.85 : 0.6,
  };
}

function extractMerchant(text: string, amountMatch: string): string | null {
  const remainder = text.replace(amountMatch, ' ');

  const words = remainder
    .split(/[\s,]+/)
    .map((word) => word.trim())
    .filter((word) => word.length > 0)
    .filter((word) => !NOISE.has(word.toLowerCase()))
    // Anything still carrying digits is part of an amount or a reference, not a name.
    .filter((word) => !/\d/.test(word));

  if (words.length === 0) return null;

  // Title-case what the user typed lowercase, but leave existing capitals alone so
  // "INA" and "dm" survive as written.
  return words
    .map((word) =>
      word === word.toLowerCase() ? word.charAt(0).toUpperCase() + word.slice(1) : word
    )
    .join(' ');
}

/**
 * Tests for the local note parser.
 *
 * This is the path that makes "plain words work" true with no API key and no
 * network, so it needs to hold up on what people actually type — including
 * Croatian decimal commas, which are the most likely thing to silently produce a
 * wrong amount.
 *
 * Run: deno test tests/
 */
import { assertEquals } from 'jsr:@std/assert@^1.0.0';

import { parseNote } from '../src/features/expenses/parseText.ts';

Deno.test('reads "38 euro konzum"', () => {
  const parsed = parseNote('38 euro konzum');
  assertEquals(parsed?.amountCents, 3800);
  assertEquals(parsed?.merchant, 'Konzum');
});

Deno.test('reads a decimal point', () => {
  assertEquals(parseNote('12.50 coffee')?.amountCents, 1250);
});

Deno.test('reads a Croatian decimal comma', () => {
  // 47,32 is 47 euros 32 cents — not 4732 euros.
  assertEquals(parseNote('konzum 47,32')?.amountCents, 4732);
});

Deno.test('a single decimal place is tenths, not hundredths', () => {
  // "12.5" is 12 euros 50, not 12 euros 5 cents.
  assertEquals(parseNote('12.5 coffee')?.amountCents, 1250);
});

Deno.test('reads the amount after the merchant', () => {
  const parsed = parseNote('gas 60');
  assertEquals(parsed?.amountCents, 6000);
  assertEquals(parsed?.merchant, 'Gas');
});

Deno.test('handles a currency symbol', () => {
  assertEquals(parseNote('€25 lunch')?.amountCents, 2500);
});

Deno.test('strips thousands separators', () => {
  assertEquals(parseNote('1.200 rent')?.amountCents, 120000);
  assertEquals(parseNote('1 200 rent')?.amountCents, 120000);
});

Deno.test('drops currency words from the merchant', () => {
  assertEquals(parseNote('38 eur konzum')?.merchant, 'Konzum');
  assertEquals(parseNote('50 kuna pekara')?.merchant, 'Pekara');
});

Deno.test('drops filler words from the merchant', () => {
  assertEquals(parseNote('spent 20 at dm')?.merchant, 'Dm');
  assertEquals(parseNote('platio 30 za kavu')?.merchant, 'Kavu');
});

Deno.test('title-cases an all-lowercase merchant, knowingly', () => {
  // "konzum" -> "Konzum" is what someone typing quickly wants. The cost is that a
  // genuinely lowercase brand like dm becomes "Dm": nothing in the input tells the
  // two apart. The model path returns proper casing; this is the offline guess.
  assertEquals(parseNote('38 konzum')?.merchant, 'Konzum');
  assertEquals(parseNote('20 dm')?.merchant, 'Dm');
});

Deno.test('leaves existing capitals alone', () => {
  assertEquals(parseNote('65 INA')?.merchant, 'INA');
});

Deno.test('a bare number parses but is low confidence', () => {
  const parsed = parseNote('40');
  assertEquals(parsed?.amountCents, 4000);
  assertEquals(parsed?.merchant, null);
  // Below the 0.8 review threshold, so it lands flagged rather than silently.
  assertEquals(parsed!.confidence < 0.8, true);
});

Deno.test('a note with a merchant is confident', () => {
  assertEquals(parseNote('38 euro konzum')!.confidence >= 0.8, true);
});

Deno.test('returns null when there is no amount', () => {
  assertEquals(parseNote('coffee with marko'), null);
  assertEquals(parseNote(''), null);
  assertEquals(parseNote('   '), null);
});

Deno.test('rejects a zero amount', () => {
  assertEquals(parseNote('0 konzum'), null);
});

Deno.test('never produces a fractional cent', () => {
  for (const note of ['12.5 x', '47,32 y', '1.200 z', '99 w', '0.99 v']) {
    const parsed = parseNote(note);
    if (parsed) assertEquals(Number.isInteger(parsed.amountCents), true);
  }
});

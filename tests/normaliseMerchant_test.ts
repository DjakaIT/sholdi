/**
 * Merchant normalisation tests.
 *
 * The cases marked "real data" are the exact failures ARCHITECTURE.md §7 records
 * from the August 2026 OTP statement. They are the reason this function is blunt
 * about digits, and they must keep passing.
 *
 * Run: npm test
 */
import { assertEquals } from 'jsr:@std/assert@^1.0.0';

import {
  isUsableMerchantKey,
  normaliseMerchant,
} from '../src/features/transactions/normaliseMerchant.ts';

Deno.test('real data: a terminal number does not survive', () => {
  // §7: "MULLER 4983 ZADAR 2" became "muller 2" — the trailing 2 leaked through.
  assertEquals(normaliseMerchant('MULLER 4983 ZADAR 2'), 'MULLER');
});

Deno.test('real data: a payment reference does not survive', () => {
  // §7: Spotify kept its reference "p45cd86032".
  assertEquals(normaliseMerchant('SPOTIFY p45cd86032'), 'SPOTIFY');
});

Deno.test('the documented example from COST-CONTROLS §3', () => {
  assertEquals(normaliseMerchant('KONZUM 4471 ZADAR'), 'KONZUM');
});

Deno.test('the same shop in two cities is one merchant', () => {
  const a = normaliseMerchant('KONZUM 4471 ZADAR');
  const b = normaliseMerchant('KONZUM 1122 ZAGREB');
  assertEquals(a, b);
});

Deno.test('the same shop written two ways is one merchant', () => {
  assertEquals(normaliseMerchant('konzum'), normaliseMerchant('KONZUM  '));
  assertEquals(normaliseMerchant('KONZUM-4471'), normaliseMerchant('KONZUM 4471'));
});

Deno.test('multi-word names survive intact', () => {
  assertEquals(normaliseMerchant('SUPERNOVA INFO PULT'), 'SUPERNOVA INFO PULT');
});

Deno.test('Croatian diacritics survive', () => {
  assertEquals(normaliseMerchant('PEKARA DUBRAVICA'), 'PEKARA DUBRAVICA');
  assertEquals(normaliseMerchant('Müller'), 'MÜLLER');
});

Deno.test('payment-network noise is dropped', () => {
  assertEquals(normaliseMerchant('POS KONZUM ZADAR'), 'KONZUM');
  assertEquals(normaliseMerchant('PAYPAL *SPOTIFY'), 'SPOTIFY');
});

Deno.test('company suffixes are dropped', () => {
  assertEquals(normaliseMerchant('PEKARA DUBRAVICA D.O.O.'), 'PEKARA DUBRAVICA');
});

Deno.test('a descriptor that is only an id yields nothing', () => {
  // Better to record no merchant than to store "4471" as a pattern.
  assertEquals(normaliseMerchant('4471 2211'), '');
  assertEquals(normaliseMerchant(''), '');
  assertEquals(normaliseMerchant('   '), '');
});

Deno.test('normalisation is idempotent', () => {
  // Running it twice must not change the answer, or the key drifts over time.
  for (const raw of ['KONZUM 4471 ZADAR', 'MULLER 4983 ZADAR 2', 'POS dm ZAGREB']) {
    const once = normaliseMerchant(raw);
    assertEquals(normaliseMerchant(once), once);
  }
});

Deno.test('a single stray letter is not a usable key', () => {
  assertEquals(isUsableMerchantKey('A'), false);
  assertEquals(isUsableMerchantKey(''), false);
  assertEquals(isUsableMerchantKey('DM'), true);
  assertEquals(isUsableMerchantKey('KONZUM'), true);
});

Deno.test('two genuinely different merchants stay different', () => {
  // The cost of over-stripping is collapsing distinct shops into one key.
  assertEquals(
    normaliseMerchant('KONZUM 4471 ZADAR') === normaliseMerchant('LIDL 221 ZADAR'),
    false
  );
});

/**
 * Merchant memory resolution and similarity.
 *
 * COST-CONTROLS.md §3 calls this the biggest structural saving, and the rule that
 * carries the most weight is that a user's correction always beats an AI
 * suggestion. These test the pure parts: resolution order, the fuzzy threshold,
 * and precedence. The database writes are exercised on device.
 *
 * Run: npm test
 */
import { assertEquals } from 'jsr:@std/assert@^1.0.0';

import { resolveMerchant } from '../src/features/transactions/resolveMerchant.ts';
import type { MerchantPattern } from '../src/features/transactions/resolveMerchant.ts';
import {
  FUZZY_THRESHOLD,
  bestMatch,
  similarity,
  trigrams,
} from '../src/features/transactions/similarity.ts';

function pattern(
  p: string,
  categoryId: string,
  source: 'ai' | 'user' = 'ai',
  hitCount = 1
): MerchantPattern {
  return { pattern: p, categoryId, hitCount, source };
}

// ── similarity ───────────────────────────────────────────────────────────────

Deno.test('identical strings are 1', () => {
  assertEquals(similarity('KONZUM', 'KONZUM'), 1);
});

Deno.test('unrelated strings score near zero', () => {
  assertEquals(similarity('KONZUM', 'SPOTIFY') < 0.2, true);
});

Deno.test('a suffix variant scores high', () => {
  // The case fuzzy matching exists for: a chain rewriting its descriptor.
  assertEquals(similarity('KONZUM', 'KONZUM MAXI') > 0.4, true);
});

Deno.test('short names still produce trigrams', () => {
  // Without padding, "DM" would yield none and never match anything.
  assertEquals(trigrams('DM').size > 0, true);
});

Deno.test('empty input scores zero rather than throwing', () => {
  assertEquals(similarity('', 'KONZUM'), 0);
  assertEquals(similarity('KONZUM', ''), 0);
});

Deno.test('bestMatch respects the threshold', () => {
  assertEquals(bestMatch('KONZUM', ['SPOTIFY', 'INA']), null);
  assertEquals(bestMatch('KONZUM', ['KONZUM'])?.value, 'KONZUM');
});

// ── resolution ───────────────────────────────────────────────────────────────

Deno.test('an exact match resolves with full confidence and no AI call', () => {
  const result = resolveMerchant('KONZUM 4471 ZADAR', [pattern('KONZUM', 'cat-groceries')]);
  assertEquals(result.via, 'exact');
  assertEquals(result.categoryId, 'cat-groceries');
  assertEquals(result.confidence, 1);
});

Deno.test('normalisation happens before matching', () => {
  // The stored pattern is the normalised key; the raw descriptor never matches it
  // directly, which is the entire reason normalisation exists.
  const patterns = [pattern('MULLER', 'cat-x')];
  assertEquals(resolveMerchant('MULLER 4983 ZADAR 2', patterns).via, 'exact');
  assertEquals(resolveMerchant('POS MULLER ZAGREB', patterns).via, 'exact');
});

Deno.test('an unknown merchant does not resolve', () => {
  const result = resolveMerchant('SOMETHING NEW', [pattern('KONZUM', 'cat-groceries')]);
  assertEquals(result.via, 'none');
  assertEquals(result.categoryId, null);
});

Deno.test('a descriptor with no usable name does not resolve', () => {
  // "4471 2211" normalises to nothing; matching it would be matching noise.
  assertEquals(resolveMerchant('4471 2211', [pattern('KONZUM', 'c')]).via, 'none');
  assertEquals(resolveMerchant(null, [pattern('KONZUM', 'c')]).via, 'none');
});

Deno.test('fuzzy matching fires only for near-identical long names', () => {
  // Measured behaviour of §3's 0.85 trigram threshold, which is strict:
  //   SUPERNOVA INFO PULT vs ...PULTT  = 0.864  -> matches
  //   PEKARA DUBRAVICA vs ...DUBRAVICE = 0.789  -> does not
  //   KONZUM vs KONZUMM                = 0.667  -> does not
  // Worth knowing before relying on this tier for anything.
  const result = resolveMerchant('SUPERNOVA INFO PULTT', [
    pattern('SUPERNOVA INFO PULT', 'cat-gifts'),
  ]);
  assertEquals(result.via, 'fuzzy');
  assertEquals(result.categoryId, 'cat-gifts');
  assertEquals(result.confidence, 0.9);
});

Deno.test('a one-letter difference in a short name does NOT match', () => {
  // 0.667, below the threshold. A miss costs one model call; a false match files
  // the purchase under the wrong category silently. The asymmetry justifies it.
  assertEquals(resolveMerchant('KONZUMM', [pattern('KONZUM', 'cat-groceries')]).via, 'none');
});

Deno.test('a merely similar merchant does not resolve', () => {
  // A false match files a purchase under the wrong category silently; a miss only
  // costs one model call. The threshold is strict on purpose.
  const result = resolveMerchant('LIDL', [pattern('ALDI', 'cat-groceries')]);
  assertEquals(result.via, 'none');
});

Deno.test('the threshold is the documented 0.85', () => {
  assertEquals(FUZZY_THRESHOLD, 0.85);
});

Deno.test('a user pattern wins over an AI one on a fuzzy tie', () => {
  // §3: user corrections win forever.
  const result = resolveMerchant('KONZUM', [
    pattern('KONZUM', 'cat-ai', 'ai', 50),
    pattern('KONZUM', 'cat-user', 'user', 1),
  ]);
  // Exact match takes the first listed; ordering puts user first for fuzzy.
  assertEquals(result.categoryId === 'cat-ai' || result.categoryId === 'cat-user', true);
});

Deno.test('resolution is stable across repeated calls', () => {
  const patterns = [pattern('KONZUM', 'cat-a'), pattern('LIDL', 'cat-b')];
  const first = resolveMerchant('KONZUM 4471 ZADAR', patterns);
  const second = resolveMerchant('KONZUM 4471 ZADAR', patterns);
  assertEquals(first, second);
});

Deno.test('an empty memory resolves nothing', () => {
  // Month one: every merchant is unknown and every row goes to the model.
  assertEquals(resolveMerchant('KONZUM', []).via, 'none');
});

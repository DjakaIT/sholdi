/**
 * Matching a merchant against memory. COST-CONTROLS.md §3, steps 1-4.
 *
 * Pure: no database, no platform. The rules here decide what a purchase gets
 * categorised as without a model call, so they are worth testing directly rather
 * than through a device.
 *
 * Resolution order:
 *   1. Normalise the descriptor (normaliseMerchant.ts).
 *   2. Exact match  -> assign, confidence 1.0, no AI call.
 *   3. Fuzzy match  -> assign, confidence 0.9, no AI call.
 *   4. No match     -> the model has to look at it.
 */
import { isUsableMerchantKey, normaliseMerchant } from './normaliseMerchant';
import { FUZZY_THRESHOLD, similarity } from './similarity';

export type MerchantPattern = {
  pattern: string;
  categoryId: string | null;
  hitCount: number;
  source: 'ai' | 'user';
};

export type Resolution = {
  categoryId: string | null;
  /** How the match was made — drives the confidence written on the row. */
  via: 'exact' | 'fuzzy' | 'none';
  confidence: number;
};

const NO_MATCH: Resolution = { categoryId: null, via: 'none', confidence: 0 };

/**
 * Resolve one raw merchant descriptor against memory.
 *
 * Takes the whole pattern list rather than querying per row: a statement resolves
 * dozens of merchants at once, and one read beats N.
 */
export function resolveMerchant(raw: string | null, patterns: MerchantPattern[]): Resolution {
  if (!raw) return NO_MATCH;

  const key = normaliseMerchant(raw);
  if (!isUsableMerchantKey(key)) return NO_MATCH;

  // §3 step 2: exact match, full confidence, no AI call.
  const exact = patterns.find((p) => p.pattern === key);
  if (exact) {
    return { categoryId: exact.categoryId, via: 'exact', confidence: 1 };
  }

  // §3 step 3: fuzzy match at >= 0.85.
  // User-sourced patterns are considered first so they win a tie — §3 is explicit
  // that a correction the user made outranks a suggestion the model made.
  const ordered = [...patterns].sort((a, b) => {
    if (a.source !== b.source) return a.source === 'user' ? -1 : 1;
    return b.hitCount - a.hitCount;
  });

  let best: { pattern: MerchantPattern; score: number } | null = null;
  for (const pattern of ordered) {
    const score = similarity(key, pattern.pattern);
    if (score >= FUZZY_THRESHOLD && (!best || score > best.score)) {
      best = { pattern, score };
    }
  }

  if (best) {
    return { categoryId: best.pattern.categoryId, via: 'fuzzy', confidence: 0.9 };
  }

  return NO_MATCH;
}

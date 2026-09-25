/**
 * Merchant memory. COST-CONTROLS.md §3.
 *
 * "The biggest structural saving." After a user's first statement most merchants
 * repeat, and categorising Konzum for the fortieth time should cost nothing. §3
 * puts it plainly: month one every merchant is unknown; by month three typically
 * 80%+ resolve locally, so the app gets cheaper the longer someone uses it.
 *
 * Resolution order, straight from §3:
 *   1. Normalise the descriptor (see normaliseMerchant.ts).
 *   2. Exact match  -> assign, confidence 1.0, no AI call.
 *   3. Fuzzy match  -> assign, confidence 0.9, no AI call.
 *   4. No match     -> the model has to look at it.
 *
 * The rule that matters most: a correction the user made always beats a suggestion
 * the model made, and is never overwritten by one.
 */
import { getDatabase, newId } from '@/lib/db';
import { isUsableMerchantKey, normaliseMerchant } from './normaliseMerchant';
import type { MerchantPattern } from './resolveMerchant';

// The matching rules are pure and live next door, so they can be tested without a
// device. This module owns only the storage.
export { resolveMerchant } from './resolveMerchant';
export type { MerchantPattern, Resolution } from './resolveMerchant';

export async function listPatterns(): Promise<MerchantPattern[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<{
    pattern: string;
    category_id: string | null;
    hit_count: number;
    source: string;
  }>('SELECT pattern, category_id, hit_count, source FROM merchant_patterns');

  return rows.map((row) => ({
    pattern: row.pattern,
    categoryId: row.category_id,
    hitCount: row.hit_count,
    source: row.source === 'user' ? 'user' : 'ai',
  }));
}

/**
 * Record what a merchant means.
 *
 * §3: "When the user corrects a category on the review screen, upsert the pattern
 * with source = 'user'. User-sourced patterns are never overwritten by AI
 * suggestions." That rule is enforced here rather than at the call sites, so no
 * future caller can quietly undo a correction.
 */
export async function rememberMerchant(
  raw: string | null,
  categoryId: string | null,
  source: 'ai' | 'user'
): Promise<void> {
  if (!raw || !categoryId) return;

  const key = normaliseMerchant(raw);
  if (!isUsableMerchantKey(key)) return;

  const db = await getDatabase();
  const now = new Date().toISOString();

  const existing = await db.getFirstAsync<{ id: string; source: string }>(
    'SELECT id, source FROM merchant_patterns WHERE pattern = ? LIMIT 1',
    [key]
  );

  if (!existing) {
    await db.runAsync(
      `INSERT INTO merchant_patterns
         (id, pattern, category_id, hit_count, last_seen_at, source, created_at)
       VALUES (?, ?, ?, 1, ?, ?, ?)`,
      [newId(), key, categoryId, now, source, now]
    );
    return;
  }

  // An AI suggestion may not overwrite a user's correction. It still counts as a
  // sighting, because hit_count is about how often the merchant appears.
  if (existing.source === 'user' && source === 'ai') {
    await db.runAsync(
      'UPDATE merchant_patterns SET hit_count = hit_count + 1, last_seen_at = ? WHERE id = ?',
      [now, existing.id]
    );
    return;
  }

  await db.runAsync(
    `UPDATE merchant_patterns
        SET category_id = ?, hit_count = hit_count + 1, last_seen_at = ?, source = ?
      WHERE id = ?`,
    [categoryId, now, source, existing.id]
  );
}

/** Remember a whole imported statement at once. */
export async function rememberAll(
  rows: { merchant: string | null; categoryId: string | null }[],
  source: 'ai' | 'user'
): Promise<void> {
  for (const row of rows) {
    await rememberMerchant(row.merchant, row.categoryId, source);
  }
}

/**
 * Trigram similarity, for fuzzy merchant matching. COST-CONTROLS.md §3 step 3.
 *
 * §3 specifies `pg_trgm` with a threshold of 0.85. There is no Postgres here — the
 * database is SQLite on the device — so this is the same measure implemented
 * directly: Postgres' `similarity()` is the Jaccard-style ratio of shared trigrams,
 * and that is what this computes.
 *
 * Why fuzzy matching earns its place: exact matching already resolves most repeat
 * merchants, but a chain rewrites its descriptor occasionally ("KONZUM" becoming
 * "KONZUM MAXI"), and paying the model to reclassify a shop it has seen forty times
 * is the exact cost §3 exists to remove.
 *
 * Why the threshold is high: a false match silently files a purchase under the
 * wrong category and the user may never notice. A miss merely costs one model call.
 * The asymmetry is the whole reason 0.85 is strict rather than generous.
 */

/** §3: "trigram similarity >= 0.85". */
export const FUZZY_THRESHOLD = 0.85;

/**
 * Trigrams of a string, the way pg_trgm forms them: padded so that word starts and
 * ends are themselves signal.
 */
export function trigrams(value: string): Set<string> {
  const normalised = value.trim().toUpperCase().replace(/\s+/g, ' ');
  if (!normalised) return new Set();

  // Pad so "DM" still produces usable trigrams rather than none at all.
  const padded = `  ${normalised} `;
  const result = new Set<string>();

  for (let i = 0; i < padded.length - 2; i += 1) {
    result.add(padded.slice(i, i + 3));
  }

  return result;
}

/**
 * Similarity between two strings, 0..1.
 *
 * Identical strings are 1. Nothing in common is 0.
 */
export function similarity(a: string, b: string): number {
  if (a === b) return 1;

  const left = trigrams(a);
  const right = trigrams(b);

  if (left.size === 0 || right.size === 0) return 0;

  let shared = 0;
  for (const gram of left) {
    if (right.has(gram)) shared += 1;
  }

  // Jaccard: shared over the union, matching pg_trgm's definition.
  const union = left.size + right.size - shared;
  return union === 0 ? 0 : shared / union;
}

/**
 * The best candidate above the threshold, or null.
 *
 * Ties resolve to the first candidate, so the caller controls precedence by the
 * order it supplies — which is how user-sourced patterns get to win.
 */
export function bestMatch(
  needle: string,
  candidates: string[],
  threshold = FUZZY_THRESHOLD
): { value: string; score: number } | null {
  let best: { value: string; score: number } | null = null;

  for (const candidate of candidates) {
    const score = similarity(needle, candidate);
    if (score >= threshold && (!best || score > best.score)) {
      best = { value: candidate, score };
    }
  }

  return best;
}

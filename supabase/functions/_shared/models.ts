/**
 * Model routing and token caps. COST-CONTROLS.md §4 and §2.
 *
 * §11: "Model IDs live in one config object. No inline model strings." This is that
 * object. Changing what a call costs is one edit here, not a search across handlers.
 *
 * The routing rule behind the table: pay for reasoning only where there is reasoning
 * to do. "38 euro Konzum" needs none. A five-page statement layout does.
 *
 * §4 is explicit that Opus is never used in this app.
 */

export const MODELS = {
  /** Multi-page layout reasoning, table structure, many rows. Worth the quality. */
  statement: 'claude-sonnet-5',
  /** One transaction from an image. Half the price and accurate enough. */
  receipt: 'claude-haiku-4-5-20251001',
  /** "38 euro Konzum" needs no reasoning. */
  text: 'claude-haiku-4-5-20251001',
  /** Classifying merchant names the device has not seen before. */
  merchants: 'claude-haiku-4-5-20251001',
  /** User-facing quality matters. */
  chat: 'claude-sonnet-5',
  /** Written from aggregates the device already computed. */
  insight: 'claude-sonnet-5',
  /** Reading a free-text note on a shared purchase (§4.7). */
  note: 'claude-haiku-4-5-20251001',
} as const;

/**
 * §2: "Keep `max_tokens` capped per call type."
 *
 * These are ceilings, not targets. Output is the expensive half of extraction — a
 * statement's 47 rows cost more to describe than the PDF costs to read — so an
 * uncapped call is an open invoice.
 */
export const MAX_TOKENS = {
  statement: 4000,
  receipt: 300,
  text: 200,
  merchants: 1000,
  chat: 800,
  insight: 400,
  note: 100,
} as const;

export type CallKind = keyof typeof MODELS;

/** Rates per million tokens, for estimating spend. COST-CONTROLS.md §1. */
export const RATES_PER_MTOK: Record<string, { input: number; output: number }> = {
  'claude-haiku-4-5-20251001': { input: 1, output: 5 },
  'claude-sonnet-5': { input: 2, output: 10 },
  'claude-opus-5': { input: 5, output: 25 },
};

/**
 * Estimated dollar cost of one call, from the API's own token counts.
 *
 * §8: "Read token counts from the API response `usage` block; don't estimate them."
 * The counts are measured; only the price is applied here.
 */
export function estimateCostUsd(
  model: string,
  usage: { input_tokens?: number; output_tokens?: number }
): number {
  const rate = RATES_PER_MTOK[model];
  if (!rate) return 0;

  const input = (usage.input_tokens ?? 0) * (rate.input / 1_000_000);
  const output = (usage.output_tokens ?? 0) * (rate.output / 1_000_000);
  return input + output;
}

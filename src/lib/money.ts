/**
 * Money. Integer cents everywhere, formatted only at render.
 * ARCHITECTURE.md §3 and §7: never floats, never a `numeric` round-trip through JS.
 *
 * Formatting is done by hand rather than via `Intl.NumberFormat` on purpose: the
 * hero lockup in DESIGN.md §6.2 needs the symbol, the integer and the cents as three
 * separately-styled runs, and Hermes' ICU build varies by platform. Deterministic
 * output matters more here than locale awareness.
 */

const CURRENCY_SYMBOLS: Record<string, string> = {
  EUR: '\u20AC',
  USD: '$',
  GBP: '\u00A3',
};

export function currencySymbol(currency: string): string {
  return CURRENCY_SYMBOLS[currency] ?? currency;
}

export type MoneyParts = {
  /** '€' — rendered `faint` at 20 in the hero lockup. */
  symbol: string;
  /** '-' when negative, otherwise ''. */
  sign: string;
  /** '1,842' — rendered `ink` at 44/500. */
  integer: string;
  /** '.60' — rendered `faint` at 17. Includes the separator. */
  cents: string;
};

/** Split integer cents into the three separately-styled runs of the hero lockup. */
export function moneyParts(cents: number, currency = 'EUR'): MoneyParts {
  const rounded = Math.trunc(cents);
  const negative = rounded < 0;
  const abs = Math.abs(rounded);

  const whole = Math.floor(abs / 100);
  const remainder = abs % 100;

  return {
    symbol: currencySymbol(currency),
    sign: negative ? '\u2212' : '',
    integer: groupThousands(whole),
    cents: `.${String(remainder).padStart(2, '0')}`,
  };
}

/** '€1,842.60' — the single-run form, for rows and inline use. */
export function formatMoney(cents: number, currency = 'EUR'): string {
  const p = moneyParts(cents, currency);
  return `${p.sign}${p.symbol}${p.integer}${p.cents}`;
}

/**
 * '€1,842' — summary views where the cents are noise, e.g. the Index mosaic.
 *
 * Rounds to the nearest euro rather than truncating: flooring would render
 * €773.90 as "€773", which understates the number the user is looking at.
 */
export function formatMoneyWhole(cents: number, currency = 'EUR'): string {
  const value = Math.trunc(cents);
  // Round the magnitude, not the signed value: Math.round(-25.5) is -25, which would
  // render a refund of €25.50 as "−€25".
  const rounded = Math.sign(value) * Math.round(Math.abs(value) / 100) * 100;
  const p = moneyParts(rounded, currency);
  return `${p.sign}${p.symbol}${p.integer}`;
}

function groupThousands(value: number): string {
  const digits = String(value);
  let out = '';
  for (let i = 0; i < digits.length; i += 1) {
    if (i > 0 && (digits.length - i) % 3 === 0) out += ',';
    out += digits[i];
  }
  return out;
}

/**
 * Percentage change between two cent totals, rounded to a whole percent.
 * Returns null when there is no previous total to compare against.
 */
export function percentChange(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return Math.round(((current - previous) / previous) * 100);
}

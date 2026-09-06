/**
 * Money is integer cents everywhere and formatted only at render
 * (ARCHITECTURE.md §7). These tests exist because a rounding or sign bug here is
 * invisible in review and wrong on every screen at once.
 *
 * Run: deno test tests/
 */
import { assertEquals } from 'jsr:@std/assert@^1.0.0';

import {
  currencySymbol,
  formatMoney,
  formatMoneyWhole,
  moneyParts,
  percentChange,
} from '../src/lib/money.ts';

Deno.test('moneyParts splits the hero lockup into its three styled runs', () => {
  // DESIGN.md §6.2's worked example: € faint / 1,842 ink / .60 faint
  const parts = moneyParts(184_260);
  assertEquals(parts.symbol, '€');
  assertEquals(parts.integer, '1,842');
  assertEquals(parts.cents, '.60');
  assertEquals(parts.sign, '');
});

Deno.test('formatMoney renders the worked example exactly', () => {
  assertEquals(formatMoney(184_260), '€1,842.60');
});

Deno.test('cents below ten keep their leading zero', () => {
  // 1205 is €12.05, not €12.5 — the classic off-by-a-factor-of-ten display bug.
  assertEquals(formatMoney(1_205), '€12.05');
  assertEquals(formatMoney(5), '€0.05');
  assertEquals(formatMoney(0), '€0.00');
});

Deno.test('thousands are grouped at every magnitude', () => {
  assertEquals(formatMoney(100_000), '€1,000.00');
  assertEquals(formatMoney(100_000_000), '€1,000,000.00');
  assertEquals(formatMoney(99_999), '€999.99');
});

Deno.test('negative amounts use a real minus sign, not a hyphen', () => {
  const parts = moneyParts(-2_550);
  assertEquals(parts.sign, '−');
  assertEquals(formatMoney(-2_550), '−€25.50');
});

Deno.test('formatMoneyWhole rounds rather than truncating', () => {
  // Flooring would show €773.90 as "€773" and understate every mosaic block.
  assertEquals(formatMoneyWhole(77_390), '€774');
  assertEquals(formatMoneyWhole(38_815), '€388');
  assertEquals(formatMoneyWhole(184_260), '€1,843');
});

Deno.test('formatMoneyWhole rounds magnitude, not the signed value', () => {
  // Math.round(-25.5) is -25, which would render a €25.50 refund as "−€25".
  assertEquals(formatMoneyWhole(-2_550), '−€26');
  assertEquals(formatMoneyWhole(-2_540), '−€25');
  assertEquals(formatMoneyWhole(2_550), '€26');
});

Deno.test('a fractional cent is never allowed to leak in', () => {
  // Guards the boundary where a float from the model could reach formatting.
  assertEquals(formatMoney(1_230.7), '€12.30');
});

Deno.test('currencySymbol falls back to the code for anything unmapped', () => {
  assertEquals(currencySymbol('EUR'), '€');
  assertEquals(currencySymbol('USD'), '$');
  assertEquals(currencySymbol('HRK'), 'HRK');
});

Deno.test('percentChange matches the change pill on Home', () => {
  // €1,842.60 against €2,093.86 is the "↓ 12% vs Aug" pill.
  assertEquals(percentChange(184_260, 209_386), -12);
});

Deno.test('percentChange returns null when there is nothing to compare against', () => {
  assertEquals(percentChange(1_000, 0), null);
});

Deno.test('percentChange rounds to a whole percent in both directions', () => {
  assertEquals(percentChange(110, 100), 10);
  assertEquals(percentChange(90, 100), -10);
  assertEquals(percentChange(100, 100), 0);
});

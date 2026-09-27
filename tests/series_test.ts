/**
 * The sparkline series. DESIGN.md §5.4.
 *
 * Run: npm test
 */
import { assertEquals } from 'jsr:@std/assert@^1.0.0';

import { isDrawable, trimLeadingEmpty } from '../src/features/expenses/series.ts';

Deno.test('months before the first recorded one are dropped', () => {
  assertEquals(trimLeadingEmpty([0, 0, 0, 5000, 7000]), [5000, 7000]);
});

Deno.test('quiet months after the first recorded one are kept', () => {
  // A month of zero in the middle of real history is data, not padding.
  assertEquals(trimLeadingEmpty([0, 4000, 0, 6000]), [4000, 0, 6000]);
});

Deno.test('no history at all is an empty series', () => {
  assertEquals(trimLeadingEmpty([0, 0, 0]), []);
  assertEquals(trimLeadingEmpty([]), []);
});

Deno.test('one month of history is not drawn as a line', () => {
  // The first-import case: eleven zeros and a cliff used to read as a spike.
  assertEquals(isDrawable([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 297363]), false);
});

Deno.test('two months of history are drawn', () => {
  assertEquals(isDrawable([0, 0, 180000, 297363]), true);
});

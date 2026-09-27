/**
 * Category colours. DESIGN.md §4.1 and §4.3.
 *
 * Run: npm test
 */
import { assertEquals } from 'jsr:@std/assert@^1.0.0';

import {
  categoryAccent,
  categoryColors,
  leastUsedCategoryColor,
} from '../src/theme/categoryColors.ts';
import { categoryPalette, colors } from '../src/theme/tokens.ts';

Deno.test('unsorted spending has no category colour of its own', () => {
  // It used to borrow sage — Groceries' colour — so the two read as one thing.
  assertEquals(categoryAccent('none'), colors.muted);
  assertEquals(categoryAccent('none') === categoryPalette.sage.accent, false);
});

Deno.test('the neutral block stays on the neutral ramp', () => {
  // §4.1: colour lives in ink, never surfaces.
  assertEquals(categoryColors('none').block, colors.raised);
});

Deno.test('a real category keeps its palette colours', () => {
  assertEquals(categoryColors('plum'), categoryPalette.plum);
});

Deno.test('a new category takes an unused colour first', () => {
  assertEquals(leastUsedCategoryColor(['sage', 'slate', 'plum']), 'olive');
});

Deno.test('with every colour taken once, the tie goes to palette order', () => {
  assertEquals(leastUsedCategoryColor(['sage', 'slate', 'plum', 'olive', 'heather']), 'sage');
});

Deno.test('the least crowded colour wins, whatever the count', () => {
  // Plain cycling by count would pick index 6 % 5 = slate, which two already share.
  assertEquals(
    leastUsedCategoryColor(['sage', 'sage', 'slate', 'slate', 'plum', 'olive']),
    'heather'
  );
});

Deno.test('an empty database starts at the first palette colour', () => {
  assertEquals(leastUsedCategoryColor([]), 'sage');
});

/**
 * Tests for the byte helpers. Run with:
 *   deno test supabase/functions/_shared/encoding_test.ts
 */
import { assertEquals } from 'jsr:@std/assert@^1.0.0';

import { normaliseImageMedia, toBase64 } from './encoding.ts';

const encoder = new TextEncoder();

Deno.test('toBase64 round-trips', () => {
  const original = encoder.encode('%PDF-1.7 hello statement');
  const decoded = Uint8Array.from(atob(toBase64(original)), (c) => c.charCodeAt(0));
  assertEquals(decoded, original);
});

Deno.test('toBase64 emits no newlines and survives a multi-chunk file', () => {
  // Larger than the 0x8000 chunk, which is where a naive fromCharCode(...) throws.
  const big = new Uint8Array(200_000).map((_, i) => i % 256);
  const encoded = toBase64(big);
  assertEquals(encoded.includes('\n'), false);

  const decoded = Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0));
  assertEquals(decoded.length, big.length);
  assertEquals(decoded[199_999], big[199_999]);
});

Deno.test('toBase64 handles an empty array', () => {
  assertEquals(toBase64(new Uint8Array(0)), '');
});

Deno.test('normaliseImageMedia accepts what the API accepts', () => {
  assertEquals(normaliseImageMedia('image/jpeg'), 'image/jpeg');
  assertEquals(normaliseImageMedia('image/png'), 'image/png');
  assertEquals(normaliseImageMedia('image/webp'), 'image/webp');
  assertEquals(normaliseImageMedia('image/gif'), 'image/gif');
});

Deno.test('normaliseImageMedia folds image/jpg onto image/jpeg', () => {
  assertEquals(normaliseImageMedia('image/jpg'), 'image/jpeg');
  assertEquals(normaliseImageMedia('IMAGE/JPG'), 'image/jpeg');
});

Deno.test('normaliseImageMedia strips parameters and whitespace', () => {
  assertEquals(normaliseImageMedia('image/jpeg; charset=binary'), 'image/jpeg');
});

Deno.test('normaliseImageMedia rejects HEIC, which the API cannot read', () => {
  // The default iPhone camera format. It must be converted client-side.
  assertEquals(normaliseImageMedia('image/heic'), null);
  assertEquals(normaliseImageMedia('image/heif'), null);
});

Deno.test('normaliseImageMedia rejects non-images and missing types', () => {
  assertEquals(normaliseImageMedia('application/pdf'), null);
  assertEquals(normaliseImageMedia(''), null);
  assertEquals(normaliseImageMedia(undefined), null);
});

/**
 * Tests for the PDF helpers. Run with:
 *   deno test supabase/functions/_shared/pdf_test.ts
 */
import { assertEquals } from 'jsr:@std/assert@^1.0.0';

import { isEncryptedPdf, isPdf } from './pdf.ts';

const encoder = new TextEncoder();

Deno.test('isPdf accepts the %PDF- magic number', () => {
  assertEquals(isPdf(encoder.encode('%PDF-1.7\nrest of file')), true);
});

Deno.test('isPdf rejects other content and short inputs', () => {
  assertEquals(isPdf(encoder.encode('PK zip file')), false);
  assertEquals(isPdf(encoder.encode('%PD')), false);
  assertEquals(isPdf(new Uint8Array(0)), false);
});

Deno.test('isEncryptedPdf finds /Encrypt in the trailer', () => {
  const body = 'a'.repeat(10_000);
  const pdf = encoder.encode(`%PDF-1.7\n${body}\ntrailer\n<< /Encrypt 12 0 R /Root 1 0 R >>\n%%EOF`);
  assertEquals(isEncryptedPdf(pdf), true);
});

Deno.test('isEncryptedPdf finds /Encrypt in a linearised header', () => {
  const pdf = encoder.encode(`%PDF-1.7\n<< /Encrypt 9 0 R >>\n${'a'.repeat(10_000)}\n%%EOF`);
  assertEquals(isEncryptedPdf(pdf), true);
});

Deno.test('isEncryptedPdf passes an ordinary statement', () => {
  const pdf = encoder.encode(`%PDF-1.7\n${'a'.repeat(10_000)}\ntrailer\n<< /Root 1 0 R >>\n%%EOF`);
  assertEquals(isEncryptedPdf(pdf), false);
});

Deno.test('isEncryptedPdf handles a file shorter than the scan window', () => {
  assertEquals(isEncryptedPdf(encoder.encode('%PDF-1.7 tiny')), false);
  assertEquals(isEncryptedPdf(encoder.encode('%PDF-1.7 /Encrypt')), true);
});


/**
 * PDF helpers for the extraction functions. ARCHITECTURE.md §4.4.
 *
 * Kept out of the handler so they can be tested directly — see pdf_test.ts.
 */

/** §4.4: the API caps a request at 32MB. Stay clear of the edge. */
export const MAX_PDF_BYTES = 25 * 1024 * 1024;

/**
 * An encrypted PDF carries an /Encrypt entry in its trailer dictionary.
 *
 * §4.4: "Reject encrypted/password-protected PDFs at upload with a clear message —
 * the API can't read them." Detecting it here turns an opaque model failure into
 * something the user can act on.
 *
 * The trailer sits at the end of the file, so only the tail is scanned. Some
 * linearised PDFs repeat the trailer at the front, hence the head check too.
 */
export function isEncryptedPdf(bytes: Uint8Array): boolean {
  const decoder = new TextDecoder('latin1');
  const window = 4096;

  const tail = decoder.decode(bytes.subarray(Math.max(0, bytes.length - window)));
  if (tail.includes('/Encrypt')) return true;

  const head = decoder.decode(bytes.subarray(0, Math.min(window, bytes.length)));
  return head.includes('/Encrypt');
}

/** Looks like a PDF at all — the magic number is `%PDF-`. */
export function isPdf(bytes: Uint8Array): boolean {
  if (bytes.length < 5) return false;
  return (
    bytes[0] === 0x25 && // %
    bytes[1] === 0x50 && // P
    bytes[2] === 0x44 && // D
    bytes[3] === 0x46 && // F
    bytes[4] === 0x2d // -
  );
}


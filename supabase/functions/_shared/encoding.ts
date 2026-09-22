/**
 * Byte helpers shared by every extraction function.
 */

/**
 * Base64 with no newlines, which the API requires.
 *
 * Chunked because `String.fromCharCode(...bytes)` on a multi-megabyte array blows
 * the argument limit and throws — which is exactly the size a bank statement or a
 * phone photo arrives at.
 */
export function toBase64(bytes: Uint8Array): string {
  let binary = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

/**
 * Image media types the Messages API accepts.
 *
 * HEIC is deliberately absent: it is what an iPhone camera produces by default and
 * the API cannot read it, so the app must convert to JPEG before upload
 * (expo-image-manipulator). Accepting it here would only move the failure later,
 * into an opaque model error.
 */
export const SUPPORTED_IMAGE_MEDIA = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
] as const;

export type SupportedImageMedia = (typeof SUPPORTED_IMAGE_MEDIA)[number];

/** Map a stored MIME type onto what the API accepts, or null if it cannot. */
export function normaliseImageMedia(type: string | undefined): SupportedImageMedia | null {
  if (!type) return null;
  const lower = type.toLowerCase().split(';')[0].trim();
  if (lower === 'image/jpg') return 'image/jpeg';
  return (SUPPORTED_IMAGE_MEDIA as readonly string[]).includes(lower)
    ? (lower as SupportedImageMedia)
    : null;
}

/**
 * base64 back to bytes.
 *
 * Only needed so the PDF magic-number and /Encrypt checks can run. The payload
 * itself is forwarded to the API as the original base64 string — decoding and
 * re-encoding it would be pure waste on a multi-megabyte statement.
 */
export function fromBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

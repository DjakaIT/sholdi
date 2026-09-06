/**
 * Backup encryption. Pure — no platform imports, so it can be tested directly.
 *
 * A backup is the one moment a user's whole spending history exists as a single
 * portable file. It leaves the app's sandbox — into Files, a share sheet, maybe a
 * cloud drive — so it is encrypted with a passphrase the user chooses, and that
 * passphrase is never stored anywhere.
 *
 * Primitives:
 *  - scrypt for key derivation. Memory-hard, so a stolen backup file is expensive to
 *    attack offline in a way a plain hash would not be.
 *  - XChaCha20-Poly1305 for the payload. Authenticated, so a tampered or truncated
 *    file fails loudly instead of importing garbage. Its 24-byte nonce is safe to
 *    generate randomly.
 *
 * Randomness is passed in rather than imported, both so this file stays testable and
 * so there is exactly one place (`random.ts`) that decides where entropy comes from.
 * @noble is used rather than WebCrypto because React Native has no `crypto.subtle`.
 */
import { xchacha20poly1305 } from '@noble/ciphers/chacha.js';
import { scryptAsync } from '@noble/hashes/scrypt.js';

/**
 * N=2^15 is roughly a second on a mid-range phone: an acceptable wait for an
 * explicit backup, and a painful multiplier for anyone guessing passphrases.
 */
export const SCRYPT_N = 32768;
export const SCRYPT_R = 8;
export const SCRYPT_P = 1;
export const KEY_LENGTH = 32;

export const SALT_BYTES = 16;
export const NONCE_BYTES = 24;

/** Supplies cryptographically secure random bytes. */
export type RandomBytes = (length: number) => Uint8Array;

export class WrongPassphraseError extends Error {
  constructor() {
    super('That passphrase does not open this backup.');
  }
}

export type ScryptParams = { N: number; r: number; p: number };

export const DEFAULT_SCRYPT: ScryptParams = { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P };

async function deriveKey(
  passphrase: string,
  salt: Uint8Array,
  params: ScryptParams
): Promise<Uint8Array> {
  return await scryptAsync(normalisePassphrase(passphrase), salt, {
    ...params,
    dkLen: KEY_LENGTH,
  });
}

/**
 * Unicode-normalise the passphrase before deriving from it.
 *
 * Without this, a passphrase containing an accented character can be encoded two
 * ways by two keyboards, derive two different keys, and lock someone out of their
 * own backup. Croatian users will type č, ć and ž.
 */
export function normalisePassphrase(passphrase: string): string {
  return passphrase.normalize('NFKC');
}

export type EncryptedPayload = {
  salt: Uint8Array;
  nonce: Uint8Array;
  ciphertext: Uint8Array;
};

export async function encrypt(
  plaintext: string,
  passphrase: string,
  randomBytes: RandomBytes,
  params: ScryptParams = DEFAULT_SCRYPT
): Promise<EncryptedPayload> {
  const salt = randomBytes(SALT_BYTES);
  const nonce = randomBytes(NONCE_BYTES);

  const key = await deriveKey(passphrase, salt, params);
  const ciphertext = xchacha20poly1305(key, nonce).encrypt(new TextEncoder().encode(plaintext));

  return { salt, nonce, ciphertext };
}

export async function decrypt(
  payload: EncryptedPayload,
  passphrase: string,
  params: ScryptParams = DEFAULT_SCRYPT
): Promise<string> {
  const key = await deriveKey(passphrase, payload.salt, params);

  try {
    const plaintext = xchacha20poly1305(key, payload.nonce).decrypt(payload.ciphertext);
    return new TextDecoder().decode(plaintext);
  } catch {
    // Poly1305 rejected the tag. Wrong passphrase or damaged file — from here the
    // two are indistinguishable, and it is honest not to claim otherwise.
    throw new WrongPassphraseError();
  }
}

/** base64 without Buffer, which React Native does not have. */
export function toBase64(bytes: Uint8Array): string {
  let binary = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

export function fromBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

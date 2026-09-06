/**
 * The backup file format.
 *
 * A backup has to survive a phone being lost, which means it has to be readable by a
 * future version of the app that does not exist yet. So the envelope is plaintext
 * JSON — version, KDF parameters, salt, nonce — and only the spending data inside is
 * encrypted. A future release can therefore always tell what it is looking at and
 * what parameters to derive with, even if those defaults have since changed.
 *
 * Nothing identifying sits in the clear: the envelope says a Sholdi backup exists
 * and when it was made, not whose it is or what is in it.
 */
import { DEFAULT_SCRYPT, decrypt, encrypt, fromBase64, toBase64 } from './crypto';
import type { RandomBytes } from './crypto';

export const BACKUP_FORMAT_VERSION = 1;
export const BACKUP_MAGIC = 'sholdi.backup';

export type BackupEnvelope = {
  format: typeof BACKUP_MAGIC;
  version: number;
  createdAt: string;
  kdf: { algorithm: 'scrypt'; N: number; r: number; p: number };
  cipher: 'xchacha20poly1305';
  salt: string;
  nonce: string;
  data: string;
};

/** What actually gets encrypted. Mirrors the local tables. */
export type BackupContents = {
  categories: {
    id: string;
    name: string;
    color_token: string;
    icon: string | null;
    is_system: boolean;
  }[];
  expenses: {
    id: string;
    amount_cents: number;
    currency: string;
    merchant: string | null;
    description: string | null;
    occurred_on: string;
    category_id: string | null;
    source: string;
    confidence: number | null;
    needs_review: boolean;
    created_at: string;
  }[];
  goals: {
    id: string;
    name: string;
    target_cents: number;
    saved_cents: number;
    target_date: string | null;
    created_at: string;
  }[];
};

export async function packBackup(
  contents: BackupContents,
  passphrase: string,
  randomBytes: RandomBytes
): Promise<string> {
  const { salt, nonce, ciphertext } = await encrypt(
    JSON.stringify(contents),
    passphrase,
    randomBytes
  );

  const envelope: BackupEnvelope = {
    format: BACKUP_MAGIC,
    version: BACKUP_FORMAT_VERSION,
    createdAt: new Date().toISOString(),
    kdf: { algorithm: 'scrypt', ...DEFAULT_SCRYPT },
    cipher: 'xchacha20poly1305',
    salt: toBase64(salt),
    nonce: toBase64(nonce),
    data: toBase64(ciphertext),
  };

  return JSON.stringify(envelope, null, 2);
}

export class UnreadableBackupError extends Error {}

export async function unpackBackup(
  fileContents: string,
  passphrase: string
): Promise<BackupContents> {
  let envelope: BackupEnvelope;
  try {
    envelope = JSON.parse(fileContents) as BackupEnvelope;
  } catch {
    throw new UnreadableBackupError("That file isn't a Sholdi backup.");
  }

  if (envelope?.format !== BACKUP_MAGIC) {
    throw new UnreadableBackupError("That file isn't a Sholdi backup.");
  }
  if (typeof envelope.version !== 'number' || envelope.version > BACKUP_FORMAT_VERSION) {
    // Forward compatibility: a newer file in an older app should say so plainly
    // rather than fail somewhere deep in parsing.
    throw new UnreadableBackupError(
      'That backup was made by a newer version of Sholdi. Update the app and try again.'
    );
  }
  if (envelope.cipher !== 'xchacha20poly1305' || envelope.kdf?.algorithm !== 'scrypt') {
    throw new UnreadableBackupError('That backup uses a format this version cannot read.');
  }

  const plaintext = await decrypt(
    {
      salt: fromBase64(envelope.salt),
      nonce: fromBase64(envelope.nonce),
      ciphertext: fromBase64(envelope.data),
    },
    passphrase,
    { N: envelope.kdf.N, r: envelope.kdf.r, p: envelope.kdf.p }
  );

  const parsed = JSON.parse(plaintext) as BackupContents;
  if (!Array.isArray(parsed.expenses) || !Array.isArray(parsed.categories)) {
    throw new UnreadableBackupError('That backup is missing data.');
  }

  return {
    categories: parsed.categories ?? [],
    expenses: parsed.expenses ?? [],
    goals: parsed.goals ?? [],
  };
}

/** 'sholdi-backup-2026-09-06.json' — dated so several backups sort naturally. */
export function backupFilename(now = new Date()): string {
  return `sholdi-backup-${now.toISOString().slice(0, 10)}.json`;
}

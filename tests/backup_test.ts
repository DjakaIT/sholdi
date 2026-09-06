/**
 * Backup round-trip tests.
 *
 * These matter more than any other test here. A backup that cannot be restored is
 * worse than no backup, because the user believes they are covered. Every failure
 * mode below is one where someone loses their whole history.
 *
 * scrypt at N=2^15 is deliberately slow, so these use reduced parameters where the
 * cost is not what is being tested.
 *
 * Run: deno test tests/
 */
import { assertEquals, assertRejects } from 'jsr:@std/assert@^1.0.0';

import {
  WrongPassphraseError,
  decrypt,
  encrypt,
  fromBase64,
  normalisePassphrase,
  toBase64,
} from '../src/features/backup/crypto.ts';
import {
  BACKUP_MAGIC,
  UnreadableBackupError,
  backupFilename,
  packBackup,
  unpackBackup,
} from '../src/features/backup/format.ts';
import type { BackupContents } from '../src/features/backup/format.ts';

/** Deterministic bytes — the tests assert on behaviour, not on entropy. */
const testRandom = (length: number) =>
  Uint8Array.from({ length }, (_, i) => (i * 7 + 13) % 256);

/** Real randomness, for the test that entropy is actually used. */
const realRandom = (length: number) => crypto.getRandomValues(new Uint8Array(length));

const FAST = { N: 1024, r: 8, p: 1 };

const SAMPLE: BackupContents = {
  categories: [
    { id: 'c1', name: 'Groceries', color_token: 'sage', icon: null, is_system: true },
    { id: 'c2', name: 'Eating out', color_token: 'plum', icon: null, is_system: true },
  ],
  expenses: [
    {
      id: 'e1',
      amount_cents: 77_390,
      currency: 'EUR',
      merchant: 'Konzum',
      description: null,
      occurred_on: '2026-09-14',
      category_id: 'c1',
      source: 'pdf',
      confidence: 0.96,
      needs_review: false,
      created_at: '2026-09-14T10:00:00.000Z',
    },
  ],
  goals: [
    {
      id: 'g1',
      name: 'Trip to Vis',
      target_cents: 120_000,
      saved_cents: 46_500,
      target_date: null,
      created_at: '2026-09-01T10:00:00.000Z',
    },
  ],
};

Deno.test('a backup round-trips exactly', async () => {
  const file = await packBackup(SAMPLE, 'correct horse battery staple', testRandom);
  const restored = await unpackBackup(file, 'correct horse battery staple');
  assertEquals(restored, SAMPLE);
});

Deno.test('integer cents survive the round trip', async () => {
  // The whole app depends on these never becoming floats.
  const file = await packBackup(SAMPLE, 'pw', testRandom);
  const restored = await unpackBackup(file, 'pw');
  assertEquals(restored.expenses[0].amount_cents, 77_390);
  assertEquals(Number.isInteger(restored.expenses[0].amount_cents), true);
});

Deno.test('the wrong passphrase is rejected, not silently mangled', async () => {
  const file = await packBackup(SAMPLE, 'the right one', testRandom);
  await assertRejects(
    () => unpackBackup(file, 'the wrong one'),
    WrongPassphraseError
  );
});

Deno.test('spending data never appears in the clear', async () => {
  const file = await packBackup(SAMPLE, 'pw', testRandom);
  // The envelope may say a backup exists; it must not say what is in it.
  assertEquals(file.includes('Konzum'), false);
  assertEquals(file.includes('77390'), false);
  assertEquals(file.includes('Trip to Vis'), false);
  assertEquals(file.includes('Groceries'), false);
  // But it must remain self-describing enough for a future version to read.
  assertEquals(file.includes(BACKUP_MAGIC), true);
  assertEquals(file.includes('scrypt'), true);
});

Deno.test('a tampered payload fails the authentication tag', async () => {
  const file = await packBackup(SAMPLE, 'pw', testRandom);
  const envelope = JSON.parse(file);

  // Flip one bit of ciphertext.
  const bytes = fromBase64(envelope.data);
  bytes[0] ^= 0x01;
  envelope.data = toBase64(bytes);

  await assertRejects(
    () => unpackBackup(JSON.stringify(envelope), 'pw'),
    WrongPassphraseError
  );
});

Deno.test('a truncated file fails rather than importing a fragment', async () => {
  const file = await packBackup(SAMPLE, 'pw', testRandom);
  await assertRejects(() => unpackBackup(file.slice(0, file.length / 2), 'pw'));
});

Deno.test('a file that is not a backup is refused by name', async () => {
  await assertRejects(
    () => unpackBackup(JSON.stringify({ some: 'other json' }), 'pw'),
    UnreadableBackupError
  );
  await assertRejects(() => unpackBackup('not json at all', 'pw'), UnreadableBackupError);
});

Deno.test('a newer backup format is refused with an actionable message', async () => {
  const file = await packBackup(SAMPLE, 'pw', testRandom);
  const envelope = JSON.parse(file);
  envelope.version = 99;

  const error = await assertRejects(
    () => unpackBackup(JSON.stringify(envelope), 'pw'),
    UnreadableBackupError
  );
  assertEquals(error.message.includes('newer version'), true);
});

Deno.test('the KDF parameters in the file are the ones used to decrypt', async () => {
  // A future release may raise N. Old backups must still open, which only works
  // because the parameters are read from the envelope rather than assumed.
  const payload = await encrypt('hello', 'pw', testRandom, FAST);

  // The same parameters open it.
  assertEquals(await decrypt(payload, 'pw', FAST), 'hello');

  // A different cost derives a different key, so it must not.
  await assertRejects(
    () => decrypt(payload, 'pw', { N: 2048, r: 8, p: 1 }),
    WrongPassphraseError
  );
});

Deno.test('an accented passphrase normalises to one key', async () => {
  // "šoldi" typed two ways: precomposed vs combining caron. Without NFKC these
  // derive different keys and lock the user out of their own backup.
  const precomposed: string = '\u0161oldi'; // s-caron as one code point
  const decomposed: string = 's\u030Coldi'; // s + combining caron
  assertEquals(precomposed === decomposed, false);
  assertEquals(normalisePassphrase(precomposed), normalisePassphrase(decomposed));

  const file = await packBackup(SAMPLE, precomposed, testRandom);
  const restored = await unpackBackup(file, decomposed);
  assertEquals(restored.expenses.length, 1);
});

Deno.test('salt and nonce differ between two backups of the same data', async () => {
  const a = JSON.parse(await packBackup(SAMPLE, 'pw', realRandom));
  const b = JSON.parse(await packBackup(SAMPLE, 'pw', realRandom));
  assertEquals(a.salt === b.salt, false);
  assertEquals(a.nonce === b.nonce, false);
  // And therefore the ciphertexts differ too.
  assertEquals(a.data === b.data, false);
});

Deno.test('an empty database still produces a restorable backup', async () => {
  const empty: BackupContents = { categories: [], expenses: [], goals: [] };
  const file = await packBackup(empty, 'pw', testRandom);
  assertEquals(await unpackBackup(file, 'pw'), empty);
});

Deno.test('the filename is dated and sorts naturally', () => {
  assertEquals(
    backupFilename(new Date('2026-09-06T12:00:00Z')),
    'sholdi-backup-2026-09-06.json'
  );
});

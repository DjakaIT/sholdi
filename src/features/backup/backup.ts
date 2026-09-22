/**
 * Export and import. The user's escape hatch.
 *
 * Local-first means losing the phone loses the history, so a backup is not a nicety
 * here — it is the thing that makes local-first survivable. It is also the only
 * moment the whole database exists as one portable file, which is why it is
 * encrypted with a passphrase the user chooses (see crypto.ts).
 *
 * The passphrase is never stored. If it is lost, the backup is gone — and the UI has
 * to say so plainly before the user picks one.
 */
import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import { getDatabase, newId } from '@/lib/db';
import { backupFilename, packBackup, unpackBackup } from './format';
import type { BackupContents } from './format';
import { secureRandomBytes } from './random';

/** Read the whole database into the backup shape. */
export async function readAllForBackup(): Promise<BackupContents> {
  const db = await getDatabase();

  const categories = await db.getAllAsync<{
    id: string;
    name: string;
    color_token: string;
    icon: string | null;
    is_system: number;
  }>('SELECT id, name, color_token, icon, is_system FROM categories');

  const expenses = await db.getAllAsync<{
    id: string;
    amount_cents: number;
    currency: string;
    merchant: string | null;
    description: string | null;
    occurred_on: string;
    category_id: string | null;
    source: string;
    confidence: number | null;
    needs_review: number;
    created_at: string;
  }>(
    `SELECT id, amount_cents, currency, merchant, description, occurred_on,
            category_id, source, confidence, needs_review, created_at
       FROM expenses`
  );

  const goals = await db.getAllAsync<{
    id: string;
    name: string;
    target_cents: number;
    saved_cents: number;
    target_date: string | null;
    created_at: string;
  }>('SELECT id, name, target_cents, saved_cents, target_date, created_at FROM goals');

  return {
    categories: categories.map((c) => ({ ...c, is_system: c.is_system === 1 })),
    expenses: expenses.map((e) => ({ ...e, needs_review: e.needs_review === 1 })),
    goals,
  };
}

/**
 * Write an encrypted backup and hand it to the share sheet.
 *
 * The file is written to the cache directory, not documents: once the user has sent
 * it somewhere, an unencrypted-at-rest copy sitting in the app's own storage is a
 * liability, and the cache is what the OS is free to reclaim. (It is encrypted
 * either way — this just avoids keeping a second copy around indefinitely.)
 */
export async function exportBackup(passphrase: string): Promise<string> {
  const contents = await readAllForBackup();
  const fileContents = await packBackup(contents, passphrase, secureRandomBytes);

  const file = new File(Paths.cache, backupFilename());
  if (file.exists) file.delete();
  file.create();
  file.write(fileContents);

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(file.uri, {
      mimeType: 'application/json',
      dialogTitle: 'Save your Sholdi backup',
      UTI: 'public.json',
    });
  }

  return file.uri;
}

/** The user backed out of the file picker. Not an error worth alarming them about. */
export class BackupCanceledError extends Error {
  constructor() {
    super('No file chosen');
  }
}

export type ImportMode =
  /** Wipe what is here and restore the backup exactly. For a new phone. */
  | 'replace'
  /** Keep what is here and add anything missing. For recovering a partial loss. */
  | 'merge';

export type ImportResult = {
  categoriesAdded: number;
  expensesAdded: number;
  expensesSkipped: number;
  goalsAdded: number;
};

/**
 * Restore from a file the user picks.
 *
 * `merge` matches on row id, which a backup preserves. Restoring the same backup
 * twice must not double a history, and id equality settles that exactly — no
 * heuristic, and no risk of collapsing two genuinely identical purchases (§7).
 */
export async function importBackup(
  passphrase: string,
  mode: ImportMode = 'replace'
): Promise<ImportResult> {
  const picked = await File.pickFileAsync({ mimeTypes: ['application/json'] });
  if (picked.canceled || !picked.result) throw new BackupCanceledError();

  const fileContents = await picked.result.text();
  const contents = await unpackBackup(fileContents, passphrase);

  return await restore(contents, mode);
}

/** Split out from the picker so it can be driven directly by a test or a fixture. */
export async function restore(
  contents: BackupContents,
  mode: ImportMode
): Promise<ImportResult> {
  const db = await getDatabase();
  const result: ImportResult = {
    categoriesAdded: 0,
    expensesAdded: 0,
    expensesSkipped: 0,
    goalsAdded: 0,
  };

  await db.withTransactionAsync(async () => {
    if (mode === 'replace') {
      // Order matters: expenses reference categories.
      await db.execAsync(`
        DELETE FROM expenses;
        DELETE FROM goals;
        DELETE FROM categories;
      `);
    }

    // Categories first, and keep their original ids so expenses still point at them.
    for (const category of contents.categories) {
      const existing = await db.getFirstAsync<{ id: string }>(
        'SELECT id FROM categories WHERE id = ? OR name = ? LIMIT 1',
        [category.id, category.name]
      );
      if (existing) continue;

      await db.runAsync(
        `INSERT INTO categories (id, name, color_token, icon, is_system, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          category.id,
          category.name,
          category.color_token,
          category.icon,
          category.is_system ? 1 : 0,
          new Date().toISOString(),
        ]
      );
      result.categoriesAdded += 1;
    }

    for (const expense of contents.expenses) {
      if (mode === 'merge') {
        // Match on id, not on date + amount + merchant.
        //
        // ARCHITECTURE.md §7: "two identical €6,70 canteen lunches on the same day
        // are two real purchases" — that tuple silently deletes the second one. A
        // backup carries the original ids, so identity here is exact and needs no
        // heuristic at all.
        const duplicate = await db.getFirstAsync<{ id: string }>(
          'SELECT id FROM expenses WHERE id = ? LIMIT 1',
          [expense.id]
        );
        if (duplicate) {
          result.expensesSkipped += 1;
          continue;
        }
      }

      await db.runAsync(
        `INSERT OR IGNORE INTO expenses
           (id, amount_cents, currency, merchant, description, occurred_on,
            category_id, source, confidence, import_id, needs_review, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)`,
        [
          expense.id || newId(),
          Math.trunc(expense.amount_cents),
          expense.currency,
          expense.merchant,
          expense.description,
          expense.occurred_on,
          expense.category_id,
          expense.source,
          expense.confidence,
          expense.needs_review ? 1 : 0,
          expense.created_at,
        ]
      );
      result.expensesAdded += 1;
    }

    for (const goal of contents.goals) {
      await db.runAsync(
        `INSERT OR IGNORE INTO goals
           (id, name, target_cents, saved_cents, target_date, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          goal.id || newId(),
          goal.name,
          goal.target_cents,
          goal.saved_cents,
          goal.target_date,
          goal.created_at,
        ]
      );
      result.goalsAdded += 1;
    }
  });

  return result;
}

/** Where a backup lands if sharing is unavailable. Surfaced so the UI can say so. */
export function backupDirectory(): Directory {
  return Paths.cache;
}

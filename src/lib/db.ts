/**
 * On-device database. This is where every expense lives, and the only place.
 *
 * ── Departure from ARCHITECTURE.md §3, deliberate and decided ──────────────────
 * §3 puts expenses in Supabase Postgres with RLS. They now live in SQLite on the
 * phone instead. Nothing about a user's spending history is uploaded anywhere.
 *
 * What that changes:
 *  - No `user_id` column and no RLS. There is one user per database — the person
 *    holding the phone — so there is nobody to isolate rows from.
 *  - No auth, no Storage buckets, no pg_cron.
 *  - Insights are computed here rather than by a weekly server job.
 *
 * What it does NOT change: a statement PDF still reaches Anthropic in order to be
 * read, via a stateless Edge Function that stores nothing. That is the one piece of
 * data that must leave the device, and only while it is being processed.
 *
 * Everything §3 got right is kept: money is integer cents, `occurred_on` is a plain
 * 'YYYY-MM-DD' string so a purchase on the 31st cannot become the 1st (§7), and the
 * indexes match the queries (user+month becomes just month).
 */
import * as SQLite from 'expo-sqlite';

import { defaultCategoryColors } from '@/theme/tokens';

const DATABASE_NAME = 'sholdi.db';

/**
 * Bumped whenever the schema changes. SQLite's own `user_version` pragma tracks
 * which migrations a given phone has already run — the local equivalent of the
 * migrations folder, and just as strictly ordered.
 */
const SCHEMA_VERSION = 1;

let database: SQLite.SQLiteDatabase | null = null;

/** Open (and migrate) the database. Safe to call repeatedly. */
export async function getDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (database) return database;

  const db = await SQLite.openDatabaseAsync(DATABASE_NAME);
  await migrate(db);
  database = db;
  return db;
}

async function migrate(db: SQLite.SQLiteDatabase): Promise<void> {
  // WAL keeps reads from blocking writes — the import screen writes 47 rows while
  // the list behind it is still being read.
  await db.execAsync('PRAGMA journal_mode = WAL;');
  await db.execAsync('PRAGMA foreign_keys = ON;');

  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version;');
  const current = row?.user_version ?? 0;

  if (current >= SCHEMA_VERSION) return;

  if (current < 1) {
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS categories (
        id          TEXT PRIMARY KEY NOT NULL,
        name        TEXT NOT NULL UNIQUE,
        color_token TEXT NOT NULL,
        icon        TEXT,
        is_system   INTEGER NOT NULL DEFAULT 0,
        created_at  TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS imports (
        id            TEXT PRIMARY KEY NOT NULL,
        source_type   TEXT NOT NULL,
        status        TEXT NOT NULL DEFAULT 'uploaded',
        period_start  TEXT,
        period_end    TEXT,
        expense_count INTEGER,
        error         TEXT,
        created_at    TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS expenses (
        id           TEXT PRIMARY KEY NOT NULL,
        amount_cents INTEGER NOT NULL,
        currency     TEXT NOT NULL DEFAULT 'EUR',
        merchant     TEXT,
        description  TEXT,
        occurred_on  TEXT NOT NULL,
        category_id  TEXT REFERENCES categories(id) ON DELETE SET NULL,
        source       TEXT NOT NULL,
        confidence   REAL,
        import_id    TEXT REFERENCES imports(id) ON DELETE SET NULL,
        needs_review INTEGER NOT NULL DEFAULT 0,
        created_at   TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS insights (
        id            TEXT PRIMARY KEY NOT NULL,
        kind          TEXT NOT NULL,
        title         TEXT NOT NULL,
        body          TEXT NOT NULL,
        category_id   TEXT REFERENCES categories(id) ON DELETE SET NULL,
        payload       TEXT,
        status        TEXT NOT NULL DEFAULT 'pending',
        deliver_after TEXT NOT NULL,
        created_at    TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS goals (
        id           TEXT PRIMARY KEY NOT NULL,
        name         TEXT NOT NULL,
        target_cents INTEGER NOT NULL,
        saved_cents  INTEGER NOT NULL DEFAULT 0,
        target_date  TEXT,
        created_at   TEXT NOT NULL
      );

      -- The app queries by month, and by category within a month.
      CREATE INDEX IF NOT EXISTS expenses_occurred_idx
        ON expenses (occurred_on DESC);
      CREATE INDEX IF NOT EXISTS expenses_category_occurred_idx
        ON expenses (category_id, occurred_on);
      CREATE INDEX IF NOT EXISTS expenses_import_idx
        ON expenses (import_id);
      -- Supports the duplicate check in §7. Not unique: two identical coffees on one
      -- day at one merchant are real, so dedup is a lookup, not a constraint.
      CREATE INDEX IF NOT EXISTS expenses_dedupe_idx
        ON expenses (occurred_on, amount_cents, merchant);
      CREATE INDEX IF NOT EXISTS insights_deliver_idx
        ON insights (deliver_after DESC);
    `);

    await seedSystemCategories(db);
  }

  await db.execAsync(`PRAGMA user_version = ${SCHEMA_VERSION};`);
}

/**
 * The five categories from DESIGN.md §4.3, created on first launch.
 *
 * This is the promise in §1 — "you never set it up manually" — made literal. A new
 * user opens the app to a working set of categories, not an empty screen asking
 * them to build one.
 */
async function seedSystemCategories(db: SQLite.SQLiteDatabase): Promise<void> {
  const now = new Date().toISOString();

  for (const [name, colorToken] of Object.entries(defaultCategoryColors)) {
    await db.runAsync(
      `INSERT OR IGNORE INTO categories (id, name, color_token, is_system, created_at)
       VALUES (?, ?, ?, 1, ?)`,
      [newId(), name, colorToken, now]
    );
  }
}

/**
 * Identifiers. `crypto.randomUUID` is available in Hermes on SDK 57; the fallback
 * keeps this usable anywhere else without pulling in a uuid dependency.
 */
export function newId(): string {
  const cryptoRef = globalThis.crypto as Crypto | undefined;
  if (cryptoRef?.randomUUID) return cryptoRef.randomUUID();

  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/** Wipe everything. The user's data is theirs to delete, on device, immediately. */
export async function deleteAllData(): Promise<void> {
  const db = await getDatabase();
  await db.execAsync(`
    DELETE FROM expenses;
    DELETE FROM imports;
    DELETE FROM insights;
    DELETE FROM goals;
    DELETE FROM categories;
  `);
  await seedSystemCategories(db);
}

/** Test seam: forget the cached handle so a fresh one is opened next time. */
export function resetDatabaseHandle(): void {
  database = null;
}

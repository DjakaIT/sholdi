/**
 * Every read and write of spending data. All of it local.
 *
 * This replaces what ARCHITECTURE.md §3 put in Postgres, including the
 * `monthly_category_totals` view — `getMonthTotals` below is that aggregation,
 * computed by SQLite instead. §3's instruction still holds in spirit: the Index
 * mosaic reads an aggregate, never the raw expense table.
 *
 * Money is integer cents in and out. Dates are 'YYYY-MM' or 'YYYY-MM-DD' strings.
 */
import { monthRange } from '@/lib/dates';
import { getDatabase, newId } from '@/lib/db';
import { leastUsedCategoryColor } from '@/theme/categoryColors';
import type { CategoryColorToken, DisplayColorToken } from '@/theme/categoryColors';
import type { Category, Expense, ExpenseSource, ExtractedExpense } from './types';

type CategoryRow = {
  id: string;
  name: string;
  color_token: string;
  icon: string | null;
  is_system: number;
};

export async function listCategories(): Promise<Category[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<CategoryRow>(
    'SELECT id, name, color_token, icon, is_system FROM categories ORDER BY name'
  );

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    color_token: row.color_token as CategoryColorToken,
    icon: row.icon,
    // SQLite has no boolean; 0/1 comes back as a number.
    is_system: row.is_system === 1,
  }));
}

export type MonthCategoryTotal = {
  categoryId: string | null;
  name: string;
  colorToken: DisplayColorToken;
  cents: number;
  expenseCount: number;
};

/**
 * Totals per category for one month, largest first.
 *
 * 'YYYY-MM' is matched with a prefix comparison on `occurred_on` rather than a date
 * function, so the index is usable and no timezone is ever consulted.
 */
export async function getMonthTotals(
  month: string,
  /** Only the first N days — for comparing against a month still in progress. */
  throughDay?: number
): Promise<MonthCategoryTotal[]> {
  const db = await getDatabase();

  const rows = await db.getAllAsync<{
    category_id: string | null;
    name: string | null;
    color_token: string | null;
    total_cents: number;
    expense_count: number;
  }>(
    `SELECT e.category_id            AS category_id,
            c.name                   AS name,
            c.color_token            AS color_token,
            SUM(e.amount_cents)      AS total_cents,
            COUNT(*)                 AS expense_count
       FROM expenses e
       LEFT JOIN categories c ON c.id = e.category_id
      WHERE e.occurred_on >= ? AND e.occurred_on <= ?
      GROUP BY e.category_id, c.name, c.color_token
      ORDER BY total_cents DESC`,
    monthRange(month, throughDay)
  );

  return rows.map((row) => ({
    categoryId: row.category_id,
    name: row.name ?? 'Uncategorised',
    // Unsorted spending gets no colour of its own (see categoryColors.ts).
    colorToken: row.category_id ? ((row.color_token ?? 'none') as DisplayColorToken) : 'none',
    cents: row.total_cents,
    expenseCount: row.expense_count,
  }));
}

/** Total spent in a month, in cents. */
export async function getMonthTotal(month: string, throughDay?: number): Promise<number> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ total: number | null }>(
    `SELECT SUM(amount_cents) AS total FROM expenses
      WHERE occurred_on >= ? AND occurred_on <= ?`,
    monthRange(month, throughDay)
  );
  return row?.total ?? 0;
}

/** Monthly totals for the last `count` months ending at `month`. Drives the sparkline. */
export async function getTrailingTotals(month: string, count: number): Promise<number[]> {
  const months: string[] = [];
  let cursor = month;
  for (let i = 0; i < count; i += 1) {
    months.unshift(cursor);
    cursor = previousMonthKey(cursor);
  }

  const totals: number[] = [];
  for (const m of months) totals.push(await getMonthTotal(m));
  return totals;
}

export async function listExpenses(month: string): Promise<Expense[]> {
  const db = await getDatabase();
  // SQLite returns needs_review as 0/1, so the row type differs from the domain type.
  const rows = await db.getAllAsync<Omit<Expense, 'needs_review'> & { needs_review: number }>(
    `SELECT id, amount_cents, currency, merchant, description, occurred_on,
            category_id, source, confidence, import_id, needs_review, created_at
       FROM expenses
      WHERE occurred_on >= ? AND occurred_on <= ?
      ORDER BY occurred_on DESC, created_at DESC`,
    [`${month}-01`, `${month}-31`]
  );

  return rows.map((row) => ({ ...row, needs_review: row.needs_review === 1 }));
}

export type NewExpense = {
  amountCents: number;
  currency?: string;
  merchant?: string | null;
  description?: string | null;
  /** 'YYYY-MM-DD'. */
  occurredOn: string;
  categoryId?: string | null;
  source: ExpenseSource;
  confidence?: number | null;
  importId?: string | null;
  needsReview?: boolean;
};

export async function insertExpense(expense: NewExpense): Promise<string> {
  const db = await getDatabase();
  const id = newId();

  await db.runAsync(
    `INSERT INTO expenses
       (id, amount_cents, currency, merchant, description, occurred_on,
        category_id, source, confidence, import_id, needs_review, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      Math.trunc(expense.amountCents),
      expense.currency ?? 'EUR',
      expense.merchant ?? null,
      expense.description ?? null,
      expense.occurredOn,
      expense.categoryId ?? null,
      expense.source,
      expense.confidence ?? null,
      expense.importId ?? null,
      expense.needsReview ? 1 : 0,
      new Date().toISOString(),
    ]
  );

  return id;
}

/**
 * Bulk import, in one transaction. This is the "Import all 47" button.
 *
 * §7 warns a user will upload the same statement twice, so rows matching an
 * existing (occurred_on, amount_cents, merchant) are skipped. Returns what was
 * written and what was recognised as a duplicate, because silently dropping rows on
 * the screen that promises "47 expenses found" would be its own bug.
 */
export async function importExpenses(
  rows: (ExtractedExpense & { categoryId: string | null; needsReview: boolean })[],
  importId: string | null,
  source: ExpenseSource = 'pdf'
): Promise<{ inserted: number; duplicates: number }> {
  const db = await getDatabase();
  let inserted = 0;
  let duplicates = 0;

  await db.withTransactionAsync(async () => {
    for (const row of rows) {
      const existing = await db.getFirstAsync<{ id: string }>(
        `SELECT id FROM expenses
          WHERE occurred_on = ? AND amount_cents = ? AND merchant IS ?
          LIMIT 1`,
        [row.occurred_on, Math.trunc(row.amount_cents), row.merchant]
      );

      if (existing) {
        duplicates += 1;
        continue;
      }

      await db.runAsync(
        `INSERT INTO expenses
           (id, amount_cents, currency, merchant, description, occurred_on,
            category_id, source, confidence, import_id, needs_review, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          newId(),
          Math.trunc(row.amount_cents),
          row.currency,
          row.merchant,
          row.description,
          row.occurred_on,
          row.categoryId,
          source,
          row.confidence,
          importId,
          row.needsReview ? 1 : 0,
          new Date().toISOString(),
        ]
      );
      inserted += 1;
    }
  });

  return { inserted, duplicates };
}

/** One month's expenses in one category — or with none, when `categoryId` is null. */
export async function listExpensesInCategory(
  month: string,
  categoryId: string | null
): Promise<Expense[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<Omit<Expense, 'needs_review'> & { needs_review: number }>(
    `SELECT id, amount_cents, currency, merchant, description, occurred_on,
            category_id, source, confidence, import_id, needs_review, created_at
       FROM expenses
      WHERE occurred_on >= ? AND occurred_on <= ? AND category_id IS ?
      ORDER BY occurred_on DESC, created_at DESC`,
    [`${month}-01`, `${month}-31`, categoryId]
  );
  return rows.map((row) => ({ ...row, needs_review: row.needs_review === 1 }));
}

/**
 * Put one expense in a category, and every UNSORTED expense from the same merchant
 * with it.
 *
 * Sorting a statement one row at a time is the chore that makes people stop
 * sorting. Muller appears six times in a month; the user should have to say what
 * Muller is once. Only rows with no category are swept up — a row someone already
 * placed deliberately is never moved by a decision about a different row.
 *
 * Merchant identity is the normalised key from merchant memory, so "MULLER 4983
 * ZAGREB 2" and "Muller" are the same shop. Returns how many rows changed in all.
 */
export async function setCategoryForMerchant(
  expenseId: string,
  categoryId: string | null,
  sameMerchant: (merchant: string | null) => boolean
): Promise<number> {
  const db = await getDatabase();

  const unsorted = await db.getAllAsync<{ id: string; merchant: string | null }>(
    'SELECT id, merchant FROM expenses WHERE category_id IS NULL AND id != ?',
    [expenseId]
  );
  const alsoIds = categoryId === null ? [] : unsorted.filter((r) => sameMerchant(r.merchant)).map((r) => r.id);

  await db.withTransactionAsync(async () => {
    await db.runAsync('UPDATE expenses SET category_id = ?, needs_review = 0 WHERE id = ?', [
      categoryId,
      expenseId,
    ]);
    for (const id of alsoIds) {
      await db.runAsync('UPDATE expenses SET category_id = ?, needs_review = 0 WHERE id = ?', [
        categoryId,
        id,
      ]);
    }
  });

  return 1 + alsoIds.length;
}

export async function updateExpenseCategory(
  expenseId: string,
  categoryId: string | null
): Promise<void> {
  const db = await getDatabase();
  await db.runAsync('UPDATE expenses SET category_id = ? WHERE id = ?', [categoryId, expenseId]);
}

export async function deleteExpense(expenseId: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync('DELETE FROM expenses WHERE id = ?', [expenseId]);
}

/**
 * Create a category, or return the one that already has this name.
 *
 * The colour is assigned by cycling the fixed palette (§4.3: "never expose a free
 * colour picker"). Names are unique regardless of case, so "groceries" typed on the
 * review screen lands on the existing Groceries rather than creating a twin.
 */
export async function createCategory(rawName: string): Promise<Category> {
  const name = rawName.trim().replace(/\s+/g, ' ');
  if (!name) throw new Error('Give the category a name.');
  if (name.length > 32) throw new Error('Keep the name under 32 characters.');

  const db = await getDatabase();

  const existing = await db.getFirstAsync<CategoryRow>(
    'SELECT id, name, color_token, icon, is_system FROM categories WHERE lower(name) = lower(?) LIMIT 1',
    [name]
  );
  if (existing) {
    return {
      id: existing.id,
      name: existing.name,
      color_token: existing.color_token as CategoryColorToken,
      icon: existing.icon,
      is_system: existing.is_system === 1,
    };
  }

  const used = await db.getAllAsync<{ color_token: string }>('SELECT color_token FROM categories');
  const colorToken = leastUsedCategoryColor(used.map((u) => u.color_token));
  const id = newId();

  await db.runAsync(
    `INSERT INTO categories (id, name, color_token, is_system, created_at)
     VALUES (?, ?, ?, 0, ?)`,
    [id, name, colorToken, new Date().toISOString()]
  );

  return { id, name, color_token: colorToken, icon: null, is_system: false };
}

/** True once anything at all has been recorded. Decides first-run empty states. */
export async function hasAnyExpenses(): Promise<boolean> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ one: number }>('SELECT 1 AS one FROM expenses LIMIT 1');
  return Boolean(row);
}

export type MonthFacts = {
  purchaseCount: number;
  /** Days in the month that had at least one purchase. */
  activeDays: number;
  largest: { merchant: string | null; cents: number; occurredOn: string } | null;
};

/** The handful of plain facts the Stats screen reports about one month. */
export async function getMonthFacts(month: string): Promise<MonthFacts> {
  const db = await getDatabase();
  const range = [`${month}-01`, `${month}-31`];

  const counts = await db.getFirstAsync<{ purchases: number; days: number }>(
    `SELECT COUNT(*) AS purchases, COUNT(DISTINCT occurred_on) AS days
       FROM expenses WHERE occurred_on >= ? AND occurred_on <= ?`,
    range
  );

  const largest = await db.getFirstAsync<{
    merchant: string | null;
    amount_cents: number;
    occurred_on: string;
  }>(
    `SELECT merchant, amount_cents, occurred_on FROM expenses
      WHERE occurred_on >= ? AND occurred_on <= ?
      ORDER BY amount_cents DESC, occurred_on DESC
      LIMIT 1`,
    range
  );

  return {
    purchaseCount: counts?.purchases ?? 0,
    activeDays: counts?.days ?? 0,
    largest: largest
      ? { merchant: largest.merchant, cents: largest.amount_cents, occurredOn: largest.occurred_on }
      : null,
  };
}

export type Goal = { id: string; name: string; targetCents: number; savedCents: number };

export async function listGoals(): Promise<Goal[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<{
    id: string;
    name: string;
    target_cents: number;
    saved_cents: number;
  }>('SELECT id, name, target_cents, saved_cents FROM goals ORDER BY created_at');
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    targetCents: r.target_cents,
    savedCents: r.saved_cents,
  }));
}

export type StoredInsight = {
  id: string;
  kind: string;
  title: string;
  body: string;
  createdAt: string;
};

/** Notes Sholdi has written, newest first. Nothing invents them; they are stored. */
export async function listInsights(): Promise<StoredInsight[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<{
    id: string;
    kind: string;
    title: string;
    body: string;
    created_at: string;
  }>(
    `SELECT id, kind, title, body, created_at FROM insights
      WHERE status != 'dismissed'
      ORDER BY deliver_after DESC
      LIMIT 3`
  );
  return rows.map((r) => ({
    id: r.id,
    kind: r.kind,
    title: r.title,
    body: r.body,
    createdAt: r.created_at,
  }));
}

export async function dismissInsight(insightId: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(`UPDATE insights SET status = 'dismissed' WHERE id = ?`, [insightId]);
}

/** 'YYYY-MM' -> the month before it. Kept here so the SQL layer needs no date lib. */
function previousMonthKey(month: string): string {
  const year = Number(month.slice(0, 4));
  const index = Number(month.slice(5, 7));
  if (index === 1) return `${year - 1}-12`;
  return `${year}-${String(index - 1).padStart(2, '0')}`;
}

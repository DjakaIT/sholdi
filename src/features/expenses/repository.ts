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
import { getDatabase, newId } from '@/lib/db';
import type { CategoryColorToken } from '@/theme/categoryColors';
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
  colorToken: CategoryColorToken;
  cents: number;
  expenseCount: number;
};

/**
 * Totals per category for one month, largest first.
 *
 * 'YYYY-MM' is matched with a prefix comparison on `occurred_on` rather than a date
 * function, so the index is usable and no timezone is ever consulted.
 */
export async function getMonthTotals(month: string): Promise<MonthCategoryTotal[]> {
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
    [`${month}-01`, `${month}-31`]
  );

  return rows.map((row) => ({
    categoryId: row.category_id,
    name: row.name ?? 'Uncategorised',
    colorToken: (row.color_token ?? 'sage') as CategoryColorToken,
    cents: row.total_cents,
    expenseCount: row.expense_count,
  }));
}

/** Total spent in a month, in cents. */
export async function getMonthTotal(month: string): Promise<number> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ total: number | null }>(
    `SELECT SUM(amount_cents) AS total FROM expenses
      WHERE occurred_on >= ? AND occurred_on <= ?`,
    [`${month}-01`, `${month}-31`]
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

/** 'YYYY-MM' -> the month before it. Kept here so the SQL layer needs no date lib. */
function previousMonthKey(month: string): string {
  const year = Number(month.slice(0, 4));
  const index = Number(month.slice(5, 7));
  if (index === 1) return `${year - 1}-12`;
  return `${year}-${String(index - 1).padStart(2, '0')}`;
}

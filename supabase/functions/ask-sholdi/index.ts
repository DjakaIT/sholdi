/**
 * ask-sholdi — a question about your spending. ARCHITECTURE.md §4.5.
 *
 * THE RULE THIS FILE EXISTS TO KEEP: the model is sent an aggregated summary —
 * monthly totals per category, trends, goals — and never the expense table. §4.5:
 * "Cheaper, faster, and less personal data in flight." The summary is built from the
 * `monthly_category_totals` view, so individual merchants and dates never leave the
 * database.
 *
 * Input:  { "question": "how am I doing on eating out?" }
 * Output: { "answer": "..." }
 */
import { anthropic, DEFAULT_MAX_TOKENS, EXTRACTION_MODEL } from '../_shared/anthropic.ts';
import { HttpError, json, requireCaller, serveJson } from '../_shared/auth.ts';
import type { Caller } from '../_shared/auth.ts';

/** How many months of aggregates to send. Enough to see a trend, small enough to cache. */
const MONTHS_OF_HISTORY = 6;

const MAX_QUESTION_LENGTH = 500;

/**
 * Sholdi's voice, straight from DESIGN.md §7. These constraints are not decoration:
 * the app's whole promise is that it observes without nagging, and the model is the
 * one writing the words.
 */
const SYSTEM = `You are Sholdi. You answer questions about the user's own spending.

Voice:
- Calm, brief, on the user's side. You observe; you do not instruct.
- Lead with the win. Mention what got better before what could improve.
- Never moralise. "No judgement, just worth a glance" is the register.
- Credit the user, not yourself. Say "nice work", never "you followed our advice".
- Active voice, sentence case, plain verbs.
- Two or three sentences. This is a conversation, not a report.

Never write: "AI", "smart", "powered by", "insights engine", exclamation marks, or
emoji.

You are given aggregated monthly totals only — never individual transactions. If a
question needs transaction-level detail you do not have, say so plainly and answer
what you can from the totals. Never invent a number: every figure you give must come
from the data below.

Amounts are in cents. Write them as euros, e.g. 38815 is "€388".`;

Deno.serve(
  serveJson(async (req) => {
    const caller = await requireCaller(req);

    const body = await req.json().catch(() => ({}));
    const question = typeof body.question === 'string' ? body.question.trim() : '';
    if (!question) throw new HttpError(400, 'Ask a question');
    if (question.length > MAX_QUESTION_LENGTH) {
      throw new HttpError(400, 'That question is a bit long. Try a shorter one.');
    }

    const summary = await buildSummary(caller);

    const response = await anthropic.messages.create({
      model: EXTRACTION_MODEL,
      max_tokens: DEFAULT_MAX_TOKENS,
      system: SYSTEM,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: `Here is the user's spending summary:\n\n${summary}\n\nQuestion: ${question}`,
            },
          ],
        },
      ],
    });

    const answer = response.content
      .filter((block) => block.type === 'text')
      .map((block) => (block.type === 'text' ? block.text : ''))
      .join('')
      .trim();

    if (!answer) throw new HttpError(502, 'Sholdi had nothing to say. Try asking again.');

    return json({ answer });
  })
);

/**
 * Build the aggregate. Reads the view, not the expense table — RLS scopes both to
 * the caller, but only one of them contains merchants and dates.
 */
async function buildSummary(caller: Caller): Promise<string> {
  const { data: totals, error } = await caller.supabase
    .from('monthly_category_totals')
    .select('month, category_name, total_cents, expense_count')
    .order('month', { ascending: false })
    .limit(MONTHS_OF_HISTORY * 20);

  if (error) throw new HttpError(500, `Could not read your totals: ${error.message}`);

  const { data: goals } = await caller.supabase
    .from('goals')
    .select('name, target_cents, saved_cents, target_date');

  type Row = {
    month: string;
    category_name: string | null;
    total_cents: number;
    expense_count: number;
  };

  const byMonth = new Map<string, Row[]>();
  for (const row of (totals ?? []) as Row[]) {
    const key = row.month.slice(0, 7);
    if (!byMonth.has(key)) byMonth.set(key, []);
    byMonth.get(key)!.push(row);
  }

  const months = [...byMonth.keys()].sort().reverse().slice(0, MONTHS_OF_HISTORY);
  if (months.length === 0) return 'The user has no spending recorded yet.';

  const lines: string[] = [];
  for (const month of months) {
    const rows = byMonth.get(month) ?? [];
    const monthTotal = rows.reduce((sum, row) => sum + row.total_cents, 0);
    lines.push(`${month} — total ${monthTotal} cents across ${rows.length} categories:`);
    for (const row of rows.sort((a, b) => b.total_cents - a.total_cents)) {
      lines.push(
        `  ${row.category_name ?? 'Uncategorised'}: ${row.total_cents} cents (${row.expense_count} expenses)`
      );
    }
  }

  if (goals && goals.length > 0) {
    lines.push('', 'Goals:');
    for (const goal of goals as { name: string; target_cents: number; saved_cents: number }[]) {
      lines.push(`  ${goal.name}: ${goal.saved_cents} of ${goal.target_cents} cents saved`);
    }
  }

  return lines.join('\n');
}

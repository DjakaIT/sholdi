/**
 * Calling the AI functions.
 *
 * These are the only network calls the app makes, and they are all the same shape:
 * send the thing to be read, get structured expenses back, store the result locally.
 * Nothing is persisted on the other end.
 *
 * Why a server exists at all, given everything else is local: the Anthropic API key
 * cannot be on the device (§4.1 — an `EXPO_PUBLIC_*` var is readable by anyone with
 * the APK). So a thin server holds the key. It holds nothing else.
 *
 * What actually leaves the phone:
 *  - the statement or photo being read, for the duration of one request
 *  - a short note being parsed
 *  - aggregated monthly totals, for a question or an insight — never individual rows
 */
import type { ExtractedExpense } from '@/features/expenses/types';

const functionsUrl = process.env.EXPO_PUBLIC_FUNCTIONS_URL;
const anonKey = process.env.EXPO_PUBLIC_FUNCTIONS_KEY;

/** False until the functions are deployed and configured. */
export const isAiConfigured = Boolean(functionsUrl && anonKey);

export class AiUnavailableError extends Error {
  constructor() {
    super(
      'Sholdi’s reading service is not configured. Set EXPO_PUBLIC_FUNCTIONS_URL ' +
        'and EXPO_PUBLIC_FUNCTIONS_KEY in .env.'
    );
  }
}

function endpoint(name: string): string {
  if (!functionsUrl || !anonKey) throw new AiUnavailableError();
  return `${functionsUrl.replace(/\/$/, '')}/${name}`;
}

function authHeaders(): Record<string, string> {
  return { Authorization: `Bearer ${anonKey}`, apikey: anonKey as string };
}

async function readError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: string };
    if (typeof body.error === 'string') return body.error;
  } catch {
    // fall through to the generic message
  }
  return 'Sholdi could not read that. Try again.';
}

/** Free text -> one expense. Backs the "Type it" tile. */
export async function extractText(input: {
  text: string;
  categories: string[];
  today: string;
}): Promise<ExtractedExpense> {
  const response = await fetch(endpoint('extract-text'), {
    method: 'POST',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });

  if (!response.ok) throw new Error(await readError(response));
  const body = (await response.json()) as { expense: ExtractedExpense };
  return body.expense;
}

/** A photo -> one expense. Backs both "Scan" and the drop-any-photo catch-all. */
export async function extractReceipt(input: {
  uri: string;
  mimeType: string;
  categories: string[];
  today: string;
}): Promise<ExtractedExpense> {
  const form = new FormData();
  // React Native's FormData takes this {uri, name, type} shape for a local file.
  form.append('file', {
    uri: input.uri,
    name: 'receipt.jpg',
    type: input.mimeType,
  } as unknown as Blob);
  form.append('categories', JSON.stringify(input.categories));
  form.append('today', input.today);

  const response = await fetch(endpoint('extract-receipt'), {
    method: 'POST',
    headers: authHeaders(),
    body: form,
  });

  if (!response.ok) throw new Error(await readError(response));
  const body = (await response.json()) as { expense: ExtractedExpense };
  return body.expense;
}

export type StatementResult = {
  expenses: (ExtractedExpense & { needs_review: boolean })[];
  issues: { index: number; field: string; message: string }[];
};

/** A bank PDF -> many expenses. This is the flow §5 says must be perfect. */
export async function extractStatement(input: {
  uri: string;
  categories: string[];
  period?: { start?: string; end?: string };
}): Promise<StatementResult> {
  const form = new FormData();
  form.append('file', {
    uri: input.uri,
    name: 'statement.pdf',
    type: 'application/pdf',
  } as unknown as Blob);
  form.append('categories', JSON.stringify(input.categories));
  if (input.period) form.append('period', JSON.stringify(input.period));

  const response = await fetch(endpoint('extract-statement'), {
    method: 'POST',
    headers: authHeaders(),
    body: form,
  });

  if (!response.ok) throw new Error(await readError(response));
  return (await response.json()) as StatementResult;
}

/** A question plus locally-built aggregates -> an answer. Never sends rows (§4.5). */
export async function askSholdi(input: {
  question: string;
  summary: string;
}): Promise<string> {
  const response = await fetch(endpoint('ask-sholdi'), {
    method: 'POST',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });

  if (!response.ok) throw new Error(await readError(response));
  const body = (await response.json()) as { answer: string };
  return body.answer;
}

/** A pattern the device already detected -> Sholdi's words for it. */
export async function writeInsight(brief: string): Promise<{ title: string; body: string }> {
  const response = await fetch(endpoint('write-insight'), {
    method: 'POST',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ brief }),
  });

  if (!response.ok) throw new Error(await readError(response));
  return (await response.json()) as { title: string; body: string };
}

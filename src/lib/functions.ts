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
import { readAsBase64 } from '@/lib/files';

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

/**
 * Raised when the server refused before the model was reached.
 *
 * Worth distinguishing: a rate-limited or oversized request cost nothing, so a
 * caller that has already spent a quota unit can hand it back (see quota.ts).
 */
export class RequestRefusedError extends Error {
  readonly name = 'RequestRefusedError';
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

/**
 * Turn a failed response into something a person can act on.
 *
 * The functions return `{ error, detail? }` — `detail` names the actual cause, and
 * was being thrown away here. That is why a deployed function's failures all read
 * "Something went wrong" no matter what had gone wrong; the server had already
 * said, and the client was discarding it. It is appended rather than replacing the
 * message, so the readable sentence still comes first.
 */
async function readError(response: Response): Promise<Error> {
  let message = 'Sholdi could not read that. Try again.';

  try {
    const body = (await response.json()) as { error?: string; detail?: string };
    if (typeof body.error === 'string' && body.error) message = body.error;
    if (typeof body.detail === 'string' && body.detail) message = `${message}\n\n${body.detail}`;
  } catch {
    // A non-JSON body (a gateway page, say) leaves the generic message in place.
  }

  // 4xx means the request was rejected on its own terms; nothing was generated.
  if (response.status >= 400 && response.status < 500) {
    return new RequestRefusedError(message, response.status);
  }
  return new Error(message);
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

  if (!response.ok) throw await readError(response);
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
  // Base64 JSON rather than multipart. React Native's FormData rejects file parts
  // it cannot serialise ("unsupported FormDataPart implementation"), and the
  // Messages API wants base64 regardless — so this avoids a translation that only
  // ever existed to satisfy the transport.
  const base64 = await readAsBase64(input.uri);

  const response = await fetch(endpoint('extract-receipt'), {
    method: 'POST',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      imageBase64: base64,
      mimeType: input.mimeType,
      categories: input.categories,
      today: input.today,
    }),
  });

  if (!response.ok) throw await readError(response);
  const body = (await response.json()) as { expense: ExtractedExpense };
  return body.expense;
}

export type StatementResult = {
  expenses: (ExtractedExpense & { needs_review: boolean })[];
  issues: { index: number; field: string; message: string }[];
};

/** A bank PDF -> many expenses. This is the flow §5 says must be perfect. */
export async function extractStatement(input: {
  /** Already-read file contents. The caller owns reading, because how a file can
   *  be read depends entirely on which picker produced it. */
  base64: string;
  categories: string[];
  period?: { start?: string; end?: string };
}): Promise<StatementResult> {

  const response = await fetch(endpoint('extract-statement'), {
    method: 'POST',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      pdfBase64: input.base64,
      categories: input.categories,
      period: input.period,
    }),
  });

  if (!response.ok) throw await readError(response);
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

  if (!response.ok) throw await readError(response);
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

  if (!response.ok) throw await readError(response);
  return (await response.json()) as { title: string; body: string };
}

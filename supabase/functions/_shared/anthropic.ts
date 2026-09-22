/**
 * Anthropic access for the Edge Functions. ARCHITECTURE.md §4.1, §4.3.
 *
 * THE RULE: the API key lives here, on the server, and nowhere else. It is read
 * from the function's secret environment and never returned to a caller. Nothing in
 * `src/` may import this file.
 *
 * ── Deviation from ARCHITECTURE.md §4.3, deliberate ────────────────────────────
 * §4.3 says to "pass `output_format` with type: 'json_schema'" and send the beta
 * header `anthropic-beta: structured-outputs-2025-11-13`. That parameter has since
 * been deprecated: structured outputs are now `output_config: { format: ... }` on
 * the regular (non-beta) Messages API, with no beta header. §4.3 itself says to
 * "confirm current model support in the docs before wiring it", which is what this
 * is. The tool-use fallback §4.3 asks for is kept and implemented below.
 */
import Anthropic from 'npm:@anthropic-ai/sdk@^0.123.0';

/**
 * The client is created on first use, not at module load.
 *
 * Throwing at module scope kills the worker before the handler runs, and Supabase
 * reports that as a bare `WORKER_ERROR` with no cause — so a missing secret, the
 * single most likely setup mistake, produced the least informative possible error.
 * Deferring it means the handler is alive to return a message that says what to do.
 */
let client: Anthropic | null = null;

export function getAnthropic(): Anthropic {
  if (client) return client;

  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) {
    throw new MissingApiKeyError();
  }

  client = new Anthropic({ apiKey });
  return client;
}

/**
 * The model ran out of room mid-answer.
 *
 * Worth its own type: it means the request was too big for its cap, which is a
 * different problem from the model failing, and it has a different fix.
 */
export class TruncatedResponseError extends Error {
  constructor(readonly maxTokens: number) {
    super(
      `The statement was too long to read in one pass (hit the ${maxTokens}-token limit). ` +
        'Try a single month.'
    );
    this.name = 'TruncatedResponseError';
  }
}

export class MissingApiKeyError extends Error {
  constructor() {
    super(
      'ANTHROPIC_API_KEY is not set on this project. Run: ' +
        'supabase secrets set ANTHROPIC_API_KEY=sk-ant-...'
    );
    this.name = 'MissingApiKeyError';
  }
}


export type StructuredRequest = {
  system: string;
  content: Anthropic.ContentBlockParam[];
  schema: Record<string, unknown>;
  /** Names the shape for the model; also the tool name in the fallback path. */
  schemaName: string;
  /** From MODELS in models.ts. Never an inline string (COST-CONTROLS.md §11). */
  model: string;
  /** From MAX_TOKENS. Every call sets one explicitly (§11). */
  maxTokens: number;
};

/**
 * Extraction runs with thinking OFF.
 *
 * Sonnet 5 runs adaptive thinking by default and those tokens count against
 * max_tokens — so reasoning consumed the budget before the answer could be
 * written, and a 79-row statement truncated inside a cap that had ample room for
 * the rows themselves (~1,400 tokens). Reading a table off a statement is not a
 * task that benefits from deliberation, so this both fixes the truncation and
 * removes tokens nobody was paying for on purpose.
 *
 * Chat and insights keep thinking: there the quality of the reasoning is the point.
 */
const NO_THINKING = { type: 'disabled' } as const;

/**
 * Ask for a JSON object matching `schema`.
 *
 * Primary path: structured outputs, which constrain generation so the response
 * cannot be malformed. Fallback: a single tool whose `input_schema` is the same
 * schema, with `strict: true`. §4.3 asks for the fallback because the tool-use path
 * is the stable one; it runs whenever the primary path is rejected by the API.
 */
export async function extractStructured<T>({
  system,
  content,
  schema,
  schemaName,
  model,
  maxTokens,
}: StructuredRequest): Promise<T> {
  try {
    const response = await getAnthropic().messages.create({
      model,
      max_tokens: maxTokens,
      system,
      messages: [{ role: 'user', content }],
      thinking: NO_THINKING,
      // JSONOutputFormat takes `type` and `schema` only — no name.
      output_config: {
        format: { type: 'json_schema', schema },
      },
    });

    // A response cut off at max_tokens is truncated JSON. Parsing it throws a
    // syntax error that says nothing about the real cause, so the cap is checked
    // first — this is the failure mode the compact wire format exists to avoid.
    if (response.stop_reason === 'max_tokens') {
      throw new TruncatedResponseError(maxTokens);
    }

    const text = firstText(response);
    if (!text) throw new Error('Structured output returned no text block');
    return JSON.parse(text) as T;
  } catch (error) {
    if (error instanceof Anthropic.BadRequestError) {
      // The structured-output surface moves; the tool path is the stable one.
      console.warn('Structured outputs rejected, falling back to tool use:', error.message);
      return await extractViaTool<T>({ system, content, schema, schemaName, model, maxTokens });
    }
    throw error;
  }
}

/** The §4.3 fallback: one tool whose input schema is the contract. */
async function extractViaTool<T>({
  system,
  content,
  schema,
  schemaName,
  model,
  maxTokens,
}: StructuredRequest): Promise<T> {
  const response = await getAnthropic().messages.create({
    model,
    max_tokens: maxTokens,
    system,
    messages: [{ role: 'user', content }],
    thinking: NO_THINKING,
    tools: [
      {
        name: schemaName,
        description: 'Return the extracted data in exactly this shape.',
        input_schema: schema as Anthropic.Tool.InputSchema,
        // Guarantees the arguments validate against the schema.
        strict: true,
      },
    ],
    tool_choice: { type: 'tool', name: schemaName },
  });

  if (response.stop_reason === 'max_tokens') throw new TruncatedResponseError(maxTokens);

  const block = response.content.find((b) => b.type === 'tool_use');
  if (!block || block.type !== 'tool_use') {
    throw new Error('Model returned no tool_use block');
  }
  // Always parse; never string-match a serialised tool input.
  return block.input as T;
}

function firstText(response: Anthropic.Message): string | null {
  for (const block of response.content) {
    if (block.type === 'text') return block.text;
  }
  return null;
}

/**
 * write-insight — turn a detected pattern into Sholdi's words. ARCHITECTURE.md §4.6.
 *
 * §4.6 described a weekly `generate-insights` job that queried every user's data
 * server-side. That job is gone. Detection now runs on the phone, over the phone's
 * own database (`src/features/insights/patterns.ts`), and only the resulting brief —
 * a category name and a few monthly totals — is sent here to be written up.
 *
 * What survives from §4.6, because it is what makes the product calm:
 *  - Detection is threshold-first. This function is only called once arithmetic has
 *    already found something worth saying, so the model is never asked "is there
 *    anything here?"
 *  - The 3-per-month cap. It moved from a database trigger to the device, where it
 *    is still enforced in code rather than by asking the model nicely.
 *
 * Input:  { "brief": "Eating out has fallen two months running.\n2026-07: ..." }
 * Output: { "title": "...", "body": "..." }
 */
import { getAnthropic } from '../_shared/anthropic.ts';
import { MAX_TOKENS, MODELS } from '../_shared/models.ts';
import { HttpError, json, serveJson } from '../_shared/http.ts';
import { MAX_BODY_CHARS, enforceRateLimit, readJsonBody } from '../_shared/guard.ts';

const MAX_BRIEF_LENGTH = 2000;

const SYSTEM = `You are Sholdi. You write one short observation about a spending pattern.

Voice (DESIGN.md §7):
- Calm, brief, on the user's side. You observe; you do not instruct.
- Lead with the win.
- Never moralise. "No judgement, just worth a glance before pair four." is the register.
- Credit the user, not the app: "nice work", never "you followed our advice".
- Active voice, sentence case, plain verbs.

Never write: "AI", "smart", "powered by", "insights engine", exclamation marks, or emoji.

Return a title of at most six words and a body of one or two sentences. The body must
not repeat the title. Use only the figures given; never invent one.

Amounts in the brief are in cents. Write them as euros: 52000 is "€520". Always the
euro sign — never a dollar sign, and never the bare number.`;

const INSIGHT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['title', 'body'],
  properties: {
    title: { type: 'string', description: 'At most six words. Sentence case.' },
    body: { type: 'string', description: "One or two sentences in Sholdi's voice." },
  },
} as const;

Deno.serve(
  serveJson(async (req) => {
    enforceRateLimit(req, 'insight');

    const body = await readJsonBody(req, MAX_BODY_CHARS.small);

    const brief = typeof body.brief === 'string' ? body.brief.trim() : '';
    if (!brief) throw new HttpError(400, 'No pattern brief was sent');
    if (brief.length > MAX_BRIEF_LENGTH) throw new HttpError(400, 'That brief is too long');

    const written = await getAnthropic().messages.create({
      model: MODELS.insight,
      max_tokens: MAX_TOKENS.insight,
      system: SYSTEM,
      messages: [{ role: 'user', content: [{ type: 'text', text: brief }] }],
      output_config: { format: { type: 'json_schema', schema: INSIGHT_SCHEMA } },
    });

    const text = written.content.find((block) => block.type === 'text');
    if (!text || text.type !== 'text') {
      throw new HttpError(502, 'Sholdi had nothing to say about that.');
    }

    // A truncated or non-JSON reply threw a raw SyntaxError here, which surfaced as
    // "Something went wrong" with no cause. An insight is decoration; failing it
    // should never look like a broken app.
    let parsed: { title?: unknown; body?: unknown };
    try {
      parsed = JSON.parse(text.text);
    } catch {
      throw new HttpError(502, 'Sholdi had nothing to say about that.');
    }

    if (typeof parsed.title !== 'string' || typeof parsed.body !== 'string') {
      throw new HttpError(502, 'Sholdi had nothing to say about that.');
    }

    return json({ title: parsed.title, body: parsed.body });
  })
);

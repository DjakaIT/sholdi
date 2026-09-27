/**
 * ask-sholdi — a question about your spending. ARCHITECTURE.md §4.5.
 *
 * THE RULE THIS FILE KEEPS: the model sees an aggregated summary — monthly totals
 * per category, trends, goals — and never individual transactions. §4.5: "Cheaper,
 * faster, and less personal data in flight."
 *
 * The summary is now built on the device from its own SQLite database and posted
 * here, rather than read from a server-side view. Merchants and dates never leave
 * the phone at all, so the rule is enforced by what the app sends rather than by
 * what this function chooses to select.
 *
 * Input:  { "question": "how am I doing on eating out?",
 *           "summary": "2026-09 — total 184260 cents...\n  Groceries: 77390..." }
 * Output: { "answer": "..." }
 */
import { getAnthropic } from '../_shared/anthropic.ts';
import { MAX_TOKENS, MODELS } from '../_shared/models.ts';
import { HttpError, json, serveJson } from '../_shared/http.ts';
import { MAX_BODY_CHARS, enforceRateLimit, readJsonBody } from '../_shared/guard.ts';

const MAX_QUESTION_LENGTH = 500;
const MAX_SUMMARY_LENGTH = 20_000;

/**
 * Sholdi's voice, straight from DESIGN.md §7. Not decoration: the app's promise is
 * that it observes without nagging, and the model writes the words.
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

The comparisons are already done for you. Each line carries its own change against
the month before — "(up 8000 from 52000)" — so you never need to subtract anything.
Read the direction off the line rather than working it out.

Never show your working, never correct yourself mid-sentence, and never write
"wait", "let me check" or "actually". A reply that visibly changes its mind reads as
unreliable about the user's own money, which is the one thing this must not be.

Amounts are in cents. Write them as euros, e.g. 38815 is "€388".`;

Deno.serve(
  serveJson(async (req) => {
    // §7 caps chat per user per day, which is enforced on the device where the
    // user actually is (src/features/usage/quota.ts). This is the coarser server
    // brake: it does not know who is asking, only how fast the asking is arriving.
    enforceRateLimit(req, 'chat');

    const body = await readJsonBody(req, MAX_BODY_CHARS.small);

    const question = typeof body.question === 'string' ? body.question.trim() : '';
    if (!question) throw new HttpError(400, 'Ask a question');
    if (question.length > MAX_QUESTION_LENGTH) {
      throw new HttpError(400, 'That question is a bit long. Try a shorter one.');
    }

    const summary = typeof body.summary === 'string' ? body.summary.slice(0, MAX_SUMMARY_LENGTH) : '';
    if (!summary) throw new HttpError(400, 'No spending summary was sent');

    const response = await getAnthropic().messages.create({
      model: MODELS.chat,
      max_tokens: MAX_TOKENS.chat,
      system: SYSTEM,
      // Thinking off, for the same reason extraction has it off: with the deltas
      // now computed on the device there is no reasoning left to buy, only phrasing.
      // Sonnet 5 reasons adaptively by default and those tokens come out of the
      // 800-token cap — which is how a two-sentence answer ended up composing its
      // arithmetic out loud in the reply.
      thinking: { type: 'disabled' },
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

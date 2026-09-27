/**
 * Request guards: payload ceilings and the per-IP rate limit.
 *
 * These are the brakes standing between an extracted anon key and the Anthropic
 * bill, so the failure that matters is a limit that silently does not fire.
 *
 * Run: npm run test:functions
 */
import { assertEquals, assertRejects, assertThrows } from 'jsr:@std/assert@^1.0.0';

import {
  MAX_BODY_CHARS,
  RATE_LIMITS,
  assertBase64Size,
  enforceRateLimit,
  readJsonBody,
  resetRateLimits,
} from './guard.ts';
import { HttpError } from './http.ts';

function request(body: string, ip = '1.2.3.4'): Request {
  return new Request('https://example.test/fn', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': ip },
    body,
  });
}

// ── payload ceilings ─────────────────────────────────────────────────────────

Deno.test('a normal body parses', async () => {
  const body = await readJsonBody(request('{"text":"38 euro konzum"}'), MAX_BODY_CHARS.small);
  assertEquals(body.text, '38 euro konzum');
});

Deno.test('a body over the ceiling is refused with 413', async () => {
  const huge = JSON.stringify({ text: 'x'.repeat(MAX_BODY_CHARS.small + 10) });
  const error = await assertRejects(() => readJsonBody(request(huge), MAX_BODY_CHARS.small));
  assertEquals((error as HttpError).status, 413);
});

Deno.test('malformed JSON becomes an empty object, not a crash', async () => {
  // The handlers all check their own required fields and return a 400 that names
  // what was missing, which reads better than a parser error.
  assertEquals(await readJsonBody(request('not json'), MAX_BODY_CHARS.small), {});
});

Deno.test('a JSON array or scalar body is treated as empty', async () => {
  assertEquals(await readJsonBody(request('[1,2,3]'), MAX_BODY_CHARS.small), {});
  assertEquals(await readJsonBody(request('null'), MAX_BODY_CHARS.small), {});
});

Deno.test('base64 size is measured without decoding', () => {
  // 4 encoded chars per 3 bytes. "AAAA" is 3 bytes; padding is subtracted.
  assertEquals(assertBase64Size('AAAA', 100, 'too big'), 3);
  assertEquals(assertBase64Size('AAA=', 100, 'too big'), 2);
  assertEquals(assertBase64Size('AA==', 100, 'too big'), 1);
});

Deno.test('an oversized base64 field is refused before it is expanded', () => {
  // This is the ordering that matters: the old code called fromBase64() first, so
  // an oversized upload was fully allocated in the worker before being rejected.
  const error = assertThrows(() => assertBase64Size('A'.repeat(200), 100, 'too big'));
  assertEquals((error as HttpError).status, 413);
  assertEquals((error as HttpError).message, 'too big');
});

Deno.test('the statement ceiling leaves room for a 25MB PDF', () => {
  // MAX_PDF_BYTES is 25MB; base64 inflates by 4/3, so the encoded ceiling must sit
  // above that or a legitimate statement would be refused by the wrong check.
  assertEquals(MAX_BODY_CHARS.statement > (25 * 1024 * 1024 * 4) / 3, true);
});

// ── rate limiting ────────────────────────────────────────────────────────────

Deno.test('requests under the limit pass', () => {
  resetRateLimits();
  for (let i = 0; i < RATE_LIMITS.statement.limit; i += 1) {
    enforceRateLimit(request('{}'), 'statement');
  }
});

Deno.test('the request after the limit is refused with 429', () => {
  resetRateLimits();
  for (let i = 0; i < RATE_LIMITS.statement.limit; i += 1) {
    enforceRateLimit(request('{}'), 'statement');
  }
  const error = assertThrows(() => enforceRateLimit(request('{}'), 'statement'));
  assertEquals((error as HttpError).status, 429);
});

Deno.test('the refusal says when to come back', () => {
  resetRateLimits();
  for (let i = 0; i < RATE_LIMITS.chat.limit; i += 1) enforceRateLimit(request('{}'), 'chat');
  const error = assertThrows(() => enforceRateLimit(request('{}'), 'chat'));
  assertEquals(/\d+ minutes/.test((error as HttpError).message), true);
});

Deno.test('one caller hitting the limit does not block another', () => {
  resetRateLimits();
  for (let i = 0; i < RATE_LIMITS.statement.limit; i += 1) {
    enforceRateLimit(request('{}', '1.1.1.1'), 'statement');
  }
  assertThrows(() => enforceRateLimit(request('{}', '1.1.1.1'), 'statement'));
  // A different IP has its own allowance.
  enforceRateLimit(request('{}', '2.2.2.2'), 'statement');
});

Deno.test('endpoints are counted separately', () => {
  resetRateLimits();
  for (let i = 0; i < RATE_LIMITS.statement.limit; i += 1) {
    enforceRateLimit(request('{}'), 'statement');
  }
  assertThrows(() => enforceRateLimit(request('{}'), 'statement'));
  // Spending the statement allowance must not disable chat.
  enforceRateLimit(request('{}'), 'chat');
});

Deno.test('the window expires and the allowance returns', () => {
  resetRateLimits();
  const start = 1_000_000;
  for (let i = 0; i < RATE_LIMITS.statement.limit; i += 1) {
    enforceRateLimit(request('{}'), 'statement', start);
  }
  assertThrows(() => enforceRateLimit(request('{}'), 'statement', start));

  // One millisecond past the window.
  const later = start + RATE_LIMITS.statement.windowMs + 1;
  enforceRateLimit(request('{}'), 'statement', later);
});

Deno.test('statements are limited more tightly than anything else', () => {
  // The routing rule: the tightest limit goes on the most expensive call.
  for (const kind of ['receipt', 'text', 'chat', 'insight'] as const) {
    assertEquals(RATE_LIMITS.statement.limit < RATE_LIMITS[kind].limit, true);
  }
});

Deno.test('an unknown kind is not silently rate-limited', () => {
  resetRateLimits();
  for (let i = 0; i < 500; i += 1) enforceRateLimit(request('{}'), 'not-a-real-kind');
});

Deno.test('a caller with no forwarded IP still gets a bucket', () => {
  resetRateLimits();
  const anonymous = () =>
    new Request('https://example.test/fn', { method: 'POST', body: '{}' });

  for (let i = 0; i < RATE_LIMITS.statement.limit; i += 1) {
    enforceRateLimit(anonymous(), 'statement');
  }
  // Missing headers must not mean unlimited.
  assertThrows(() => enforceRateLimit(anonymous(), 'statement'));
});

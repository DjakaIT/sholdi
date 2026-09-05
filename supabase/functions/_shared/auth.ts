/**
 * Caller identity and CORS for the Edge Functions.
 *
 * Every function is called by the app on behalf of a signed-in user. The client is
 * built with the caller's own JWT rather than the service-role key, so the RLS
 * policies in the migrations apply to everything these functions read and write —
 * a function cannot accidentally reach across users.
 */
import { createClient } from 'npm:@supabase/supabase-js@^2.115.0';
import type { SupabaseClient } from 'npm:@supabase/supabase-js@^2.115.0';

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

export type Caller = {
  userId: string;
  /** Scoped to the caller — RLS applies. */
  supabase: SupabaseClient;
};

export class HttpError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

/** Resolve the caller from the Authorization header, or throw a 401. */
export async function requireCaller(req: Request): Promise<Caller> {
  const authorization = req.headers.get('Authorization');
  if (!authorization) throw new HttpError(401, 'Missing Authorization header');

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    { global: { headers: { Authorization: authorization } } }
  );

  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new HttpError(401, 'Not signed in');

  return { userId: data.user.id, supabase };
}

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

/**
 * Wraps a handler with CORS preflight and error translation, so no function leaks a
 * stack trace — or worse, key material — to the client.
 */
export function serveJson(handler: (req: Request) => Promise<Response>) {
  return async (req: Request): Promise<Response> => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

    try {
      return await handler(req);
    } catch (error) {
      if (error instanceof HttpError) {
        return json({ error: error.message }, error.status);
      }
      console.error('Unhandled error:', error);
      return json({ error: 'Something went wrong' }, 500);
    }
  };
}

/** The user's category names, so extraction can match what already exists (§4.2). */
export async function categoryNames(caller: Caller): Promise<string[]> {
  const { data, error } = await caller.supabase.from('categories').select('name');
  if (error) throw new HttpError(500, `Could not read categories: ${error.message}`);
  return (data ?? []).map((row: { name: string }) => row.name);
}

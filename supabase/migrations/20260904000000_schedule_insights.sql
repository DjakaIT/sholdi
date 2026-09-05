-- Schedule the insight engine. ARCHITECTURE.md §4.6 step 1: "pg_cron runs
-- generate-insights weekly."
--
-- Weekly, not daily, and never on write. §4.6 opens with the rule this file exists
-- to keep: the engine "must be scheduled and rate-limited, never reactive". A
-- reactive engine is how an app that promises 2-3 notes a month starts sending one
-- every time you buy coffee.
--
-- The 3-per-month cap is enforced separately, by the trigger in
-- 20260903000002_insight_cap.sql. This schedule controls how often we *look*;
-- that trigger controls how much the user can ever receive.

create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

-- The function URL and the shared secret are read from Vault rather than written
-- into this migration, so no credential lives in the repository. Set them once:
--
--   select vault.create_secret('https://<ref>.supabase.co/functions/v1/generate-insights',
--                              'generate_insights_url');
--   select vault.create_secret('<the same value as the CRON_SECRET function secret>',
--                              'generate_insights_cron_secret');
--
create or replace function public.trigger_generate_insights()
returns void
language plpgsql
security definer
set search_path = public, extensions
as $trigger$
declare
  fn_url    text;
  fn_secret text;
begin
  select decrypted_secret into fn_url
    from vault.decrypted_secrets where name = 'generate_insights_url';
  select decrypted_secret into fn_secret
    from vault.decrypted_secrets where name = 'generate_insights_cron_secret';

  if fn_url is null or fn_secret is null then
    raise warning 'generate-insights is not configured; skipping this run';
    return;
  end if;

  perform net.http_post(
    url     := fn_url,
    headers := jsonb_build_object(
                 'Content-Type',  'application/json',
                 'x-cron-secret', fn_secret
               ),
    body    := '{}'::jsonb
  );
end
$trigger$;

-- Monday 08:00 UTC. Weekly, so a pattern has time to actually be a pattern.
select cron.unschedule('sholdi-generate-insights')
  where exists (select 1 from cron.job where jobname = 'sholdi-generate-insights');

select cron.schedule(
  'sholdi-generate-insights',
  '0 8 * * 1',
  $cron$select public.trigger_generate_insights()$cron$
);

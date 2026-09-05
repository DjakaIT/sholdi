-- The insight cap. ARCHITECTURE.md §4.6, point 3:
--   "Hard cap: 3 delivered per calendar month. Enforce in SQL, not in the prompt."
--
-- This is the rule that makes the product feel calm rather than naggy, and the app
-- states it to the user in so many words ("2-3 notes a month, max." — DESIGN.md §6.5).
-- A prompt cannot be trusted to hold a promise the UI has already made, so the
-- database holds it instead.
--
-- Interpretation: the cap counts insights *scheduled into* a calendar month, keyed on
-- deliver_after. §4.6 step 4 inserts rows with deliver_after precisely to space
-- deliveries out, so capping per delivery-month is what limits what a user receives.
-- A row that was delivered and then dismissed still consumed its slot.

create or replace function public.enforce_insight_monthly_cap()
returns trigger
language plpgsql
as $cap$
declare
  delivered_count int;
  cap constant int := 3;
begin
  select count(*)
    into delivered_count
    from public.insights i
   where i.user_id = new.user_id
     and date_trunc('month', i.deliver_after) = date_trunc('month', new.deliver_after)
     and i.id is distinct from new.id;

  if delivered_count >= cap then
    raise exception
      'Sholdi insight cap reached: % already scheduled for %, limit is % per calendar month',
      delivered_count, to_char(new.deliver_after, 'YYYY-MM'), cap
      using errcode = 'check_violation';
  end if;

  return new;
end
$cap$;

drop trigger if exists insights_monthly_cap on public.insights;

create trigger insights_monthly_cap
  before insert or update of deliver_after on public.insights
  for each row
  execute function public.enforce_insight_monthly_cap();

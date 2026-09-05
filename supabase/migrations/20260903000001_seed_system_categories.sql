-- Seed the five system categories for every new user.
--
-- Why this exists: Sholdi's whole premise is that you never build categories by
-- hand (DESIGN.md §1). The five below, and their colour tokens, are fixed by
-- DESIGN.md §4.3. `is_system` marks them so the UI can treat them differently from
-- user-created ones later.
--
-- `icon` is left null: DESIGN.md §6.7 shows a "small category icon" in the mosaic
-- but never says which icon belongs to which category. Filling that in would be
-- inventing design, so it waits for a decision.

create or replace function public.seed_system_categories()
returns trigger
language plpgsql
security definer
set search_path = public
as $seed$
begin
  insert into public.categories (user_id, name, color_token, is_system)
  values
    (new.id, 'Groceries',  'sage',    true),
    (new.id, 'Transport',  'slate',   true),
    (new.id, 'Eating out', 'plum',    true),
    (new.id, 'Fuel',       'olive',   true),
    (new.id, 'Fitness',    'heather', true)
  on conflict (user_id, name) do nothing;

  return new;
end
$seed$;

drop trigger if exists on_auth_user_created_seed_categories on auth.users;

create trigger on_auth_user_created_seed_categories
  after insert on auth.users
  for each row
  execute function public.seed_system_categories();

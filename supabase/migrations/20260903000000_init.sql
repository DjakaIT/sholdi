-- Sholdi initial schema. ARCHITECTURE.md §3.
--
-- Two rules this file exists to enforce from day one:
--   1. Money is integer cents (bigint). Never numeric, never float (§7).
--   2. RLS is on for every table, with a user_id = auth.uid() policy. Retrofitting
--      row-level security later is miserable (§7), so there is no "add it later" path.
--
-- occurred_on is a `date`, not timestamptz, on purpose: a purchase on the 31st must
-- not become the 1st in another timezone (§7).

-- ---------------------------------------------------------------------------
-- categories
-- ---------------------------------------------------------------------------
create table if not exists public.categories (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  name         text not null,
  -- One of the fixed palette keys in DESIGN.md §4.3. There is deliberately no free
  -- colour picker, so this is constrained rather than free text.
  color_token  text not null check (color_token in ('sage', 'slate', 'plum', 'olive', 'heather')),
  icon         text,
  is_system    boolean not null default false,
  created_at   timestamptz not null default now(),

  unique (user_id, name)
);

-- ---------------------------------------------------------------------------
-- imports
-- ---------------------------------------------------------------------------
create table if not exists public.imports (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users (id) on delete cascade,
  source_type   text not null,
  storage_path  text,
  status        text not null default 'uploaded'
                  check (status in ('uploaded', 'extracting', 'ready', 'imported', 'failed')),
  period_start  date,
  period_end    date,
  expense_count int,
  error         text,
  created_at    timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- expenses
-- ---------------------------------------------------------------------------
create table if not exists public.expenses (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users (id) on delete cascade,
  amount_cents  bigint not null,
  currency      char(3) not null default 'EUR',
  merchant      text,
  description   text,
  occurred_on   date not null,
  category_id   uuid references public.categories (id) on delete set null,
  source        text not null
                  check (source in ('pdf', 'receipt', 'voice', 'text', 'photo', 'manual')),
  confidence    real check (confidence is null or (confidence >= 0 and confidence <= 1)),
  import_id     uuid references public.imports (id) on delete set null,
  -- Set true when confidence < 0.8, so the review screen can surface it.
  needs_review  boolean not null default false,
  created_at    timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- insights
-- ---------------------------------------------------------------------------
create table if not exists public.insights (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users (id) on delete cascade,
  kind           text not null
                   check (kind in ('trend', 'alternative', 'goal', 'celebration')),
  title          text not null,
  body           text not null,
  category_id    uuid references public.categories (id) on delete set null,
  payload        jsonb,
  status         text not null default 'pending'
                   check (status in ('pending', 'delivered', 'acted', 'dismissed')),
  deliver_after  timestamptz not null default now(),
  created_at     timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- goals
-- ---------------------------------------------------------------------------
-- Goals are not categories and carry no category colour (DESIGN.md §4.3) — hence
-- no color_token here.
create table if not exists public.goals (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users (id) on delete cascade,
  name          text not null,
  target_cents  bigint not null check (target_cents > 0),
  saved_cents   bigint not null default 0 check (saved_cents >= 0),
  target_date   date,
  created_at    timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Indexes. §3: the whole app queries by user + month.
-- ---------------------------------------------------------------------------
create index if not exists expenses_user_occurred_idx
  on public.expenses (user_id, occurred_on desc);

create index if not exists expenses_user_category_occurred_idx
  on public.expenses (user_id, category_id, occurred_on);

create index if not exists expenses_import_idx
  on public.expenses (import_id);

-- Supports the duplicate-import check in §7. Deliberately NOT unique: two identical
-- small purchases at the same merchant on the same day are a real thing, so dedup is
-- a lookup the import path performs, not a constraint the database enforces.
create index if not exists expenses_dedupe_idx
  on public.expenses (user_id, occurred_on, amount_cents, merchant);

create index if not exists imports_user_created_idx
  on public.imports (user_id, created_at desc);

create index if not exists insights_user_deliver_idx
  on public.insights (user_id, deliver_after desc);

create index if not exists categories_user_idx
  on public.categories (user_id);

-- ---------------------------------------------------------------------------
-- Row-level security. Every table, no exceptions (§3, §7).
-- ---------------------------------------------------------------------------
alter table public.categories enable row level security;
alter table public.imports    enable row level security;
alter table public.expenses   enable row level security;
alter table public.insights   enable row level security;
alter table public.goals      enable row level security;

-- `(select auth.uid())` rather than a bare call: it is evaluated once per query
-- instead of once per row, which matters on the expense table.
do $policies$
declare
  t text;
begin
  foreach t in array array['categories', 'imports', 'expenses', 'insights', 'goals']
  loop
    execute format('drop policy if exists %I on public.%I', t || '_select_own', t);
    execute format('drop policy if exists %I on public.%I', t || '_insert_own', t);
    execute format('drop policy if exists %I on public.%I', t || '_update_own', t);
    execute format('drop policy if exists %I on public.%I', t || '_delete_own', t);

    execute format(
      'create policy %I on public.%I for select to authenticated using (user_id = (select auth.uid()))',
      t || '_select_own', t);
    execute format(
      'create policy %I on public.%I for insert to authenticated with check (user_id = (select auth.uid()))',
      t || '_insert_own', t);
    execute format(
      'create policy %I on public.%I for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))',
      t || '_update_own', t);
    execute format(
      'create policy %I on public.%I for delete to authenticated using (user_id = (select auth.uid()))',
      t || '_delete_own', t);
  end loop;
end
$policies$;

-- ---------------------------------------------------------------------------
-- monthly_category_totals — §3: the Index mosaic must not be computed client-side
-- over the raw expense table.
-- ---------------------------------------------------------------------------
-- security_invoker so the view respects the caller's RLS rather than the owner's.
create or replace view public.monthly_category_totals
with (security_invoker = on) as
select
  e.user_id,
  date_trunc('month', e.occurred_on)::date as month,
  e.category_id,
  c.name        as category_name,
  c.color_token as color_token,
  c.icon        as icon,
  sum(e.amount_cents)::bigint as total_cents,
  count(*)::int               as expense_count
from public.expenses e
left join public.categories c on c.id = e.category_id
group by e.user_id, date_trunc('month', e.occurred_on), e.category_id, c.name, c.color_token, c.icon;

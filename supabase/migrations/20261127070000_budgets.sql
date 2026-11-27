-- =====================================================================
-- Phase 3, part 3: monthly budgets per spending category.
--
--   budgets             one row per category per month you set a budget.
--                       A budget carries forward: the amount set for
--                       December is also January's, February's and so on,
--                       until you set a different one.
--   budget_for_month()  each spending category's budget for a month:
--                         set_cents    what you set (carried forward)
--                         bills_cents  that month's bills in the category
--                         budget_cents the bigger of the two
--                       So a bill category (Utilities, Debt...) is budgeted
--                       at least what its bills add up to, and you only
--                       set a number by hand to go above that or for
--                       categories without bills (Groceries, Dining, Gas).
--
-- Transfer and income categories have no budget: card payments aren't
-- spending, and income isn't budgeted.
-- =====================================================================

create table public.budgets (
  id           uuid primary key default gen_random_uuid(),
  category_id  uuid not null references public.categories(id) on delete cascade,
  month        date not null check (month = date_trunc('month', month)::date),
  amount_cents bigint not null check (amount_cents >= 0),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (category_id, month)   -- also the index for "latest month <= X"
);

create trigger set_updated_at before update on public.budgets
  for each row execute function public.set_updated_at();

alter table public.budgets enable row level security;
create policy household_all on public.budgets for all to authenticated
  using (private.is_household_member()) with check (private.is_household_member());
revoke all on public.budgets from anon, public;
grant select, insert, update, delete on public.budgets to authenticated;

-- SECURITY INVOKER (the default) and STABLE: runs as the signed-in user,
-- so RLS applies, and only reads.
create or replace function public.budget_for_month(p_month date)
returns table (
  category_id  uuid,
  set_cents    bigint,   -- null = never set
  set_month    date,     -- the month that amount was set in (earlier = carried forward)
  bills_cents  bigint,
  budget_cents bigint
)
language sql stable set search_path = '' as $$
  select c.id,
         b.amount_cents,
         b.month,
         coalesce(bills.total, 0)::bigint,
         greatest(coalesce(b.amount_cents, 0), coalesce(bills.total, 0))::bigint
    from public.categories c
    left join lateral (
      select bu.amount_cents, bu.month
        from public.budgets bu
       where bu.category_id = c.id
         and bu.month <= date_trunc('month', p_month)::date
       order by bu.month desc
       limit 1) b on true
    left join lateral (
      select sum(bi.amount_cents) as total
        from public.bill_instances bi
       where bi.category_id = c.id
         and bi.bill_month = date_trunc('month', p_month)::date
         and bi.status <> 'skipped') bills on true
   where c.kind = 'expense';
$$;

revoke execute on function public.budget_for_month(date) from public, anon;
grant  execute on function public.budget_for_month(date) to authenticated;

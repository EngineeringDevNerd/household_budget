-- =====================================================================
-- Phase 1 core schema: household access, accounts, categories,
-- pay schedules + paychecks, recurring bills + bill instances,
-- transactions, and the mark-paid / unmark-paid functions.
--
-- Applied with the "Migrate database" GitHub Action.
--
-- Conventions
--   * Money is bigint cents. Transactions are signed (negative = out,
--     positive = in). Bill and paycheck amounts are always positive
--     "amount due / amount expected"; the mark-paid function negates.
--   * Calendar dates use the `date` type (no time zone surprises).
--   * Closed lists use text + CHECK instead of Postgres enums, because
--     CHECKs are easy to change in a later migration; enums are not.
-- =====================================================================

-- ---------- Helpers ----------------------------------------------------
create or replace function public.set_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- ---------- Household access ------------------------------------------
-- The allowlist. Rows are added by hand in the SQL editor, never by the app.
create table public.household_members (
  user_id      uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  created_at   timestamptz not null default now()
);

-- Used by every RLS policy. SECURITY DEFINER so it can read
-- household_members without tripping that table's own policy. It lives in a
-- `private` schema the Data API doesn't expose, so it can't be called as an
-- endpoint (Supabase's recommended pattern for SECURITY DEFINER helpers).
create schema if not exists private;
grant usage on schema private to authenticated;
create or replace function private.is_household_member()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.household_members where user_id = (select auth.uid())
  );
$$;

-- ---------- Accounts ---------------------------------------------------
create table public.accounts (
  id                    uuid primary key default gen_random_uuid(),
  name                  text not null unique,
  type                  text not null check (type in ('checking','savings','credit','cash')),
  opening_balance_cents bigint not null default 0,
  opening_balance_date  date not null default current_date,
  is_active             boolean not null default true,
  sort_order            int not null default 0,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

-- ---------- Categories -------------------------------------------------
create table public.categories (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique,
  group_name text,
  kind       text not null check (kind in ('expense','income','transfer')),
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------- Pay schedules + paychecks ----------------------------------
create table public.pay_schedules (
  id                   uuid primary key default gen_random_uuid(),
  owner_user_id        uuid not null references public.household_members(user_id),
  name                 text not null,               -- e.g. 'Dallas paycheck'
  frequency            text not null check (frequency in ('biweekly','manual')),
  anchor_date          date,                        -- Dallas: 2026-11-06
  default_amount_cents bigint not null default 0 check (default_amount_cents >= 0),
  deposit_account_id   uuid references public.accounts(id),
  covers_bills         boolean not null default true,   -- false = pooled income (Sylvia): never auto-assigned bills
  is_active            boolean not null default true,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  check (frequency <> 'biweekly' or anchor_date is not null)
);

create table public.paychecks (
  id                    uuid primary key default gen_random_uuid(),
  pay_schedule_id       uuid not null references public.pay_schedules(id) on delete restrict,
  pay_date              date not null,
  expected_amount_cents bigint not null check (expected_amount_cents >= 0),
  actual_amount_cents   bigint check (actual_amount_cents >= 0),
  received_on           date,                       -- null = not received yet
  notes                 text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (pay_schedule_id, pay_date)
);
create index paychecks_pay_date_idx on public.paychecks (pay_date);

-- ---------- Recurring bills + monthly instances ------------------------
create table public.recurring_bills (
  id                   uuid primary key default gen_random_uuid(),
  name                 text not null,
  category_id          uuid references public.categories(id),
  default_amount_cents bigint not null check (default_amount_cents >= 0),  -- per occurrence (a half payment for per_paycheck)
  frequency            text not null default 'monthly' check (frequency in ('monthly','per_paycheck')),
  due_day              smallint check (due_day between 1 and 31),           -- monthly bills
  pay_schedule_id      uuid references public.pay_schedules(id),          -- per_paycheck bills: whose paydays
  default_account_id   uuid references public.accounts(id),
  last_account_id      uuid references public.accounts(id),  -- set by mark_bill_paid
  transfer_to_account_id uuid references public.accounts(id), -- set for a credit card payment: money moves checking -> card
  is_variable          boolean not null default false,        -- utilities etc.
  is_active            boolean not null default true,
  notes                text,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  check (frequency <> 'monthly'      or due_day is not null),
  check (frequency <> 'per_paycheck' or pay_schedule_id is not null)
);

create table public.bill_instances (
  id                uuid primary key default gen_random_uuid(),
  recurring_bill_id uuid references public.recurring_bills(id) on delete restrict,  -- null = one-off bill
  name              text not null,       -- copied at generation so renaming a bill doesn't rewrite history
  category_id       uuid references public.categories(id),
  bill_month        date not null check (bill_month = date_trunc('month', bill_month)::date),
  due_date          date not null,
  amount_cents      bigint not null check (amount_cents >= 0),  -- budgeted / expected this month
  paycheck_id       uuid references public.paychecks(id) on delete set null,  -- the check that covers it (auto-assigned, editable)
  generated_for_paycheck_id uuid references public.paychecks(id) on delete restrict,  -- per_paycheck bills only
  status            text not null default 'due' check (status in ('due','paid','skipped')),
  paid_date         date,
  notes             text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  check ((status = 'paid') = (paid_date is not null))
);
-- A monthly bill appears once per month; a per-paycheck bill once per paycheck.
create unique index bill_instances_monthly_uniq on public.bill_instances (recurring_bill_id, bill_month)
  where generated_for_paycheck_id is null;
create unique index bill_instances_per_check_uniq on public.bill_instances (recurring_bill_id, generated_for_paycheck_id)
  where generated_for_paycheck_id is not null;
create index bill_instances_due_date_idx on public.bill_instances (due_date);

-- ---------- Transactions -----------------------------------------------
-- Created in phase 1 because mark-paid needs it. CSV import UI is phase 2.
create table public.transactions (
  id               uuid primary key default gen_random_uuid(),
  txn_date         date not null,
  amount_cents     bigint not null check (amount_cents <> 0),   -- negative = out
  account_id       uuid not null references public.accounts(id),
  category_id      uuid references public.categories(id),
  payee            text,
  notes            text,
  bill_instance_id uuid unique references public.bill_instances(id) on delete set null,
  transfer_group_id uuid,   -- both halves of a transfer (checking -> credit card) share this id
  source           text not null default 'manual'
                   check (source in ('manual','bill_payment','csv','seed')),
  import_hash      text unique,
  created_by       uuid default auth.uid() references auth.users(id),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index transactions_account_date_idx  on public.transactions (account_id, txn_date);
create index transactions_category_date_idx on public.transactions (category_id, txn_date);

-- ---------- updated_at triggers ----------------------------------------
create trigger set_updated_at before update on public.accounts        for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.categories      for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.pay_schedules   for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.paychecks       for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.recurring_bills for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.bill_instances  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.transactions    for each row execute function public.set_updated_at();

-- ---------- Row Level Security -----------------------------------------
-- RLS on means "deny everything" until a policy allows it.
alter table public.household_members enable row level security;
alter table public.accounts          enable row level security;
alter table public.categories        enable row level security;
alter table public.pay_schedules     enable row level security;
alter table public.paychecks         enable row level security;
alter table public.recurring_bills   enable row level security;
alter table public.bill_instances    enable row level security;
alter table public.transactions      enable row level security;

-- Members can see the member list. No insert/update/delete policy, so the
-- app can never add a member; only the SQL editor (as owner) can.
create policy members_read on public.household_members
  for select to authenticated using (private.is_household_member());

create policy household_all on public.accounts        for all to authenticated using (private.is_household_member()) with check (private.is_household_member());
create policy household_all on public.categories      for all to authenticated using (private.is_household_member()) with check (private.is_household_member());
create policy household_all on public.pay_schedules   for all to authenticated using (private.is_household_member()) with check (private.is_household_member());
create policy household_all on public.paychecks       for all to authenticated using (private.is_household_member()) with check (private.is_household_member());
create policy household_all on public.recurring_bills for all to authenticated using (private.is_household_member()) with check (private.is_household_member());
create policy household_all on public.bill_instances  for all to authenticated using (private.is_household_member()) with check (private.is_household_member());
create policy household_all on public.transactions    for all to authenticated using (private.is_household_member()) with check (private.is_household_member());

-- Belt and braces: the logged-out (anon) role gets nothing at all.
revoke all on all tables in schema public from anon;
grant select on public.household_members to authenticated;
grant select, insert, update, delete on
  public.accounts, public.categories, public.pay_schedules, public.paychecks,
  public.recurring_bills, public.bill_instances, public.transactions
  to authenticated;

-- ---------- App functions (called with supabase.rpc) -------------------
-- SECURITY INVOKER (the default): they run as the signed-in user, so RLS
-- still applies. Each runs as one database transaction: all or nothing.

-- Mark a bill paid: create the payment transaction and flip the status together.
create or replace function public.mark_bill_paid(
  p_bill_instance_id uuid,
  p_account_id       uuid,
  p_amount_cents     bigint,      -- positive: what was paid
  p_paid_date        date,
  p_category_id      uuid default null
) returns uuid
language plpgsql set search_path = '' as $$
declare
  v_bill     public.bill_instances;
  v_txn_id   uuid;
  v_to_acct  uuid;
  v_group    uuid;
begin
  if p_amount_cents <= 0 then
    raise exception 'Amount paid must be greater than zero';
  end if;

  select * into v_bill from public.bill_instances
   where id = p_bill_instance_id for update;
  if not found then raise exception 'Bill not found'; end if;
  if v_bill.status = 'paid' then raise exception 'Bill is already marked paid'; end if;

  select rb.transfer_to_account_id into v_to_acct
    from public.recurring_bills rb where rb.id = v_bill.recurring_bill_id;
  if v_to_acct is not null then v_group := gen_random_uuid(); end if;

  insert into public.transactions
    (txn_date, amount_cents, account_id, category_id, payee, bill_instance_id, source, transfer_group_id)
  values
    (p_paid_date, -p_amount_cents, p_account_id,
     coalesce(p_category_id, v_bill.category_id), v_bill.name, v_bill.id, 'bill_payment', v_group)
  returning id into v_txn_id;

  -- Credit card payment: the matching "money in" row on the card account.
  if v_to_acct is not null then
    insert into public.transactions
      (txn_date, amount_cents, account_id, category_id, payee, source, transfer_group_id)
    values
      (p_paid_date, p_amount_cents, v_to_acct,
       coalesce(p_category_id, v_bill.category_id), v_bill.name, 'bill_payment', v_group);
  end if;

  update public.bill_instances
     set status = 'paid', paid_date = p_paid_date
   where id = v_bill.id;

  if v_bill.recurring_bill_id is not null then
    update public.recurring_bills set last_account_id = p_account_id
     where id = v_bill.recurring_bill_id;
  end if;

  return v_txn_id;
end $$;

-- Un-check a bill: delete the payment the app created; if the linked row
-- came from a bank import, keep it and just unlink it.
create or replace function public.unmark_bill_paid(p_bill_instance_id uuid)
returns void
language plpgsql set search_path = '' as $$
begin
  -- Remove the transfer's other half first, then the payment itself.
  delete from public.transactions
   where source = 'bill_payment'
     and transfer_group_id in (select transfer_group_id from public.transactions
                                where bill_instance_id = p_bill_instance_id
                                  and transfer_group_id is not null);
  delete from public.transactions
   where bill_instance_id = p_bill_instance_id and source = 'bill_payment';
  update public.transactions set bill_instance_id = null
   where bill_instance_id = p_bill_instance_id;
  update public.bill_instances set status = 'due', paid_date = null
   where id = p_bill_instance_id;
end $$;

-- Create every-other-Friday paychecks up to a date. Safe to call repeatedly.
-- Sylvia's (manual) paychecks are entered by hand in the app.
create or replace function public.generate_paychecks(p_through date)
returns integer
language plpgsql set search_path = '' as $$
declare v_count integer;
begin
  insert into public.paychecks (pay_schedule_id, pay_date, expected_amount_cents)
  select ps.id, d::date, ps.default_amount_cents
    from public.pay_schedules ps
   cross join lateral generate_series(ps.anchor_date, p_through, interval '14 days') d
   where ps.is_active and ps.frequency = 'biweekly'
  on conflict (pay_schedule_id, pay_date) do nothing;
  get diagnostics v_count = row_count;
  return v_count;
end $$;

-- Fill in a month: make sure paychecks exist, create the month's bill rows
-- from the templates, then give every unassigned bill a covering paycheck.
-- Safe to call repeatedly; the app calls it for this month and next.
create or replace function public.generate_month(p_month date)
returns integer
language plpgsql set search_path = '' as $$
declare
  v_month date := date_trunc('month', p_month)::date;
  v_last  date := (date_trunc('month', p_month) + interval '1 month' - interval '1 day')::date;
  v_a integer; v_b integer;
begin
  perform public.generate_paychecks(v_last);

  -- Monthly bills. Due day 31 in a 30-day month lands on the last day.
  insert into public.bill_instances
    (recurring_bill_id, name, category_id, bill_month, due_date, amount_cents)
  select rb.id, rb.name, rb.category_id, v_month,
         least(v_month + (rb.due_day - 1), v_last), rb.default_amount_cents
    from public.recurring_bills rb
   where rb.is_active and rb.frequency = 'monthly'
  on conflict (recurring_bill_id, bill_month) where generated_for_paycheck_id is null do nothing;
  get diagnostics v_a = row_count;

  -- Per-paycheck bills (car payments): one row per payday in the month, due that day.
  insert into public.bill_instances
    (recurring_bill_id, name, category_id, bill_month, due_date, amount_cents,
     paycheck_id, generated_for_paycheck_id)
  select rb.id, rb.name, rb.category_id, v_month, pc.pay_date, rb.default_amount_cents, pc.id, pc.id
    from public.recurring_bills rb
    join public.paychecks pc on pc.pay_schedule_id = rb.pay_schedule_id
   where rb.is_active and rb.frequency = 'per_paycheck'
     and pc.pay_date between v_month and v_last
  on conflict (recurring_bill_id, generated_for_paycheck_id) where generated_for_paycheck_id is not null do nothing;
  get diagnostics v_b = row_count;

  -- Auto-assign: the latest bill-covering paycheck on or before the due date.
  -- Only touches bills with no paycheck yet, so a manual change sticks.
  update public.bill_instances bi
     set paycheck_id = (
       select pc.id from public.paychecks pc
         join public.pay_schedules ps on ps.id = pc.pay_schedule_id
        where ps.covers_bills and pc.pay_date <= bi.due_date
        order by pc.pay_date desc limit 1)
   where bi.bill_month = v_month and bi.paycheck_id is null and bi.status = 'due';

  return v_a + v_b;
end $$;

-- Postgres lets everyone (PUBLIC) run new functions by default. Lock them down.
revoke execute on function private.is_household_member()                          from public, anon;
revoke execute on function public.mark_bill_paid(uuid, uuid, bigint, date, uuid) from public, anon;
revoke execute on function public.unmark_bill_paid(uuid)                         from public, anon;
revoke execute on function public.generate_month(date)                           from public, anon;
revoke execute on function public.generate_paychecks(date)                       from public, anon;
grant  execute on function private.is_household_member()                          to authenticated;
grant  execute on function public.mark_bill_paid(uuid, uuid, bigint, date, uuid) to authenticated;
grant  execute on function public.unmark_bill_paid(uuid)                         to authenticated;
grant  execute on function public.generate_month(date)                           to authenticated;
grant  execute on function public.generate_paychecks(date)                       to authenticated;

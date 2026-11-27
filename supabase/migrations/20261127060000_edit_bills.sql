-- =====================================================================
-- Phase 3, part 1: add, edit and delete bills from the app.
--
-- How a bill is stored (from phase 1):
--   recurring_bills  the template: name, usual amount, due day, account...
--   bill_instances   one row per month (or per paycheck for car payments),
--                    copied from the template by generate_month().
--
-- So "this month only" changes the one bill_instances row, and "this and
-- future months" changes the template plus every unpaid row from that
-- month on. Paid rows are history and keep what they were.
--
--   start_month      new column: the first month a bill appears. Lets you
--                    add a bill today whose first due date is next month
--                    without it showing up as overdue this month.
--   update_bill()    the edit popup's Save.
--   delete_bill()    the edit popup's Delete.
--
-- Deleting never deletes money. A paid bill's payment stays in
-- Transactions (it really left the account); it's just unlinked from the
-- bill. "This month only" hides the month's row (status 'skipped')
-- instead of deleting it, because generate_month() would otherwise put it
-- straight back.
-- =====================================================================

alter table public.recurring_bills
  add column start_month date
  check (start_month is null or start_month = date_trunc('month', start_month)::date);

-- generate_month(), unchanged from 20261127010000 except that a bill whose
-- start_month is later than the month being filled in is left out.
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
     and (rb.start_month is null or rb.start_month <= v_month)
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
     and (rb.start_month is null or rb.start_month <= v_month)
     and pc.pay_date between v_month and v_last
  on conflict (recurring_bill_id, generated_for_paycheck_id) where generated_for_paycheck_id is not null do nothing;
  get diagnostics v_b = row_count;

  -- Auto-assign the covering paycheck, using each bill's pay_from rule.
  -- Only touches bills with no paycheck yet, so a manual change sticks.
  update public.bill_instances bi
     set paycheck_id = (
       select pc.id from public.paychecks pc
         join public.pay_schedules ps on ps.id = pc.pay_schedule_id
        where ps.covers_bills
          and pc.pay_date <= case
                when (select rb.pay_from from public.recurring_bills rb where rb.id = bi.recurring_bill_id) = 'prev_month_last'
                  then bi.bill_month - 1
                else bi.due_date
              end
        order by pc.pay_date desc limit 1)
   where bi.bill_month = v_month and bi.paycheck_id is null and bi.status = 'due';

  return v_a + v_b;
end $$;

-- ---------- Edit a bill ------------------------------------------------
-- p_scope 'one'    = this month only: changes this row's name, amount,
--                    category and due date. Account, card-payment and
--                    paycheck-rule settings live on the template, so they
--                    can only change with 'future'.
-- p_scope 'future' = this and future months: changes the template, and
--                    every unpaid row of this bill from this one on (for a
--                    car payment, from this payday on).
--
-- Due date: p_due_date if given (one-time bills), otherwise p_due_day
-- (31 in a 30-day month = the last day). Pass p_due_day only when the day
-- was changed: left null, every due date stays as it is, including one
-- you moved for a single month. Per-paycheck bills are due on their payday
-- and ignore both.
--
-- When a due date or paycheck rule changes, the covering paycheck is
-- picked again, the same way generate_month() picks it.
create or replace function public.update_bill(
  p_bill_instance_id       uuid,
  p_scope                  text,
  p_name                   text,
  p_amount_cents           bigint,
  p_category_id            uuid,
  p_due_day                smallint default null,
  p_due_date               date default null,
  p_default_account_id     uuid default null,
  p_transfer_to_account_id uuid default null,
  p_is_variable            boolean default false,
  p_pay_from               text default 'on_or_before'
) returns void
language plpgsql set search_path = '' as $$
declare
  v_bill   public.bill_instances;
  v_rb     public.recurring_bills;
  v_name   text := nullif(btrim(p_name), '');
  v_months date[];
  v_m      date;
  v_day    smallint;
  v_day_changed boolean;
begin
  if p_scope not in ('one', 'future') then raise exception 'Unknown scope %', p_scope; end if;
  if v_name is null then raise exception 'Give the bill a name'; end if;
  if p_amount_cents is null or p_amount_cents < 0 then raise exception 'The amount can''t be negative'; end if;
  if p_due_day is not null and p_due_day not between 1 and 31 then
    raise exception 'The due day must be between 1 and 31';
  end if;

  select * into v_bill from public.bill_instances where id = p_bill_instance_id for update;
  if not found then raise exception 'Bill not found'; end if;
  if v_bill.recurring_bill_id is not null then
    select * into v_rb from public.recurring_bills where id = v_bill.recurring_bill_id for update;
  end if;

  if p_scope = 'future' then
    if v_rb.id is null then raise exception 'A one-time bill has no future months'; end if;
    v_day := coalesce(p_due_day, v_rb.due_day);
    v_day_changed := v_rb.frequency = 'monthly' and v_day is distinct from v_rb.due_day;
    if p_transfer_to_account_id is not null and p_transfer_to_account_id = p_default_account_id then
      raise exception 'A card payment can''t go to the account it''s paid from';
    end if;

    update public.recurring_bills
       set name                   = v_name,
           default_amount_cents   = p_amount_cents,
           category_id            = p_category_id,
           due_day                = case when frequency = 'monthly' then v_day else due_day end,
           default_account_id     = p_default_account_id,
           transfer_to_account_id = p_transfer_to_account_id,
           is_variable            = coalesce(p_is_variable, false),
           pay_from               = coalesce(p_pay_from, 'on_or_before')
     where id = v_rb.id;

    -- Unpaid rows from this month on take the new settings. If the due
    -- date or the paycheck rule changed, clear the paycheck so it's
    -- picked again below.
    with changed as (
      update public.bill_instances bi
         set name         = v_name,
             amount_cents = p_amount_cents,
             category_id  = p_category_id,
             due_date     = new_due,
             paycheck_id  = case when bi.generated_for_paycheck_id is null
                                  and (new_due <> bi.due_date
                                       or coalesce(p_pay_from, 'on_or_before') <> v_rb.pay_from)
                                 then null else bi.paycheck_id end
        from (select b.id,
                     case when b.generated_for_paycheck_id is null and v_day_changed
                          then least(b.bill_month + (v_day - 1),
                                     (b.bill_month + interval '1 month' - interval '1 day')::date)
                          else b.due_date end as new_due
                from public.bill_instances b
               where b.recurring_bill_id = v_rb.id
                 and (b.bill_month > v_bill.bill_month
                      or (b.bill_month = v_bill.bill_month and b.due_date >= v_bill.due_date))
                 and b.status = 'due') n
       where bi.id = n.id
      returning bi.bill_month
    )
    select array_agg(distinct bill_month) into v_months from changed;

    -- The row you opened keeps its history if it's paid, but its name and
    -- category still follow the edit.
    if v_bill.status = 'paid' then
      update public.bill_instances set name = v_name, category_id = p_category_id where id = v_bill.id;
    end if;

  else  -- 'one'
    update public.bill_instances bi
       set name         = v_name,
           amount_cents = p_amount_cents,
           category_id  = p_category_id,
           due_date     = n.new_due,
           paycheck_id  = case when n.new_due <> bi.due_date and bi.status = 'due' then null else bi.paycheck_id end
      from (select case
                     when v_bill.generated_for_paycheck_id is not null then v_bill.due_date
                     when p_due_date is not null then p_due_date
                     when p_due_day is not null then
                       least(v_bill.bill_month + (p_due_day - 1),
                             (v_bill.bill_month + interval '1 month' - interval '1 day')::date)
                     else v_bill.due_date
                   end as new_due) n
     where bi.id = v_bill.id;
    v_months := array[v_bill.bill_month];
  end if;

  -- Re-pick paychecks for any row whose paycheck was cleared.
  if v_months is not null then
    foreach v_m in array v_months loop
      perform public.generate_month(v_m);
    end loop;
  end if;
end $$;

-- ---------- Delete a bill ----------------------------------------------
-- Returns what happened, so the app can say so:
--   'skipped'  this month only: the month's row is hidden.
--   'ended'    this and future: the bill stops from this month on. Earlier
--              months and anything already paid stay as history.
--   'deleted'  the bill is gone completely. Happens for a one-time bill,
--              or for 'future' on a bill with no earlier months, nothing
--              paid and no linked transactions (say, one added by mistake).
--
-- Payments are never deleted, only unlinked from the bill, so account
-- balances and spending don't change. To undo a payment that didn't
-- happen, mark the bill not paid first.
create or replace function public.delete_bill(p_bill_instance_id uuid, p_scope text)
returns text
language plpgsql set search_path = '' as $$
declare
  v_bill public.bill_instances;
begin
  if p_scope not in ('one', 'future') then raise exception 'Unknown scope %', p_scope; end if;

  select * into v_bill from public.bill_instances where id = p_bill_instance_id for update;
  if not found then raise exception 'Bill not found'; end if;

  -- One-time bill: nothing would recreate it, so delete it for real.
  if v_bill.recurring_bill_id is null then
    update public.transactions set bill_instance_id = null where bill_instance_id = v_bill.id;
    delete from public.bill_instances where id = v_bill.id;
    return 'deleted';
  end if;

  if p_scope = 'one' then
    update public.transactions set bill_instance_id = null where bill_instance_id = v_bill.id;
    update public.bill_instances set status = 'skipped', paid_date = null where id = v_bill.id;
    return 'skipped';
  end if;

  -- 'future'. A bill with no history at all is deleted outright.
  if not exists (
       select 1 from public.bill_instances b
        where b.recurring_bill_id = v_bill.recurring_bill_id
          and (b.bill_month < v_bill.bill_month
               or (b.bill_month = v_bill.bill_month and b.due_date < v_bill.due_date)
               or b.status = 'paid'))
     and not exists (
       select 1 from public.transactions t
         join public.bill_instances b on b.id = t.bill_instance_id
        where b.recurring_bill_id = v_bill.recurring_bill_id) then
    delete from public.bill_instances where recurring_bill_id = v_bill.recurring_bill_id;
    delete from public.recurring_bills where id = v_bill.recurring_bill_id;  -- payee rules tied to it are untied
    return 'deleted';
  end if;

  update public.recurring_bills set is_active = false where id = v_bill.recurring_bill_id;
  -- The row you opened goes even if it was paid (its payment stays).
  update public.transactions set bill_instance_id = null where bill_instance_id = v_bill.id;
  update public.bill_instances set status = 'skipped', paid_date = null where id = v_bill.id;
  -- Later unpaid rows go too. Later paid ones are history and stay.
  update public.bill_instances
     set status = 'skipped'
   where recurring_bill_id = v_bill.recurring_bill_id
     and (bill_month > v_bill.bill_month
          or (bill_month = v_bill.bill_month and due_date >= v_bill.due_date))
     and status = 'due';
  return 'ended';
end $$;

revoke execute on function public.generate_month(date) from public, anon;
revoke execute on function public.update_bill(uuid, text, text, bigint, uuid, smallint, date, uuid, uuid, boolean, text) from public, anon;
revoke execute on function public.delete_bill(uuid, text) from public, anon;
grant  execute on function public.generate_month(date) to authenticated;
grant  execute on function public.update_bill(uuid, text, text, bigint, uuid, smallint, date, uuid, uuid, boolean, text) to authenticated;
grant  execute on function public.delete_bill(uuid, text) to authenticated;

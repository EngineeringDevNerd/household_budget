-- =====================================================================
-- Per-bill "which paycheck covers it" rule.
--
--   on_or_before     (default) the latest bill-covering paycheck on or
--                    before the due date.
--   prev_month_last  the last bill-covering paycheck of the previous
--                    month, for bills paid ahead (e.g. rent due the 5th
--                    paid from the prior month's last check).
--
-- Only affects automatic assignment of bills that have no paycheck yet,
-- so moving a bill to another check by hand still sticks.
-- =====================================================================

alter table public.recurring_bills
  add column pay_from text not null default 'on_or_before'
  check (pay_from in ('on_or_before', 'prev_month_last'));

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

-- create or replace keeps the existing grants, but restate them so this
-- file stands on its own.
revoke execute on function public.generate_month(date) from public, anon;
grant  execute on function public.generate_month(date) to authenticated;

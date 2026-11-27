-- =====================================================================
-- Phase 2, part 1: transaction list, manual entry, account balances.
--
--   * Starter spending categories (bills already have theirs).
--   * Account balances start on 2026-11-01, the day tracking starts.
--     Each account's balance = opening balance + every transaction on or
--     after its opening date. Credit cards go negative as you charge them
--     (negative = you owe), matching "negative = money out".
--   * delete_transaction(): one safe way to delete from the list that
--     keeps the bills board and both halves of a transfer in step.
-- =====================================================================

-- ---------- Starter categories -----------------------------------------
-- `on conflict do nothing` so re-running (or a category added by hand
-- with the same name) never fails.
insert into public.categories (name, kind) values
  ('Dining',        'expense'),
  ('Gas',           'expense'),
  ('Shopping',      'expense'),
  ('Kids/Sports',   'expense'),
  ('Entertainment', 'expense'),
  ('Income',        'income'),
  ('Uncategorized', 'expense')
on conflict (name) do nothing;

-- ---------- Tracking starts Nov 1 --------------------------------------
-- The accounts were created on 2026-11-27 with today's date as their
-- opening date. Move it back to Nov 1, but only for accounts nobody has
-- given a real opening balance yet.
update public.accounts
   set opening_balance_date = date '2026-11-01'
 where opening_balance_cents = 0
   and opening_balance_date > date '2026-11-01';

alter table public.accounts alter column opening_balance_date set default date '2026-11-01';

-- ---------- Balances ---------------------------------------------------
-- security_invoker: the view runs as the signed-in user, so the RLS on
-- accounts and transactions still applies. Without it a view runs as its
-- owner and would skip RLS.
create or replace view public.account_balances
with (security_invoker = true) as
select a.id,
       a.name,
       a.type,
       a.sort_order,
       a.is_active,
       a.opening_balance_cents,
       a.opening_balance_date,
       a.opening_balance_cents + coalesce((
         select sum(t.amount_cents)
           from public.transactions t
          where t.account_id = a.id
            and t.txn_date >= a.opening_balance_date
       ), 0)::bigint as balance_cents
  from public.accounts a;

revoke all on public.account_balances from anon, public;
grant select on public.account_balances to authenticated;

-- ---------- Safe delete ------------------------------------------------
-- Deleting from the transaction list:
--   * a bill payment the app created (either half, if it was a card
--     payment) -> un-check the bill, which removes the payment;
--   * one half of any other transfer -> remove both halves;
--   * anything else -> just delete it.
create or replace function public.delete_transaction(p_transaction_id uuid)
returns void
language plpgsql set search_path = '' as $$
declare
  v_txn  public.transactions;
  v_bill uuid;
begin
  select * into v_txn from public.transactions where id = p_transaction_id;
  if not found then raise exception 'Transaction not found'; end if;

  -- The bill this payment belongs to, found on this row or on its transfer partner.
  select t.bill_instance_id into v_bill
    from public.transactions t
   where t.bill_instance_id is not null
     and t.source = 'bill_payment'
     and (t.id = v_txn.id
          or (v_txn.transfer_group_id is not null and t.transfer_group_id = v_txn.transfer_group_id))
   limit 1;

  if v_txn.source = 'bill_payment' and v_bill is not null then
    perform public.unmark_bill_paid(v_bill);
  elsif v_txn.transfer_group_id is not null then
    delete from public.transactions where transfer_group_id = v_txn.transfer_group_id;
  else
    delete from public.transactions where id = v_txn.id;
  end if;
end $$;

revoke execute on function public.delete_transaction(uuid) from public, anon;
grant  execute on function public.delete_transaction(uuid) to authenticated;

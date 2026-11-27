-- =====================================================================
-- Phase 2, part 3: match imported bank rows to what's already in the app.
--
-- The app suggests matches; nothing is linked until you confirm. The
-- three kinds of match, each one confirmed with its own function:
--
--   link_imported_row()   A bank row is the same money as a payment you
--                         already recorded (marking a bill paid, or a
--                         manual entry). The bank's details move onto
--                         your row and the duplicate bank row goes away.
--   pair_transfer()       A payment leaving Arvest and the same payment
--                         arriving on a card: both get one transfer id
--                         and the Credit Card Payment category, so
--                         neither side counts as spending.
--   mark_paid_from_import() A bank row pays a bill that's still due (or
--                         was checked off with no payment row): the bill
--                         is checked off using that row.
--
--   dismiss_match()       "Not a match": the row stops being suggested.
-- =====================================================================

alter table public.transactions
  add column match_dismissed boolean not null default false;

-- ---------- Link a bank row to an existing payment ---------------------
create or replace function public.link_imported_row(p_imported_id uuid, p_existing_id uuid)
returns void
language plpgsql set search_path = '' as $$
declare
  v_imp public.transactions;
  v_old public.transactions;
begin
  select * into v_imp from public.transactions where id = p_imported_id for update;
  select * into v_old from public.transactions where id = p_existing_id for update;
  if v_imp.id is null or v_old.id is null then raise exception 'Transaction not found'; end if;
  if v_imp.source <> 'csv' then raise exception 'The first row must be an imported bank row'; end if;
  if v_old.source = 'csv' or v_old.import_hash is not null then
    raise exception 'That payment is already linked to a bank row';
  end if;
  if v_imp.account_id <> v_old.account_id or v_imp.amount_cents <> v_old.amount_cents then
    raise exception 'The account and amount must match';
  end if;

  -- Remove the bank row first: import_hash is unique, so it can't be on both.
  delete from public.transactions where id = v_imp.id;

  update public.transactions
     set txn_date             = v_imp.txn_date,   -- the bank's date is the real one
         import_hash          = v_imp.import_hash,
         import_batch_id      = v_imp.import_batch_id,
         original_description = v_imp.original_description,
         bank_category        = v_imp.bank_category
   where id = v_old.id;

  -- If that payment checked off a bill, the bill's paid date follows the bank too.
  update public.bill_instances set paid_date = v_imp.txn_date
   where id = v_old.bill_instance_id and status = 'paid';
end $$;

-- ---------- Pair the two sides of a card payment -----------------------
create or replace function public.pair_transfer(p_out_id uuid, p_in_id uuid)
returns void
language plpgsql set search_path = '' as $$
declare
  v_out public.transactions;
  v_in  public.transactions;
  v_cat uuid;
begin
  select * into v_out from public.transactions where id = p_out_id for update;
  select * into v_in  from public.transactions where id = p_in_id  for update;
  if v_out.id is null or v_in.id is null then raise exception 'Transaction not found'; end if;
  if v_out.amount_cents >= 0 or v_in.amount_cents <> -v_out.amount_cents then
    raise exception 'A transfer needs money out of one account and the same amount into another';
  end if;
  if v_out.account_id = v_in.account_id then raise exception 'Both sides are on the same account'; end if;
  if v_out.transfer_group_id is not null or v_in.transfer_group_id is not null then
    raise exception 'One of these is already part of a transfer';
  end if;

  select id into v_cat from public.categories
   where kind = 'transfer' order by (name = 'Credit Card Payment') desc, name limit 1;

  update public.transactions
     set transfer_group_id = gen_random_uuid(), category_id = coalesce(v_cat, category_id)
   where id = v_out.id;
  update public.transactions
     set transfer_group_id = (select transfer_group_id from public.transactions where id = v_out.id),
         category_id = coalesce(v_cat, category_id)
   where id = v_in.id;
end $$;

-- ---------- Check off a due bill using a bank row ----------------------
create or replace function public.mark_paid_from_import(p_bill_instance_id uuid, p_transaction_id uuid)
returns void
language plpgsql set search_path = '' as $$
declare
  v_bill public.bill_instances;
  v_txn  public.transactions;
begin
  select * into v_bill from public.bill_instances where id = p_bill_instance_id for update;
  select * into v_txn  from public.transactions  where id = p_transaction_id  for update;
  if v_bill.id is null or v_txn.id is null then raise exception 'Not found'; end if;
  -- A due bill, or one already checked off that has no payment row yet
  -- (the November bills ticked off from the spreadsheet).
  if v_bill.status = 'skipped'
     or (v_bill.status = 'paid' and exists (select 1 from public.transactions where bill_instance_id = v_bill.id)) then
    raise exception 'That bill already has a payment';
  end if;
  if v_txn.amount_cents >= 0 then raise exception 'That row isn’t a payment'; end if;
  if v_txn.bill_instance_id is not null then raise exception 'That row already pays a bill'; end if;

  update public.transactions
     set bill_instance_id = v_bill.id,
         -- Keep a category you picked; replace a blank or "Uncategorized" with the bill's.
         category_id = case
           when category_id is null
             or category_id in (select id from public.categories where name = 'Uncategorized')
           then coalesce(v_bill.category_id, category_id)
           else category_id end
   where id = v_txn.id;

  update public.bill_instances set status = 'paid', paid_date = v_txn.txn_date where id = v_bill.id;

  if v_bill.recurring_bill_id is not null then
    update public.recurring_bills set last_account_id = v_txn.account_id where id = v_bill.recurring_bill_id;
  end if;
end $$;

-- ---------- "Not a match" ----------------------------------------------
create or replace function public.dismiss_match(p_transaction_id uuid)
returns void
language sql set search_path = '' as $$
  update public.transactions set match_dismissed = true where id = p_transaction_id;
$$;

-- ---------- Keep the bills board in step when bank rows go away --------
-- Deleting (or un-importing) a bank row that was checking off a bill puts
-- the bill back to due, the same as un-checking it.
create or replace function public.delete_transaction(p_transaction_id uuid)
returns void
language plpgsql set search_path = '' as $$
declare
  v_txn  public.transactions;
  v_bill uuid;
begin
  select * into v_txn from public.transactions where id = p_transaction_id;
  if not found then raise exception 'Transaction not found'; end if;

  select t.bill_instance_id into v_bill
    from public.transactions t
   where t.bill_instance_id is not null
     and t.source = 'bill_payment'
     and (t.id = v_txn.id
          or (v_txn.transfer_group_id is not null and t.transfer_group_id = v_txn.transfer_group_id))
   limit 1;

  if v_txn.source = 'bill_payment' and v_bill is not null then
    perform public.unmark_bill_paid(v_bill);
    return;
  end if;

  if v_txn.bill_instance_id is not null then
    update public.bill_instances set status = 'due', paid_date = null
     where id = v_txn.bill_instance_id and status = 'paid';
  end if;

  if v_txn.transfer_group_id is not null then
    -- Imported transfer halves are bank facts: deleting one side just
    -- un-pairs the other instead of deleting it too.
    update public.transactions set transfer_group_id = null
     where transfer_group_id = v_txn.transfer_group_id and id <> v_txn.id and source = 'csv';
    delete from public.transactions
     where transfer_group_id = v_txn.transfer_group_id and (id = v_txn.id or source <> 'csv');
  else
    delete from public.transactions where id = v_txn.id;
  end if;
end $$;

create or replace function public.undo_import(p_batch_id uuid)
returns integer
language plpgsql set search_path = '' as $$
declare v_deleted integer;
begin
  -- Bills these rows checked off go back to due.
  update public.bill_instances bi set status = 'due', paid_date = null
    from public.transactions t
   where t.import_batch_id = p_batch_id and t.source = 'csv'
     and t.bill_instance_id = bi.id and bi.status = 'paid';
  -- Their transfer partners from other imports stay, un-paired.
  update public.transactions o set transfer_group_id = null
    from public.transactions t
   where t.import_batch_id = p_batch_id and t.source = 'csv'
     and t.transfer_group_id is not null
     and o.transfer_group_id = t.transfer_group_id
     and o.import_batch_id is distinct from p_batch_id;
  delete from public.transactions where import_batch_id = p_batch_id and source = 'csv';
  get diagnostics v_deleted = row_count;
  delete from public.import_batches where id = p_batch_id;
  return v_deleted;
end $$;

revoke execute on function public.link_imported_row(uuid, uuid)     from public, anon;
revoke execute on function public.pair_transfer(uuid, uuid)         from public, anon;
revoke execute on function public.mark_paid_from_import(uuid, uuid) from public, anon;
revoke execute on function public.dismiss_match(uuid)               from public, anon;
revoke execute on function public.delete_transaction(uuid)          from public, anon;
revoke execute on function public.undo_import(uuid)                 from public, anon;
grant  execute on function public.link_imported_row(uuid, uuid)     to authenticated;
grant  execute on function public.pair_transfer(uuid, uuid)         to authenticated;
grant  execute on function public.mark_paid_from_import(uuid, uuid) to authenticated;
grant  execute on function public.dismiss_match(uuid)               to authenticated;
grant  execute on function public.delete_transaction(uuid)          to authenticated;
grant  execute on function public.undo_import(uuid)                 to authenticated;

-- =====================================================================
-- Phase 2, part 2: CSV import.
--
--   * accounts.card_numbers: last 4 digits of each card on the account,
--     so a Capital One file (which only names the card by its last 4)
--     picks the right account by itself. Entered in the app, never in
--     this repo.
--   * import_batches: one row per imported file, so a bad import can be
--     undone in one step.
--   * transactions gain the bank's original description and category,
--     and which batch they came from.
--   * import_transactions(): saves a whole file in one database
--     transaction (all or nothing). Rows whose import_hash already exists
--     are skipped, so importing the same file twice never doubles up.
--   * undo_import(): deletes a batch and the transactions it created.
-- =====================================================================

alter table public.accounts
  add column card_numbers text[] not null default '{}'
  check (array_to_string(card_numbers, ',') ~ '^([0-9]{4}(,[0-9]{4})*)?$');  -- each entry is exactly 4 digits

create table public.import_batches (
  id                    uuid primary key default gen_random_uuid(),
  file_name             text not null,
  format                text not null,             -- 'capital_one', 'arvest', 'standard', 'custom'
  row_count             int not null default 0,     -- rows sent to the database
  inserted_count        int not null default 0,     -- rows actually added (the rest were already there)
  total_cents           bigint not null default 0,  -- sum of the rows sent, for checking against a statement
  statement_total_cents bigint,                     -- what the person typed from the statement, if anything
  created_by            uuid default auth.uid() references auth.users(id),
  created_at            timestamptz not null default now()
);

alter table public.transactions
  add column import_batch_id      uuid references public.import_batches(id) on delete set null,
  add column original_description text,   -- exactly what the bank sent; payee is the cleaned-up version
  add column bank_category        text;   -- the bank's own label, kept for future payee rules

-- Foreign keys aren't indexed automatically; undo looks rows up by batch.
create index transactions_import_batch_idx on public.transactions (import_batch_id) where import_batch_id is not null;

alter table public.import_batches enable row level security;
create policy household_all on public.import_batches for all to authenticated
  using (private.is_household_member()) with check (private.is_household_member());
revoke all on public.import_batches from anon;
grant select, insert, update, delete on public.import_batches to authenticated;

-- p_rows is a JSON array of objects with these keys:
--   txn_date, amount_cents, account_id, payee, original_description,
--   bank_category, category_id, import_hash
create or replace function public.import_transactions(
  p_file_name             text,
  p_format                text,
  p_statement_total_cents bigint,
  p_rows                  jsonb
) returns jsonb
language plpgsql set search_path = '' as $$
declare
  v_batch    uuid;
  v_count    int;
  v_total    bigint;
  v_inserted int;
begin
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 then
    raise exception 'Nothing to import';
  end if;

  select count(*), coalesce(sum((r->>'amount_cents')::bigint), 0)
    into v_count, v_total
    from jsonb_array_elements(p_rows) r;

  insert into public.import_batches (file_name, format, row_count, total_cents, statement_total_cents)
  values (p_file_name, p_format, v_count, v_total, p_statement_total_cents)
  returning id into v_batch;

  insert into public.transactions
    (txn_date, amount_cents, account_id, payee, original_description, bank_category,
     category_id, import_hash, import_batch_id, source)
  select (r->>'txn_date')::date,
         (r->>'amount_cents')::bigint,
         (r->>'account_id')::uuid,
         nullif(r->>'payee', ''),
         r->>'original_description',
         nullif(r->>'bank_category', ''),
         nullif(r->>'category_id', '')::uuid,
         r->>'import_hash',
         v_batch,
         'csv'
    from jsonb_array_elements(p_rows) r
  on conflict (import_hash) do nothing;
  get diagnostics v_inserted = row_count;

  -- Everything was already there: don't leave an empty batch in the history.
  if v_inserted = 0 then
    delete from public.import_batches where id = v_batch;
    v_batch := null;
  else
    update public.import_batches set inserted_count = v_inserted where id = v_batch;
  end if;

  return jsonb_build_object('batch_id', v_batch, 'inserted', v_inserted, 'skipped', v_count - v_inserted);
end $$;

create or replace function public.undo_import(p_batch_id uuid)
returns integer
language plpgsql set search_path = '' as $$
declare v_deleted integer;
begin
  delete from public.transactions where import_batch_id = p_batch_id and source = 'csv';
  get diagnostics v_deleted = row_count;
  delete from public.import_batches where id = p_batch_id;
  return v_deleted;
end $$;

revoke execute on function public.import_transactions(text, text, bigint, jsonb) from public, anon;
revoke execute on function public.undo_import(uuid)                           from public, anon;
grant  execute on function public.import_transactions(text, text, bigint, jsonb) to authenticated;
grant  execute on function public.undo_import(uuid)                           to authenticated;

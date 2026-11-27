-- =====================================================================
-- Phase 2, part 4: payee rules.
--
-- A rule says: "when the bank's description contains this text, call it
-- this payee, put it in this category, and (optionally) it pays this
-- bill". Matching ignores upper/lower case. When several rules match,
-- the one with the longest text wins (it's the most specific).
--
-- Rules are used:
--   * by the import preview, to fill in payee and category;
--   * by the match suggestions: a row tied to a bill matches that bill at
--     any amount near its due date (electric, DirecTV and other bills
--     that change month to month);
--   * once, when a rule is saved, on past rows that are still
--     Uncategorized (apply_payee_rule). Rows you categorized by hand are
--     never changed.
-- =====================================================================

create table public.payee_rules (
  id                uuid primary key default gen_random_uuid(),
  match_text        text not null check (length(trim(match_text)) >= 3),
  payee_name        text,
  category_id       uuid references public.categories(id) on delete set null,
  recurring_bill_id uuid references public.recurring_bills(id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  check (payee_name is not null or category_id is not null or recurring_bill_id is not null)
);

-- One rule per text, ignoring case, so saving "Always do this" twice updates it.
create unique index payee_rules_match_text_uniq on public.payee_rules (lower(trim(match_text)));
create index payee_rules_category_idx on public.payee_rules (category_id) where category_id is not null;
create index payee_rules_bill_idx     on public.payee_rules (recurring_bill_id) where recurring_bill_id is not null;

create trigger set_updated_at before update on public.payee_rules
  for each row execute function public.set_updated_at();

alter table public.payee_rules enable row level security;
create policy household_all on public.payee_rules for all to authenticated
  using (private.is_household_member()) with check (private.is_household_member());
revoke all on public.payee_rules from anon;
grant select, insert, update, delete on public.payee_rules to authenticated;

-- Apply one rule to past rows that are still uncategorized (no category,
-- or "Uncategorized"). Returns how many rows changed. Uses position()
-- rather than LIKE so a % or _ in the text is just a character.
create or replace function public.apply_payee_rule(p_rule_id uuid)
returns integer
language plpgsql set search_path = '' as $$
declare
  v_rule  public.payee_rules;
  v_count integer;
begin
  select * into v_rule from public.payee_rules where id = p_rule_id;
  if not found then raise exception 'Rule not found'; end if;

  update public.transactions t
     set payee       = coalesce(v_rule.payee_name, t.payee),
         category_id = coalesce(v_rule.category_id, t.category_id)
   where position(lower(trim(v_rule.match_text)) in lower(coalesce(t.original_description, t.payee, ''))) > 0
     and (t.category_id is null
          or t.category_id in (select id from public.categories where name = 'Uncategorized'))
     -- A longer (more specific) rule that also matches this row wins.
     and not exists (
       select 1 from public.payee_rules o
        where o.id <> v_rule.id
          and length(trim(o.match_text)) > length(trim(v_rule.match_text))
          and position(lower(trim(o.match_text)) in lower(coalesce(t.original_description, t.payee, ''))) > 0);
  get diagnostics v_count = row_count;
  return v_count;
end $$;

revoke execute on function public.apply_payee_rule(uuid) from public, anon;
grant  execute on function public.apply_payee_rule(uuid) to authenticated;

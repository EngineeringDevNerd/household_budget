import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { findMatches, type MatchAccount, type MatchBill, type MatchTxn, type Suggestion } from './findMatches'

const TXN_COLUMNS = 'id, txn_date, amount_cents, account_id, payee, original_description, bill_instance_id, transfer_group_id, source'

/** Loads everything the matching rules need and returns the suggestions. */
export function useMatches() {
  const [suggestions, setSuggestions] = useState<Suggestion[] | null>(null)
  const [accounts, setAccounts] = useState<MatchAccount[]>([])
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!supabase) return
    const [imported, appRows, bills, accts, billTxns, rules] = await Promise.all([
      supabase
        .from('transactions')
        .select(TXN_COLUMNS)
        .eq('source', 'csv')
        .eq('match_dismissed', false)
        .or('bill_instance_id.is.null,transfer_group_id.is.null'),
      supabase.from('transactions').select(TXN_COLUMNS).neq('source', 'csv').is('import_hash', null),
      supabase.from('bill_instances').select('id, name, due_date, amount_cents, status, recurring_bill_id').in('status', ['due', 'paid']),
      supabase.from('accounts').select('id, name, type'),
      supabase.from('transactions').select('bill_instance_id').not('bill_instance_id', 'is', null),
      supabase.from('payee_rules').select('match_text, recurring_bill_id').not('recurring_bill_id', 'is', null),
    ])
    const failed = [imported, appRows, bills, accts, billTxns, rules].find((r) => r.error)
    if (failed?.error) return setError(failed.error.message)
    setAccounts(accts.data ?? [])
    setSuggestions(
      findMatches({
        imported: (imported.data ?? []) as MatchTxn[],
        appRows: (appRows.data ?? []) as MatchTxn[],
        // A paid bill is still matchable when nothing records its payment yet.
        dueBills: ((bills.data ?? []) as MatchBill[]).filter(
          (b) => b.status === 'due' || !(billTxns.data ?? []).some((t) => t.bill_instance_id === b.id),
        ),
        accounts: accts.data ?? [],
        rules: rules.data ?? [],
      }),
    )
    setError(null)
  }, [])

  useEffect(() => {
    // oxlint-disable-next-line react/set-state-in-effect
    load()
  }, [load])

  return { suggestions, accounts, error, reload: load }
}

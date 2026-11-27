import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { monthEnd } from '../../lib/dates'
import type { Tables } from '../../types/database'

export type Txn = Pick<
  Tables<'transactions'>,
  | 'id'
  | 'txn_date'
  | 'amount_cents'
  | 'account_id'
  | 'category_id'
  | 'payee'
  | 'notes'
  | 'bill_instance_id'
  | 'transfer_group_id'
  | 'source'
>
export type AccountBalance = Tables<'account_balances'>
export type TxnCategory = Pick<Tables<'categories'>, 'id' | 'name' | 'kind'>

export type TransactionsData = {
  month: string
  transactions: Txn[]
  accounts: AccountBalance[]
  categories: TxnCategory[]
}

/** Every transaction in one month (all accounts), plus account balances. */
export function useTransactions(month: string) {
  const [data, setData] = useState<TransactionsData | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!supabase) return
    try {
      const [txns, accounts, categories] = await Promise.all([
        supabase
          .from('transactions')
          .select('id, txn_date, amount_cents, account_id, category_id, payee, notes, bill_instance_id, transfer_group_id, source')
          .gte('txn_date', month)
          .lte('txn_date', monthEnd(month))
          .order('txn_date', { ascending: false })
          .order('created_at', { ascending: false }),
        supabase.from('account_balances').select('*').order('sort_order').order('name'),
        supabase.from('categories').select('id, name, kind').eq('is_active', true).order('name'),
      ])
      for (const r of [txns, accounts, categories]) if (r.error) throw r.error
      setData({
        month,
        transactions: txns.data ?? [],
        accounts: accounts.data ?? [],
        categories: categories.data ?? [],
      })
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong loading your transactions.')
    }
  }, [month])

  useEffect(() => {
    // oxlint-disable-next-line react/set-state-in-effect
    load()
  }, [load])

  return { data, error, reload: load }
}

/** Card payments and other money moving between your own accounts. */
export function isTransfer(t: Txn, categories: TxnCategory[]): boolean {
  if (t.transfer_group_id) return true
  return categories.find((c) => c.id === t.category_id)?.kind === 'transfer'
}

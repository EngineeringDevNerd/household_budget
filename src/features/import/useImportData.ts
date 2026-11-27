import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import type { Tables } from '../../types/database'

export type ImportAccount = Pick<
  Tables<'accounts'>,
  'id' | 'name' | 'type' | 'card_numbers' | 'opening_balance_date' | 'is_active'
>
export type ImportCategory = Pick<Tables<'categories'>, 'id' | 'name' | 'kind'>
export type Batch = Pick<
  Tables<'import_batches'>,
  'id' | 'file_name' | 'format' | 'row_count' | 'inserted_count' | 'total_cents' | 'created_at'
>

export type ImportData = { accounts: ImportAccount[]; categories: ImportCategory[]; batches: Batch[] }

export function useImportData() {
  const [data, setData] = useState<ImportData | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!supabase) return
    const [accounts, categories, batches] = await Promise.all([
      supabase
        .from('accounts')
        .select('id, name, type, card_numbers, opening_balance_date, is_active')
        .order('sort_order')
        .order('name'),
      supabase.from('categories').select('id, name, kind').eq('is_active', true).order('name'),
      supabase
        .from('import_batches')
        .select('id, file_name, format, row_count, inserted_count, total_cents, created_at')
        .order('created_at', { ascending: false })
        .limit(10),
    ])
    const failed = [accounts, categories, batches].find((r) => r.error)
    if (failed?.error) return setError(failed.error.message)
    setData({ accounts: accounts.data ?? [], categories: categories.data ?? [], batches: batches.data ?? [] })
    setError(null)
  }, [])

  useEffect(() => {
    // oxlint-disable-next-line react/set-state-in-effect
    load()
  }, [load])

  return { data, error, reload: load }
}

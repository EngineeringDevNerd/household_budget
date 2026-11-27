import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { addMonths, monthEnd, monthStart, todayISO } from '../../lib/dates'
import type { Tables } from '../../types/database'

export type Bill = Tables<'bill_instances'> & {
  recurring_bills: Pick<
    Tables<'recurring_bills'>,
    | 'last_account_id'
    | 'default_account_id'
    | 'due_day'
    | 'frequency'
    | 'transfer_to_account_id'
    | 'is_variable'
    | 'pay_from'
  > | null
  paycheck: Pick<Tables<'paychecks'>, 'pay_date'> | null
}
export type Account = Pick<Tables<'accounts'>, 'id' | 'name' | 'type'>
export type Category = Pick<Tables<'categories'>, 'id' | 'name' | 'kind'>
export type PaySchedule = Pick<Tables<'pay_schedules'>, 'id' | 'name' | 'frequency' | 'covers_bills'>

export type BoardData = {
  today: string
  bills: Bill[]
  accounts: Account[]
  categories: Category[]
  paySchedules: PaySchedule[]
  nextPayday: string | null
}

export function useBoard() {
  const [data, setData] = useState<BoardData | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!supabase) return
    const today = todayISO()
    const thisMonth = monthStart(today)
    const nextMonth = addMonths(today, 1)
    try {
      // Make sure this month's and next month's bills and paychecks exist.
      // Safe to repeat: it only adds what's missing.
      for (const m of [thisMonth, nextMonth]) {
        const { error: genError } = await supabase.rpc('generate_month', { p_month: m })
        if (genError) throw genError
      }

      const [bills, accounts, categories, payday, schedules] = await Promise.all([
        supabase
          .from('bill_instances')
          .select(
            '*, recurring_bills(last_account_id, default_account_id, due_day, frequency, transfer_to_account_id, is_variable, pay_from), paycheck:paychecks!bill_instances_paycheck_id_fkey(pay_date)',
          )
          // This month and next, plus anything older that's still unpaid.
          .or(`due_date.gte.${thisMonth},status.eq.due`)
          .lte('due_date', monthEnd(nextMonth))
          .neq('status', 'skipped')
          .order('due_date')
          .order('name'),
        supabase.from('accounts').select('id, name, type').eq('is_active', true).order('sort_order').order('name'),
        supabase.from('categories').select('id, name, kind').eq('is_active', true).order('name'),
        supabase
          .from('paychecks')
          .select('pay_date, pay_schedules!inner(covers_bills)')
          .eq('pay_schedules.covers_bills', true)
          .gt('pay_date', today)
          .order('pay_date')
          .limit(1),
        supabase.from('pay_schedules').select('id, name, frequency, covers_bills').eq('is_active', true).order('name'),
      ])
      for (const r of [bills, accounts, categories, payday, schedules]) if (r.error) throw r.error

      setData({
        today,
        bills: (bills.data ?? []) as unknown as Bill[],
        accounts: accounts.data ?? [],
        categories: categories.data ?? [],
        paySchedules: schedules.data ?? [],
        nextPayday: payday.data?.[0]?.pay_date ?? null,
      })
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong loading your bills.')
    }
  }, [])

  useEffect(() => {
    // Loading from the server on mount is exactly what an effect is for.
    // oxlint-disable-next-line react/set-state-in-effect
    load()
  }, [load])

  return { data, error, reload: load }
}

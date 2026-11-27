import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { addMonths, monthEnd, monthStart, todayISO } from '../../lib/dates'
import type { Tables } from '../../types/database'

export type Paycheck = Pick<
  Tables<'paychecks'>,
  'id' | 'pay_date' | 'expected_amount_cents' | 'actual_amount_cents' | 'received_on' | 'notes' | 'pay_schedule_id'
> & { pay_schedules: Pick<Tables<'pay_schedules'>, 'name' | 'covers_bills'> }

export type CheckBill = Pick<
  Tables<'bill_instances'>,
  'id' | 'name' | 'due_date' | 'amount_cents' | 'status' | 'paycheck_id' | 'category_id'
>

export type PaychecksData = {
  today: string
  from: string
  through: string
  paychecks: Paycheck[]
  bills: CheckBill[]
  transferCategoryIds: Set<string>
  /** The manual (non bill-covering) schedule Sylvia's pay is entered under. */
  poolScheduleId: string | null
}

export function usePaychecks() {
  const [data, setData] = useState<PaychecksData | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!supabase) return
    const today = todayISO()
    const from = monthStart(today)
    const nextMonth = addMonths(today, 1)
    const through = monthEnd(nextMonth)
    try {
      for (const m of [from, nextMonth]) {
        const { error: genError } = await supabase.rpc('generate_month', { p_month: m })
        if (genError) throw genError
      }

      const [paychecks, categories, schedules] = await Promise.all([
        supabase
          .from('paychecks')
          .select(
            'id, pay_date, expected_amount_cents, actual_amount_cents, received_on, notes, pay_schedule_id, pay_schedules!inner(name, covers_bills)',
          )
          .gte('pay_date', from)
          .lte('pay_date', through)
          .order('pay_date'),
        supabase.from('categories').select('id, kind'),
        supabase.from('pay_schedules').select('id, covers_bills, frequency').eq('is_active', true),
      ])
      for (const r of [paychecks, categories, schedules]) if (r.error) throw r.error

      const checks = (paychecks.data ?? []) as unknown as Paycheck[]
      const ids = checks.map((p) => p.id)
      const bills = ids.length
        ? await supabase
            .from('bill_instances')
            .select('id, name, due_date, amount_cents, status, paycheck_id, category_id')
            .in('paycheck_id', ids)
            .neq('status', 'skipped')
            .order('due_date')
            .order('name')
        : { data: [], error: null }
      if (bills.error) throw bills.error

      setData({
        today,
        from,
        through,
        paychecks: checks,
        bills: bills.data ?? [],
        transferCategoryIds: new Set((categories.data ?? []).filter((c) => c.kind === 'transfer').map((c) => c.id)),
        poolScheduleId:
          (schedules.data ?? []).find((s) => !s.covers_bills && s.frequency === 'manual')?.id ?? null,
      })
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong loading your paychecks.')
    }
  }, [])

  useEffect(() => {
    // oxlint-disable-next-line react/set-state-in-effect
    load()
  }, [load])

  return { data, error, reload: load }
}

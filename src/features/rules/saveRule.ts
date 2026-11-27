import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import type { Rule } from './rules'

export type RuleFields = Omit<Rule, 'id'>
export type BillOption = { id: string; name: string }
export type CategoryOption = { id: string; name: string; is_active: boolean }

/**
 * Saves a rule (updating the one with the same text, if there is one),
 * then applies it to past rows that are still uncategorized.
 * Returns how many past rows it changed.
 */
export async function saveRule(fields: RuleFields, id?: string): Promise<number> {
  if (!supabase) return 0
  const clean = { ...fields, match_text: fields.match_text.trim() }
  if (clean.match_text.length < 3) throw new Error('The text to look for needs at least 3 characters.')
  if (!clean.payee_name && !clean.category_id && !clean.recurring_bill_id) {
    throw new Error('A rule needs a payee name, a category or a bill.')
  }

  let ruleId = id
  if (!ruleId) {
    // Same text as an existing rule (ignoring case)? Update that one.
    const { data: existing, error } = await supabase.from('payee_rules').select('id, match_text')
    if (error) throw error
    ruleId = existing?.find((r) => r.match_text.trim().toLowerCase() === clean.match_text.toLowerCase())?.id
  }
  const { data: saved, error: saveError } = ruleId
    ? await supabase.from('payee_rules').update(clean).eq('id', ruleId).select('id').single()
    : await supabase.from('payee_rules').insert(clean).select('id').single()
  if (saveError) throw saveError

  const { data: changed, error: applyError } = await supabase.rpc('apply_payee_rule', { p_rule_id: saved.id })
  if (applyError) throw applyError
  return changed ?? 0
}

/** Everything the rule editors need to show their pickers. */
export function useRuleOptions() {
  const [rules, setRules] = useState<Rule[] | null>(null)
  const [bills, setBills] = useState<BillOption[]>([])
  const [categories, setCategories] = useState<CategoryOption[]>([])
  const [error, setError] = useState<string | null>(null)
  const [version, setVersion] = useState(0)

  useEffect(() => {
    if (!supabase) return
    let cancelled = false
    Promise.all([
      supabase.from('payee_rules').select('id, match_text, payee_name, category_id, recurring_bill_id').order('match_text'),
      supabase.from('recurring_bills').select('id, name, is_active').order('name'),
      supabase.from('categories').select('id, name, is_active').order('name'),
    ]).then(([r, b, c]) => {
      if (cancelled) return
      const failed = [r, b, c].find((x) => x.error)
      if (failed?.error) return setError(failed.error.message)
      setRules(r.data ?? [])
      setBills(b.data ?? [])
      setCategories(c.data ?? [])
    })
    return () => {
      cancelled = true
    }
  }, [version])

  return { rules, bills, categories, error, reload: () => setVersion((v) => v + 1) }
}

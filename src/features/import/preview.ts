import { supabase } from '../../lib/supabase'
import { addDays, daysBetween } from '../../lib/dates'
import { cleanPayee, guessCategory } from './categorize'
import type { Detected, ParsedRow } from './formats'
import { fingerprints } from './hash'
import { findRule, type Rule } from '../rules/rules'
import type { ImportAccount, ImportCategory } from './useImportData'

export type RowStatus = 'new' | 'duplicate' | 'possible' | 'before_start'

export type PreviewRow = {
  line: number
  date: string
  description: string
  payee: string
  amountCents: number
  accountId: string
  bankCategory: string | null
  categoryId: string | null
  hash: string
  status: RowStatus
  note: string | null
  include: boolean
}

/** Which account a row belongs to is decided per group: a card number, an account name, or the whole file. */
export function groupKey(row: ParsedRow, d: Detected): string {
  if (d.format === 'capital_one' && row.card) return `card:${row.card}`
  if (row.accountName) return `name:${row.accountName.toLowerCase()}`
  return 'file'
}

export function groupLabel(key: string): string {
  if (key.startsWith('card:')) return `Card ending ${key.slice(5)}`
  if (key.startsWith('name:')) return `“${key.slice(5)}” in the file`
  return 'This file'
}

/** The account each group most likely belongs to, or '' when there's no good guess. */
export function suggestAccount(key: string, d: Detected, accounts: ImportAccount[]): string {
  const active = accounts.filter((a) => a.is_active)
  if (key.startsWith('card:')) return active.find((a) => a.card_numbers.includes(key.slice(5)))?.id ?? ''
  if (key.startsWith('name:')) return active.find((a) => a.name.toLowerCase() === key.slice(5))?.id ?? ''
  if (d.format === 'arvest') return active.find((a) => a.type === 'checking')?.id ?? ''
  return ''
}

const MATCH_DAYS = 4

/**
 * Builds the preview: fingerprints every row, then checks the database for
 *  - rows already imported (same fingerprint)                      -> skipped
 *  - a manual entry or marked-paid bill with the same account and
 *    amount within 4 days (probably the same money)                 -> noted;
 *    imported anyway and offered as a match to link afterwards
 *  - rows dated before the account's tracking start date            -> unticked
 */
export async function buildPreview(
  parsed: ParsedRow[],
  d: Detected,
  groupAccounts: Record<string, string>,
  accounts: ImportAccount[],
  categories: ImportCategory[],
  rules: Rule[] = [],
): Promise<PreviewRow[]> {
  if (!supabase) return []
  const withAccount = parsed.map((r) => ({ ...r, accountId: groupAccounts[groupKey(r, d)] }))
  const hashes = await fingerprints(withAccount)
  const categoryId = (name: string) =>
    categories.find((c) => c.name === name && c.is_active)?.id ?? categories.find((c) => c.name === 'Uncategorized')?.id ?? null

  // Already imported?
  const existing = new Set<string>()
  for (let i = 0; i < hashes.length; i += 100) {
    const { data, error } = await supabase
      .from('transactions')
      .select('import_hash')
      .in('import_hash', hashes.slice(i, i + 100))
    if (error) throw error
    for (const t of data ?? []) if (t.import_hash) existing.add(t.import_hash)
  }

  // Entered by hand or by marking a bill paid, near these dates?
  const dates = parsed.map((r) => r.date).sort()
  const accountIds = [...new Set(withAccount.map((r) => r.accountId))]
  const { data: nearby, error } = await supabase
    .from('transactions')
    .select('id, txn_date, amount_cents, account_id, payee')
    .in('account_id', accountIds)
    .neq('source', 'csv')
    .gte('txn_date', addDays(dates[0], -MATCH_DAYS))
    .lte('txn_date', addDays(dates[dates.length - 1], MATCH_DAYS))
  if (error) throw error
  const unclaimed = [...(nearby ?? [])]

  return withAccount.map((r, i) => {
    const account = accounts.find((a) => a.id === r.accountId)
    // Your rules win over the built-in guesses.
    const rule = findRule(r.description, rules)
    const base = {
      line: r.line,
      date: r.date,
      description: r.description,
      payee: rule?.payee_name ?? cleanPayee(r.description),
      amountCents: r.amountCents,
      accountId: r.accountId,
      bankCategory: r.bankCategory,
      categoryId: rule?.category_id ?? categoryId(guessCategory({ ...r, accountType: account?.type ?? 'checking' })),
      hash: hashes[i],
    }
    if (existing.has(hashes[i])) {
      return { ...base, status: 'duplicate' as const, note: 'Already imported', include: false }
    }
    const matchIndex = unclaimed.findIndex(
      (t) =>
        t.account_id === r.accountId &&
        t.amount_cents === r.amountCents &&
        Math.abs(daysBetween(t.txn_date, r.date)) <= MATCH_DAYS,
    )
    if (matchIndex >= 0) {
      const [t] = unclaimed.splice(matchIndex, 1)
      return {
        ...base,
        status: 'possible' as const,
        note: `Same as ${t.payee ?? 'an entry'} on ${t.txn_date.slice(5).replace('-', '/')}? You’ll be asked to link them after importing.`,
        include: true,
      }
    }
    if (account && r.date < account.opening_balance_date) {
      return { ...base, status: 'before_start' as const, note: 'Before this account’s start date', include: false }
    }
    return { ...base, status: 'new' as const, note: null, include: true }
  })
}

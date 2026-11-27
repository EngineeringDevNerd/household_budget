import { daysBetween } from '../../lib/dates'
import { findRule } from '../rules/rules'

// Pure matching rules, kept apart from the screen so they're easy to read
// and test. Nothing here changes data; the review list asks you first.

export type MatchTxn = {
  id: string
  txn_date: string
  amount_cents: number
  account_id: string
  payee: string | null
  original_description: string | null
  bill_instance_id: string | null
  transfer_group_id: string | null
  source: string
}
export type MatchBill = {
  id: string
  name: string
  due_date: string
  amount_cents: number
  status: string
  recurring_bill_id: string | null
}
/** Payee rules that tie a description to a bill. */
export type BillRule = { match_text: string; recurring_bill_id: string | null }
export type MatchAccount = { id: string; name: string; type: string }

export type Suggestion =
  | { kind: 'link'; key: string; imported: MatchTxn; existing: MatchTxn }
  | { kind: 'pair'; key: string; out: MatchTxn; in: MatchTxn }
  | { kind: 'bill'; key: string; txn: MatchTxn; bill: MatchBill; byRule: boolean }

/** Same money recorded twice: within this many days of each other. */
export const LINK_DAYS = 4
/** Money leaves Arvest and reaches a card within this many days (seen: up to 3, in either order). */
export const PAIR_DAYS = 5
/** A bank payment this close to a due bill's due date, for exactly its amount. */
export const BILL_DAYS = 7

const gap = (a: string, b: string) => Math.abs(daysBetween(a, b))

/** Picks, for each item, the closest-dated unused candidate. Each candidate is used once. */
function closest<T extends { txn_date?: string; due_date?: string }>(
  date: string,
  candidates: T[],
  used: Set<T>,
  ok: (c: T) => boolean,
): T | undefined {
  let best: T | undefined
  for (const c of candidates) {
    if (used.has(c) || !ok(c)) continue
    const d = c.txn_date ?? c.due_date ?? date
    const bestD = best ? (best.txn_date ?? best.due_date ?? date) : ''
    if (!best || gap(d, date) < gap(bestD, date)) best = c
  }
  if (best) used.add(best)
  return best
}

export function findMatches(input: {
  /** Imported bank rows not yet linked, paired or dismissed. */
  imported: MatchTxn[]
  /** Rows entered in the app (manual or by marking a bill paid) with no bank row linked yet. */
  appRows: MatchTxn[]
  /** Bills that are due, or checked off but with no payment row yet. */
  dueBills: MatchBill[]
  accounts: MatchAccount[]
  rules?: BillRule[]
}): Suggestion[] {
  const out: Suggestion[] = []
  const isCard = (accountId: string) => input.accounts.find((a) => a.id === accountId)?.type === 'credit'

  // 1. Bank row = a payment already in the app. These rows are spoken for.
  const usedApp = new Set<MatchTxn>()
  const linked = new Set<string>()
  for (const r of input.imported) {
    if (r.bill_instance_id || r.transfer_group_id) continue
    const m = closest(r.txn_date, input.appRows, usedApp, (a) =>
      a.account_id === r.account_id && a.amount_cents === r.amount_cents && gap(a.txn_date, r.txn_date) <= LINK_DAYS,
    )
    if (m) {
      out.push({ kind: 'link', key: `link:${r.id}`, imported: r, existing: m })
      linked.add(r.id)
    }
  }
  const free = input.imported.filter((r) => !linked.has(r.id))

  // 2. Money out of a bank account and the same amount into a card.
  const ins = free.filter((r) => r.amount_cents > 0 && !r.transfer_group_id && isCard(r.account_id))
  const usedIn = new Set<MatchTxn>()
  for (const r of free) {
    if (r.amount_cents >= 0 || r.transfer_group_id || isCard(r.account_id)) continue
    const m = closest(r.txn_date, ins, usedIn, (c) => c.amount_cents === -r.amount_cents && gap(c.txn_date, r.txn_date) <= PAIR_DAYS)
    if (m) out.push({ kind: 'pair', key: `pair:${r.id}`, out: r, in: m })
  }

  // 3. A bank payment for a bill, near its due date. (Can sit alongside a
  //    pair: a card-payment bill is both.)
  //    a) Your payee rule ties this description to a bill: any amount,
  //       because bills like electric change every month.
  //    b) Otherwise: exactly the bill's amount.
  const usedBills = new Set<MatchBill>()
  const billRules = (input.rules ?? []).filter((x) => x.recurring_bill_id)
  const payments = free.filter((r) => r.amount_cents < 0 && !r.bill_instance_id)
  const byRule = new Set<string>()
  for (const r of payments) {
    const rule = findRule(r.original_description ?? r.payee ?? '', billRules)
    if (!rule) continue
    const m = closest(r.txn_date, input.dueBills, usedBills, (b) =>
      b.recurring_bill_id === rule.recurring_bill_id && gap(b.due_date, r.txn_date) <= BILL_DAYS,
    )
    if (m) {
      out.push({ kind: 'bill', key: `bill:${r.id}`, txn: r, bill: m, byRule: true })
      byRule.add(r.id)
    }
  }
  for (const r of payments) {
    if (byRule.has(r.id)) continue
    const m = closest(r.txn_date, input.dueBills, usedBills, (b) =>
      b.amount_cents === -r.amount_cents && gap(b.due_date, r.txn_date) <= BILL_DAYS,
    )
    if (m) out.push({ kind: 'bill', key: `bill:${r.id}`, txn: r, bill: m, byRule: false })
  }

  const date = (s: Suggestion) => (s.kind === 'link' ? s.imported : s.kind === 'pair' ? s.out : s.txn).txn_date
  return out.sort((a, b) => date(a).localeCompare(date(b)))
}

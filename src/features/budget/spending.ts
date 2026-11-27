// Pseudo-category for spending nobody has categorized yet.
export const NO_CATEGORY = 'none'

// What counts as spending in a category, from one month's transactions:
//   * only spending (expense) categories; transfers and income never count
//   * money out counts, refunds (money back, not part of a transfer) subtract
//   * the incoming half of a transfer doesn't count, so a card minimum in
//     the Debt category counts once (leaving checking), not zero times
type TxnRow = { amount_cents: number; category_id: string | null; transfer_group_id: string | null }
export function spendingByCategory(txns: TxnRow[], expenseIds: Set<string>): Map<string, number> {
  const out = new Map<string, number>()
  for (const t of txns) {
    if (t.transfer_group_id && t.amount_cents > 0) continue
    const key = t.category_id ?? NO_CATEGORY
    if (t.category_id && !expenseIds.has(t.category_id)) continue
    // Uncategorized money in (paychecks not yet categorized) isn't a refund.
    if (!t.category_id && t.amount_cents > 0) continue
    out.set(key, (out.get(key) ?? 0) - t.amount_cents)
  }
  return out
}

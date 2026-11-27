import { useState, type FormEvent } from 'react'
import { supabase } from '../../lib/supabase'
import { centsToInput, parseDollarsToCents } from '../../lib/money'
import { formatShortDate, todayISO } from '../../lib/dates'
import type { Account, Bill, Category } from './useBoard'
import { pickable } from '../../lib/categories'

type Props = {
  bill: Bill
  accounts: Account[]
  categories: Category[]
  onClose: () => void
  onSaved: () => void
}

// Tapping a bill's check opens this. Saving creates the payment transaction
// and marks the bill paid in one database call, so they can't drift apart.
export function MarkPaidDialog({ bill, accounts, categories, onClose, onSaved }: Props) {
  const defaultAccount =
    bill.recurring_bills?.last_account_id ?? bill.recurring_bills?.default_account_id ?? accounts[0]?.id ?? ''
  const [accountId, setAccountId] = useState(defaultAccount)
  const [amount, setAmount] = useState(centsToInput(bill.amount_cents))
  const [paidDate, setPaidDate] = useState(todayISO())
  const [categoryId, setCategoryId] = useState(bill.category_id ?? '')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    const cents = parseDollarsToCents(amount)
    if (cents === null || cents <= 0) return setError('Enter the amount paid, like 125.40.')
    if (!accountId) return setError('Pick the account it was paid from.')
    if (!supabase) return
    setBusy(true)
    const { error: rpcError } = await supabase.rpc('mark_bill_paid', {
      p_bill_instance_id: bill.id,
      p_account_id: accountId,
      p_amount_cents: cents,
      p_paid_date: paidDate,
      p_category_id: categoryId || undefined,
    })
    setBusy(false)
    if (rpcError) return setError(rpcError.message)
    onSaved()
  }

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <form
        className="sheet form"
        role="dialog"
        aria-modal="true"
        aria-labelledby="markpaid-title"
        onClick={(e) => e.stopPropagation()}
        onSubmit={onSubmit}
      >
        <div>
          <h2 id="markpaid-title">Mark {bill.name} paid</h2>
          <p className="muted small">Due {formatShortDate(bill.due_date)}</p>
        </div>
        {accounts.length === 0 ? (
          <p className="warn">No accounts yet. They’ll be added with the spreadsheet import.</p>
        ) : (
          <label>
            Paid from
            <select value={accountId} onChange={(e) => setAccountId(e.target.value)} required>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <label>
          Amount paid
          <input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} required />
        </label>
        <label>
          Date paid
          <input type="date" value={paidDate} onChange={(e) => setPaidDate(e.target.value)} required />
        </label>
        <label>
          Category
          <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            <option value="">None</option>
            {pickable(categories, bill.category_id).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <div className="row-buttons">
          <button type="button" className="secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" disabled={busy || accounts.length === 0}>
            {busy ? 'Saving…' : 'Mark paid'}
          </button>
        </div>
      </form>
    </div>
  )
}

import { useState, type FormEvent } from 'react'
import { supabase } from '../../lib/supabase'
import { centsToInput, parseDollarsToCents } from '../../lib/money'
import { formatShortDate } from '../../lib/dates'
import type { Bill } from './useBoard'

type Props = { bill: Bill; onClose: () => void; onSaved: () => void }

// Tapping a due bill's amount opens this. It changes only this month's
// expected amount (for example a card's new minimum once the statement
// arrives), so paycheck totals are right before the bill is paid.
// The bill's usual amount for future months stays the same.
export function EditAmountDialog({ bill, onClose, onSaved }: Props) {
  const [amount, setAmount] = useState(centsToInput(bill.amount_cents))
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    const cents = parseDollarsToCents(amount)
    if (cents === null || cents < 0) return setError('Enter an amount, like 125.40.')
    if (!supabase) return
    setBusy(true)
    const { error: dbError } = await supabase
      .from('bill_instances')
      .update({ amount_cents: cents })
      .eq('id', bill.id)
      .eq('status', 'due')
    setBusy(false)
    if (dbError) return setError(dbError.message)
    onSaved()
  }

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <form
        className="sheet form"
        role="dialog"
        aria-modal="true"
        aria-labelledby="editamount-title"
        onClick={(e) => e.stopPropagation()}
        onSubmit={onSubmit}
      >
        <div>
          <h2 id="editamount-title">{bill.name}</h2>
          <p className="muted small">Due {formatShortDate(bill.due_date)} · changes this month only</p>
        </div>
        <label>
          Amount due
          <input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} required autoFocus />
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
          <button type="submit" disabled={busy}>
            {busy ? 'Saving…' : 'Save amount'}
          </button>
        </div>
      </form>
    </div>
  )
}

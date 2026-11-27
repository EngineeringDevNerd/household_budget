import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import type { Bill } from './useBoard'

type Props = { bill: Bill; onClose: () => void; onSaved: () => void }

export function UnmarkDialog({ bill, onClose, onSaved }: Props) {
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function confirm() {
    if (!supabase) return
    setBusy(true)
    const { error: rpcError } = await supabase.rpc('unmark_bill_paid', { p_bill_instance_id: bill.id })
    setBusy(false)
    if (rpcError) return setError(rpcError.message)
    onSaved()
  }

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet form" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <h2>Mark {bill.name} as not paid?</h2>
        <p className="muted">This removes the payment that was recorded for it.</p>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <div className="row-buttons">
          <button type="button" className="secondary" onClick={onClose}>
            Keep it paid
          </button>
          <button type="button" className="danger" onClick={confirm} disabled={busy}>
            {busy ? 'Saving…' : 'Mark not paid'}
          </button>
        </div>
      </div>
    </div>
  )
}

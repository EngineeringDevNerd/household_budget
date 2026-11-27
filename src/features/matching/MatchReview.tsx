import { useState } from 'react'
import { formatMonthDay } from '../../lib/dates'
import { formatCents } from '../../lib/money'
import { supabase } from '../../lib/supabase'
import type { MatchAccount, MatchTxn, Suggestion } from './findMatches'

// The "is this the same money?" list. Each card is one suggestion; nothing
// is linked until you press its button.
export function MatchReview({
  suggestions,
  accounts,
  onChanged,
}: {
  suggestions: Suggestion[]
  accounts: MatchAccount[]
  onChanged: () => void
}) {
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const accountName = (id: string) => accounts.find((a) => a.id === id)?.name ?? 'Unknown account'

  async function run(key: string, call: () => PromiseLike<{ error: { message: string } | null }>) {
    setBusy(key)
    setError(null)
    const { error: rpcError } = await call()
    setBusy(null)
    if (rpcError) return setError(rpcError.message)
    onChanged()
  }

  function confirm(s: Suggestion) {
    if (!supabase) return
    const db = supabase
    if (s.kind === 'link')
      return run(s.key, () => db.rpc('link_imported_row', { p_imported_id: s.imported.id, p_existing_id: s.existing.id }))
    if (s.kind === 'pair') return run(s.key, () => db.rpc('pair_transfer', { p_out_id: s.out.id, p_in_id: s.in.id }))
    return run(s.key, () => db.rpc('mark_paid_from_import', { p_bill_instance_id: s.bill.id, p_transaction_id: s.txn.id }))
  }

  async function dismiss(s: Suggestion) {
    if (!supabase) return
    const db = supabase
    const ids = s.kind === 'link' ? [s.imported.id] : s.kind === 'pair' ? [s.out.id, s.in.id] : [s.txn.id]
    setBusy(s.key)
    for (const id of ids) {
      const { error: rpcError } = await db.rpc('dismiss_match', { p_transaction_id: id })
      if (rpcError) {
        setBusy(null)
        return setError(rpcError.message)
      }
    }
    setBusy(null)
    onChanged()
  }

  if (suggestions.length === 0) return null

  const line = (t: MatchTxn) => (
    <span>
      {formatMonthDay(t.txn_date)} · {accountName(t.account_id)} ·{' '}
      <span className="muted">{t.original_description ?? t.payee ?? ''}</span>{' '}
      <strong className={t.amount_cents > 0 ? 'ok' : undefined}>
        {t.amount_cents > 0 ? '+' : ''}
        {formatCents(t.amount_cents)}
      </strong>
    </span>
  )

  return (
    <section className="section matches">
      <h2>Matches to review ({suggestions.length})</h2>
      <p className="small">
        These look like the same money showing up twice. Confirm the ones that are right so nothing is counted twice.
      </p>
      <ul className="bills">
        {suggestions.map((s) => (
          <li key={s.key} className="match">
            {s.kind === 'link' && (
              <>
                <div className="match-title">
                  Same as <strong>{s.existing.payee ?? 'your entry'}</strong> already in the app?
                </div>
                <div className="small">Bank: {line(s.imported)}</div>
                <div className="small">
                  App: {line(s.existing)}
                  {s.existing.source === 'bill_payment' ? ' (marked paid)' : ''}
                </div>
                <p className="muted small">Linking keeps one row, with the bank’s date and description.</p>
              </>
            )}
            {s.kind === 'pair' && (
              <>
                <div className="match-title">
                  Card payment: {accountName(s.out.account_id)} → <strong>{accountName(s.in.account_id)}</strong>?
                </div>
                <div className="small">Out: {line(s.out)}</div>
                <div className="small">In: {line(s.in)}</div>
                <p className="muted small">Pairing marks both as a card payment, so neither counts as spending.</p>
              </>
            )}
            {s.kind === 'bill' && (
              <>
                <div className="match-title">
                  Pays <strong>{s.bill.name}</strong> (due {formatMonthDay(s.bill.due_date)},{' '}
                  {formatCents(s.bill.amount_cents)})?
                </div>
                <div className="small">Bank: {line(s.txn)}</div>
                <p className="muted small">
                  {s.bill.status === 'paid'
                    ? 'This bill is already checked off; linking records this as its payment.'
                    : 'This checks the bill off on the bills board using this payment.'}
                </p>
              </>
            )}
            <div className="row-buttons compact">
              <button className="secondary" disabled={busy !== null} onClick={() => dismiss(s)}>
                Not a match
              </button>
              <button disabled={busy !== null} onClick={() => confirm(s)}>
                {busy === s.key ? 'Saving…' : s.kind === 'link' ? 'Link them' : s.kind === 'pair' ? 'Pair them' : s.bill.status === 'paid' ? 'Link to bill' : 'Mark paid'}
              </button>
            </div>
          </li>
        ))}
      </ul>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </section>
  )
}

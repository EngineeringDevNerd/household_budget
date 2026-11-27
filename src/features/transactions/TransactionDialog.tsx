import { useState, type FormEvent } from 'react'
import { supabase } from '../../lib/supabase'
import { centsToInput, parseDollarsToCents } from '../../lib/money'
import { todayISO } from '../../lib/dates'
import type { AccountBalance, Txn, TxnCategory } from './useTransactions'

type Props = {
  /** null = adding a new transaction. */
  txn: Txn | null
  accounts: AccountBalance[]
  categories: TxnCategory[]
  /** Pre-selected account for a new transaction (the list's account filter). */
  defaultAccountId?: string
  onClose: () => void
  onSaved: () => void
}

// Add or edit one transaction. Bill payments and transfers come in linked
// pairs, so only their payee, category and notes can be edited here; the
// money side is changed from the bills board.
export function TransactionDialog({ txn, accounts, categories, defaultAccountId, onClose, onSaved }: Props) {
  const uncategorized = categories.find((c) => c.name === 'Uncategorized')?.id ?? ''
  const activeAccounts = accounts.filter((a) => a.is_active || a.id === txn?.account_id)
  const locked = txn !== null && (txn.source === 'bill_payment' || txn.transfer_group_id !== null)

  const [date, setDate] = useState(txn?.txn_date ?? todayISO())
  const [accountId, setAccountId] = useState(txn?.account_id ?? defaultAccountId ?? activeAccounts[0]?.id ?? '')
  const [direction, setDirection] = useState<'out' | 'in'>(txn && txn.amount_cents > 0 ? 'in' : 'out')
  const [amount, setAmount] = useState(txn ? centsToInput(Math.abs(txn.amount_cents)) : '')
  const [payee, setPayee] = useState(txn?.payee ?? '')
  const [categoryId, setCategoryId] = useState(txn ? (txn.category_id ?? '') : uncategorized)
  const [notes, setNotes] = useState(txn?.notes ?? '')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  function pickCategory(id: string) {
    setCategoryId(id)
    // Picking an income category almost always means money coming in.
    if (!locked && categories.find((c) => c.id === id)?.kind === 'income') setDirection('in')
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!supabase) return
    const fields = {
      payee: payee.trim() || null,
      category_id: categoryId || null,
      notes: notes.trim() || null,
    }
    let result
    if (locked && txn) {
      result = await save(() => supabase!.from('transactions').update(fields).eq('id', txn.id))
    } else {
      const cents = parseDollarsToCents(amount)
      if (cents === null || cents <= 0) return setError('Enter an amount, like 42.50.')
      if (!accountId) return setError('Pick an account.')
      const row = { ...fields, txn_date: date, account_id: accountId, amount_cents: direction === 'out' ? -cents : cents }
      result = await save(() =>
        txn
          ? supabase!.from('transactions').update(row).eq('id', txn.id)
          : supabase!.from('transactions').insert({ ...row, source: 'manual' }),
      )
    }
    if (result) onSaved()
  }

  async function onDelete() {
    if (!supabase || !txn) return
    const ok = await save(() => supabase!.rpc('delete_transaction', { p_transaction_id: txn.id }))
    if (ok) onSaved()
  }

  async function save(run: () => PromiseLike<{ error: { message: string } | null }>) {
    setBusy(true)
    const { error: dbError } = await run()
    setBusy(false)
    if (dbError) {
      setError(dbError.message)
      return false
    }
    return true
  }

  const deleteWarning =
    txn?.source === 'bill_payment'
      ? `This also unchecks ${txn.payee ?? 'the bill'} on the bills board.`
      : txn?.transfer_group_id
        ? 'This also deletes the other side of the transfer.'
        : 'This can’t be undone.'

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <form
        className="sheet form"
        role="dialog"
        aria-modal="true"
        aria-labelledby="txn-title"
        onClick={(e) => e.stopPropagation()}
        onSubmit={onSubmit}
      >
        <h2 id="txn-title">{txn ? 'Edit transaction' : 'Add transaction'}</h2>

        {locked && (
          <p className="muted small">
            {txn?.source === 'bill_payment'
              ? 'This came from marking a bill paid. To change the amount, date or account, uncheck the bill and mark it paid again.'
              : 'This is one side of a transfer, so the amount, date and account are locked.'}
          </p>
        )}

        {!locked && (
          <>
            <div className="segmented" role="group" aria-label="Money in or out">
              <button type="button" className={direction === 'out' ? 'on' : ''} onClick={() => setDirection('out')}>
                Money out
              </button>
              <button type="button" className={direction === 'in' ? 'on' : ''} onClick={() => setDirection('in')}>
                Money in
              </button>
            </div>
            <div className="row-buttons">
              <label>
                Amount
                <input
                  inputMode="decimal"
                  placeholder="0.00"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  required
                  autoFocus={!txn}
                />
              </label>
              <label>
                Date
                <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
              </label>
            </div>
            <label>
              Account
              <select value={accountId} onChange={(e) => setAccountId(e.target.value)} required>
                {activeAccounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </label>
          </>
        )}

        <label>
          Payee
          <input value={payee} onChange={(e) => setPayee(e.target.value)} placeholder="Walmart, Sonic, …" />
        </label>
        <label>
          Category
          <select value={categoryId} onChange={(e) => pickCategory(e.target.value)}>
            {!uncategorized && <option value="">Uncategorized</option>}
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Notes
          <input value={notes} onChange={(e) => setNotes(e.target.value)} />
        </label>

        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}

        {confirmDelete ? (
          <>
            <p className="warn small">Delete this transaction? {deleteWarning}</p>
            <div className="row-buttons">
              <button type="button" className="secondary" onClick={() => setConfirmDelete(false)}>
                Keep it
              </button>
              <button type="button" className="danger" onClick={onDelete} disabled={busy}>
                {busy ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </>
        ) : (
          <div className="row-buttons">
            <button type="button" className="secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" disabled={busy || activeAccounts.length === 0}>
              {busy ? 'Saving…' : 'Save'}
            </button>
          </div>
        )}
        {txn && !confirmDelete && (
          <button type="button" className="link danger-text" onClick={() => setConfirmDelete(true)}>
            Delete transaction
          </button>
        )}
      </form>
    </div>
  )
}

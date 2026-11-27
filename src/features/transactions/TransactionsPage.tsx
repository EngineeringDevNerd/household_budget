import { useState, type FormEvent } from 'react'
import { Link } from 'react-router'
import { TopBar } from '../../components/TopBar'
import { addMonths, formatMonth, formatMonthDay, formatShortDate, monthStart, todayISO } from '../../lib/dates'
import { centsToInput, formatCents, parseDollarsToCents } from '../../lib/money'
import { supabase } from '../../lib/supabase'
import { TransactionDialog } from './TransactionDialog'
import { isTransfer, useTransactions, type AccountBalance, type Txn, type TransactionsData } from './useTransactions'

const ALL = ''
const NO_CATEGORY = 'none'

export function TransactionsPage() {
  const [month, setMonth] = useState(() => monthStart(todayISO()))
  const [accountFilter, setAccountFilter] = useState(ALL)
  const [categoryFilter, setCategoryFilter] = useState(ALL)
  const [editing, setEditing] = useState<Txn | 'new' | null>(null)
  const [editingAccount, setEditingAccount] = useState<AccountBalance | null>(null)
  const { data, error, reload } = useTransactions(month)
  const header = <TopBar title="Transactions" />

  if (error) {
    return (
      <main className="page">
        {header}
        <p className="error">Couldn’t load your transactions: {error}</p>
        <button onClick={reload}>Try again</button>
      </main>
    )
  }
  if (!data) {
    return (
      <main className="page">
        {header}
        <p className="muted">Loading…</p>
      </main>
    )
  }

  const shown = data.transactions.filter(
    (t) =>
      (accountFilter === ALL || t.account_id === accountFilter) &&
      (categoryFilter === ALL ||
        (categoryFilter === NO_CATEGORY ? t.category_id === null : t.category_id === categoryFilter)),
  )
  // Spending totals leave out card payments and other transfers, so paying
  // the Savor card from Arvest isn't counted as spending twice.
  const counted = shown.filter((t) => !isTransfer(t, data.categories))
  const spent = -counted.filter((t) => t.amount_cents < 0).reduce((s, t) => s + t.amount_cents, 0)
  const received = counted.filter((t) => t.amount_cents > 0).reduce((s, t) => s + t.amount_cents, 0)
  const byDate = groupByDate(shown)

  function saved() {
    setEditing(null)
    setEditingAccount(null)
    reload()
  }

  return (
    <main className="page">
      {header}

      <div className="month-switch">
        <button className="secondary" aria-label="Previous month" onClick={() => setMonth(addMonths(month, -1))}>
          ‹
        </button>
        <span className="month-name">{formatMonth(month)}</span>
        <button className="secondary" aria-label="Next month" onClick={() => setMonth(addMonths(month, 1))}>
          ›
        </button>
      </div>

      <div className="filters">
        <select aria-label="Account" value={accountFilter} onChange={(e) => setAccountFilter(e.target.value)}>
          <option value={ALL}>All accounts</option>
          {data.accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
        <select aria-label="Category" value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
          <option value={ALL}>All categories</option>
          {data.categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
          <option value={NO_CATEGORY}>No category</option>
        </select>
      </div>

      <div className="summary">
        <div className="month-line">
          <span>
            Spent <strong>{formatCents(spent)}</strong>
          </span>
          <span>
            In <strong className="ok">{formatCents(received)}</strong>
          </span>
        </div>
        <p className="small">Card payments and transfers aren’t counted.</p>
      </div>

      <div className="row-buttons add-row">
        <button onClick={() => setEditing('new')} disabled={data.accounts.length === 0}>
          + Add transaction
        </button>
        <Link className="button-like secondary" to="/import">
          Import CSV
        </Link>
      </div>

      {byDate.length === 0 && <p className="muted">No transactions in {formatMonth(month)} yet.</p>}
      {byDate.map(([date, txns]) => (
        <section key={date} className="section">
          <h2>{formatShortDate(date)}</h2>
          <ul className="bills">
            {txns.map((t) => (
              <TxnRow key={t.id} txn={t} data={data} onOpen={() => setEditing(t)} />
            ))}
          </ul>
        </section>
      ))}

      <AccountsSection data={data} onEdit={setEditingAccount} />

      {editing && (
        <TransactionDialog
          txn={editing === 'new' ? null : editing}
          accounts={data.accounts}
          categories={data.categories}
          defaultAccountId={accountFilter || undefined}
          onClose={() => setEditing(null)}
          onSaved={saved}
        />
      )}
      {editingAccount && (
        <OpeningBalanceDialog account={editingAccount} onClose={() => setEditingAccount(null)} onSaved={saved} />
      )}
    </main>
  )
}

function groupByDate(txns: Txn[]): [string, Txn[]][] {
  const groups = new Map<string, Txn[]>()
  for (const t of txns) groups.set(t.txn_date, [...(groups.get(t.txn_date) ?? []), t])
  return [...groups.entries()]
}

function TxnRow({ txn: t, data, onOpen }: { txn: Txn; data: TransactionsData; onOpen: () => void }) {
  const account = data.accounts.find((a) => a.id === t.account_id)?.name ?? 'Unknown account'
  const category = data.categories.find((c) => c.id === t.category_id)?.name ?? 'No category'
  const tags = [category, account]
  if (t.source === 'bill_payment') tags.push('bill paid')
  else if (isTransfer(t, data.categories)) tags.push('transfer')
  return (
    <li className="bill">
      <button className="txn-open" onClick={onOpen} aria-label={`Edit ${t.payee ?? 'transaction'}`}>
        <div className="bill-main">
          <span className="bill-name">{t.payee || 'No payee'}</span>
          <span className="muted small">{tags.join(' · ')}</span>
        </div>
        <span className={t.amount_cents > 0 ? 'bill-amount ok' : 'bill-amount'}>
          {t.amount_cents > 0 ? '+' : ''}
          {formatCents(t.amount_cents)}
        </span>
      </button>
    </li>
  )
}

function AccountsSection({ data, onEdit }: { data: TransactionsData; onEdit: (a: AccountBalance) => void }) {
  const accounts = data.accounts.filter((a) => a.is_active)
  return (
    <details className="section accounts">
      <summary>
        <span className="section-title">
          <span>
            <span className="chevron">›</span> Account balances
          </span>
        </span>
      </summary>
      <p className="small">
        Opening balance plus every transaction since. Tap an account to set its starting balance.
      </p>
      <ul className="bills">
        {accounts.map((a) => (
          <li key={a.id} className="bill">
            <button className="txn-open" onClick={() => onEdit(a)} aria-label={`Set starting balance for ${a.name}`}>
              <div className="bill-main">
                <span className="bill-name">{a.name}</span>
                <span className="muted small">Since {formatMonthDay(a.opening_balance_date)}</span>
              </div>
              <span className={a.balance_cents < 0 ? 'bill-amount danger-text' : 'bill-amount'}>
                {balanceLabel(a)}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </details>
  )
}

// A card's balance is negative when you owe on it; show that as "owe $X".
function balanceLabel(a: AccountBalance): string {
  if (a.type === 'credit') {
    if (a.balance_cents < 0) return `Owe ${formatCents(-a.balance_cents)}`
    if (a.balance_cents > 0) return `${formatCents(a.balance_cents)} credit`
    return formatCents(0)
  }
  return formatCents(a.balance_cents)
}

function OpeningBalanceDialog({
  account,
  onClose,
  onSaved,
}: {
  account: AccountBalance
  onClose: () => void
  onSaved: () => void
}) {
  const isCard = account.type === 'credit'
  // Cards: you type what you owed (positive); it's stored negative.
  const shown = isCard ? -account.opening_balance_cents : account.opening_balance_cents
  const [amount, setAmount] = useState(centsToInput(Math.max(shown, 0)))
  const [date, setDate] = useState(account.opening_balance_date)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!supabase) return
    const cents = parseDollarsToCents(amount)
    if (cents === null) return setError('Enter an amount, like 1250.00 (or 0).')
    setBusy(true)
    const { error: updError } = await supabase
      .from('accounts')
      .update({ opening_balance_cents: isCard ? -cents : cents, opening_balance_date: date })
      .eq('id', account.id)
    setBusy(false)
    if (updError) return setError(updError.message)
    onSaved()
  }

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <form
        className="sheet form"
        role="dialog"
        aria-modal="true"
        aria-labelledby="opening-title"
        onClick={(e) => e.stopPropagation()}
        onSubmit={onSubmit}
      >
        <h2 id="opening-title">{account.name}</h2>
        <p className="muted small">
          The balance at the start of the day you began tracking. Transactions before that date don’t count toward
          the balance.
        </p>
        <label>
          {isCard ? 'Amount owed' : 'Balance'}
          <input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} required />
        </label>
        <label>
          As of
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
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
            {busy ? 'Saving…' : 'Save'}
          </button>
        </div>
      </form>
    </div>
  )
}

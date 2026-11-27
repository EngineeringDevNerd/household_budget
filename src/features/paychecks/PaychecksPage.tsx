import { useState, type FormEvent } from 'react'
import { TopBar } from '../../components/TopBar'
import { formatMonthDay, formatShortDate } from '../../lib/dates'
import { formatCents, parseDollarsToCents } from '../../lib/money'
import { supabase } from '../../lib/supabase'
import { usePaychecks, type CheckBill, type Paycheck, type PaychecksData } from './usePaychecks'

const amountOf = (p: Paycheck) => p.actual_amount_cents ?? p.expected_amount_cents

export function PaychecksPage() {
  const { data, error, reload } = usePaychecks()
  const header = <TopBar title="Paychecks" />

  if (error) {
    return (
      <main className="page">
        {header}
        <p className="error">Couldn’t load your paychecks: {error}</p>
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

  const covering = data.paychecks.filter((p) => p.pay_schedules.covers_bills)
  const pool = data.paychecks.filter((p) => !p.pay_schedules.covers_bills)
  const isTransfer = (b: CheckBill) => data.transferCategoryIds.has(b.category_id ?? '')

  // Each check's left-over rolls into the next one, starting from the first
  // check on this page, so a short check shows whether earlier money covers it.
  const base = covering.map((p) => {
    const bills = data.bills.filter((b) => b.paycheck_id === p.id)
    const billTotal = bills.filter((b) => !isTransfer(b)).reduce((t, b) => t + b.amount_cents, 0)
    return { paycheck: p, bills, billTotal, left: amountOf(p) - billTotal }
  })
  const rows: Row[] = base.map((r, i) => {
    const carriedIn = base.slice(0, i).reduce((t, x) => t + x.left, 0)
    return { ...r, carriedIn, running: carriedIn + r.left }
  })

  return (
    <main className="page">
      {header}
      <p className="muted small">
        Each bill sits on the latest check on or before its due date. Use the menu on a bill to move it to another
        check.
      </p>

      {rows.length === 0 && <p className="muted">No paychecks yet. They appear once your pay schedule is set up.</p>}

      {rows.map((r) => (
        <CheckCard key={r.paycheck.id} row={r} data={data} covering={covering} isTransfer={isTransfer} onChanged={reload} />
      ))}

      <PoolSection pool={pool} data={data} onChanged={reload} />
    </main>
  )
}

type Row = {
  paycheck: Paycheck
  bills: CheckBill[]
  billTotal: number
  left: number
  carriedIn: number
  running: number
}

function CheckCard({
  row,
  data,
  covering,
  isTransfer,
  onChanged,
}: {
  row: Row
  data: PaychecksData
  covering: Paycheck[]
  isTransfer: (b: CheckBill) => boolean
  onChanged: () => void
}) {
  const { paycheck: p, bills, billTotal, left, carriedIn, running } = row
  const [error, setError] = useState<string | null>(null)
  const past = p.pay_date < data.today

  async function move(bill: CheckBill, paycheckId: string) {
    if (!supabase) return
    const { error: updError } = await supabase
      .from('bill_instances')
      .update({ paycheck_id: paycheckId || null })
      .eq('id', bill.id)
    if (updError) return setError(updError.message)
    onChanged()
  }

  return (
    <section className="section">
      <h2>
        <span className="section-title">
          <span>
            {formatShortDate(p.pay_date)} · {p.pay_schedules.name}
          </span>
          <span className="muted">{formatCents(amountOf(p))}</span>
        </span>
      </h2>
      <ul className="bills">
        {bills.length === 0 && (
          <li className="bill">
            <span className="muted">No bills on this check.</span>
          </li>
        )}
        {bills.map((b) => (
          <li key={b.id} className={b.status === 'paid' ? 'bill paid' : 'bill'}>
            <div className="bill-main">
              <span className="bill-name">
                {b.status === 'paid' && <span className="ok">✓ </span>}
                {b.name}
              </span>
              <span className="muted small">
                Due {formatMonthDay(b.due_date)}
                {isTransfer(b) ? ' · card payment, not counted' : ''}
              </span>
            </div>
            <select
              className="move"
              aria-label={`Move ${b.name} to another check`}
              value={b.paycheck_id ?? ''}
              onChange={(e) => move(b, e.target.value)}
            >
              {covering.map((c) => (
                <option key={c.id} value={c.id}>
                  {formatMonthDay(c.pay_date)}
                </option>
              ))}
            </select>
            <span className="bill-amount">{formatCents(b.amount_cents)}</span>
          </li>
        ))}
      </ul>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="check-totals small">
        <span>Bills {formatCents(billTotal)}</span>
        <span className={left < 0 ? 'danger-text' : 'ok'}>Left over {formatCents(left)}</span>
      </div>
      {carriedIn !== 0 && (
        <div className="check-totals small muted">
          <span>With {formatCents(carriedIn)} carried from earlier checks</span>
          <span className={running < 0 ? 'danger-text' : undefined}>{formatCents(running)}</span>
        </div>
      )}
      {past && !p.received_on && <p className="muted small">Not marked received.</p>}
    </section>
  )
}

function PoolSection({ pool, data, onChanged }: { pool: Paycheck[]; data: PaychecksData; onChanged: () => void }) {
  const [date, setDate] = useState(data.today)
  const [amount, setAmount] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const total = pool.reduce((t, p) => t + amountOf(p), 0)

  async function add(e: FormEvent) {
    e.preventDefault()
    if (!supabase || !data.poolScheduleId) return
    const cents = parseDollarsToCents(amount)
    if (cents === null || cents <= 0) return setError('Enter an amount, like 390 or 390.50.')
    setBusy(true)
    const { error: insError } = await supabase.from('paychecks').insert({
      pay_schedule_id: data.poolScheduleId,
      pay_date: date,
      expected_amount_cents: cents,
      actual_amount_cents: cents,
      received_on: date,
    })
    setBusy(false)
    if (insError) {
      return setError(
        insError.code === '23505' ? 'There’s already pay entered for that day. Remove it first to change it.' : insError.message,
      )
    }
    setAmount('')
    setError(null)
    onChanged()
  }

  async function remove(p: Paycheck) {
    if (!supabase) return
    const { error: delError } = await supabase.from('paychecks').delete().eq('id', p.id)
    if (delError) return setError(delError.message)
    onChanged()
  }

  if (!data.poolScheduleId) return null
  return (
    <section className="section">
      <h2>
        <span className="section-title">
          <span>Sylvia’s pay (into the pool)</span>
          <span className="muted">{formatCents(total)}</span>
        </span>
      </h2>
      <ul className="bills">
        {pool.length === 0 && (
          <li className="bill">
            <span className="muted">Nothing entered for these two months yet.</span>
          </li>
        )}
        {pool.map((p) => (
          <li key={p.id} className="bill">
            <div className="bill-main">
              <span className="bill-name">{formatShortDate(p.pay_date)}</span>
            </div>
            <span className="bill-amount">{formatCents(amountOf(p))}</span>
            <button className="link small" onClick={() => remove(p)} aria-label={`Remove pay from ${p.pay_date}`}>
              Remove
            </button>
          </li>
        ))}
      </ul>
      <form className="form pool-form" onSubmit={add}>
        <div className="row-buttons">
          <label>
            Date
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
          </label>
          <label>
            Amount
            <input inputMode="decimal" placeholder="0.00" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </label>
        </div>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <button type="submit" disabled={busy}>
          {busy ? 'Saving…' : 'Add pay'}
        </button>
      </form>
    </section>
  )
}

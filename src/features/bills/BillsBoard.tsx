import { useState } from 'react'
import { addDays, daysBetween, formatMonth, formatMonthDay, formatShortDate, monthStart } from '../../lib/dates'
import { formatCents } from '../../lib/money'
import { useAuth } from '../auth/authContext'
import { MarkPaidDialog } from './MarkPaidDialog'
import { UnmarkDialog } from './UnmarkDialog'
import { useBoard, type Bill } from './useBoard'

const sum = (bills: Bill[]) => bills.reduce((t, b) => t + b.amount_cents, 0)

export function BillsBoard() {
  const { displayName, signOut } = useAuth()
  const { data, error, reload } = useBoard()
  const [paying, setPaying] = useState<Bill | null>(null)
  const [unpaying, setUnpaying] = useState<Bill | null>(null)

  const header = (
    <header className="topbar">
      <h1>Bills</h1>
      <button className="link" onClick={signOut} title={displayName ? `Signed in as ${displayName}` : undefined}>
        Sign out
      </button>
    </header>
  )

  if (error) {
    return (
      <main className="page">
        {header}
        <p className="error">Couldn’t load your bills: {error}</p>
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

  const { today, bills, nextPayday } = data
  const weekEnd = addDays(today, 6)
  const unpaid = bills.filter((b) => b.status === 'due')

  const overdue = unpaid.filter((b) => b.due_date < today)
  const dueToday = unpaid.filter((b) => b.due_date === today)
  const thisWeek = unpaid.filter((b) => b.due_date > today && b.due_date <= weekEnd)
  const untilPayday = nextPayday ? unpaid.filter((b) => b.due_date > weekEnd && b.due_date < nextPayday) : []
  const later = unpaid.filter((b) => b.due_date > weekEnd && (!nextPayday || b.due_date >= nextPayday))

  const leftBeforePayday = nextPayday ? sum(unpaid.filter((b) => b.due_date < nextPayday)) : null
  const daysToPayday = nextPayday ? daysBetween(today, nextPayday) : null

  const thisMonth = monthStart(today)
  const monthBills = bills.filter((b) => b.bill_month === thisMonth)
  const monthPaid = monthBills.filter((b) => b.status === 'paid')
  const monthTotal = sum(monthBills)
  const paidPct = monthTotal ? Math.round((sum(monthPaid) / monthTotal) * 100) : 0

  const done = () => {
    setPaying(null)
    setUnpaying(null)
    reload()
  }

  return (
    <main className="page">
      {header}

      <section className="card summary" aria-label="Payday summary">
        {nextPayday ? (
          <>
            <p className="big">
              {daysToPayday === 1 ? 'Payday tomorrow' : `Payday in ${daysToPayday} days`}
            </p>
            <p className="muted">
              {formatShortDate(nextPayday)} · {formatCents(leftBeforePayday ?? 0)} left to pay before then
            </p>
          </>
        ) : (
          <p className="muted">No upcoming payday yet. It appears once your pay schedule is set up.</p>
        )}
        {monthBills.length > 0 && (
          <div className="month">
            <div className="month-line">
              <span>{formatMonth(thisMonth)}</span>
              <span>
                {formatCents(sum(monthPaid))} of {formatCents(monthTotal)} paid
              </span>
            </div>
            <div className="bar" role="progressbar" aria-valuenow={paidPct} aria-valuemin={0} aria-valuemax={100}>
              <div style={{ width: `${paidPct}%` }} />
            </div>
          </div>
        )}
      </section>

      {bills.length === 0 && (
        <p className="muted">No bills yet. They’ll show up here once your spreadsheet is imported.</p>
      )}

      <Section title="Overdue" tone="danger" bills={overdue} onCheck={setPaying} />
      <Section title="Due today" bills={dueToday} onCheck={setPaying} />
      <Section title="This week" bills={thisWeek} onCheck={setPaying} />
      <Section title="Until next payday" bills={untilPayday} onCheck={setPaying} />
      <Section title="Later" bills={later} onCheck={setPaying} collapsed />
      <Section title="Paid this month" bills={monthPaid} onCheck={setUnpaying} collapsed />

      {paying && (
        <MarkPaidDialog
          bill={paying}
          accounts={data.accounts}
          categories={data.categories}
          onClose={() => setPaying(null)}
          onSaved={done}
        />
      )}
      {unpaying && <UnmarkDialog bill={unpaying} onClose={() => setUnpaying(null)} onSaved={done} />}
    </main>
  )
}

type SectionProps = {
  title: string
  bills: Bill[]
  onCheck: (b: Bill) => void
  tone?: 'danger'
  collapsed?: boolean
}

function Section({ title, bills, onCheck, tone, collapsed }: SectionProps) {
  if (bills.length === 0) return null
  const heading = (
    <span className="section-title">
      <span className={tone === 'danger' ? 'danger-text' : undefined}>
        {collapsed && <span className="chevron" aria-hidden="true">›</span>}
        {title}
      </span>
      <span className="muted">{formatCents(sum(bills))}</span>
    </span>
  )
  const list = (
    <ul className="bills">
      {bills.map((b) => (
        <BillRow key={b.id} bill={b} onCheck={onCheck} />
      ))}
    </ul>
  )
  return collapsed ? (
    <details className="section">
      <summary>{heading}</summary>
      {list}
    </details>
  ) : (
    <section className="section">
      <h2>{heading}</h2>
      {list}
    </section>
  )
}

function BillRow({ bill, onCheck }: { bill: Bill; onCheck: (b: Bill) => void }) {
  const paid = bill.status === 'paid'
  return (
    <li className={paid ? 'bill paid' : 'bill'}>
      <button
        className={paid ? 'check checked' : 'check'}
        onClick={() => onCheck(bill)}
        aria-label={paid ? `Mark ${bill.name} as not paid` : `Mark ${bill.name} paid`}
      >
        {paid ? '✓' : ''}
      </button>
      <div className="bill-main">
        <span className="bill-name">{bill.name}</span>
        <span className="muted small">
          {paid && bill.paid_date ? `Paid ${formatShortDate(bill.paid_date)}` : `Due ${formatShortDate(bill.due_date)}`}
          {bill.paycheck && !paid ? ` · ${formatMonthDay(bill.paycheck.pay_date)} check` : ''}
        </span>
      </div>
      <span className="bill-amount">{formatCents(bill.amount_cents)}</span>
    </li>
  )
}

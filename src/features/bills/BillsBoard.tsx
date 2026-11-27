import { useCallback, useRef, useState } from 'react'
import { addDays, daysBetween, formatMonth, formatMonthDay, formatShortDate, monthStart } from '../../lib/dates'
import { formatCents } from '../../lib/money'
import { TopBar } from '../../components/TopBar'
import { ProgressRing } from '../../components/ProgressRing'
import { CategoryDot, CategoryTag } from '../../components/CategoryDot'
import { SwipeToPay } from '../../components/SwipeToPay'
import { confetti } from '../../lib/confetti'
import { Toast, type ToastState } from '../../components/Toast'
import { useCountUp } from '../../lib/useCountUp'
import { supabase } from '../../lib/supabase'
import { MarkPaidDialog } from './MarkPaidDialog'
import { UnmarkDialog } from './UnmarkDialog'
import { BillDialog } from './BillDialog'
import { useBoard, type Bill } from './useBoard'

const sum = (bills: Bill[]) => bills.reduce((t, b) => t + b.amount_cents, 0)

export function BillsBoard() {
  const { data, error, reload } = useBoard()
  const [paying, setPaying] = useState<Bill | null>(null)
  const [unpaying, setUnpaying] = useState<Bill | null>(null)
  const [editing, setEditing] = useState<Bill | null>(null)
  const [adding, setAdding] = useState(false)
  // A bill that was just marked paid stays in place for a moment so its
  // check mark can draw and the row can fold away before the list reloads.
  const [justPaid, setJustPaid] = useState<string | null>(null)
  const [toast, setToast] = useState<ToastState | null>(null)
  const hideToast = useCallback(() => setToast(null), [])
  const toastId = useRef(0)

  const header = <TopBar title="Bills" />

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
      <main className="page" aria-busy="true">
        {header}
        <div className="skeleton" style={{ height: 132, marginBottom: 16 }} />
        <div className="skeleton" style={{ height: 48, marginBottom: 20 }} />
        <div className="skeleton" style={{ height: 14, width: '35%', marginBottom: 10 }} />
        <div className="skeleton" style={{ height: 68, marginBottom: 8 }} />
        <div className="skeleton" style={{ height: 68, marginBottom: 8 }} />
        <span className="visually-hidden">Loading your bills</span>
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
  // Credit card payments are transfers: the bills charged to the card are
  // already counted, so counting the card payment too would double it.
  const transferCats = new Set(data.categories.filter((c) => c.kind === 'transfer').map((c) => c.id))
  const monthBills = bills.filter((b) => b.bill_month === thisMonth && !transferCats.has(b.category_id ?? ''))
  const monthPaid = monthBills.filter((b) => b.status === 'paid')
  const monthTotal = sum(monthBills)
  const paidPct = monthTotal ? (sum(monthPaid) / monthTotal) * 100 : 0

  const paid = (bill: Bill) => {
    setPaying(null)
    setJustPaid(bill.id)
    // Celebrate when this was the last unpaid bill on its paycheck.
    const checkDone =
      bill.paycheck_id && bill.paycheck && !bills.some((b) => b.id !== bill.id && b.paycheck_id === bill.paycheck_id && b.status === 'due')
    const message = checkDone
      ? `${bill.name} paid. That's every bill on the ${formatMonthDay(bill.paycheck!.pay_date)} check!`
      : `${bill.name} marked paid`
    if (checkDone) setTimeout(confetti, 350)
    setToast({ id: ++toastId.current, message, actionLabel: 'Undo', onAction: () => undo(bill) })
    setTimeout(async () => {
      await reload()
      setJustPaid(null)
    }, 750)
  }

  // Undo removes the payment the app just recorded, the same as
  // "Mark not paid" but without the confirm step.
  const undo = async (bill: Bill) => {
    if (!supabase) return
    const { error: rpcError } = await supabase.rpc('unmark_bill_paid', { p_bill_instance_id: bill.id })
    if (rpcError) setToast({ id: ++toastId.current, message: `Couldn’t undo: ${rpcError.message}` })
    reload()
  }

  const categoryName = (id: string | null) => data.categories.find((c) => c.id === id)?.name ?? null

  const done = () => {
    setPaying(null)
    setUnpaying(null)
    setEditing(null)
    setAdding(false)
    reload()
  }

  return (
    <main className="page">
      {header}

      <PaydayCard
        nextPayday={nextPayday}
        daysToPayday={daysToPayday}
        leftBeforePayday={leftBeforePayday ?? 0}
        monthLabel={formatMonth(thisMonth)}
        monthPaid={sum(monthPaid)}
        monthTotal={monthTotal}
        hasMonthBills={monthBills.length > 0}
        paidPct={paidPct}
      />

      <button className="add-txn secondary" onClick={() => setAdding(true)}>
        + Add bill
      </button>

      {bills.length === 0 && <p className="muted">No bills yet. Add one with the button above.</p>}

      <Section title="Overdue" tone="danger" bills={overdue} onCheck={setPaying} onEdit={setEditing} justPaid={justPaid} categoryName={categoryName} />
      <Section title="Due today" bills={dueToday} onCheck={setPaying} onEdit={setEditing} justPaid={justPaid} categoryName={categoryName} />
      <Section title="This week" bills={thisWeek} onCheck={setPaying} onEdit={setEditing} justPaid={justPaid} categoryName={categoryName} />
      <Section title="Until next payday" bills={untilPayday} onCheck={setPaying} onEdit={setEditing} justPaid={justPaid} categoryName={categoryName} />
      <Section title="Later" bills={later} onCheck={setPaying} onEdit={setEditing} justPaid={justPaid} categoryName={categoryName} collapsed />
      <Section title="Paid this month" bills={monthPaid} onCheck={setUnpaying} onEdit={setEditing} justPaid={justPaid} categoryName={categoryName} collapsed />

      {paying && (
        <MarkPaidDialog
          bill={paying}
          accounts={data.accounts}
          categories={data.categories}
          onClose={() => setPaying(null)}
          onSaved={() => paid(paying)}
        />
      )}
      {(editing || adding) && (
        <BillDialog
          bill={editing ?? undefined}
          today={today}
          accounts={data.accounts}
          categories={data.categories}
          paySchedules={data.paySchedules}
          onClose={() => (setEditing(null), setAdding(false))}
          onSaved={done}
        />
      )}
      {unpaying && <UnmarkDialog bill={unpaying} onClose={() => setUnpaying(null)} onSaved={done} />}
      <Toast toast={toast} onDone={hideToast} />
    </main>
  )
}

type SectionProps = {
  title: string
  bills: Bill[]
  onCheck: (b: Bill) => void
  onEdit: (b: Bill) => void
  tone?: 'danger'
  collapsed?: boolean
  justPaid: string | null
  categoryName: (id: string | null) => string | null
}

function Section({ title, bills, onCheck, onEdit, tone, collapsed, justPaid, categoryName }: SectionProps) {
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
    <ul className="bills cards">
      {bills.map((b) => (
        <BillRow key={b.id} bill={b} onCheck={onCheck} onEdit={onEdit} leaving={b.id === justPaid} categoryName={categoryName(b.category_id)} />
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

type RowProps = {
  bill: Bill
  onCheck: (b: Bill) => void
  onEdit: (b: Bill) => void
  leaving: boolean
  categoryName: string | null
}

function BillRow({ bill, onCheck, onEdit, leaving, categoryName }: RowProps) {
  const paid = bill.status === 'paid' || leaving
  return (
    <li className={['bill', 'swipeable', paid && 'paid', leaving && 'leaving'].filter(Boolean).join(' ')}>
      <SwipeToPay enabled={!paid} label="Pay" onSwipe={() => onCheck(bill)}>
        <button
          className={['check', paid && 'checked', leaving && 'just-checked'].filter(Boolean).join(' ')}
          onClick={() => onCheck(bill)}
          disabled={leaving}
          aria-label={paid ? `Mark ${bill.name} as not paid` : `Mark ${bill.name} paid`}
        >
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <path d="M3.5 8.5l3 3 6-7" />
          </svg>
        </button>
        {/* Tapping anywhere but the check opens the edit popup. */}
        <button className="txn-open" onClick={() => onEdit(bill)} aria-label={`Edit ${bill.name}`}>
          <span className="bill-main">
            <span className="bill-name">
              <CategoryDot id={bill.category_id} />
              {bill.name}
            </span>
            <span className="muted small">
              {paid && bill.paid_date ? `Paid ${formatShortDate(bill.paid_date)}` : `Due ${formatShortDate(bill.due_date)}`}
              {bill.paycheck && !paid ? ` · ${formatMonthDay(bill.paycheck.pay_date)} check` : ''}
              {categoryName && (
                <>
                  {' '}
                  <CategoryTag id={bill.category_id} name={categoryName} />
                </>
              )}
            </span>
          </span>
          <span className="bill-amount">{formatCents(bill.amount_cents)}</span>
        </button>
      </SwipeToPay>
    </li>
  )
}

type PaydayCardProps = {
  nextPayday: string | null
  daysToPayday: number | null
  leftBeforePayday: number
  monthLabel: string
  monthPaid: number
  monthTotal: number
  hasMonthBills: boolean
  paidPct: number
}

// The blue card at the top: money still due before payday, and a ring
// showing how much of this month's bills are paid.
function PaydayCard(p: PaydayCardProps) {
  const left = useCountUp(p.leftBeforePayday)
  const monthPaid = useCountUp(p.monthPaid)
  return (
    <section className="hero" aria-label="Payday summary">
      <div className="hero-row">
        <div className="hero-text">
          {p.nextPayday ? (
            <>
              <p className="hero-label">
                {p.daysToPayday === 1 ? 'Payday tomorrow' : `Payday in ${p.daysToPayday} days`} ·{' '}
                {formatShortDate(p.nextPayday)}
              </p>
              <p className="hero-amount">{formatCents(left)}</p>
              <p className="hero-label">left to pay before then</p>
            </>
          ) : (
            <p className="hero-label">No upcoming payday yet. It appears once your pay schedule is set up.</p>
          )}
        </div>
        {p.hasMonthBills && <ProgressRing pct={p.paidPct} label={`${Math.round(p.paidPct)}% of ${p.monthLabel} bills paid`} />}
      </div>
      {p.hasMonthBills && (
        <p className="hero-month">
          {p.monthLabel} · {formatCents(monthPaid)} of {formatCents(p.monthTotal)} paid
        </p>
      )}
    </section>
  )
}

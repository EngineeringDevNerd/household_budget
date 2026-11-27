import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router'
import { TopBar } from '../../components/TopBar'
import { supabase } from '../../lib/supabase'
import { addMonths, formatMonth, monthEnd, monthStart, todayISO } from '../../lib/dates'
import { centsToInput, formatCents, parseDollarsToCents } from '../../lib/money'
import { NO_CATEGORY, spendingByCategory } from './spending'

type Line = {
  category_id: string
  name: string
  is_active: boolean
  set_cents: number | null
  set_month: string | null
  bills_cents: number
  budget_cents: number
  /** Spent this month: money out minus refunds, from transactions. */
  spent_cents: number
  /** Bills in this category that aren't paid yet. */
  due_cents: number
}


function useBudget(month: string) {
  const [lines, setLines] = useState<Line[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!supabase) return
    setLines(null)
    try {
      // Bills for a month only exist once the month is filled in. The Bills
      // page does this month and next; do the same here for any month that
      // isn't over yet. (Never for past months: that would add bills to
      // months before they existed.)
      if (month >= monthStart(todayISO())) {
        const { error: genError } = await supabase.rpc('generate_month', { p_month: month })
        if (genError) throw genError
      }
      const [budget, cats, txns, due] = await Promise.all([
        supabase.rpc('budget_for_month', { p_month: month }),
        supabase.from('categories').select('id, name, kind, is_active'),
        supabase
          .from('transactions')
          .select('amount_cents, category_id, transfer_group_id')
          .gte('txn_date', month)
          .lte('txn_date', monthEnd(month)),
        supabase.from('bill_instances').select('amount_cents, category_id').eq('bill_month', month).eq('status', 'due'),
      ])
      for (const res of [budget, cats, txns, due]) if (res.error) throw res.error
      const byId = new Map((cats.data ?? []).map((c) => [c.id, c]))
      const expenseIds = new Set((cats.data ?? []).filter((c) => c.kind === 'expense').map((c) => c.id))
      const spent = spendingByCategory(txns.data ?? [], expenseIds)
      const dueBy = new Map<string, number>()
      for (const b of due.data ?? []) {
        if (b.category_id && expenseIds.has(b.category_id))
          dueBy.set(b.category_id, (dueBy.get(b.category_id) ?? 0) + b.amount_cents)
      }
      const list: Line[] = (budget.data ?? []).map((b) => ({
        ...b,
        name: byId.get(b.category_id)?.name ?? '?',
        is_active: byId.get(b.category_id)?.is_active ?? true,
        spent_cents: spent.get(b.category_id) ?? 0,
        due_cents: dueBy.get(b.category_id) ?? 0,
      }))
      const uncategorized = spent.get(NO_CATEGORY) ?? 0
      if (uncategorized !== 0) {
        list.push({
          category_id: NO_CATEGORY,
          name: 'No category',
          is_active: true,
          set_cents: null,
          set_month: null,
          bills_cents: 0,
          budget_cents: 0,
          spent_cents: uncategorized,
          due_cents: 0,
        })
      }
      setLines(
        list
          // Hidden categories only show up if they still have a budget or spending.
          .filter((l) => l.is_active || l.budget_cents > 0 || l.spent_cents !== 0)
          .sort((a, b) => b.budget_cents - a.budget_cents || b.spent_cents - a.spent_cents || a.name.localeCompare(b.name)),
      )
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong loading the budget.')
    }
  }, [month])

  useEffect(() => {
    // oxlint-disable-next-line react/set-state-in-effect
    load()
  }, [load])

  return { lines, error, reload: load }
}

export function BudgetPage() {
  const [month, setMonth] = useState(() => monthStart(todayISO()))
  const { lines, error, reload } = useBudget(month)
  const [editing, setEditing] = useState<Line | null>(null)
  const header = <TopBar title="Budget" />

  const switcher = (
    <div className="month-switch">
      <button className="secondary" aria-label="Previous month" onClick={() => setMonth(addMonths(month, -1))}>
        ‹
      </button>
      <span className="month-name">{formatMonth(month)}</span>
      <button className="secondary" aria-label="Next month" onClick={() => setMonth(addMonths(month, 1))}>
        ›
      </button>
    </div>
  )

  if (error) {
    return (
      <main className="page">
        {header}
        {switcher}
        <p className="error">Couldn’t load the budget: {error}</p>
        <button onClick={reload}>Try again</button>
      </main>
    )
  }
  if (!lines) {
    return (
      <main className="page">
        {header}
        {switcher}
        <p className="muted">Loading…</p>
      </main>
    )
  }

  const total = lines.reduce((t, l) => t + l.budget_cents, 0)
  const spentTotal = lines.reduce((t, l) => t + l.spent_cents, 0)
  const dueTotal = lines.reduce((t, l) => t + l.due_cents, 0)
  const budgeted = lines.filter((l) => l.budget_cents > 0)
  const unbudgeted = lines.filter((l) => l.budget_cents === 0)

  return (
    <main className="page">
      {header}
      {switcher}

      <section className="card summary">
        <p className="big">
          {formatCents(spentTotal)} <span className="muted small">spent of {formatCents(total)}</span>
        </p>
        <Meter spent={spentTotal} due={dueTotal} budget={total} />
        <p className="muted small">
          {dueTotal > 0 ? `${formatCents(dueTotal)} in bills still due · ` : ''}
          {total - spentTotal - dueTotal >= 0
            ? `${formatCents(total - spentTotal - dueTotal)} left`
            : `${formatCents(spentTotal + dueTotal - total)} over`}
        </p>
      </section>

      <p className="small">
        A bill category is budgeted at least what its bills add up to. Tap a category to set a budget. It carries into
        the months after until you change it.
      </p>

      {budgeted.length > 0 && (
        <section className="section">
          <h2>Budgeted</h2>
          <ul className="bills">
            {budgeted.map((l) => (
              <BudgetRow key={l.category_id} line={l} month={month} onOpen={() => setEditing(l)} />
            ))}
          </ul>
        </section>
      )}
      {unbudgeted.length > 0 && (
        <section className="section">
          <h2>No budget yet</h2>
          <ul className="bills">
            {unbudgeted.map((l) => (
              <BudgetRow key={l.category_id} line={l} month={month} onOpen={() => setEditing(l)} />
            ))}
          </ul>
        </section>
      )}

      <p className="small">
        Card payments and other transfers aren’t budgeted, so nothing counts twice.{' '}
        <Link to="/categories">Manage categories</Link>
      </p>

      {editing && (
        <BudgetDialog
          line={editing}
          month={month}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            reload()
          }}
        />
      )}
    </main>
  )
}

function describe(l: Line, month: string): string {
  const parts: string[] = []
  if (l.spent_cents !== 0 || l.due_cents > 0) {
    parts.push(`Spent ${formatCents(l.spent_cents)}${l.due_cents > 0 ? ` · ${formatCents(l.due_cents)} due` : ''}`)
  }
  if (l.bills_cents > 0) parts.push(`Bills ${formatCents(l.bills_cents)}`)
  if (l.set_cents !== null) {
    parts.push(
      l.set_month === month
        ? `Set to ${formatCents(l.set_cents)}`
        : `${formatCents(l.set_cents)} carried from ${formatMonth(l.set_month!).split(' ')[0]}`,
    )
  }
  return parts.join(' · ') || 'Tap to set a budget'
}

// Solid = spent, light = bills still due, against the budget. Turns red
// once spent + due goes past the budget.
function Meter({ spent, due, budget }: { spent: number; due: number; budget: number }) {
  if (budget <= 0) return null
  const pct = (n: number) => `${Math.max(0, Math.min(100, (n / budget) * 100))}%`
  const over = spent + due > budget
  return (
    <div
      className={over ? 'bar meter over' : 'bar meter'}
      role="img"
      aria-label={`${formatCents(spent)} spent and ${formatCents(due)} due of ${formatCents(budget)}`}
    >
      <div className="spent" style={{ width: pct(spent) }} />
      <div className="due" style={{ width: pct(Math.min(due, budget - Math.max(spent, 0))) }} />
    </div>
  )
}

function BudgetRow({ line, month, onOpen }: { line: Line; month: string; onOpen: () => void }) {
  const editable = line.category_id !== NO_CATEGORY
  const body = (
    <span className="budget-line">
      <span className="budget-top">
        <span className="bill-main">
          <span className="bill-name">
            {line.name}
            {!line.is_active && <span className="muted small"> (hidden)</span>}
          </span>
          <span className="muted small">
            {editable ? describe(line, month) : `Spent ${formatCents(line.spent_cents)} · categorize it on Transactions`}
          </span>
        </span>
        <span className="bill-amount">{line.budget_cents ? formatCents(line.budget_cents) : '—'}</span>
      </span>
      <Meter spent={line.spent_cents} due={line.due_cents} budget={line.budget_cents} />
    </span>
  )
  return (
    <li className="bill">
      {editable ? (
        <button className="txn-open" onClick={onOpen} aria-label={`Set budget for ${line.name}`}>
          {body}
        </button>
      ) : (
        body
      )}
    </li>
  )
}

function BudgetDialog({
  line,
  month,
  onClose,
  onSaved,
}: {
  line: Line
  month: string
  onClose: () => void
  onSaved: () => void
}) {
  const [amount, setAmount] = useState(line.set_cents !== null ? centsToInput(line.set_cents) : '')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const monthName = formatMonth(month).split(' ')[0]
  const setThisMonth = line.set_month === month

  async function run(call: () => PromiseLike<{ error: { message: string } | null }>) {
    setBusy(true)
    setError(null)
    const { error: dbError } = await call()
    setBusy(false)
    if (dbError) return setError(dbError.message)
    onSaved()
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    const cents = parseDollarsToCents(amount)
    if (cents === null) return setError('Enter an amount, like 600.')
    if (!supabase) return
    const db = supabase
    return run(() =>
      db
        .from('budgets')
        .upsert({ category_id: line.category_id, month, amount_cents: cents }, { onConflict: 'category_id,month' }),
    )
  }

  // Removing this month's amount goes back to whatever was carried in from
  // an earlier month (or no budget, if there wasn't one).
  function remove() {
    if (!supabase) return
    const db = supabase
    return run(() => db.from('budgets').delete().eq('category_id', line.category_id).eq('month', month))
  }

  const cents = parseDollarsToCents(amount)
  const belowBills = cents !== null && line.bills_cents > 0 && cents < line.bills_cents

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <form
        className="sheet form"
        role="dialog"
        aria-modal="true"
        aria-labelledby="budget-title"
        onClick={(e) => e.stopPropagation()}
        onSubmit={onSubmit}
      >
        <div>
          <h2 id="budget-title">{line.name} budget</h2>
          <p className="muted small">
            For {monthName} and every month after, until you change it.
          </p>
        </div>
        <label>
          Monthly budget
          <input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} required autoFocus />
        </label>
        {line.bills_cents > 0 && (
          <p className={belowBills ? 'warn small' : 'muted small'}>
            {monthName}’s bills in {line.name} add up to {formatCents(line.bills_cents)}.
            {belowBills ? ' The budget won’t go below that, so this month it stays at the bills total.' : ''}
          </p>
        )}
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
            {busy ? 'Saving…' : 'Save budget'}
          </button>
        </div>
        {setThisMonth && (
          <button type="button" className="link danger-text" onClick={remove} disabled={busy}>
            Remove {monthName}’s amount
          </button>
        )}
      </form>
    </div>
  )
}

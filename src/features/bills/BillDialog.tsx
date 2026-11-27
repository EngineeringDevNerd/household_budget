import { useState, type FormEvent } from 'react'
import { supabase } from '../../lib/supabase'
import { centsToInput, parseDollarsToCents } from '../../lib/money'
import { addMonths, formatMonth, formatShortDate, monthStart } from '../../lib/dates'
import type { Account, Bill, Category, PaySchedule } from './useBoard'

type Props = {
  /** The bill you tapped. Leave it out to add a new bill. */
  bill?: Bill
  today: string
  accounts: Account[]
  categories: Category[]
  paySchedules: PaySchedule[]
  onClose: () => void
  onSaved: () => void
}

type Frequency = 'monthly' | 'per_paycheck' | 'once'
type Step = 'form' | 'save-scope' | 'delete'
type Scope = 'one' | 'future'

// One popup for adding a bill and for editing or deleting one.
//
// A recurring bill is a template plus one row per month (see the
// 20261127060000_edit_bills migration). So Save and Delete ask, every time,
// whether the change is for this month only or for this and future months,
// the way a calendar asks about a repeating event.
export function BillDialog({ bill, today, accounts, categories, paySchedules, onClose, onSaved }: Props) {
  const rb = bill?.recurring_bills ?? null
  const isNew = !bill
  const payCheckSchedule = paySchedules.find((s) => s.covers_bills && s.frequency === 'biweekly')

  const initialFrequency: Frequency = bill ? (rb ? (rb.frequency as Frequency) : 'once') : 'monthly'
  // Show the day this row is actually due (it may have been moved for one
  // month), and send a due day to the database only if you change it.
  const initialDueDay = bill ? (bill.due_date.startsWith(bill.bill_month.slice(0, 7)) ? Number(bill.due_date.slice(8)) : rb?.due_day) : null

  const [frequency, setFrequency] = useState<Frequency>(initialFrequency)
  const [name, setName] = useState(bill?.name ?? '')
  const [amount, setAmount] = useState(bill ? centsToInput(bill.amount_cents) : '')
  const [dueDay, setDueDay] = useState(initialDueDay ? String(initialDueDay) : '')
  const [dueDate, setDueDate] = useState(bill?.due_date ?? today)
  const [categoryId, setCategoryId] = useState(bill?.category_id ?? '')
  const [accountId, setAccountId] = useState(rb?.default_account_id ?? '')
  const [isCardPayment, setIsCardPayment] = useState(Boolean(rb?.transfer_to_account_id))
  const [toAccountId, setToAccountId] = useState(rb?.transfer_to_account_id ?? '')
  const [isVariable, setIsVariable] = useState(rb?.is_variable ?? false)
  const [payFrom, setPayFrom] = useState(rb?.pay_from ?? 'on_or_before')
  const [startMonth, setStartMonth] = useState<string | null>(null)

  const [step, setStep] = useState<Step>('form')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const recurring = frequency !== 'once'
  const perPaycheck = frequency === 'per_paycheck'
  const paid = bill?.status === 'paid'
  const cards = accounts.filter((a) => a.type === 'credit' && a.id !== accountId)

  // First month for a new bill: this month if its due day hasn't passed yet,
  // otherwise next month, so a bill you add today doesn't show up overdue.
  // Car payments start next month for the same reason (this month's paydays
  // may be behind you).
  const thisMonth = monthStart(today)
  const dayNum = Number(dueDay)
  const suggestedStart =
    frequency === 'monthly' && dayNum >= Number(today.slice(8)) ? thisMonth : addMonths(today, 1)
  const firstMonth = startMonth ?? suggestedStart
  const monthChoices = [0, 1, 2, 3].map((n) => addMonths(today, n))

  // These live on the bill's template, so they can't change for one month.
  const templateOnlyChanged =
    !!rb &&
    ((rb.default_account_id ?? '') !== accountId ||
      (rb.transfer_to_account_id ?? '') !== (isCardPayment ? toAccountId : '') ||
      rb.is_variable !== isVariable ||
      rb.pay_from !== payFrom)

  const oneLabel = perPaycheck ? 'This payment only' : 'This month only'
  const futureLabel = perPaycheck ? 'This and future payments' : 'This and future months'

  function readForm() {
    const cleanName = name.trim()
    if (!cleanName) return setError('Give the bill a name.'), null
    const cents = parseDollarsToCents(amount)
    if (cents === null) return setError('Enter an amount, like 125.40. Use 0 if it changes every month.'), null
    if (frequency === 'monthly' && !(Number.isInteger(dayNum) && dayNum >= 1 && dayNum <= 31))
      return setError('Enter a due day from 1 to 31.'), null
    if (frequency === 'once' && !dueDate) return setError('Pick the due date.'), null
    if (recurring && isCardPayment && !toAccountId) return setError('Pick the card this payment goes to.'), null
    if (perPaycheck && !payCheckSchedule) return setError('There’s no paycheck schedule to follow yet.'), null
    return { cleanName, cents }
  }

  async function run(call: () => PromiseLike<{ error: { message: string } | null }>) {
    if (!supabase) return
    setBusy(true)
    setError(null)
    const { error: dbError } = await call()
    setBusy(false)
    if (dbError) return setError(dbError.message)
    onSaved()
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    const f = readForm()
    if (!f || !supabase) return
    const db = supabase

    if (isNew) {
      if (frequency === 'once') {
        return run(() =>
          db.from('bill_instances').insert({
            name: f.cleanName,
            amount_cents: f.cents,
            category_id: categoryId || null,
            due_date: dueDate,
            bill_month: monthStart(dueDate),
          }),
        )
      }
      return run(() =>
        db.from('recurring_bills').insert({
          name: f.cleanName,
          default_amount_cents: f.cents,
          frequency,
          due_day: frequency === 'monthly' ? dayNum : null,
          pay_schedule_id: perPaycheck ? payCheckSchedule!.id : null,
          category_id: categoryId || null,
          default_account_id: accountId || null,
          transfer_to_account_id: isCardPayment ? toAccountId : null,
          is_variable: isVariable,
          pay_from: frequency === 'monthly' ? payFrom : 'on_or_before',
          start_month: firstMonth,
        }),
      )
    }

    // A one-time bill has no future months to ask about.
    if (!rb) return save('one')
    setStep('save-scope')
  }

  function save(scope: Scope) {
    const f = readForm()
    if (!f || !bill || !supabase) return
    const db = supabase
    return run(() =>
      db.rpc('update_bill', {
        p_bill_instance_id: bill.id,
        p_scope: scope,
        p_name: f.cleanName,
        p_amount_cents: f.cents,
        p_category_id: categoryId || null,
        p_due_day: frequency === 'monthly' && dayNum !== initialDueDay ? dayNum : null,
        p_due_date: frequency === 'once' ? dueDate : null,
        p_default_account_id: accountId || null,
        p_transfer_to_account_id: isCardPayment ? toAccountId || null : null,
        p_is_variable: isVariable,
        p_pay_from: payFrom,
      }),
    )
  }

  function remove(scope: Scope) {
    if (!bill || !supabase) return
    const db = supabase
    return run(() => db.rpc('delete_bill', { p_bill_instance_id: bill.id, p_scope: scope }))
  }

  const title = isNew ? 'Add a bill' : step === 'delete' ? `Delete ${bill.name}?` : `Edit ${bill.name}`
  const monthName = bill ? formatMonth(bill.bill_month).split(' ')[0] : ''
  // "Just November, or November and every month after?"
  const scopeQuestion = perPaycheck
    ? 'Just this payment, or this one and every payment after it?'
    : `Just ${monthName}, or ${monthName} and every month after it?`

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <form
        className="sheet form"
        role="dialog"
        aria-modal="true"
        aria-labelledby="bill-title"
        onClick={(e) => e.stopPropagation()}
        onSubmit={onSubmit}
      >
        <div>
          <h2 id="bill-title">{title}</h2>
          {bill && (
            <p className="muted small">
              {paid && bill.paid_date ? `Paid ${formatShortDate(bill.paid_date)}` : `Due ${formatShortDate(bill.due_date)}`}
              {' · '}
              {rb ? (perPaycheck ? 'every payday' : 'monthly') : 'one time'}
            </p>
          )}
        </div>

        {step === 'form' && (
          <>
            {isNew && (
              <div className="segmented" role="group" aria-label="How often">
                {(
                  [
                    ['monthly', 'Monthly'],
                    ['per_paycheck', 'Every payday'],
                    ['once', 'One time'],
                  ] as const
                ).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    className={frequency === value ? 'on' : undefined}
                    aria-pressed={frequency === value}
                    onClick={() => setFrequency(value)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}

            <label>
              Name
              <input value={name} onChange={(e) => setName(e.target.value)} required autoFocus={isNew} />
            </label>

            <div className="row-buttons">
              <label>
                {perPaycheck ? 'Amount each payday' : 'Amount'}
                <input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} required />
              </label>
              {frequency === 'monthly' && (
                <label>
                  Due day
                  <input
                    inputMode="numeric"
                    value={dueDay}
                    onChange={(e) => setDueDay(e.target.value.replace(/\D/g, '').slice(0, 2))}
                    placeholder="1–31"
                    required
                  />
                </label>
              )}
              {frequency === 'once' && (
                <label>
                  Due date
                  <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} required />
                </label>
              )}
            </div>
            {paid && <p className="muted small">Already paid. Changing the amount here doesn’t change the payment.</p>}

            {isNew && recurring && (
              <label>
                First month
                <select value={firstMonth} onChange={(e) => setStartMonth(e.target.value)}>
                  {monthChoices.map((m) => (
                    <option key={m} value={m}>
                      {formatMonth(m)}
                    </option>
                  ))}
                </select>
              </label>
            )}

            <label>
              Category
              <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
                <option value="">None</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>

            {recurring && (
              <>
                <label>
                  Usually paid from
                  <select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
                    <option value="">Not set</option>
                    {accounts.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                  </select>
                </label>

                {frequency === 'monthly' && (
                  <label>
                    Which paycheck covers it
                    <select value={payFrom} onChange={(e) => setPayFrom(e.target.value)}>
                      <option value="on_or_before">The last check on or before the due date</option>
                      <option value="prev_month_last">The last check of the month before</option>
                    </select>
                  </label>
                )}

                <label className="check-label">
                  <input type="checkbox" checked={isVariable} onChange={(e) => setIsVariable(e.target.checked)} />
                  The amount changes from month to month
                </label>

                <label className="check-label">
                  <input
                    type="checkbox"
                    checked={isCardPayment}
                    onChange={(e) => setIsCardPayment(e.target.checked)}
                  />
                  This is a credit card payment
                </label>
                {isCardPayment && (
                  <>
                    <label>
                      Pays off card
                      <select value={toAccountId} onChange={(e) => setToAccountId(e.target.value)} required>
                        <option value="">Pick a card</option>
                        {cards.map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <p className="muted small">
                      Marking it paid records money leaving the paid-from account and arriving on the card. Use the
                      Credit Card Payment category if what you charged to the card is already listed as bills, so
                      nothing counts twice.
                    </p>
                  </>
                )}
              </>
            )}
          </>
        )}

        {step === 'save-scope' && (
          <>
            <p>Save the change for {scopeQuestion.charAt(0).toLowerCase() + scopeQuestion.slice(1)}</p>
            {templateOnlyChanged && (
              <p className="muted small">
                You changed the paid-from account, the card payment, the paycheck rule or “amount changes”. Those can
                only change for this and future {perPaycheck ? 'payments' : 'months'}.
              </p>
            )}
            {!paid && rb && (
              <p className="muted small">“{futureLabel}” also updates every unpaid month after this one. Paid months stay as they were.</p>
            )}
          </>
        )}

        {step === 'delete' && bill && (
          <>
            {rb && <p>{scopeQuestion}</p>}
            {paid && (
              <p className="warn small">
                This one is already paid. Its payment stays in Transactions, because that money really left the account.
                If the payment never happened, mark the bill not paid first.
              </p>
            )}
            {rb && <p className="muted small">Earlier months stay as history.</p>}
          </>
        )}

        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}

        {step === 'form' && (
          <>
            <div className="row-buttons">
              <button type="button" className="secondary" onClick={onClose}>
                Cancel
              </button>
              <button type="submit" disabled={busy}>
                {busy ? 'Saving…' : isNew ? 'Add bill' : 'Save'}
              </button>
            </div>
            {bill && (
              <button type="button" className="link danger-text" onClick={() => (setError(null), setStep('delete'))}>
                Delete bill
              </button>
            )}
          </>
        )}

        {step === 'save-scope' && (
          <div className="scope-buttons">
            <button type="button" onClick={() => save('one')} disabled={busy || templateOnlyChanged}>
              {oneLabel}
            </button>
            <button type="button" onClick={() => save('future')} disabled={busy}>
              {futureLabel}
            </button>
            <button type="button" className="secondary" onClick={() => setStep('form')} disabled={busy}>
              Back
            </button>
          </div>
        )}

        {step === 'delete' && (
          <div className="scope-buttons">
            {rb ? (
              <>
                <button type="button" className="danger" onClick={() => remove('one')} disabled={busy}>
                  {oneLabel}
                </button>
                <button type="button" className="danger" onClick={() => remove('future')} disabled={busy}>
                  {futureLabel}
                </button>
              </>
            ) : (
              <button type="button" className="danger" onClick={() => remove('one')} disabled={busy}>
                {busy ? 'Deleting…' : 'Delete'}
              </button>
            )}
            <button type="button" className="secondary" onClick={() => setStep('form')} disabled={busy}>
              Keep it
            </button>
          </div>
        )}
      </form>
    </div>
  )
}

import { useState, type FormEvent } from 'react'
import { TopBar } from '../../components/TopBar'
import { supabase } from '../../lib/supabase'
import type { Rule } from './rules'
import { RuleFieldsInputs } from './RuleFields'
import { saveRule, useRuleOptions, type BillOption, type CategoryOption } from './saveRule'

// Every payee rule in one list: tap one to change or delete it.
export function RulesPage() {
  const { rules, bills, categories, error, reload } = useRuleOptions()
  const [editing, setEditing] = useState<Rule | 'new' | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const header = <TopBar title="Payee rules" />

  if (error) {
    return (
      <main className="page">
        {header}
        <p className="error">Couldn’t load your rules: {error}</p>
      </main>
    )
  }
  if (!rules) {
    return (
      <main className="page">
        {header}
        <p className="muted">Loading…</p>
      </main>
    )
  }

  const name = (list: { id: string; name: string }[], id: string | null) => list.find((x) => x.id === id)?.name

  return (
    <main className="page">
      {header}
      <p className="small">
        When a bank description contains a rule’s text, imports use that rule’s payee name and category. A rule tied to
        a bill lets that bill match a payment for any amount, which is handy for bills that change every month.
      </p>
      <button className="add-txn" onClick={() => setEditing('new')}>
        + Add rule
      </button>
      {message && (
        <p className="ok small" role="status">
          {message}
        </p>
      )}
      {rules.length === 0 && (
        <p className="muted">
          No rules yet. The quickest way to make one is “Always do this” when you edit an imported transaction.
        </p>
      )}
      {rules.length > 0 && (
        <ul className="bills">
          {rules.map((r) => (
            <li key={r.id} className="bill">
              <button className="txn-open" onClick={() => setEditing(r)} aria-label={`Edit rule for ${r.match_text}`}>
                <div className="bill-main">
                  <span className="bill-name">“{r.match_text}”</span>
                  <span className="muted small">
                    {[
                      r.payee_name && `→ ${r.payee_name}`,
                      name(categories, r.category_id),
                      r.recurring_bill_id && `pays ${name(bills, r.recurring_bill_id) ?? 'a bill'}`,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
      {editing && (
        <RuleDialog
          rule={editing === 'new' ? null : editing}
          bills={bills}
          categories={categories}
          onClose={() => setEditing(null)}
          onSaved={(msg) => {
            setEditing(null)
            setMessage(msg)
            reload()
          }}
        />
      )}
    </main>
  )
}

function RuleDialog({
  rule,
  bills,
  categories,
  onClose,
  onSaved,
}: {
  rule: Rule | null
  bills: BillOption[]
  categories: CategoryOption[]
  onClose: () => void
  onSaved: (message: string) => void
}) {
  const [text, setText] = useState(rule?.match_text ?? '')
  const [payee, setPayee] = useState(rule?.payee_name ?? '')
  const [categoryId, setCategoryId] = useState(rule?.category_id ?? '')
  const [billId, setBillId] = useState(rule?.recurring_bill_id ?? '')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const changed = await saveRule(
        {
          match_text: text,
          payee_name: payee.trim() || null,
          category_id: categoryId || null,
          recurring_bill_id: billId || null,
        },
        rule?.id,
      )
      onSaved(`Rule saved.${changed ? ` Updated ${changed} uncategorized transaction${changed === 1 ? '' : 's'}.` : ''}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  async function onDelete() {
    if (!supabase || !rule) return
    setBusy(true)
    const { error: delError } = await supabase.from('payee_rules').delete().eq('id', rule.id)
    setBusy(false)
    if (delError) return setError(delError.message)
    onSaved('Rule deleted. Transactions it already changed keep their payee and category.')
  }

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <form
        className="sheet form"
        role="dialog"
        aria-modal="true"
        aria-labelledby="rule-title"
        onClick={(e) => e.stopPropagation()}
        onSubmit={onSubmit}
      >
        <h2 id="rule-title">{rule ? 'Edit rule' : 'New rule'}</h2>
        <RuleFieldsInputs
          text={text}
          setText={setText}
          payee={payee}
          setPayee={setPayee}
          categoryId={categoryId}
          setCategoryId={setCategoryId}
          billId={billId}
          setBillId={setBillId}
          bills={bills}
          categories={categories}
        />
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        {confirmDelete ? (
          <>
            <p className="warn small">Delete this rule? Transactions it already changed stay as they are.</p>
            <div className="row-buttons">
              <button type="button" className="secondary" onClick={() => setConfirmDelete(false)}>
                Keep it
              </button>
              <button type="button" className="danger" onClick={onDelete} disabled={busy}>
                Delete
              </button>
            </div>
          </>
        ) : (
          <div className="row-buttons">
            <button type="button" className="secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" disabled={busy}>
              {busy ? 'Saving…' : 'Save'}
            </button>
          </div>
        )}
        {rule && !confirmDelete && (
          <button type="button" className="link danger-text" onClick={() => setConfirmDelete(true)}>
            Delete rule
          </button>
        )}
      </form>
    </div>
  )
}

import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router'
import { TopBar } from '../../components/TopBar'
import { supabase } from '../../lib/supabase'
import type { Tables } from '../../types/database'

type Kind = 'expense' | 'income' | 'transfer'
type Category = Pick<Tables<'categories'>, 'id' | 'name' | 'kind' | 'is_active'>
type Usage = { transactions: number; bills: number; rules: number }
type PageData = { categories: Category[]; usage: Map<string, Usage> }

const KINDS: { kind: Kind; label: string; heading: string; help: string }[] = [
  { kind: 'expense', label: 'Spending', heading: 'Spending', help: 'Counted as spending in totals and budgets.' },
  { kind: 'income', label: 'Income', heading: 'Income', help: 'Money coming in, like paychecks.' },
  {
    kind: 'transfer',
    label: 'Transfer',
    heading: 'Transfers',
    help: 'Money moving between your own accounts, like card payments. Never counted as spending, so nothing counts twice.',
  },
]

// The app finds this one by name (manual entries and imports fall back to
// it), so it can't be renamed, hidden or deleted.
const LOCKED = 'Uncategorized'

function useCategories() {
  const [data, setData] = useState<PageData | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!supabase) return
    // Only the category column of each table, to count what uses what.
    const [cats, txns, instances, templates, rules] = await Promise.all([
      supabase.from('categories').select('id, name, kind, is_active').order('name'),
      supabase.from('transactions').select('category_id').not('category_id', 'is', null),
      supabase.from('bill_instances').select('category_id').not('category_id', 'is', null),
      supabase.from('recurring_bills').select('category_id').not('category_id', 'is', null),
      supabase.from('payee_rules').select('category_id').not('category_id', 'is', null),
    ])
    const failed = [cats, txns, instances, templates, rules].find((r) => r.error)
    if (failed?.error) return setError(failed.error.message)

    const usage = new Map<string, Usage>()
    const bump = (id: string | null, key: keyof Usage) => {
      if (!id) return
      const u = usage.get(id) ?? { transactions: 0, bills: 0, rules: 0 }
      u[key] += 1
      usage.set(id, u)
    }
    txns.data?.forEach((r) => bump(r.category_id, 'transactions'))
    // A bill counts once for its template and once per month row; both
    // block deleting, so just count rows.
    instances.data?.forEach((r) => bump(r.category_id, 'bills'))
    templates.data?.forEach((r) => bump(r.category_id, 'bills'))
    rules.data?.forEach((r) => bump(r.category_id, 'rules'))

    setData({ categories: (cats.data ?? []) as Category[], usage })
    setError(null)
  }, [])

  useEffect(() => {
    // oxlint-disable-next-line react/set-state-in-effect
    load()
  }, [load])

  return { data, error, reload: load }
}

function usageText(u: Usage | undefined): string {
  if (!u || (!u.transactions && !u.bills && !u.rules)) return 'Not used yet'
  const parts = []
  if (u.transactions) parts.push(`${u.transactions} transaction${u.transactions === 1 ? '' : 's'}`)
  if (u.bills) parts.push('bills')
  if (u.rules) parts.push(`${u.rules} rule${u.rules === 1 ? '' : 's'}`)
  return parts.join(' · ')
}

export function CategoriesPage() {
  const { data, error, reload } = useCategories()
  const [editing, setEditing] = useState<Category | 'new' | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const header = <TopBar title="Categories" />

  if (error) {
    return (
      <main className="page">
        {header}
        <p className="error">Couldn’t load your categories: {error}</p>
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

  const visible = data.categories.filter((c) => c.is_active)
  const hidden = data.categories.filter((c) => !c.is_active)

  const row = (c: Category) => (
    <li key={c.id} className="bill">
      <button className="txn-open" onClick={() => (setMessage(null), setEditing(c))} aria-label={`Edit ${c.name}`}>
        <span className="bill-main">
          <span className="bill-name">{c.name}</span>
          <span className="muted small">
            {!c.is_active && `${KINDS.find((k) => k.kind === c.kind)?.label} · `}
            {usageText(data.usage.get(c.id))}
          </span>
        </span>
      </button>
    </li>
  )

  return (
    <main className="page">
      {header}
      <p className="small">
        Tap a category to rename it, change its type or hide it. <Link to="/transactions">Back to transactions</Link>
      </p>
      <button className="add-txn" onClick={() => (setMessage(null), setEditing('new'))}>
        + Add category
      </button>
      {message && (
        <p className="ok small" role="status">
          {message}
        </p>
      )}

      {KINDS.map(({ kind, heading }) => {
        const list = visible.filter((c) => c.kind === kind)
        if (list.length === 0) return null
        return (
          <section key={kind} className="section">
            <h2>{heading}</h2>
            <ul className="bills">{list.map(row)}</ul>
          </section>
        )
      })}

      {hidden.length > 0 && (
        <details className="section">
          <summary>
            <span className="section-title">
              <span>
                <span className="chevron" aria-hidden="true">
                  ›
                </span>
                Hidden
              </span>
              <span className="muted">{hidden.length}</span>
            </span>
          </summary>
          <p className="muted small">
            Hidden categories stay on the transactions and bills that already use them, but aren’t offered in pick lists.
          </p>
          <ul className="bills">{hidden.map(row)}</ul>
        </details>
      )}

      {editing && (
        <CategoryDialog
          category={editing === 'new' ? null : editing}
          usage={editing === 'new' ? undefined : data.usage.get(editing.id)}
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

function CategoryDialog({
  category,
  usage,
  onClose,
  onSaved,
}: {
  category: Category | null
  usage: Usage | undefined
  onClose: () => void
  onSaved: (message: string) => void
}) {
  const [name, setName] = useState(category?.name ?? '')
  const [kind, setKind] = useState<Kind>((category?.kind as Kind) ?? 'expense')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const locked = category?.name === LOCKED
  // Anything a transaction or bill points at can't be deleted (that would
  // wipe the label off history), only hidden.
  const inUse = !!usage && (usage.transactions > 0 || usage.bills > 0)

  async function run(call: () => PromiseLike<{ error: { code?: string; message: string } | null }>, done: string) {
    setBusy(true)
    setError(null)
    const { error: dbError } = await call()
    setBusy(false)
    if (!dbError) return onSaved(done)
    if (dbError.code === '23505') return setError('There’s already a category with that name. It may be hidden.')
    if (dbError.code === '23503') return setError('Something still uses this category, so it can’t be deleted. Hide it instead.')
    setError(dbError.message)
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    const clean = name.trim()
    if (!clean) return setError('Give the category a name.')
    if (!supabase) return
    const db = supabase
    if (!category) {
      return run(() => db.from('categories').insert({ name: clean, kind }), `Added ${clean}.`)
    }
    return run(() => db.from('categories').update({ name: clean, kind }).eq('id', category.id), `Saved ${clean}.`)
  }

  function setActive(active: boolean) {
    if (!supabase || !category) return
    const db = supabase
    return run(
      () => db.from('categories').update({ is_active: active }).eq('id', category.id),
      active ? `${category.name} is back in the pick lists.` : `Hid ${category.name}.`,
    )
  }

  function remove() {
    if (!supabase || !category) return
    const db = supabase
    return run(() => db.from('categories').delete().eq('id', category.id), `Deleted ${category.name}.`)
  }

  const kindChanged = !!category && category.kind !== kind

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <form
        className="sheet form"
        role="dialog"
        aria-modal="true"
        aria-labelledby="category-title"
        onClick={(e) => e.stopPropagation()}
        onSubmit={onSubmit}
      >
        <div>
          <h2 id="category-title">{category ? `Edit ${category.name}` : 'Add a category'}</h2>
          {category && <p className="muted small">{usageText(usage)}</p>}
        </div>

        {locked ? (
          <p className="muted small">
            The app puts anything it can’t place here, so this one can’t be renamed, hidden or deleted.
          </p>
        ) : (
          <>
            <label>
              Name
              <input value={name} onChange={(e) => setName(e.target.value)} required autoFocus={!category} />
            </label>
            <div>
              <div className="segmented" role="group" aria-label="Type">
                {KINDS.map((k) => (
                  <button
                    key={k.kind}
                    type="button"
                    className={kind === k.kind ? 'on' : undefined}
                    aria-pressed={kind === k.kind}
                    onClick={() => setKind(k.kind)}
                  >
                    {k.label}
                  </button>
                ))}
              </div>
              <p className="muted small field-help">{KINDS.find((k) => k.kind === kind)?.help}</p>
            </div>
            {kindChanged && inUse && (
              <p className="warn small">
                Everything already in this category changes with it, including totals for past months.
              </p>
            )}
          </>
        )}

        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}

        {confirmDelete ? (
          <>
            <p className="warn small">
              Delete {category?.name}?
              {usage?.rules ? ` ${usage.rules} payee rule${usage.rules === 1 ? '' : 's'} will stop setting a category.` : ''}
            </p>
            <div className="row-buttons">
              <button type="button" className="secondary" onClick={() => setConfirmDelete(false)}>
                Keep it
              </button>
              <button type="button" className="danger" onClick={remove} disabled={busy}>
                {busy ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="row-buttons">
              <button type="button" className="secondary" onClick={onClose}>
                {locked ? 'Close' : 'Cancel'}
              </button>
              {!locked && (
                <button type="submit" disabled={busy}>
                  {busy ? 'Saving…' : category ? 'Save' : 'Add category'}
                </button>
              )}
            </div>
            {category && !locked && (
              <>
                {category.is_active ? (
                  <button type="button" className="link" onClick={() => setActive(false)} disabled={busy}>
                    Hide from pick lists
                  </button>
                ) : (
                  <button type="button" className="link" onClick={() => setActive(true)} disabled={busy}>
                    Show in pick lists again
                  </button>
                )}
                {inUse ? (
                  <p className="muted small">
                    Transactions or bills use it, so it can’t be deleted. Hide it to keep it out of the way.
                  </p>
                ) : (
                  <button type="button" className="link danger-text" onClick={() => setConfirmDelete(true)}>
                    Delete category
                  </button>
                )}
              </>
            )}
          </>
        )}
      </form>
    </div>
  )
}

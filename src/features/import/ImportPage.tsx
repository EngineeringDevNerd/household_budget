import { useEffect, useMemo, useState, type ChangeEvent } from 'react'
import { Link } from 'react-router'
import { TopBar } from '../../components/TopBar'
import { formatMonthDay } from '../../lib/dates'
import { formatCents } from '../../lib/money'
import { supabase } from '../../lib/supabase'
import { parseCsv } from './csv'
import { detectFormat, guessFormat, parseRows, type Detected, type Mapping } from './formats'
import { buildPreview, groupKey, groupLabel, suggestAccount, type PreviewRow } from './preview'
import { useImportData, type Batch, type ImportData } from './useImportData'
import { MatchReview } from '../matching/MatchReview'
import { useMatches } from '../matching/useMatches'

type Loaded = { fileName: string; rows: string[][]; detected: Detected }

// Import a bank CSV: pick the file, check the preview, confirm. Nothing is
// saved until "Import". The file itself never leaves your device; only the
// rows you confirm are sent.
export function ImportPage() {
  const { data, error, reload } = useImportData()
  const matches = useMatches()
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const [fileError, setFileError] = useState<string | null>(null)
  const [result, setResult] = useState<string | null>(null)
  const header = <TopBar title="Import" />

  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = '' // so picking the same file again still fires
    if (!file) return
    setResult(null)
    const rows = parseCsv(await file.text())
    const detected = detectFormat(rows) ?? guessFormat(rows)
    if (!detected) {
      setLoaded(null)
      return setFileError('That file doesn’t look like a CSV with transactions in it.')
    }
    setFileError(null)
    setLoaded({ fileName: file.name, rows, detected })
  }

  if (error) {
    return (
      <main className="page wide">
        {header}
        <p className="error">Couldn’t load: {error}</p>
        <button onClick={reload}>Try again</button>
      </main>
    )
  }
  if (!data) {
    return (
      <main className="page wide">
        {header}
        <p className="muted">Loading…</p>
      </main>
    )
  }

  return (
    <main className="page wide">
      {header}
      <p className="small">
        Download a CSV from your bank’s website, then pick it here. You’ll see every row before anything is saved, and
        rows you’ve already imported are skipped automatically.
      </p>

      <label className="file-pick">
        <input type="file" accept=".csv,text/csv" onChange={onFile} />
        <span className="button-like">{loaded ? 'Choose a different file' : 'Choose a CSV file'}</span>
      </label>
      {fileError && <p className="error">{fileError}</p>}
      {result && (
        <p className="ok" role="status">
          {result} <Link to="/transactions">See transactions</Link>
        </p>
      )}

      {loaded && (
        <Preview
          key={loaded.fileName + loaded.rows.length}
          loaded={loaded}
          data={data}
          onCancel={() => setLoaded(null)}
          onImported={(msg) => {
            setLoaded(null)
            setResult(msg)
            reload()
            matches.reload()
          }}
        />
      )}

      {matches.error && <p className="error">Couldn’t check for matches: {matches.error}</p>}
      {matches.suggestions && !loaded && (
        <MatchReview suggestions={matches.suggestions} accounts={matches.accounts} onChanged={matches.reload} />
      )}

      <RecentImports
        batches={data.batches}
        onUndone={() => {
          reload()
          matches.reload()
        }}
      />
    </main>
  )
}

function Preview({
  loaded,
  data,
  onCancel,
  onImported,
}: {
  loaded: Loaded
  data: ImportData
  onCancel: () => void
  onImported: (message: string) => void
}) {
  const [detected, setDetected] = useState(loaded.detected)
  const parsed = useMemo(() => parseRows(loaded.rows, detected), [loaded.rows, detected])
  const groups = useMemo(() => [...new Set(parsed.rows.map((r) => groupKey(r, detected)))], [parsed, detected])
  const [groupAccounts, setGroupAccounts] = useState<Record<string, string>>(() =>
    Object.fromEntries(groups.map((g) => [g, suggestAccount(g, detected, data.accounts)])),
  )
  const [rows, setRows] = useState<PreviewRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const allAssigned = groups.every((g) => groupAccounts[g])
  const activeAccounts = data.accounts.filter((a) => a.is_active)

  useEffect(() => {
    if (!allAssigned || parsed.rows.length === 0) return
    let cancelled = false
    buildPreview(parsed.rows, detected, groupAccounts, data.accounts, data.categories)
      .then((r) => !cancelled && setRows(r))
      .catch((e: unknown) => !cancelled && setError(e instanceof Error ? e.message : String(e)))
    return () => {
      cancelled = true
    }
  }, [parsed, detected, groupAccounts, allAssigned, data.accounts, data.categories])

  const visibleRows = allAssigned ? rows : null
  const included = (visibleRows ?? []).filter((r) => r.include)
  const out = included.filter((r) => r.amountCents < 0).reduce((s, r) => s + r.amountCents, 0)
  const inn = included.filter((r) => r.amountCents > 0).reduce((s, r) => s + r.amountCents, 0)
  const fileOut = parsed.rows.filter((r) => r.amountCents < 0).reduce((s, r) => s + r.amountCents, 0)
  const fileIn = parsed.rows.filter((r) => r.amountCents > 0).reduce((s, r) => s + r.amountCents, 0)
  const counts = (visibleRows ?? []).reduce<Record<string, number>>((c, r) => ({ ...c, [r.status]: (c[r.status] ?? 0) + 1 }), {})

  function update(i: number, patch: Partial<PreviewRow>) {
    setRows((rs) => rs && rs.map((r, k) => (k === i ? { ...r, ...patch } : r)))
  }

  async function confirm() {
    if (!supabase || included.length === 0) return
    setBusy(true)
    setError(null)
    try {
      // Remember new card numbers so the next file from this card picks its account by itself.
      for (const g of groups.filter((k) => k.startsWith('card:'))) {
        const account = data.accounts.find((a) => a.id === groupAccounts[g])
        const card = g.slice(5)
        if (account && !account.card_numbers.includes(card)) {
          const { error: cardError } = await supabase
            .from('accounts')
            .update({ card_numbers: [...account.card_numbers, card] })
            .eq('id', account.id)
          if (cardError) throw cardError
        }
      }
      const bank = parsed.bankTotals
      const { data: res, error: rpcError } = await supabase.rpc('import_transactions', {
        p_file_name: loaded.fileName,
        p_format: detected.format,
        p_statement_total_cents: bank ? bank.inCents - bank.outCents : null,
        p_rows: included.map((r) => ({
          txn_date: r.date,
          amount_cents: r.amountCents,
          account_id: r.accountId,
          payee: r.payee,
          original_description: r.description,
          bank_category: r.bankCategory,
          category_id: r.categoryId,
          import_hash: r.hash,
        })),
      })
      if (rpcError) throw rpcError
      const { inserted, skipped } = res as { inserted: number; skipped: number }
      onImported(
        `Imported ${inserted} transaction${inserted === 1 ? '' : 's'}` +
          (skipped ? ` (${skipped} were already there).` : '.'),
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="section import-preview">
      <h2>
        <span className="section-title">
          <span>{loaded.fileName}</span>
          <span className="muted">{detected.label} layout</span>
        </span>
      </h2>

      {detected.format === 'custom' && (
        <ColumnPicker detected={detected} onChange={(mapping) => setDetected({ ...detected, mapping })} />
      )}

      <div className="assign">
        {groups.map((g) => (
          <label key={g}>
            {groupLabel(g)} goes to
            <select
              value={groupAccounts[g] ?? ''}
              onChange={(e) => {
                setRows(null)
                setGroupAccounts({ ...groupAccounts, [g]: e.target.value })
              }}
            >
              <option value="">Pick an account…</option>
              {activeAccounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </label>
        ))}
      </div>

      {parsed.bankTotals && (
        <p className={parsed.bankTotals.inCents === fileIn && parsed.bankTotals.outCents === -fileOut ? 'ok small' : 'error small'}>
          {parsed.bankTotals.inCents === fileIn && parsed.bankTotals.outCents === -fileOut
            ? `✓ Matches the bank’s totals line: ${formatCents(fileIn)} in, ${formatCents(fileOut)} out.`
            : `The rows don’t add up to the bank’s totals line (${formatCents(parsed.bankTotals.inCents)} in, ${formatCents(-parsed.bankTotals.outCents)} out; rows give ${formatCents(fileIn)} in, ${formatCents(fileOut)} out). Some rows may not have been read.`}
        </p>
      )}
      {parsed.skipped.filter((s) => !s.reason.includes('totals')).length > 0 && (
        <details className="small">
          <summary>
            {parsed.skipped.filter((s) => !s.reason.includes('totals')).length} line(s) couldn’t be read and will be left
            out
          </summary>
          <ul>
            {parsed.skipped.map((s) => (
              <li key={s.line}>
                Line {s.line}: {s.reason} — <span className="muted">{s.text.slice(0, 80)}</span>
              </li>
            ))}
          </ul>
        </details>
      )}

      {parsed.rows.length === 0 && <p className="warn small">No transactions found in this file.</p>}
      {parsed.rows.length > 0 && !allAssigned && <p className="warn small">Pick an account above to see the preview.</p>}
      {allAssigned && !visibleRows && !error && <p className="muted">Checking for duplicates…</p>}

      {visibleRows && (
        <>
          <p className="small">
            {visibleRows.length} rows. {counts.duplicate ? `${counts.duplicate} already imported. ` : ''}
            {counts.possible ? `${counts.possible} look like something already in the app; you’ll confirm those after importing. ` : ''}
            {counts.before_start ? `${counts.before_start} before the start date (unticked).` : ''}
          </p>
          <div className="table-wrap">
            <table className="preview-table">
              <thead>
                <tr>
                  <th aria-label="Import" />
                  <th>Date</th>
                  <th>Payee</th>
                  <th>Category</th>
                  <th className="num">Amount</th>
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((r, i) => (
                  <tr key={r.hash} className={r.include ? '' : 'excluded'}>
                    <td>
                      <input
                        type="checkbox"
                        checked={r.include}
                        disabled={r.status === 'duplicate'}
                        onChange={(e) => update(i, { include: e.target.checked })}
                        aria-label={`Import ${r.payee}`}
                      />
                    </td>
                    <td className="nowrap">{formatMonthDay(r.date)}</td>
                    <td>
                      <div className="payee">{r.payee}</div>
                      <div className="muted small" title={r.description}>
                        {r.note ?? (groups.length > 1 ? data.accounts.find((a) => a.id === r.accountId)?.name : r.description)}
                      </div>
                    </td>
                    <td>
                      <select
                        value={r.categoryId ?? ''}
                        onChange={(e) => update(i, { categoryId: e.target.value || null })}
                        aria-label={`Category for ${r.payee}`}
                      >
                        {data.categories.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className={r.amountCents > 0 ? 'num ok' : 'num'}>
                      {r.amountCents > 0 ? '+' : ''}
                      {formatCents(r.amountCents)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="check-totals">
            <span>
              {included.length} to import · out {formatCents(out)} · in {formatCents(inn)}
            </span>
          </div>
        </>
      )}

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="row-buttons">
        <button type="button" className="secondary" onClick={onCancel}>
          Cancel
        </button>
        <button type="button" onClick={confirm} disabled={busy || included.length === 0}>
          {busy ? 'Importing…' : `Import ${included.length} row${included.length === 1 ? '' : 's'}`}
        </button>
      </div>
    </section>
  )
}

// For a layout we don't recognize: say which column is which.
function ColumnPicker({ detected, onChange }: { detected: Detected; onChange: (m: Mapping) => void }) {
  const m = detected.mapping
  const split = m.amount === undefined
  const pick = (label: string, value: number | undefined, set: (i: number) => Mapping) => (
    <label>
      {label}
      <select value={value ?? ''} onChange={(e) => onChange(set(Number(e.target.value)))}>
        {detected.headers.map((h, i) => (
          <option key={i} value={i}>
            {h || `Column ${i + 1}`}
          </option>
        ))}
      </select>
    </label>
  )
  return (
    <div className="assign">
      <p className="warn small">I don’t know this bank’s layout. Check which column is which:</p>
      {pick('Date', m.date, (i) => ({ ...m, date: i }))}
      {pick('Description', m.description, (i) => ({ ...m, description: i }))}
      <label>
        Amounts are in
        <select
          value={split ? 'split' : 'one'}
          onChange={(e) =>
            onChange(
              e.target.value === 'split'
                ? { ...m, amount: undefined, debit: m.debit ?? 0, credit: m.credit ?? 0 }
                : { ...m, amount: m.amount ?? 0, debit: undefined, credit: undefined },
            )
          }
        >
          <option value="one">One column (negative = money out)</option>
          <option value="split">Two columns (money out, money in)</option>
        </select>
      </label>
      {split
        ? [pick('Money out', m.debit, (i) => ({ ...m, debit: i })), pick('Money in', m.credit, (i) => ({ ...m, credit: i }))]
        : pick('Amount', m.amount, (i) => ({ ...m, amount: i }))}
    </div>
  )
}

function RecentImports({ batches, onUndone }: { batches: Batch[]; onUndone: () => void }) {
  const [confirming, setConfirming] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function undo(b: Batch) {
    if (!supabase) return
    const { error: rpcError } = await supabase.rpc('undo_import', { p_batch_id: b.id })
    if (rpcError) return setError(rpcError.message)
    setConfirming(null)
    onUndone()
  }

  if (batches.length === 0) return null
  return (
    <section className="section recent-imports">
      <h2>Recent imports</h2>
      <ul className="bills">
        {batches.map((b) => (
          <li key={b.id} className="bill">
            <div className="bill-main">
              <span className="bill-name">{b.file_name}</span>
              <span className="muted small">
                {new Date(b.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}{' '}
                · {b.inserted_count} added
                {b.row_count > b.inserted_count ? `, ${b.row_count - b.inserted_count} already there` : ''}
              </span>
            </div>
            {confirming === b.id ? (
              <span className="row-buttons compact">
                <button className="secondary" onClick={() => setConfirming(null)}>
                  Keep
                </button>
                <button className="danger" onClick={() => undo(b)}>
                  Undo
                </button>
              </span>
            ) : (
              <button className="link small" onClick={() => setConfirming(b.id)}>
                Undo…
              </button>
            )}
          </li>
        ))}
      </ul>
      {confirming && <p className="warn small">Undo deletes every transaction that import added.</p>}
      {error && <p className="error">{error}</p>}
    </section>
  )
}

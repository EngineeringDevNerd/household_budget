// Turns the rows of a bank CSV into transactions, for the layouts we know:
//
//   Capital One  Transaction Date, Posted Date, Card No., Description,
//                Category, Debit, Credit   (amounts are always positive)
//   Arvest       a line with the account name first, then
//                Date, Account, Description, Check #, Category, Credit, Debit
//                (Debit already has a minus sign), and a "Totals:" line last
//   Standard     date, description, amount[, account]   (signed amounts;
//                the layout Claude uses when converting a PDF statement)
//
// Anything else gets a best guess at the columns, which the person can fix.

export type FormatId = 'capital_one' | 'arvest' | 'standard' | 'custom'

export type Mapping = {
  date: number
  description: number
  /** One signed amount column (negative = money out)… */
  amount?: number
  /** …or separate money-out / money-in columns. The sign comes from the column, not the number. */
  debit?: number
  credit?: number
  category?: number
  card?: number
  account?: number
}

export type Detected = {
  format: FormatId
  label: string
  headerIndex: number
  headers: string[]
  mapping: Mapping
}

export type ParsedRow = {
  line: number // 1-based line in the file, for error messages
  date: string // YYYY-MM-DD
  description: string
  amountCents: number // signed: negative = money out
  bankCategory: string | null
  card: string | null // last 4 digits, Capital One only
  accountName: string | null // standard layout only
}

export type SkippedRow = { line: number; reason: string; text: string }

const norm = (s: string) => s.trim().toLowerCase()

export function detectFormat(rows: string[][]): Detected | null {
  // The header is in the first few lines (Arvest puts the account name first).
  for (let i = 0; i < Math.min(rows.length, 5); i++) {
    const h = rows[i].map(norm)
    const col = (name: string) => h.indexOf(name)
    const has = (...names: string[]) => names.every((n) => h.includes(n))

    if (has('transaction date', 'description', 'debit', 'credit')) {
      return {
        format: 'capital_one',
        label: 'Capital One',
        headerIndex: i,
        headers: rows[i],
        mapping: {
          date: col('transaction date'),
          description: col('description'),
          debit: col('debit'),
          credit: col('credit'),
          category: col('category') >= 0 ? col('category') : undefined,
          card: col('card no.') >= 0 ? col('card no.') : undefined,
        },
      }
    }
    if (has('date', 'description', 'credit', 'debit', 'check #')) {
      return {
        format: 'arvest',
        label: 'Arvest',
        headerIndex: i,
        headers: rows[i],
        mapping: {
          date: col('date'),
          description: col('description'),
          debit: col('debit'),
          credit: col('credit'),
          category: col('category') >= 0 ? col('category') : undefined,
        },
      }
    }
    if (has('date', 'description', 'amount')) {
      return {
        format: 'standard',
        label: 'Standard',
        headerIndex: i,
        headers: rows[i],
        mapping: {
          date: col('date'),
          description: col('description'),
          amount: col('amount'),
          account: col('account') >= 0 ? col('account') : undefined,
        },
      }
    }
  }
  return null
}

/** Best guess for a layout we don't know. Returns null if it can't find a header row. */
export function guessFormat(rows: string[][]): Detected | null {
  const headerIndex = rows.findIndex((r) => r.filter((c) => c.trim()).length >= 3)
  if (headerIndex < 0) return null
  const h = rows[headerIndex].map(norm)
  const find = (...words: string[]) => {
    const i = h.findIndex((c) => words.some((w) => c.includes(w)))
    return i >= 0 ? i : undefined
  }
  const debit = find('debit', 'withdrawal')
  const credit = find('credit', 'deposit')
  return {
    format: 'custom',
    label: 'Other',
    headerIndex,
    headers: rows[headerIndex],
    mapping: {
      date: find('date') ?? 0,
      description: find('description', 'payee', 'memo', 'name') ?? 1,
      amount: debit === undefined || credit === undefined ? (find('amount') ?? 2) : undefined,
      debit: debit !== undefined && credit !== undefined ? debit : undefined,
      credit: debit !== undefined && credit !== undefined ? credit : undefined,
      category: find('category'),
    },
  }
}

/** Money in / money out from the bank's own totals line, when the file has one (Arvest does). */
export type BankTotals = { inCents: number; outCents: number }

export function parseRows(
  rows: string[][],
  d: Detected,
): { rows: ParsedRow[]; skipped: SkippedRow[]; bankTotals: BankTotals | null } {
  const out: ParsedRow[] = []
  const skipped: SkippedRow[] = []
  let bankTotals: BankTotals | null = null
  const m = d.mapping
  const cell = (r: string[], i: number | undefined) => (i === undefined ? '' : (r[i] ?? '').trim())

  rows.slice(d.headerIndex + 1).forEach((r, k) => {
    const line = d.headerIndex + k + 2
    const text = r.join(', ')
    const date = parseDate(cell(r, m.date))
    if (!date) {
      if (/\btotals?\b/i.test(text) && m.debit !== undefined && m.credit !== undefined) {
        bankTotals = {
          inCents: Math.abs(parseAmountCents(cell(r, m.credit)) ?? 0),
          outCents: Math.abs(parseAmountCents(cell(r, m.debit)) ?? 0),
        }
        return skipped.push({ line, reason: 'The bank’s totals line', text })
      }
      return skipped.push({ line, reason: 'No valid date', text })
    }

    let cents: number | null
    if (m.amount !== undefined) {
      cents = parseAmountCents(cell(r, m.amount))
    } else {
      const moneyOut = parseAmountCents(cell(r, m.debit))
      const moneyIn = parseAmountCents(cell(r, m.credit))
      cents = moneyOut ? -Math.abs(moneyOut) : moneyIn ? Math.abs(moneyIn) : null
    }
    if (!cents) return skipped.push({ line, reason: 'No amount', text })

    out.push({
      line,
      date,
      description: cell(r, m.description).replace(/\s+/g, ' '),
      amountCents: cents,
      bankCategory: cell(r, m.category) || null,
      card: cell(r, m.card) || null,
      accountName: cell(r, m.account) || null,
    })
  })
  return { rows: out, skipped, bankTotals }
}

/** "2026-11-24", "11/24/2026" or "11/24/26" -> "2026-11-24". Null if it isn't a real date. */
export function parseDate(s: string): string | null {
  let y: number, mo: number, d: number
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s)
  if (m) [y, mo, d] = [+m[1], +m[2], +m[3]]
  else if ((m = /^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/.exec(s))) {
    ;[mo, d, y] = [+m[1], +m[2], +m[3]]
    if (y < 100) y += 2000
  } else return null
  const dt = new Date(Date.UTC(y, mo - 1, d))
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

/** "-63.75", "$1,234.50", "(12.00)" or "50.00 -" -> signed cents. Null if blank or not a number. */
export function parseAmountCents(s: string): number | null {
  let t = s.replace(/[$,\s]/g, '')
  if (!t) return null
  let negative = false
  if (/^\(.*\)$/.test(t)) {
    negative = true
    t = t.slice(1, -1)
  }
  if (t.endsWith('-')) {
    negative = true
    t = t.slice(0, -1)
  }
  if (t.startsWith('-')) {
    negative = !negative
    t = t.slice(1)
  } else if (t.startsWith('+')) t = t.slice(1)
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return null
  const [whole, frac = ''] = t.split('.')
  const cents = Number(whole) * 100 + Number(frac.padEnd(2, '0'))
  return negative ? -cents : cents
}

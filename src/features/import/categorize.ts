// First guesses for imported rows: a tidier payee name and a category.
// Everything here is a suggestion; you can change any row afterwards.
// Proper "this payee always goes to that category" rules come later.

/** "WALMART.COM 8009256278 DDA PIN POS PUR CD7837 BENTONVILLE #000000109939" -> "Walmart.com" */
export function cleanPayee(description: string): string {
  let s = description
    .replace(/\s+DDA\s.*$/i, '') // Arvest: everything after "DDA" is card/terminal detail
    .replace(/#?\d{6,}/g, '') // long reference / phone numbers
    .replace(/\s+/g, ' ')
    .trim()
  if (!s) s = description.trim()
  const letters = s.replace(/[^A-Za-z]/g, '')
  const mostlyCaps = letters.length > 0 && letters.replace(/[^A-Z]/g, '').length / letters.length > 0.7
  if (!mostlyCaps) return s
  return s.toLowerCase().replace(/(^|[\s*])([a-z])/g, (_, before: string, ch: string) => before + ch.toUpperCase())
}

// Payments to a credit card, seen from either side. Checked first, because
// banks label these inconsistently (Arvest calls a Merrick payment "Dining").
const CARD_PAYMENT_OUT = [
  /CAPITAL ONE\s+(CRCARDPMT|MOBILE PMT|ONLINE PMT)/i,
  /CREDIT ONE BANK\s+PAYMENT/i,
  /MERRICK BANK\s+MOBILE PAY/i,
  /\bCRCARDPMT\b/i,
]
const CARD_PAYMENT_IN = [/\bPYMT\b/i, /^PAYMENT\b/i, /MOBILE PAYMENT/i, /AUTOPAY/i]

const FEES = [/NSF\/OD/i, /OVERDRAFT/i, /SERVICE CHG/i, /INTEREST CHARGE/i, /LATE FEE/i, /ANN(UAL)? FEE/i]

// Bank label -> our category. Labels not listed stay Uncategorized.
const BANK_CATEGORIES: Record<string, string> = {
  // Capital One
  utilities: 'Utilities',
  'phone/cable': 'Utilities',
  insurance: 'Insurance',
  merchandise: 'Shopping',
  dining: 'Dining',
  'gas/automotive': 'Gas',
  grocery: 'Groceries',
  entertainment: 'Entertainment',
  'fee/interest charge': 'Interest & Fees',
  // Arvest
  'food/dining out': 'Dining',
  food: 'Dining',
  shopping: 'Shopping',
  clothing: 'Shopping',
  income: 'Income',
  'financial services/fees': 'Interest & Fees',
}

/** The name of the category to suggest for one imported row. */
export function guessCategory(row: {
  description: string
  amountCents: number
  bankCategory: string | null
  accountType: string
}): string {
  const d = row.description
  const out = row.amountCents < 0
  if (out && CARD_PAYMENT_OUT.some((re) => re.test(d))) return 'Credit Card Payment'
  if (!out && row.accountType === 'credit' && CARD_PAYMENT_IN.some((re) => re.test(d))) return 'Credit Card Payment'
  if (out && FEES.some((re) => re.test(d))) return 'Interest & Fees'
  if (!out && /PAYROLL/i.test(d)) return 'Income'
  const fromBank = BANK_CATEGORIES[(row.bankCategory ?? '').trim().toLowerCase()]
  // A bank label for spending shouldn't land a refund or deposit in a spending
  // category, and vice versa.
  if (fromBank === 'Income') return out ? 'Uncategorized' : 'Income'
  if (fromBank && out) return fromBank
  return 'Uncategorized'
}

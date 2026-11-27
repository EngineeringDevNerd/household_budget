// Money is stored as integer cents everywhere. These are the only two
// places that convert to and from dollars.

const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })

export function formatCents(cents: number): string {
  return usd.format(cents / 100)
}

/** "1,234.5" or "$12" -> cents. Returns null if it isn't a valid amount. */
export function parseDollarsToCents(input: string): number | null {
  const cleaned = input.replace(/[$,\s]/g, '')
  if (!/^\d+(\.\d{0,2})?$/.test(cleaned)) return null
  const [whole, frac = ''] = cleaned.split('.')
  return Number(whole) * 100 + Number(frac.padEnd(2, '0'))
}

export function centsToInput(cents: number): string {
  return (cents / 100).toFixed(2)
}

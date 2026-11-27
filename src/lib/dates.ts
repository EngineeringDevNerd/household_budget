// Calendar dates are plain 'YYYY-MM-DD' strings, matching Postgres `date`.
// "Today" is the phone's local date (you're both on Central time).

const pad = (n: number) => String(n).padStart(2, '0')

function toISO(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function fromISO(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function todayISO(): string {
  return toISO(new Date())
}

export function addDays(iso: string, days: number): string {
  const d = fromISO(iso)
  d.setDate(d.getDate() + days)
  return toISO(d)
}

export function monthStart(iso: string): string {
  return `${iso.slice(0, 7)}-01`
}

export function addMonths(iso: string, months: number): string {
  const d = fromISO(monthStart(iso))
  d.setMonth(d.getMonth() + months)
  return toISO(d)
}

export function monthEnd(iso: string): string {
  return addDays(addMonths(iso, 1), -1)
}

export function daysBetween(fromIso: string, toIso: string): number {
  return Math.round((fromISO(toIso).getTime() - fromISO(fromIso).getTime()) / 86_400_000)
}

export function formatShortDate(iso: string): string {
  return fromISO(iso).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

export function formatMonth(iso: string): string {
  return fromISO(iso).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
}

export function formatMonthDay(iso: string): string {
  return fromISO(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

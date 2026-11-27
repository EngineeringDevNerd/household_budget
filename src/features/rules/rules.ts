import type { Tables } from '../../types/database'

export type Rule = Pick<Tables<'payee_rules'>, 'id' | 'match_text' | 'payee_name' | 'category_id' | 'recurring_bill_id'>

/** The rule for a bank description: the longest rule text it contains, ignoring case. */
export function findRule<R extends Pick<Rule, 'match_text'>>(description: string, rules: R[]): R | undefined {
  const d = description.toLowerCase()
  let best: R | undefined
  for (const r of rules) {
    const t = r.match_text.trim().toLowerCase()
    if (t && d.includes(t) && (!best || t.length > best.match_text.trim().length)) best = r
  }
  return best
}

/**
 * A starting point for a rule's text, from a bank description: the
 * merchant part, without Arvest's card/terminal detail or long reference
 * numbers. "WALMART.COM 8009256278 DDA PIN POS PUR CD7837 …" -> "WALMART.COM".
 */
export function ruleTextFrom(description: string): string {
  return description
    .replace(/\s+DDA\s.*$/i, '')
    .replace(/#?\d{6,}/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 40)
    .trim()
}

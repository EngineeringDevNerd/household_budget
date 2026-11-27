// The duplicate check. Each imported row gets a fingerprint from its
// account, date, amount and description. Two identical rows in the same
// file (two $5.00 Sonic runs on the same day) are told apart by counting
// them: the 1st and 2nd get different fingerprints. Importing the same file
// again produces the same fingerprints, which the database skips.

export type Fingerprintable = { accountId: string; date: string; amountCents: number; description: string }

export async function fingerprints(rows: Fingerprintable[]): Promise<string[]> {
  const seen = new Map<string, number>()
  return Promise.all(
    rows.map((r) => {
      const key = [r.accountId, r.date, r.amountCents, r.description.replace(/\s+/g, ' ').trim().toUpperCase()].join('|')
      const n = (seen.get(key) ?? 0) + 1
      seen.set(key, n)
      return sha256(`${key}|${n}`)
    }),
  )
}

async function sha256(text: string): Promise<string> {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

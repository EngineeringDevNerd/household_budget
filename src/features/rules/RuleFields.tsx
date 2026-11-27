import type { BillOption, CategoryOption } from './saveRule'

/** The rule's own fields. Used here and by "Always do this" on a transaction. */
export function RuleFieldsInputs(p: {
  text: string
  setText: (v: string) => void
  payee?: string
  setPayee?: (v: string) => void
  categoryId?: string
  setCategoryId?: (v: string) => void
  billId: string
  setBillId: (v: string) => void
  bills: BillOption[]
  categories?: CategoryOption[]
}) {
  return (
    <>
      <label>
        When the bank description contains
        <input value={p.text} onChange={(e) => p.setText(e.target.value)} placeholder="e.g. PSO BILLMATRIX" required />
      </label>
      {p.setPayee && (
        <label>
          Call it
          <input value={p.payee} onChange={(e) => p.setPayee!(e.target.value)} placeholder="Payee name (optional)" />
        </label>
      )}
      {p.setCategoryId && p.categories && (
        <label>
          Category
          <select value={p.categoryId} onChange={(e) => p.setCategoryId!(e.target.value)}>
            <option value="">Don’t change</option>
            {p.categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
      )}
      <label>
        It pays this bill
        <select value={p.billId} onChange={(e) => p.setBillId(e.target.value)}>
          <option value="">No bill</option>
          {p.bills.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
      </label>
    </>
  )
}

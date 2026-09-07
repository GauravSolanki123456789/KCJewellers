import type { ErpBillLine } from '@/components/reseller/erp/erp-ui'

export type BillTableColDef = { key: string; edit?: boolean }

/** Tab/Enter order through editable billing grid cells. */
export function nextBillTableField(
  cols: BillTableColDef[],
  current: string,
  line: ErpBillLine,
): string | null {
  const editable = cols.filter((c) => c.edit && c.key !== 'amount').map((c) => c.key)
  let order: string[]
  if (line.manualEntry) {
    const manualLead = ['sku', 'style_code']
    order = [...manualLead, ...editable.filter((k) => !manualLead.includes(k))]
  } else {
    order = editable
  }
  const seen = new Set<string>()
  order = order.filter((k) => {
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })
  const idx = order.indexOf(current)
  if (idx < 0 || idx >= order.length - 1) return null
  return order[idx + 1] ?? null
}

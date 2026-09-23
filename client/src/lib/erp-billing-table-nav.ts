import type { ErpBillLine } from '@/components/reseller/erp/erp-ui'
import { nextManualEntryField, nextStackedManualEntryField } from '@/lib/erp-billing-shortcuts'
import type { ManualBillGridField } from '@/lib/erp-metal-slab-field'

export type BillTableColDef = { key: string; edit?: boolean }

/** Tab/Enter order through editable billing grid cells. */
export function nextBillTableField(
  cols: BillTableColDef[],
  current: string,
  line: ErpBillLine,
): string | null {
  if (line.manualEntry) {
    if (line.manualEntryOpen) {
      return nextStackedManualEntryField(current as ManualBillGridField, line)
    }
    return nextManualEntryField(current as ManualBillGridField, line)
  }
  const editable = cols.filter((c) => c.edit && c.key !== 'amount').map((c) => c.key)
  const seen = new Set<string>()
  const order = editable.filter((k) => {
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })
  const idx = order.indexOf(current)
  if (idx < 0 || idx >= order.length - 1) return null
  return order[idx + 1] ?? null
}

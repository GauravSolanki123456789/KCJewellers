import type { ErpBillLine } from '@/components/reseller/erp/erp-ui'
import {
  GIFT_ENTRY_FIELD_ORDER,
  isGiftManualLine,
  MANUAL_ENTRY_FIELD_ORDER,
} from '@/lib/erp-billing-shortcuts'
import { isManualGridFieldVisible, nextVisibleManualEntryField, type ManualBillGridField } from '@/lib/erp-metal-slab-field'

export type BillTableColDef = { key: string; edit?: boolean }

/** Tab/Enter order through editable billing grid cells. */
export function nextBillTableField(
  cols: BillTableColDef[],
  current: string,
  line: ErpBillLine,
): string | null {
  if (line.manualEntry) {
    const manualOrder = (
      isGiftManualLine(line) ? GIFT_ENTRY_FIELD_ORDER : MANUAL_ENTRY_FIELD_ORDER
    ) as ManualBillGridField[]
    const asManual = current as ManualBillGridField
    if (manualOrder.includes(asManual)) {
      const next = nextVisibleManualEntryField(asManual, line, manualOrder)
      if (next) return next
    }
    const tableOrder = cols
      .filter((c) => c.edit && c.key !== 'amount')
      .map((c) => c.key as ManualBillGridField)
    const idx = tableOrder.indexOf(asManual)
    if (idx >= 0) {
      for (let i = idx + 1; i < tableOrder.length; i += 1) {
        const key = tableOrder[i]!
        if (isManualGridFieldVisible(key, line)) return key
      }
    }
    return null
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

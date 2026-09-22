import type { ErpBillLine } from '@/components/reseller/erp/erp-ui'
import type { ErpRateSlab } from '@/lib/erp-billing-pricing'

export type ManualBillGridField = keyof ErpBillLine | 'metal_slab_pct'

export function metalSlabPctStorageKey(slab: ErpRateSlab): keyof ErpBillLine {
  if (slab === 'W') return 'metal_slab_w_pct'
  if (slab === 'F') return 'metal_slab_f_pct'
  return 'metal_slab_r_pct'
}

export function readMetalSlabPct(line: ErpBillLine, slab: ErpRateSlab): number | '' {
  const key = metalSlabPctStorageKey(slab)
  const raw = line[key]
  if (raw == null || raw === '') return ''
  const n = Number(raw)
  return Number.isFinite(n) ? n : ''
}

export function patchMetalSlabPct(
  slab: ErpRateSlab,
  value: number | null,
): Partial<ErpBillLine> {
  const key = metalSlabPctStorageKey(slab)
  return { [key]: value } as Partial<ErpBillLine>
}

/** Skip box/finish cells hidden in stacked manual row (same rules as ErpBillingStackedRow). */
export function isManualGridFieldVisible(field: ManualBillGridField, line: ErpBillLine): boolean {
  if (field === 'box_charges') return (line.designBoxOptions?.length ?? 0) >= 2
  if (field === 'stone_charges') return (line.designFinishOptions?.length ?? 0) >= 2
  return true
}

export function nextVisibleManualEntryField(
  current: ManualBillGridField,
  line: ErpBillLine,
  order: ManualBillGridField[],
): ManualBillGridField | null {
  const idx = order.indexOf(current)
  if (idx < 0) return null
  for (let i = idx + 1; i < order.length; i += 1) {
    const key = order[i]!
    if (isManualGridFieldVisible(key, line)) return key
  }
  return null
}

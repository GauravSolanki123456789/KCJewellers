import type { ErpBillLine } from '@/components/reseller/erp/erp-ui'
import type { ErpRateSlab } from '@/lib/erp-billing-pricing'

export function billingShowsMcSlabRColumn(slab: ErpRateSlab): boolean {
  return slab === 'R'
}
import { lineHasFinishPicker } from '@/lib/erp-catalog-product'

export type ManualBillGridField = keyof ErpBillLine | 'metal_slab_pct'

export function metalSlabPctStorageKey(slab: ErpRateSlab): keyof ErpBillLine {
  if (slab === 'W') return 'metal_slab_w_pct'
  if (slab === 'F') return 'metal_slab_f_pct'
  return 'metal_slab_r_pct'
}

/** DB/catalog may store 1 = 100% or 0.88 = 88%; UI always uses whole numbers (100, 88). */
export function metalSlabPctUiFromStorage(raw: unknown): number | null {
  if (raw == null || raw === '') return null
  const n = typeof raw === 'number' ? raw : Number(String(raw).replace(/,/g, '').trim())
  if (!Number.isFinite(n)) return null
  if (n > 0 && n <= 1) return Math.round(n * 10000) / 100
  return n
}

export function normalizeMetalSlabPctForUiStorage(value: number | null | undefined): number | null {
  if (value == null || !Number.isFinite(Number(value))) return null
  return metalSlabPctUiFromStorage(value)
}

export function readMetalSlabPct(line: ErpBillLine, slab: ErpRateSlab): number | '' {
  const key = metalSlabPctStorageKey(slab)
  const ui = metalSlabPctUiFromStorage(line[key])
  return ui != null ? ui : ''
}

/** Multiplier for billed weight (88 → 0.88). Empty metal % → 1.0 unless wastage applies elsewhere. */
export function metalSlabPctMultiplier(line: ErpBillLine, slab: ErpRateSlab): number | null {
  const ui = readMetalSlabPct(line, slab)
  if (ui === '' || ui <= 0) return null
  return ui / 100
}

/** PDF / display — show the value the cashier entered (e.g. 89 → 89%). */
export function formatMetalSlabPctForDisplay(line: ErpBillLine, slab: ErpRateSlab): string {
  const key = metalSlabPctStorageKey(slab)
  const raw = line[key]
  if (raw == null || raw === '') return ''
  const s = String(raw).trim()
  if (!s) return ''
  if (s.includes('%')) return s
  const n = Number(s)
  if (!Number.isFinite(n)) return s
  if (n > 0 && n <= 1) return `${Math.round(n * 1000) / 10}%`
  return `${n}%`
}

export function lineHasMetalSlabPctInput(line: ErpBillLine, slab: ErpRateSlab): boolean {
  return formatMetalSlabPctForDisplay(line, slab) !== ''
}

export function patchMetalSlabPct(
  slab: ErpRateSlab,
  value: number | null,
): Partial<ErpBillLine> {
  const key = metalSlabPctStorageKey(slab)
  return { [key]: value } as Partial<ErpBillLine>
}

/** Skip box/finish cells hidden in stacked manual row (same rules as ErpBillingStackedRow). */
export function isManualGridFieldVisible(
  field: ManualBillGridField,
  line: ErpBillLine,
  rateSlab: ErpRateSlab = 'R',
): boolean {
  if (field === 'mc_rate_slab_r' && !billingShowsMcSlabRColumn(rateSlab)) return false
  if (line.manualCategory === 'gift') {
    if (field === 'ratePerGram' || field === 'metal_type') return false
  }
  if (field === 'box_charges') return (line.designBoxOptions?.length ?? 0) >= 2
  if (field === 'stone_charges') return lineHasFinishPicker(line)
  if (field === 'fixed_price_r') {
    return line.manualCategory === 'gift' || !!line.mrpMode
  }
  return true
}

export function nextVisibleManualEntryField(
  current: ManualBillGridField,
  line: ErpBillLine,
  order: ManualBillGridField[],
  rateSlab: ErpRateSlab = 'R',
): ManualBillGridField | null {
  const idx = order.indexOf(current)
  if (idx < 0) return null
  for (let i = idx + 1; i < order.length; i += 1) {
    const key = order[i]!
    if (isManualGridFieldVisible(key, line, rateSlab)) return key
  }
  return null
}

import type { ErpBillLine } from '@/components/reseller/erp/erp-ui'
import { shouldUseWeightSilverNotMrp } from '@/lib/erp-billing-pricing'
import { erpSlabUsesWholesaleMetal, isRetailQuoteSlab, type ErpRateSlab } from '@/lib/erp-billing-pricing'

export function billingShowsMcSlabRColumn(slab: ErpRateSlab): boolean {
  return slab === 'R' || isRetailQuoteSlab(slab)
}
import { lineHasFinishPicker } from '@/lib/erp-catalog-product'

export type ManualBillGridField = keyof ErpBillLine | 'metal_slab_pct'

export function metalSlabPctStorageKey(slab: ErpRateSlab): keyof ErpBillLine {
  if (slab === 'R1') return 'metal_slab_r1_pct'
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

/**
 * Net weight (g) for ERP lines — not pure/billable metal weight.
 * When only billable weight is stored, recover net using metal slab %.
 */
export function erpLineNetWeightGm(line: ErpBillLine, slab: ErpRateSlab = 'R'): number {
  const og = Number(line.originalWeightGm)
  const wg = Number(line.weightGm ?? 0)
  const hasOg = Number.isFinite(og) && og > 0
  const hasWg = Number.isFinite(wg) && wg > 0
  const mult = metalSlabPctMultiplier(line, slab)
  if (mult != null && mult > 0 && mult < 1) {
    if (hasOg && hasWg) {
      const billFromOg = Math.round(og * mult * 1000) / 1000
      if (Math.abs(billFromOg - wg) <= 0.05 || og >= wg * 0.99) return og
      return Math.round((wg / mult) * 1000) / 1000
    }
    if (hasOg) return og
    if (hasWg) return Math.round((wg / mult) * 1000) / 1000
  }
  if (hasOg) return og
  return hasWg ? wg : 0
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
  if (line.manualCategory === 'shipping') {
    return field === 'fixed_price' || field === 'qty' || field === 'name'
  }
  if (line.manualCategory === 'old') {
    const allowed = new Set<ManualBillGridField>([
      'name',
      'weightGm',
      'oldDustStoneGm',
      'gross_weight',
      'oldExchangePct',
      'ratePerGram',
      'invoice_item_name',
    ])
    return allowed.has(field)
  }
  if (field === 'mc_rate_slab_r' && !billingShowsMcSlabRColumn(rateSlab)) return false
  if (field === 'ratePerGram' || field === 'metal_type') {
    if (shouldUseWeightSilverNotMrp(line)) return true
    if (line.manualCategory === 'gift' || line.mrpMode) return false
  }
  if (field === 'box_charges') return (line.designBoxOptions?.length ?? 0) >= 2
  if (field === 'stone_charges') return lineHasFinishPicker(line)
  if (field === 'fixed_price_r') {
    if (erpSlabUsesWholesaleMetal(rateSlab)) return false
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

import type { ErpBillLine } from '@/components/reseller/erp/erp-ui'
import { normalizeMetalSlabPctForUiStorage } from '@/lib/erp-metal-slab-field'

const NUMERIC_LINE_KEYS: (keyof ErpBillLine)[] = [
  'weightGm',
  'originalWeightGm',
  'gross_weight',
  'bag_wt',
  'purity',
  'wastage_pct',
  'ratePerGram',
  'mc_rate',
  'mc_rate_catalog',
  'mc_rate_slab_r',
  'mc_rate_slab_w',
  'mc_rate_slab_f',
  'metal_slab_r_pct',
  'metal_slab_w_pct',
  'metal_slab_f_pct',
  'qty',
  'box_charges',
  'stone_charges',
  'fixed_price',
  'unitInr',
  'mrpListPrice',
  'lineTotalInr',
  'displayMcInr',
  'displayMcBeforeDiscount',
  'displayMcDiscountPct',
  'displayWastagePct',
]

function coerceNum(v: unknown): number | null {
  if (v == null || v === '') return null
  const n = typeof v === 'number' ? v : Number(String(v).replace(/,/g, '').trim())
  return Number.isFinite(n) ? n : null
}

/** Parse saved bill JSON lines before recalc (avoids string math & double-discount drift). */
export function normalizeErpBillLineFromStorage(line: ErpBillLine): ErpBillLine {
  const next: ErpBillLine = { ...line }
  for (const key of NUMERIC_LINE_KEYS) {
    const coerced = coerceNum(line[key])
    if (coerced != null) {
      ;(next as Record<string, unknown>)[key] = coerced
    }
  }
  if (line.rateLocked != null) {
    next.rateLocked = !!line.rateLocked
  }
  if (line.manualEntry != null) next.manualEntry = !!line.manualEntry
  if (line.mrpMode != null) next.mrpMode = !!line.mrpMode
  for (const key of ['metal_slab_r_pct', 'metal_slab_w_pct', 'metal_slab_f_pct'] as const) {
    const ui = normalizeMetalSlabPctForUiStorage(line[key])
    if (ui != null) next[key] = ui
  }
  return next
}

export function normalizeErpBillLinesFromStorage(lines: ErpBillLine[]): ErpBillLine[] {
  return (lines || []).map(normalizeErpBillLineFromStorage)
}

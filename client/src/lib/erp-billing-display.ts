import type { ErpBillLine } from '@/components/reseller/erp/erp-ui'
import type { ErpRateSlab } from '@/lib/erp-billing-pricing'

export function isGoldSlabRLine(line: ErpBillLine, slab: ErpRateSlab): boolean {
  return slab === 'R' && String(line.metal_type || '').toLowerCase().startsWith('gold')
}

/** Grid / PDF display for wastage % — Slab R gold shows 0. */
export function billingWastageDisplay(line: ErpBillLine, slab: ErpRateSlab): string | number {
  if (isGoldSlabRLine(line, slab)) return 0
  if (line.displayWastagePct != null) return line.displayWastagePct
  return line.wastage_pct ?? ''
}

/** Grid / PDF display for MC — Slab R gold shows computed ₹ MC for the piece. */
export function billingMcDisplay(line: ErpBillLine, slab: ErpRateSlab): string | number {
  if (isGoldSlabRLine(line, slab) && line.displayMcInr != null && line.displayMcInr > 0) {
    return line.displayMcInr
  }
  return line.mc_rate ?? ''
}

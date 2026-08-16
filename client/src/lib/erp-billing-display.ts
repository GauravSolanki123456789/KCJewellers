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
    return Math.round(line.displayMcInr)
  }
  return line.mc_rate ?? ''
}

/** Short hint for MC discount (Slab R gold with catalog MC disc %). */
export function billingMcDiscountHint(line: ErpBillLine, slab: ErpRateSlab): string | null {
  if (!isGoldSlabRLine(line, slab)) return null
  if (
    line.displayMcBeforeDiscount != null &&
    line.displayMcDiscountPct != null &&
    line.displayMcInr != null &&
    line.displayMcBeforeDiscount > line.displayMcInr
  ) {
    return `${Math.round(line.displayMcDiscountPct)}% off · was ₹${Math.round(line.displayMcBeforeDiscount).toLocaleString('en-IN')}`
  }
  return null
}

/** PDF-friendly MC cell — shows discounted MC with before/after when applicable. */
export function billingMcPdfText(line: ErpBillLine, slab: ErpRateSlab): string {
  const mc = billingMcDisplay(line, slab)
  if (mc === '' || mc == null) return '—'
  const hint = billingMcDiscountHint(line, slab)
  if (hint) return `${mc} (${hint})`
  return String(mc)
}

/** Sum of catalog MC discounts across lines (before − after). */
export function computeMcDiscountTotal(lines: ErpBillLine[]): number {
  return lines.reduce((sum, line) => {
    if (
      line.displayMcBeforeDiscount != null &&
      line.displayMcInr != null &&
      line.displayMcBeforeDiscount > line.displayMcInr
    ) {
      return sum + Math.round(line.displayMcBeforeDiscount - line.displayMcInr)
    }
    return sum
  }, 0)
}

export type BillingDiscountSummary = {
  mcDiscountInr: number
  cashDiscountInr: number
  totalDiscountInr: number
  collectedAmount: number | null
}

/** MC slab savings + cash/rounding discount from collected amount. */
export function computeBillingDiscountSummary(params: {
  netTotal: number
  collectedAmount: number | null
  lines: ErpBillLine[]
}): BillingDiscountSummary {
  const mcDiscountInr = computeMcDiscountTotal(params.lines)
  const collectedAmount = params.collectedAmount
  const cashDiscountInr =
    collectedAmount != null && params.netTotal > 0
      ? Math.round(params.netTotal - collectedAmount)
      : 0
  const totalDiscountInr =
    collectedAmount != null
      ? mcDiscountInr + cashDiscountInr
      : mcDiscountInr
  return {
    mcDiscountInr,
    cashDiscountInr,
    totalDiscountInr,
    collectedAmount,
  }
}

import type { ErpBillLine } from '@/components/reseller/erp/erp-ui'
import type { ErpRateSlab } from '@/lib/erp-billing-pricing'
import { lineHasPieceSlabFields, pieceSlabMcRate } from '@/lib/erp-piece-slab-pricing'
import { erpMcBillingWeightGm } from '@/lib/erp-manual-as-line-pricing'
import { isMcPerGmBillingType } from '@/lib/erp-mc-type-field'
import { isMcPerPiece, type PriceBreakdown } from '@/lib/pricing'

export function isGoldSlabRLine(line: ErpBillLine, slab: ErpRateSlab): boolean {
  return slab === 'R' && String(line.metal_type || '').toLowerCase().startsWith('gold')
}

/** Slab R gold with MC-style pricing (wastage bundled into MC). When false, use wastage % display. */
export function isGoldSlabRMcPricing(
  line: ErpBillLine,
  slab: ErpRateSlab,
  goldSlabRShowMc = true,
): boolean {
  return isGoldSlabRLine(line, slab) && goldSlabRShowMc !== false
}

/** Grid / PDF display for wastage % — gold shows catalogue / edited wastage. */
export function billingWastageDisplay(
  line: ErpBillLine,
  slab: ErpRateSlab,
  goldSlabRShowMc = true,
): string | number {
  if (isGoldSlabRLine(line, slab)) {
    if (line.displayWastagePct != null) return line.displayWastagePct
    return line.wastage_pct ?? ''
  }
  if (isGoldSlabRMcPricing(line, slab, goldSlabRShowMc)) return 0
  if (line.displayWastagePct != null) return line.displayWastagePct
  return line.wastage_pct ?? ''
}

export function applyErpLineMcDisplayFromBreakdown(
  line: ErpBillLine,
  bd: PriceBreakdown,
  slab: ErpRateSlab,
): Pick<
  ErpBillLine,
  'displayMcInr' | 'displayMcRatePerUnit' | 'displayMcBeforeDiscount' | 'displayMcDiscountPct'
> {
  if (!(bd.mc > 0)) {
    return {
      displayMcInr: null,
      displayMcRatePerUnit: null,
      displayMcBeforeDiscount: null,
      displayMcDiscountPct: null,
    }
  }
  const qty = Math.max(1, Number(line.qty) || 1)
  let rate: number | null = null
  if (isMcPerGmBillingType(line.mc_type)) {
    const wt = erpMcBillingWeightGm(line, slab)
    if (wt > 0) rate = Math.round((bd.mc / wt) * 100) / 100
  } else if (isMcPerPiece(line.mc_type) || Number(line.mc_rate) > 0) {
    rate = Math.round((bd.mc / qty) * 100) / 100
  }
  return {
    displayMcInr: Math.round(bd.mc),
    displayMcRatePerUnit: rate != null ? rate : undefined,
    displayMcBeforeDiscount:
      bd.mc_before_discount != null && bd.mc_before_discount > bd.mc
        ? Math.round(bd.mc_before_discount)
        : undefined,
    displayMcDiscountPct: bd.mc_discount_pct ?? undefined,
  }
}

/** Grid / PDF display for MC — Slab R gold shows computed ₹ MC when MC mode is on. */
export function billingMcDisplay(
  line: ErpBillLine,
  slab: ErpRateSlab,
  goldSlabRShowMc = true,
): string | number {
  if (isGoldSlabRMcPricing(line, slab, goldSlabRShowMc) && line.displayMcInr != null && line.displayMcInr > 0) {
    return Math.round(line.displayMcInr)
  }
  if (
    line.displayMcRatePerUnit != null &&
    Number(line.displayMcRatePerUnit) > 0 &&
    slab !== 'R' &&
    slab !== 'Q' &&
    !isGoldSlabRMcPricing(line, slab, goldSlabRShowMc)
  ) {
    const n = Number(line.displayMcRatePerUnit)
    return Number.isInteger(n) ? n : Math.round(n * 100) / 100
  }
  if (slab !== 'R' && slab !== 'Q' && lineHasPieceSlabFields(line) && !line.manualEntry) {
    const slabMc = pieceSlabMcRate(line, slab)
    if (slabMc != null && Number.isFinite(Number(slabMc))) return Math.round(Number(slabMc))
  }
  return line.mc_rate ?? ''
}

/** Short hint for MC discount (Slab R gold with catalog MC disc %). */
export function billingMcDiscountHint(
  line: ErpBillLine,
  slab: ErpRateSlab,
  goldSlabRShowMc = true,
): string | null {
  if (!isGoldSlabRMcPricing(line, slab, goldSlabRShowMc)) return null
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
export function billingMcPdfText(
  line: ErpBillLine,
  slab: ErpRateSlab,
  goldSlabRShowMc = true,
): string {
  const mc = billingMcDisplay(line, slab, goldSlabRShowMc)
  if (mc === '' || mc == null) return '—'
  const hint = billingMcDiscountHint(line, slab, goldSlabRShowMc)
  if (hint) return `${mc} (${hint})`
  return String(mc)
}

/** Line-sum net (incl. GST) before settlement discount typed in Discount (₹). */
export function erpLinesNetBeforeSettlementDiscount(linesNetTotal: number): number {
  return Math.round(linesNetTotal)
}

/** Final bill/estimate total after explicit settlement discount (46 → net−46; −54 → net+54). */
export function erpSettledTotalInr(
  linesNetTotal: number,
  explicitCashDiscountInr: number | null | undefined,
): number {
  const net = erpLinesNetBeforeSettlementDiscount(linesNetTotal)
  if (explicitCashDiscountInr == null || !Number.isFinite(Number(explicitCashDiscountInr))) {
    return net
  }
  return Math.max(0, net - Math.round(Number(explicitCashDiscountInr)))
}

/** Saved total_inr for estimates & sales (unchanged when Discount field empty). */
export function resolveErpBillTotalInr(params: {
  linesNetTotal: number
  billType: 'sale' | 'estimate'
  explicitCashDiscountInr: number | null
  collectedAmountInr: number | null
  /** Jainav/lane sales: use collected when no explicit settlement discount. */
  shadowSaleUsesCollected: boolean
}): number {
  if (
    params.explicitCashDiscountInr != null &&
    Number.isFinite(params.explicitCashDiscountInr)
  ) {
    return erpSettledTotalInr(params.linesNetTotal, params.explicitCashDiscountInr)
  }
  if (
    params.billType === 'sale' &&
    params.shadowSaleUsesCollected &&
    params.collectedAmountInr != null &&
    params.collectedAmountInr > 0
  ) {
    return Math.round(params.collectedAmountInr)
  }
  return erpLinesNetBeforeSettlementDiscount(params.linesNetTotal)
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
  /** User-entered settlement discount (₹) — not auto-derived from collected. */
  cashDiscountInr: number
  /** Net − collected (informational until user confirms Discount field). */
  balanceInr: number | null
  totalDiscountInr: number
  collectedAmount: number | null
}

/** MC slab savings + optional explicit cash discount (balance is display-only). */
export function computeBillingDiscountSummary(params: {
  netTotal: number
  collectedAmount: number | null
  explicitCashDiscountInr: number | null
  lines: ErpBillLine[]
}): BillingDiscountSummary {
  const mcDiscountInr = computeMcDiscountTotal(params.lines)
  const collectedAmount = params.collectedAmount
  const settledTotal = erpSettledTotalInr(params.netTotal, params.explicitCashDiscountInr)
  const balanceInr =
    collectedAmount != null && params.netTotal > 0
      ? Math.round(settledTotal - collectedAmount)
      : null
  const cashDiscountInr =
    params.explicitCashDiscountInr != null && Number.isFinite(params.explicitCashDiscountInr)
      ? Math.round(params.explicitCashDiscountInr)
      : 0
  const totalDiscountInr =
    mcDiscountInr + (params.explicitCashDiscountInr != null ? cashDiscountInr : 0)
  return {
    mcDiscountInr,
    cashDiscountInr,
    balanceInr,
    totalDiscountInr,
    collectedAmount,
  }
}

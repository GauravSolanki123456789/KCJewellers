import type { ErpBillLine } from '@/components/reseller/erp/erp-ui'
import type { ErpRateSlab } from '@/lib/erp-billing-pricing'

export type ErpBillSession = {
  rateSlab?: ErpRateSlab
  wholesaleGold?: number | null
  wholesaleSilver?: number | null
  goldPerG?: number
  silverPerG?: number
  /** Snapshot of live rates used in billing (incl. per-line rate overrides on regen). */
  displayRates?: unknown
  mobile?: string
  address?: string
  /** When true, Rate column stays empty on reload (rate unfix). */
  ratesUnfixed?: boolean
  /** Advance amount customer has paid (₹). */
  advancePaidInr?: number
  /** Customer PAN for tax invoice */
  pan?: string
  /** Customer GSTIN for tax invoice */
  customerGst?: string
  /** Set when this estimate was converted to a sales bill */
  billedSaleBillId?: number
  billedSaleBillNumber?: string
  billedAt?: string
  /** Amount collected from customer (₹) — discount = net − collected. */
  collectedAmountInr?: number
  /** Billing discount (₹) = net total − collected; negative = over-collected. */
  billingDiscountInr?: number
}

export function buildErpBillSession(input: {
  rateSlab: ErpRateSlab
  wholesaleGold: number | null
  wholesaleSilver: number | null
  goldPerG: number
  silverPerG: number
  displayRates?: unknown
  mobile: string
  address: string
  lines: ErpBillLine[]
  advancePaidInr?: number | null
  pan?: string
  customerGst?: string
  collectedAmountInr?: number | null
  billingDiscountInr?: number | null
  netTotalInr?: number
}): ErpBillSession {
  const ratesUnfixed =
    input.lines.length > 0 && input.lines.every((l) => l.rateLocked)
  const advance = Math.max(0, Number(input.advancePaidInr) || 0)
  const collectedRaw = input.collectedAmountInr
  const collected =
    collectedRaw != null && Number.isFinite(Number(collectedRaw))
      ? Number(collectedRaw)
      : null
  const netTotal = Number(input.netTotalInr) || 0
  const billingDiscount =
    input.billingDiscountInr != null && Number.isFinite(Number(input.billingDiscountInr))
      ? Number(input.billingDiscountInr)
      : collected != null && netTotal > 0
        ? Math.round(netTotal - collected)
        : undefined
  return {
    rateSlab: input.rateSlab,
    wholesaleGold: input.wholesaleGold,
    wholesaleSilver: input.wholesaleSilver,
    goldPerG: input.goldPerG,
    silverPerG: input.silverPerG,
    displayRates: input.displayRates,
    mobile: input.mobile.trim() || undefined,
    address: input.address.trim() || undefined,
    ratesUnfixed: ratesUnfixed || undefined,
    advancePaidInr: advance > 0 ? advance : undefined,
    pan: input.pan?.trim() || undefined,
    customerGst: input.customerGst?.trim() || undefined,
    collectedAmountInr: collected != null ? collected : undefined,
    billingDiscountInr:
      billingDiscount != null && Number.isFinite(billingDiscount) ? billingDiscount : undefined,
  }
}

export function applyRatesUnfixed(lines: ErpBillLine[], ratesUnfixed?: boolean): ErpBillLine[] {
  if (!ratesUnfixed) return lines
  return lines.map((l) => ({ ...l, ratePerGram: null, rateLocked: true }))
}

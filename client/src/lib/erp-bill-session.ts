import type { ErpBillLine } from '@/components/reseller/erp/erp-ui'
import type { ErpRateSlab } from '@/lib/erp-billing-pricing'
import type { ErpPaymentMethod } from '@/lib/erp-ledger-routing'

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
  /** Catalog MC discount total (₹) across lines. */
  mcDiscountInr?: number
  /** Cash / rounding discount (₹) = net − collected. */
  cashDiscountInr?: number
  /** Total discount shown (MC + cash). */
  totalDiscountInr?: number
  /** @deprecated use totalDiscountInr */
  billingDiscountInr?: number
  /** Slab R gold: MC pricing mode when saved (see printFormats.goldSlabRShowMc). */
  goldSlabRShowMc?: boolean
  /** Payment method for ledger routing (no GSTIN sales). */
  paymentMethod?: ErpPaymentMethod
  cashAmountInr?: number
  onlineAmountInr?: number
  /** Estimate converted via ledger (no official SALE number). */
  billedViaLedger?: boolean
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
  mcDiscountInr?: number | null
  cashDiscountInr?: number | null
  totalDiscountInr?: number | null
  netTotalInr?: number
  goldSlabRShowMc?: boolean
  paymentMethod?: ErpPaymentMethod
  cashAmountInr?: number | null
  onlineAmountInr?: number | null
}): ErpBillSession {
  const ratesUnfixed =
    input.lines.length > 0 && input.lines.every((l) => l.rateLocked)
  const advance = Math.max(0, Number(input.advancePaidInr) || 0)
  const collectedRaw = input.collectedAmountInr
  const collected =
    collectedRaw != null && Number.isFinite(Number(collectedRaw))
      ? Number(collectedRaw)
      : null
  const mcDiscount = Math.max(0, Number(input.mcDiscountInr) || 0)
  const cashDiscount =
    input.cashDiscountInr != null && Number.isFinite(Number(input.cashDiscountInr))
      ? Number(input.cashDiscountInr)
      : collected != null
        ? Math.round((Number(input.netTotalInr) || 0) - collected)
        : 0
  const totalDiscount =
    input.totalDiscountInr != null && Number.isFinite(Number(input.totalDiscountInr))
      ? Number(input.totalDiscountInr)
      : collected != null
        ? mcDiscount + cashDiscount
        : mcDiscount
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
    mcDiscountInr: mcDiscount > 0 ? mcDiscount : undefined,
    cashDiscountInr:
      collected != null && cashDiscount !== 0 ? cashDiscount : undefined,
    totalDiscountInr: totalDiscount !== 0 ? totalDiscount : undefined,
    billingDiscountInr: totalDiscount !== 0 ? totalDiscount : undefined,
    goldSlabRShowMc: input.goldSlabRShowMc === false ? false : undefined,
    paymentMethod: input.paymentMethod || undefined,
    cashAmountInr:
      input.cashAmountInr != null && Number.isFinite(Number(input.cashAmountInr))
        ? Number(input.cashAmountInr)
        : undefined,
    onlineAmountInr:
      input.onlineAmountInr != null && Number.isFinite(Number(input.onlineAmountInr))
        ? Number(input.onlineAmountInr)
        : undefined,
  }
}

export function applyRatesUnfixed(lines: ErpBillLine[], ratesUnfixed?: boolean): ErpBillLine[] {
  if (!ratesUnfixed) return lines
  return lines.map((l) => ({ ...l, ratePerGram: null, rateLocked: true }))
}

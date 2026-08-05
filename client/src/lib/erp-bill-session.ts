import type { ErpBillLine } from '@/components/reseller/erp/erp-ui'
import type { ErpRateSlab } from '@/lib/erp-billing-pricing'

export type ErpBillSession = {
  rateSlab?: ErpRateSlab
  wholesaleGold?: number | null
  wholesaleSilver?: number | null
  goldPerG?: number
  silverPerG?: number
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
}

export function buildErpBillSession(input: {
  rateSlab: ErpRateSlab
  wholesaleGold: number | null
  wholesaleSilver: number | null
  goldPerG: number
  silverPerG: number
  mobile: string
  address: string
  lines: ErpBillLine[]
  advancePaidInr?: number | null
  pan?: string
  customerGst?: string
}): ErpBillSession {
  const ratesUnfixed =
    input.lines.length > 0 && input.lines.every((l) => l.rateLocked)
  const advance = Math.max(0, Number(input.advancePaidInr) || 0)
  return {
    rateSlab: input.rateSlab,
    wholesaleGold: input.wholesaleGold,
    wholesaleSilver: input.wholesaleSilver,
    goldPerG: input.goldPerG,
    silverPerG: input.silverPerG,
    mobile: input.mobile.trim() || undefined,
    address: input.address.trim() || undefined,
    ratesUnfixed: ratesUnfixed || undefined,
    advancePaidInr: advance > 0 ? advance : undefined,
    pan: input.pan?.trim() || undefined,
    customerGst: input.customerGst?.trim() || undefined,
  }
}

export function applyRatesUnfixed(lines: ErpBillLine[], ratesUnfixed?: boolean): ErpBillLine[] {
  if (!ratesUnfixed) return lines
  return lines.map((l) => ({ ...l, ratePerGram: null, rateLocked: true }))
}

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
}): ErpBillSession {
  const ratesUnfixed = input.lines.length > 0 && input.lines.every((l) => l.rateLocked)
  return {
    rateSlab: input.rateSlab,
    wholesaleGold: input.wholesaleGold,
    wholesaleSilver: input.wholesaleSilver,
    goldPerG: input.goldPerG,
    silverPerG: input.silverPerG,
    mobile: input.mobile.trim() || undefined,
    address: input.address.trim() || undefined,
    ratesUnfixed,
  }
}

export function applyRatesUnfixed(lines: ErpBillLine[], ratesUnfixed?: boolean): ErpBillLine[] {
  if (!ratesUnfixed) return lines
  return lines.map((l) => ({ ...l, ratePerGram: null, rateLocked: true }))
}

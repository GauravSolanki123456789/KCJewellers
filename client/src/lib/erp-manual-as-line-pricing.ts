import type { ErpBillLine } from '@/components/reseller/erp/erp-ui'
import type { ErpRateSlab } from '@/lib/erp-billing-pricing'
import { lineHasMetalSlabPctInput } from '@/lib/erp-metal-slab-field'
import {
  computeWeightBasedRowBreakdown,
  erpLineNetWeightGm,
  erpMcDiscountPerUnit,
  erpNetMcPerUnit,
  erpResolveBilledWeightGm,
} from '@/lib/erp-weight-row-pricing'
import type { PriceBreakdown } from '@/lib/pricing'

export function erpMcBillingNetGm(line: ErpBillLine): number {
  return erpLineNetWeightGm(line)
}

const GST_PCT = 3

/** Manual scanner lines typed as A (articles) or S (jewellery). */
export function isManualArticlesOrJewelleryLine(line: ErpBillLine): boolean {
  if (!line.manualEntry) return false
  return (
    line.manualCategory === 'articles' ||
    line.manualCategory === 'jewellery' ||
    line.manualCategory === 'bullion'
  )
}

/** MC R column on manual rows = discount per unit off base MC (not net slab rate). */
export function manualMcDiscountPerUnit(line: ErpBillLine, slab: ErpRateSlab): number {
  if (!line.manualEntry) return 0
  return erpMcDiscountPerUnit(line, slab)
}

export function manualEffectiveMcRatePerUnit(line: ErpBillLine, slab: ErpRateSlab): number {
  return erpNetMcPerUnit(line, slab)
}

/** NetWt = Gross − (Bags × BagWt) — used for manual A/S rows. */
export function deriveManualNetWeightPatch(
  line: ErpBillLine,
  patch: Partial<ErpBillLine> = {},
): Partial<ErpBillLine> | null {
  const merged = { ...line, ...patch }
  const gross = merged.gross_weight
  if (gross == null || !Number.isFinite(Number(gross))) return null
  const bagCount =
    merged.bags != null && String(merged.bags).trim() !== '' && Number.isFinite(Number(merged.bags))
      ? Math.max(0, Number(merged.bags))
      : 0
  const bagUnitWt =
    merged.bag_wt != null && Number.isFinite(Number(merged.bag_wt)) ? Number(merged.bag_wt) : 0
  let bagDeduction = 0
  if (bagCount > 0 && bagUnitWt > 0) {
    bagDeduction = bagCount * bagUnitWt
  } else if (bagUnitWt > 0) {
    bagDeduction = bagUnitWt
  }
  const net = Number(gross) - bagDeduction
  if (!Number.isFinite(net) || net < 0) return null
  const weightGm = Math.round(net * 1000) / 1000
  return { ...patch, weightGm, originalWeightGm: weightGm }
}

function resolveManualRowRatePerG(
  line: ErpBillLine,
  slab: ErpRateSlab,
  silverPerG: number,
  goldPerG: number,
  wholesaleSilver?: number | null,
  wholesaleGold?: number | null,
): number {
  const locked = Number(line.ratePerGram)
  if (line.rateLocked && Number.isFinite(locked) && locked > 0) return locked
  const metal = String(line.metal_type || 'silver').toLowerCase()
  if (metal.startsWith('gold')) {
    if (slab === 'W' || slab === 'F') {
      const wh = Number(wholesaleGold ?? goldPerG) || 0
      return wh > 0 ? wh : goldPerG > 0 ? goldPerG : 0
    }
    return goldPerG > 0 ? goldPerG : 0
  }
  if (slab === 'W' || slab === 'F') {
    const wh = Number(wholesaleSilver ?? silverPerG) || 0
    return wh > 0 ? wh : silverPerG > 0 ? silverPerG : 0
  }
  return silverPerG > 0 ? silverPerG : 0
}

function manualSilverRateDiscountInr(
  line: ErpBillLine,
  slab: ErpRateSlab,
  billedWt: number,
  lineRate: number,
  silverPerG: number,
): number {
  if (slab !== 'R') return 0
  if (line.rateLocked && Number(line.ratePerGram) > 0) return 0
  if (lineHasMetalSlabPctInput(line, slab)) return 0
  if (billedWt <= 0 || silverPerG <= 0 || lineRate <= 0) return 0
  if (silverPerG <= lineRate) return 0
  return Math.round((silverPerG - lineRate) * billedWt)
}

/**
 * Strict manual A/S row math:
 * Base = metal + base MC + fixed (+ box/stone) → subtract rate & MC discounts → GST on net.
 */
export function computeManualAsLineBreakdown(
  line: ErpBillLine,
  slab: ErpRateSlab,
  silverPerG = 0,
  goldPerG = 0,
  wholesaleSilver?: number | null,
  wholesaleGold?: number | null,
  gstPct = GST_PCT,
): PriceBreakdown {
  const rate = resolveManualRowRatePerG(
    line,
    slab,
    silverPerG,
    goldPerG,
    wholesaleSilver,
    wholesaleGold,
  )
  const netWt = erpLineNetWeightGm(line)
  const billedWt = netWt > 0 ? erpResolveBilledWeightGm(line, slab, netWt) : 0
  const metalDisc = manualSilverRateDiscountInr(line, slab, billedWt, rate, silverPerG)
  return computeWeightBasedRowBreakdown({
    line,
    slab,
    metalRatePerG: rate,
    gstPct,
    metalRateDiscountInr: metalDisc,
  })
}

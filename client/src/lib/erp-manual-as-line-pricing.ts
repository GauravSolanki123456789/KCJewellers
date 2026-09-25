import type { ErpBillLine } from '@/components/reseller/erp/erp-ui'
import { mcSlabFieldForBillingSlab, type ErpRateSlab } from '@/lib/erp-billing-pricing'
import { lineHasMetalSlabPctInput, metalSlabPctMultiplier } from '@/lib/erp-metal-slab-field'
import type { PriceBreakdown } from '@/lib/pricing'

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
  const field = mcSlabFieldForBillingSlab(slab)
  const v = Number(line[field] ?? 0)
  return Number.isFinite(v) && v > 0 ? v : 0
}

export function manualEffectiveMcRatePerUnit(line: ErpBillLine, slab: ErpRateSlab): number {
  const base = Number(line.mc_rate ?? 0) || 0
  if (base <= 0) return 0
  const disc = manualMcDiscountPerUnit(line, slab)
  return disc > 0 ? Math.max(0, base - disc) : base
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

function isMcPerGmMcType(mcType: string | null | undefined): boolean {
  const t = String(mcType || '')
    .toLowerCase()
    .replace(/\s+/g, '')
  if (!t) return true
  if (t.includes('/pc') || t.includes('perpc') || t.includes('mcpc') || t.includes('piece')) return false
  return true
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
): PriceBreakdown {
  const netWt = Number(line.originalWeightGm ?? line.weightGm ?? 0) || 0
  if (netWt <= 0) {
    return { metal: 0, mc: 0, stone: 0, cgst: 0, sgst: 0, taxable: 0, total: 0 }
  }

  const wastPct = Number(line.wastage_pct ?? 0) || 0
  const metalMult = metalSlabPctMultiplier(line, slab)
  let billedWt = netWt
  if (metalMult != null && metalMult > 0) {
    billedWt = netWt * metalMult
  } else if (wastPct > 0) {
    billedWt = netWt * (1 + wastPct / 100)
  }

  const rate = resolveManualRowRatePerG(
    line,
    slab,
    silverPerG,
    goldPerG,
    wholesaleSilver,
    wholesaleGold,
  )
  const metalCost = rate > 0 ? billedWt * rate : 0

  const baseMcRate = Number(line.mc_rate ?? 0) || 0
  const effMcRate = manualEffectiveMcRatePerUnit(line, slab)
  const pcs = Math.max(1, Number(line.qty) || 1)
  const perGm = isMcPerGmMcType(line.mc_type)
  const totalMcBase = perGm ? billedWt * baseMcRate : pcs * baseMcRate
  const totalMc = perGm ? billedWt * effMcRate : pcs * effMcRate

  const fixed = Number(line.fixed_price ?? 0) || 0
  const box = Number(line.box_charges ?? 0) || 0
  const stone = Number(line.stone_charges ?? 0) || 0
  const baseSubtotal = metalCost + totalMcBase + fixed + box + stone
  const metalDisc = manualSilverRateDiscountInr(line, slab, billedWt, rate, silverPerG)
  const mcDisc = Math.max(0, Math.round(totalMcBase - totalMc))
  const netSubtotal = Math.max(0, baseSubtotal - metalDisc - mcDisc)
  const taxable = Math.round(netSubtotal)
  const total = Math.round(taxable * (1 + GST_PCT / 100))
  const gstRounded = total - taxable

  const mcBefore =
    baseMcRate > effMcRate && totalMcBase > totalMc ? Math.round(totalMcBase) : undefined

  return {
    metal: Math.round(metalCost),
    mc: Math.round(totalMc),
    mc_before_discount: mcBefore,
    stone: stone + box,
    cgst: gstRounded / 2,
    sgst: gstRounded / 2,
    taxable,
    total,
    rate_per_gram: rate > 0 ? rate : undefined,
    net_weight: netWt,
    billable_weight_gm: Math.round(billedWt * 1000) / 1000,
    wastage_pct:
      wastPct > 0 && !lineHasMetalSlabPctInput(line, slab) ? wastPct : undefined,
  }
}

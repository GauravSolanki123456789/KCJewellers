import type { ErpBillLine } from '@/components/reseller/erp/erp-ui'
import {
  isRetailQuoteSlab,
  mcSlabFieldForBillingSlab,
  type ErpRateSlab,
} from '@/lib/erp-billing-pricing'
import type { ResellerSlabSettings } from '@/lib/catalog-slab-pricing'
import { pieceSlabMcRate } from '@/lib/erp-piece-slab-pricing'
import {
  erpCatalogMcPerUnit,
  erpEffectiveMcPerUnit,
  erpTierMcDiscountPct,
  skipCatalogMcPcDiscount,
} from '@/lib/erp-mc-slab-effective'
import {
  erpLineNetWeightGm,
  lineHasMetalSlabPctInput,
  metalSlabPctMultiplier,
} from '@/lib/erp-metal-slab-field'
import { isMcPerGmBillingType } from '@/lib/erp-mc-type-field'
import type { PriceBreakdown } from '@/lib/pricing'

export function erpMcBillingNetGm(line: ErpBillLine): number {
  const n = Number(line.originalWeightGm ?? line.weightGm ?? 0)
  return Number.isFinite(n) && n > 0 ? n : 0
}

/** MC/GM × weight — wastage adds to MC wt; metal slab % does not (MC × net wt, metal × pure wt). */
export function erpMcBillingWeightGm(line: ErpBillLine, slab: ErpRateSlab = 'R'): number {
  const netWt = erpLineNetWeightGm(line, slab) || erpMcBillingNetGm(line)
  if (netWt <= 0) return 0
  const wastPct = Number(line.wastage_pct ?? 0) || 0
  const metalMult = metalSlabPctMultiplier(line, slab)
  if (metalMult != null && metalMult > 0) return netWt
  if (wastPct > 0) return Math.round(netWt * (1 + wastPct / 100) * 1000) / 1000
  return netWt
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

/** Legacy: MC slab column as ₹/gm discount off catalog MC when no slab MC rate is set. */
export function manualMcDiscountPerUnit(line: ErpBillLine, slab: ErpRateSlab): number {
  if (!line.manualEntry) return 0
  if (slab === 'W' || slab === 'F' || isRetailQuoteSlab(slab)) return 0
  const slabMc = pieceSlabMcRate(line, slab)
  if (slabMc != null && Number(slabMc) > 0) return 0
  const field = mcSlabFieldForBillingSlab(slab)
  const v = Number(line[field] ?? 0)
  return Number.isFinite(v) && v > 0 ? v : 0
}

/** Billable MC ₹/gm (or ₹/pc) — catalogue MC × slab % (S/A/B silver). G-enter skips. */
export function manualEffectiveMcRatePerUnit(
  line: ErpBillLine,
  slab: ErpRateSlab,
  slabSettings?: ResellerSlabSettings,
): number {
  if (!skipCatalogMcPcDiscount(line)) {
    const eff = erpEffectiveMcPerUnit(line, slab, slabSettings)
    if (eff > 0) return eff
  }
  const slabMc = pieceSlabMcRate(line, slab)
  if (slabMc != null && Number(slabMc) > 0 && !line.manualEntry) return Number(slabMc)
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

function resolveManualRowRatePerG(
  line: ErpBillLine,
  slab: ErpRateSlab,
  silverPerG: number,
  goldPerG: number,
  wholesaleSilver?: number | null,
  wholesaleGold?: number | null,
): number {
  const explicit = Number(line.ratePerGram)
  if (Number.isFinite(explicit) && explicit > 0) return explicit
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
  // Row ₹/g (incl. slab R offset) is the billable metal rate — do not subtract live−line again.
  if (Number(line.ratePerGram) > 0) return 0
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
  slabSettings?: ResellerSlabSettings,
): PriceBreakdown {
  const netWt = erpLineNetWeightGm(line, slab) || 0
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
  const pcs = Math.max(1, Number(line.qty) || 1)
  const metalCost = rate > 0 ? billedWt * rate * pcs : 0

  const catalogMc = erpCatalogMcPerUnit(line)
  const perGm = isMcPerGmBillingType(line.mc_type)
  const baseMcRate = perGm ? Number(line.mc_rate ?? catalogMc) || 0 : catalogMc
  const effMcRate = manualEffectiveMcRatePerUnit(line, slab, slabSettings)
  let mcWt = netWt
  if (perGm) {
    if (metalMult != null && metalMult > 0) {
      mcWt = netWt
    } else if (wastPct > 0) {
      mcWt = billedWt
    } else {
      mcWt = netWt
    }
  }
  const totalMcBase = perGm ? mcWt * baseMcRate * pcs : pcs * baseMcRate
  const totalMc = perGm ? mcWt * effMcRate * pcs : pcs * effMcRate

  const fixedBase = Number(line.fixed_price ?? 0) || 0
  const fixedR = Number(line.fixed_price_r ?? 0) || 0
  let fixedTotal = fixedBase
  if (line.mrpMode || line.manualCategory === 'gift') {
    const baseTot = fixedBase * pcs
    fixedTotal = fixedR > 0 ? fixedR * pcs : baseTot
  }
  const box = Number(line.box_charges ?? 0) || 0
  const stone = Number(line.stone_charges ?? 0) || 0
  const metalDisc = manualSilverRateDiscountInr(line, slab, billedWt, rate, silverPerG)
  const mcDisc = Math.max(0, Math.round(totalMcBase - totalMc))
  // Bill at effective MC (MC R/W/F); catalog MC (480) vs slab MC (240) is display/print only.
  const baseSubtotal = metalCost + totalMc + fixedTotal + box + stone
  const netSubtotal = Math.max(0, baseSubtotal - metalDisc)
  const taxable = Math.round(netSubtotal)
  const total =
    gstPct > 0 ? Math.round(taxable * (1 + gstPct / 100)) : taxable
  const gstRounded = total - taxable

  const mcBefore =
    catalogMc > effMcRate && totalMcBase > totalMc ? Math.round(totalMcBase) : undefined
  const mcDiscountPct = erpTierMcDiscountPct(line, slab, slabSettings) || undefined

  return {
    metal: Math.round(metalCost),
    mc: Math.round(totalMc * 100) / 100,
    mc_before_discount: mcBefore,
    mc_discount_pct: mcDiscountPct && mcBefore ? mcDiscountPct : undefined,
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

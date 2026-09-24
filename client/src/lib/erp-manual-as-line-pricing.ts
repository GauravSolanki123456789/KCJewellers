import type { ErpBillLine } from '@/components/reseller/erp/erp-ui'
import { mcSlabFieldForBillingSlab, type ErpRateSlab } from '@/lib/erp-billing-pricing'
import { readMetalSlabPct } from '@/lib/erp-metal-slab-field'
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
  silverPerG: number,
  goldPerG: number,
): number {
  const locked = Number(line.ratePerGram)
  if (line.rateLocked && Number.isFinite(locked) && locked > 0) return locked
  if (Number.isFinite(locked) && locked > 0) return locked
  const metal = String(line.metal_type || 'silver').toLowerCase()
  if (metal.startsWith('gold') && goldPerG > 0) return goldPerG
  if (silverPerG > 0) return silverPerG
  return 0
}

/**
 * Strict manual A/S row math (order of operations from billing spec).
 * Fixed ₹ is GST-inclusive and added after Subtotal + GST.
 */
export function computeManualAsLineBreakdown(
  line: ErpBillLine,
  slab: ErpRateSlab,
  silverPerG = 0,
  goldPerG = 0,
): PriceBreakdown {
  const netWt = Number(line.originalWeightGm ?? line.weightGm ?? 0) || 0
  if (netWt <= 0) {
    return { metal: 0, mc: 0, stone: 0, cgst: 0, sgst: 0, taxable: 0, total: 0 }
  }

  const metalPct = readMetalSlabPct(line, slab)
  const wastPct = Number(line.wastage_pct ?? 0) || 0
  let billedWt = netWt
  if (metalPct !== '' && Number(metalPct) > 0) {
    billedWt = netWt * (Number(metalPct) / 100)
  } else if (wastPct > 0) {
    billedWt = netWt * (1 + wastPct / 100)
  }

  const rate = resolveManualRowRatePerG(line, silverPerG, goldPerG)
  const metalCost = rate > 0 ? billedWt * rate : 0

  const baseMcRate = Number(line.mc_rate ?? 0) || 0
  const effMcRate = manualEffectiveMcRatePerUnit(line, slab)
  const pcs = Math.max(1, Number(line.qty) || 1)
  const perGm = isMcPerGmMcType(line.mc_type)
  const totalMcBase = perGm ? billedWt * baseMcRate : pcs * baseMcRate
  const totalMc = perGm ? billedWt * effMcRate : pcs * effMcRate

  const subtotalRaw = metalCost + totalMc
  const gstRaw = subtotalRaw * (GST_PCT / 100)
  const fixed = Number(line.fixed_price ?? 0) || 0
  const box = Number(line.box_charges ?? 0) || 0
  const stone = Number(line.stone_charges ?? 0) || 0
  const extras = fixed + box + stone
  const taxable = Math.round(subtotalRaw)
  const total = Math.round(subtotalRaw + gstRaw + extras)
  const gstRounded = total - taxable - Math.round(extras)

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
    wastage_pct: wastPct > 0 && metalPct === '' ? wastPct : undefined,
  }
}

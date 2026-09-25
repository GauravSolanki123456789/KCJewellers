import type { ErpBillLine } from '@/components/reseller/erp/erp-ui'
import {
  lineHasMetalSlabPctInput,
  metalSlabPctMultiplier,
} from '@/lib/erp-metal-slab-field'
import { isMcPerGmBillingType } from '@/lib/erp-mc-type-field'
import {
  lineHasPieceSlabFields,
  pieceSlabBillableWeight,
} from '@/lib/erp-piece-slab-pricing'
import type { PriceBreakdown } from '@/lib/pricing'
import type { ErpRateSlab } from '@/lib/erp-billing-pricing'

function mcSlabFieldForBillingSlab(
  slab: ErpRateSlab,
): 'mc_rate_slab_r' | 'mc_rate_slab_w' | 'mc_rate_slab_f' {
  if (slab === 'W') return 'mc_rate_slab_w'
  if (slab === 'F') return 'mc_rate_slab_f'
  return 'mc_rate_slab_r'
}

/** Net weight for MC — always original net, never billable/slab-adjusted weightGm. */
export function erpLineNetWeightGm(line: ErpBillLine): number {
  const n = Number(line.originalWeightGm ?? line.weightGm ?? 0)
  return Number.isFinite(n) && n > 0 ? n : 0
}

export function erpSafeRatePerG(line: ErpBillLine, resolvedMetalRate: number): number {
  const locked = Number(line.ratePerGram)
  if (line.rateLocked && Number.isFinite(locked) && locked > 0) return locked
  const r = Number(resolvedMetalRate)
  return Number.isFinite(r) && r > 0 ? r : 0
}

export function erpBaseMcPerUnit(line: ErpBillLine): number {
  const v = Number(line.mc_rate ?? 0)
  return Number.isFinite(v) && v > 0 ? v : 0
}

/** MC R column — per-unit discount off base MC (never metal rate). */
export function erpMcDiscountPerUnit(line: ErpBillLine, slab: ErpRateSlab): number {
  const field = mcSlabFieldForBillingSlab(slab)
  const v = Number(line[field] ?? 0)
  return Number.isFinite(v) && v > 0 ? v : 0
}

/** Net MC ₹/gm or ₹/pc — uses mc_rate only, never ratePerGram. */
export function erpNetMcPerUnit(line: ErpBillLine, slab: ErpRateSlab): number {
  const safeMC = erpBaseMcPerUnit(line)
  const safeMCR = erpMcDiscountPerUnit(line, slab)
  if (safeMC > 0 && safeMCR > 0) {
    if (safeMCR < safeMC) return safeMC - safeMCR
    return safeMCR
  }
  if (safeMC > 0) return safeMC
  return safeMCR
}

export function erpResolveBilledWeightGm(
  line: ErpBillLine,
  slab: ErpRateSlab,
  netWt: number,
): number {
  const metalMult = metalSlabPctMultiplier(line, slab)
  if (metalMult != null && metalMult > 0) return netWt * metalMult
  const wastPct = Number(line.wastage_pct ?? 0) || 0
  if (wastPct > 0 && !lineHasMetalSlabPctInput(line, slab)) {
    return netWt * (1 + wastPct / 100)
  }
  if (lineHasPieceSlabFields(line)) {
    const stub = { ...line, originalWeightGm: netWt, weightGm: netWt }
    return pieceSlabBillableWeight(stub, slab)
  }
  return netWt
}

export type WeightRowBreakdownParams = {
  line: ErpBillLine
  slab: ErpRateSlab
  metalRatePerG: number
  gstPct: number
  metalRateDiscountInr?: number
}

/**
 * Strict weight-row math: metal on billed wt × rate; MC on net wt (or pcs) × mc_rate;
 * MC R subtracts per unit — no cross-use of Rate for MC.
 */
export function computeWeightBasedRowBreakdown(
  params: WeightRowBreakdownParams,
): PriceBreakdown {
  const { line, slab, metalRatePerG, gstPct, metalRateDiscountInr = 0 } = params
  const safeNetWt = erpLineNetWeightGm(line)
  const safePCS = Math.max(1, Number(line.qty) || 1)
  const safeRate = erpSafeRatePerG(line, metalRatePerG)

  if (safeNetWt <= 0) {
    return { metal: 0, mc: 0, stone: 0, cgst: 0, sgst: 0, taxable: 0, total: 0 }
  }

  const billedWt = erpResolveBilledWeightGm(line, slab, safeNetWt)
  const metalCost = safeRate > 0 ? billedWt * safeRate : 0

  const safeMC = erpBaseMcPerUnit(line)
  const safeMCR = erpMcDiscountPerUnit(line, slab)
  const netMcPer = erpNetMcPerUnit(line, slab)
  const perGm = isMcPerGmBillingType(line.mc_type)

  const baseMcTotal = perGm ? safeNetWt * safeMC : safePCS * safeMC
  const netMcCost = perGm ? safeNetWt * netMcPer : safePCS * netMcPer

  const fixedBase = Number(line.fixed_price ?? 0) || 0
  const fixedR = Number(line.fixed_price_r ?? 0) || 0
  let fixedTotal = fixedBase
  if (line.mrpMode || line.manualCategory === 'gift') {
    const baseTot = fixedBase * safePCS
    fixedTotal = fixedR > 0 ? fixedR * safePCS : baseTot
  }
  const box = Number(line.box_charges ?? 0) || 0
  const stone = Number(line.stone_charges ?? 0) || 0

  let mcInSubtotal = netMcCost
  let mcDisc = 0
  if (safeMC > 0 && safeMCR > 0 && safeMCR < safeMC) {
    mcInSubtotal = baseMcTotal
    mcDisc = Math.max(0, Math.round(baseMcTotal - netMcCost))
  } else if (safeMC > 0) {
    mcInSubtotal = baseMcTotal
  }

  const baseSubtotal = metalCost + mcInSubtotal + fixedTotal + box + stone
  const netSubtotal = Math.max(0, baseSubtotal - metalRateDiscountInr - mcDisc)
  const taxable = Math.round(netSubtotal)
  const total = gstPct > 0 ? Math.round(taxable * (1 + gstPct / 100)) : taxable
  const gstRounded = total - taxable

  const mcBefore =
    safeMC > 0 && mcDisc > 0 ? Math.round(baseMcTotal) : undefined

  return {
    metal: Math.round(metalCost),
    mc: Math.round(netMcCost),
    mc_before_discount: mcBefore,
    stone: stone + box,
    cgst: gstRounded / 2,
    sgst: gstRounded / 2,
    taxable,
    total,
    rate_per_gram: safeRate > 0 ? safeRate : undefined,
    net_weight: safeNetWt,
    billable_weight_gm: Math.round(billedWt * 1000) / 1000,
    wastage_pct:
      Number(line.wastage_pct ?? 0) > 0 && !lineHasMetalSlabPctInput(line, slab)
        ? Number(line.wastage_pct)
        : undefined,
  }
}

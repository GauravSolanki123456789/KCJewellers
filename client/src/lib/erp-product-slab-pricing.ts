/**
 * Per-product ERP slab pricing — MCRateSlabR/W/F and MetalSlabR/W/F% from stock Excel.
 * When set, billing adjusts billable weight and MC rate by active rate slab (R / W / F).
 */
import { isMcPerPiece } from '@/lib/pricing'
import type { ErpBillLine } from '@/components/reseller/erp/erp-ui'
import type { ErpRateSlab } from '@/lib/erp-billing-pricing'
import type { PriceBreakdown } from '@/lib/pricing'

export type ProductSlabFields = {
  baseWeightGm?: number | null
  mc_rate?: number | null
  mc_type?: string | null
  mc_rate_slab_r?: number | null
  mc_rate_slab_w?: number | null
  mc_rate_slab_f?: number | null
  metal_slab_r_pct?: number | null
  metal_slab_w_pct?: number | null
  metal_slab_f_pct?: number | null
}

/** Excel may store 0.94, 1, or 94 — normalize to 0–100 scale. */
export function normalizeMetalSlabPctInput(v: unknown): number | null {
  if (v == null || v === '') return null
  const n = Number(v)
  if (!Number.isFinite(n)) return null
  if (n <= 0) return 0
  if (n <= 1) return Math.round(n * 10000) / 100
  if (n <= 100) return n
  return 100
}

export function hasProductSlabPricing(fields: ProductSlabFields): boolean {
  return (
    fields.mc_rate_slab_r != null ||
    fields.mc_rate_slab_w != null ||
    fields.mc_rate_slab_f != null ||
    fields.metal_slab_r_pct != null ||
    fields.metal_slab_w_pct != null ||
    fields.metal_slab_f_pct != null
  )
}

export function resolveMcRateForSlab(fields: ProductSlabFields, slab: ErpRateSlab): number {
  const pick =
    slab === 'W'
      ? fields.mc_rate_slab_w
      : slab === 'F'
        ? fields.mc_rate_slab_f
        : fields.mc_rate_slab_r
  if (pick != null && Number.isFinite(Number(pick))) return Number(pick)
  return Number(fields.mc_rate) || 0
}

export function resolveMetalSlabPct(fields: ProductSlabFields, slab: ErpRateSlab): number {
  const pick =
    slab === 'W'
      ? fields.metal_slab_w_pct
      : slab === 'F'
        ? fields.metal_slab_f_pct
        : fields.metal_slab_r_pct
  if (pick != null && Number.isFinite(Number(pick))) return Number(pick)
  return 100
}

export function resolveBillableWeightGm(fields: ProductSlabFields, slab: ErpRateSlab): number {
  const base = Number(fields.baseWeightGm)
  if (!Number.isFinite(base) || base <= 0) return 0
  const pct = resolveMetalSlabPct(fields, slab)
  return Math.round(base * (pct / 100) * 1000) / 1000
}

/** Apply slab-specific weight + MC rate to a billing line (preserves baseWeightGm). */
export function applyProductSlabToLine(line: ErpBillLine, slab: ErpRateSlab): ErpBillLine {
  if (!hasProductSlabPricing(line)) return line
  const base =
    line.baseWeightGm != null && Number.isFinite(line.baseWeightGm)
      ? line.baseWeightGm
      : line.weightGm
  const next: ErpBillLine = {
    ...line,
    baseWeightGm: base ?? null,
    weightGm: resolveBillableWeightGm({ ...line, baseWeightGm: base }, slab),
    mc_rate: resolveMcRateForSlab(line, slab),
  }
  return next
}

export function computeProductSlabBreakdown(params: {
  line: ErpBillLine
  slab: ErpRateSlab
  metalRatePerG: number
  gstPct?: number
}): PriceBreakdown | null {
  const { line, slab, metalRatePerG } = params
  const gst = params.gstPct ?? 3
  if (!hasProductSlabPricing(line)) return null

  const baseWt = line.baseWeightGm ?? line.weightGm ?? 0
  const adjustedWt = resolveBillableWeightGm(line, slab)
  const mcRate = resolveMcRateForSlab(line, slab)
  const qty = Math.max(1, Number(line.qty) || 1)

  if (adjustedWt <= 0 || metalRatePerG <= 0) {
    return {
      metal: 0,
      mc: 0,
      stone: Number(line.stone_charges) || 0,
      cgst: 0,
      sgst: 0,
      taxable: 0,
      total: 0,
      rate_per_gram: metalRatePerG,
      net_weight: adjustedWt,
      billable_weight_gm: adjustedWt,
    }
  }

  const stone = Number(line.stone_charges) || 0
  const box = Number(line.box_charges) || 0
  let metalPart: number
  let mcPartVal: number

  if (isMcPerPiece(line.mc_type)) {
    metalPart = Math.round(metalRatePerG * adjustedWt)
    mcPartVal = Math.round(mcRate * qty)
  } else {
    metalPart = Math.round(metalRatePerG * adjustedWt)
    mcPartVal = Math.round(mcRate * adjustedWt)
  }

  const taxable = metalPart + mcPartVal + stone + box
  const total = Math.round(taxable * (1 + gst / 100))
  const gstAmt = total - taxable

  return {
    metal: metalPart,
    mc: mcPartVal,
    stone,
    cgst: gstAmt / 2,
    sgst: gstAmt / 2,
    taxable,
    total,
    rate_per_gram: metalRatePerG,
    net_weight: adjustedWt,
    billable_weight_gm: adjustedWt,
    mc_before_discount: undefined,
    mc_discount_pct: undefined,
  }
}

/** Hint for estimate footer — shows base vs slab-adjusted weight. */
export function productSlabWeightHint(line: ErpBillLine, slab: ErpRateSlab): string | null {
  if (!hasProductSlabPricing(line)) return null
  const base = line.baseWeightGm ?? line.weightGm
  const adj = resolveBillableWeightGm(line, slab)
  if (base == null || adj === base) return null
  return `${Number(base).toFixed(3)} g → ${adj.toFixed(3)} g (slab ${slab} metal %)`
}

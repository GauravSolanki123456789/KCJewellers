/**
 * Per-piece ERP slab pricing — MCRateSlabR/W/F + MetalSlabR%/W%/F% from stock Excel upload.
 * Silver MC/GM: (metal_rate + mc_per_g) × slab_adjusted_weight + GST.
 * Rate and MC are shown separately; calculation uses combined per-gram for MC/GM silver.
 */
import { isMcPerPiece, type PriceBreakdown } from '@/lib/pricing'
import type { ErpBillLine } from '@/components/reseller/erp/erp-ui'

type ErpRateSlab = 'R' | 'W' | 'F'

/** Parse Excel fraction: 1 = 100%, 0.94 = 94%, 94 = 94%. */
export function parseMetalSlabFraction(raw: unknown): number {
  if (raw == null || raw === '') return 1
  const n = Number(raw)
  if (!Number.isFinite(n)) return 1
  if (n > 1) return Math.min(1, Math.max(0, n / 100))
  if (n > 0 && n <= 1) return n
  return 1
}

export function lineHasPieceSlabFields(line: ErpBillLine): boolean {
  return (
    line.mc_rate_slab_r != null ||
    line.mc_rate_slab_w != null ||
    line.mc_rate_slab_f != null ||
    line.metal_slab_r_pct != null ||
    line.metal_slab_w_pct != null ||
    line.metal_slab_f_pct != null
  )
}

export function pieceSlabMcRate(line: ErpBillLine, slab: ErpRateSlab): number | null {
  if (slab === 'W') return line.mc_rate_slab_w ?? line.mc_rate_slab_r ?? line.mc_rate ?? null
  if (slab === 'F') return line.mc_rate_slab_f ?? line.mc_rate_slab_w ?? line.mc_rate ?? null
  return line.mc_rate_slab_r ?? line.mc_rate ?? null
}

export function pieceSlabMetalFraction(line: ErpBillLine, slab: ErpRateSlab): number {
  if (slab === 'W') {
    return parseMetalSlabFraction(line.metal_slab_w_pct ?? line.metal_slab_r_pct ?? 1)
  }
  if (slab === 'F') {
    return parseMetalSlabFraction(line.metal_slab_f_pct ?? line.metal_slab_w_pct ?? 1)
  }
  return parseMetalSlabFraction(line.metal_slab_r_pct ?? 1)
}

/** Billable weight for current slab (net × metal slab %). */
export function pieceSlabBillableWeight(line: ErpBillLine, slab: ErpRateSlab): number {
  const net = line.originalWeightGm ?? line.weightGm ?? 0
  if (net <= 0) return 0
  const frac = pieceSlabMetalFraction(line, slab)
  return Math.round(net * frac * 1000) / 1000
}

export function resolveErpSilverMetalRatePerG(
  slab: ErpRateSlab,
  silverPerG: number,
  wholesaleSilver?: number | null,
): number {
  if (slab === 'R') return Math.max(0, silverPerG)
  const wh = wholesaleSilver ?? silverPerG
  return Math.max(0, wh)
}

/** Apply slab-adjusted weight + per-slab MC to a bill line (before totals). */
export function applyPieceSlabToLine(line: ErpBillLine, slab: ErpRateSlab): ErpBillLine {
  if (!lineHasPieceSlabFields(line)) return line
  const net = line.originalWeightGm ?? line.weightGm ?? null
  const next: ErpBillLine = {
    ...line,
    originalWeightGm: net,
    weightGm: pieceSlabBillableWeight(line, slab),
    mc_rate: pieceSlabMcRate(line, slab),
  }
  return next
}

export function computeErpPieceSlabBreakdown(
  line: ErpBillLine,
  slab: ErpRateSlab,
  silverPerG: number,
  wholesaleSilver?: number | null,
  gstPct = 3,
): PriceBreakdown {
  const netWt = line.originalWeightGm ?? line.weightGm ?? 0
  const billWt = pieceSlabBillableWeight(line, slab)
  const metalRate = resolveErpSilverMetalRatePerG(slab, silverPerG, wholesaleSilver)
  const mcRate = pieceSlabMcRate(line, slab) ?? 0
  const qty = line.qty ?? 1
  const stone = Number(line.stone_charges || 0) || 0
  const box = Number(line.box_charges || 0) || 0
  const mcGm = !isMcPerPiece(line.mc_type)

  let metalPart: number
  let mc: number

  if (mcGm) {
    const combined = Math.round((metalRate + mcRate) * billWt)
    metalPart = Math.round(metalRate * billWt)
    mc = combined - metalPart
  } else {
    metalPart = Math.round(metalRate * billWt)
    mc = Math.round(mcRate * qty)
  }

  const taxable = metalPart + mc + stone + box
  const total = Math.round(taxable * (1 + gstPct / 100))
  const gstAmt = total - taxable

  return {
    metal: metalPart,
    mc,
    stone,
    cgst: gstAmt / 2,
    sgst: gstAmt / 2,
    taxable,
    total,
    rate_per_gram: metalRate,
    net_weight: netWt,
    billable_weight_gm: billWt,
  }
}

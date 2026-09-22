import {
  applyPieceSlabToLine,
  applyPiecePricedLineCalc,
  computeLineBreakdown,
  isPiecePricedBillLine,
  isSilverGiftStockLine,
  isWeightBasedSilverGiftLine,
  lineHasPieceSlabFields,
  resolveErpSilverMetalRatePerG,
  type ErpRateSlab,
} from '@/lib/erp-billing-pricing'
import { applyGiftMrpPieceRate } from '@/lib/erp-gift-mrp-pricing'
import type { ErpBillLine } from '@/components/reseller/erp/erp-ui'
import type { ResellerSlabSettings } from '@/lib/catalog-slab-pricing'
import { perGramToDisplayRates } from '@/lib/erp-billing-pricing'

export type ExhibitionRecalcOpts = {
  slab: ErpRateSlab
  slabSettings: ResellerSlabSettings
  goldPerG: number
  silverPerG: number
  wholesaleGold?: number | null
  wholesaleSilver?: number | null
  displayRates?: unknown
  goldSlabRShowMc?: boolean
}

/** Same core math as live ERP billing — shared with offline exhibition HTML. */
export function recalcExhibitionBillLine(
  line: ErpBillLine,
  opts: ExhibitionRecalcOpts,
): ErpBillLine {
  if (isPiecePricedBillLine(line)) {
    const withMrp = applyGiftMrpPieceRate(line, opts.slab, opts.slabSettings)
    return { ...withMrp, ...applyPiecePricedLineCalc(withMrp) }
  }

  const rates =
    opts.displayRates ?? perGramToDisplayRates(opts.goldPerG, opts.silverPerG)
  const mcMode = opts.goldSlabRShowMc !== false
  const withOriginal: ErpBillLine = {
    ...line,
    originalWeightGm: line.originalWeightGm ?? line.weightGm,
  }
  const skipPieceSlabWeight =
    isWeightBasedSilverGiftLine(withOriginal) || isSilverGiftStockLine(withOriginal)
  const slabLine = skipPieceSlabWeight
    ? withOriginal
    : applyPieceSlabToLine(withOriginal, opts.slab)

  const bd = computeLineBreakdown(
    slabLine,
    rates,
    opts.slab,
    opts.slabSettings,
    opts.wholesaleGold ?? null,
    opts.wholesaleSilver ?? null,
    opts.goldPerG,
    opts.silverPerG,
    mcMode,
  )

  const next: ErpBillLine = {
    ...slabLine,
    lineTotalInr: bd.total,
    originalWeightGm: withOriginal.originalWeightGm,
  }

  const silverMetal = String(line.metal_type || '').toLowerCase().startsWith('silver')
  const silverOffset =
    opts.slab === 'R'
      ? Math.max(0, Number(opts.slabSettings.slab_r?.silver_rate_offset_per_g) || 0)
      : 0
  if (silverMetal && opts.slab === 'R' && silverOffset > 0) {
    next.ratePerGram = resolveErpSilverMetalRatePerG(
      opts.slab,
      opts.silverPerG,
      opts.wholesaleSilver ?? null,
      silverOffset,
    )
  } else if (!line.rateLocked) {
    const r = bd.rate_per_gram
    next.ratePerGram =
      r != null && Number.isFinite(r) ? Math.round(r * 100) / 100 : null
  }

  if (
    lineHasPieceSlabFields(line) &&
    silverMetal &&
    !isSilverGiftStockLine(line) &&
    !line.rateLocked &&
    next.ratePerGram == null
  ) {
    const r = bd.rate_per_gram
    if (r != null && Number.isFinite(r)) {
      next.ratePerGram = Math.round(r * 100) / 100
    }
  }

  return next
}

export function cartTotalsFromLines(lines: ErpBillLine[]) {
  let items = 0
  let weight = 0
  let net = 0
  for (const l of lines) {
    const qty = Math.max(1, Number(l.qty) || 1)
    items += qty
    const wt = Number(l.weightGm ?? l.originalWeightGm ?? 0) || 0
    weight += wt * qty
    net += Number(l.lineTotalInr) || 0
  }
  const gstPct = 3
  const subtotal = net > 0 ? Math.round(net / (1 + gstPct / 100)) : 0
  const gst = net - subtotal
  return { items, weight, subtotal, gst, netTotal: net }
}

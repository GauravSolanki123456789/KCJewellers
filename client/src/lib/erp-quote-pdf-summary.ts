import type { ErpBillLine } from '@/components/reseller/erp/erp-ui'
import type { ErpRateSlab } from '@/lib/erp-billing-pricing'
import { billingMcDisplay, billingMcPdfText, isGoldSlabRLine } from '@/lib/erp-billing-display'
import { isMcPerGmBillingType } from '@/lib/erp-mc-type-field'
import { erpMcBillingNetGm } from '@/lib/erp-manual-as-line-pricing'
import { pieceSlabMcRate } from '@/lib/erp-piece-slab-pricing'

/** Group key for summary estimate rows — same SKU/style/product/metal/MC slab. */
function summaryGroupKey(line: ErpBillLine): string {
  return [
    line.sku || '',
    line.style_code || '',
    line.name || '',
    line.metal_type || '',
    line.size || '',
    line.mc_type || '',
    String(line.mc_rate ?? ''),
    line.purity != null ? String(line.purity) : '',
  ]
    .join('|')
    .toLowerCase()
}

function effectiveMcRatePerUnitForPdf(line: ErpBillLine, rateSlab: ErpRateSlab): number | null {
  const slabMc = pieceSlabMcRate(line, rateSlab)
  if (slabMc != null && Number(slabMc) > 0) return Number(slabMc)
  const mcRaw = billingMcDisplay(line, rateSlab)
  const mc = typeof mcRaw === 'number' ? mcRaw : Number(mcRaw)
  if (!Number.isFinite(mc) || mc <= 0) return null
  return mc
}

/** MC column: catalog MC + slab MC R when both exist (manual/scanned rows with MC R). */
export function billingMcPdfTextWithSlabR(
  line: ErpBillLine,
  rateSlab: ErpRateSlab,
  goldSlabRShowMc = true,
): string {
  const slabMc = pieceSlabMcRate(line, rateSlab)
  if (slabMc == null || !(Number(slabMc) > 0)) {
    return billingMcPdfText(line, rateSlab, goldSlabRShowMc)
  }
  const catalog = Number(line.mc_rate_catalog ?? line.mc_rate ?? 0)
  const slabRounded = Math.round(Number(slabMc))
  if (catalog > 0 && Math.round(catalog) !== slabRounded) {
    return `${Math.round(catalog)} · MC R ${slabRounded}`
  }
  return String(slabRounded)
}

export function computeMcValueForPdf(line: ErpBillLine, rateSlab: ErpRateSlab): number | null {
  if (isGoldSlabRLine(line, rateSlab) && line.displayMcInr != null && line.displayMcInr > 0) {
    return Math.round(line.displayMcInr)
  }
  const mc = effectiveMcRatePerUnitForPdf(line, rateSlab)
  if (mc == null) return null
  if (!isMcPerGmBillingType(line.mc_type)) {
    const qty = Math.max(1, Number(line.qty) || 1)
    return Math.round(mc * qty)
  }
  const wt = erpMcBillingNetGm(line)
  if (wt <= 0) return null
  return Math.round(mc * wt)
}

function num(v: unknown): number {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

/** Collapse similar lines into one summary row with totals. */
export function groupBillLinesForSummaryPdf(lines: ErpBillLine[], rateSlab: ErpRateSlab): ErpBillLine[] {
  const groups = new Map<string, ErpBillLine[]>()
  for (const line of lines) {
    const key = summaryGroupKey(line)
    const bucket = groups.get(key)
    if (bucket) bucket.push(line)
    else groups.set(key, [line])
  }

  const out: ErpBillLine[] = []
  for (const group of groups.values()) {
    const first = group[0]
    let gross = 0
    let bagWt = 0
    let netOrig = 0
    let billWt = 0
    let pcs = 0
    let mcValue = 0
    let fixed = 0
    let amount = 0
    let hasGross = false
    let hasBag = false

    for (const line of group) {
      pcs += num(line.qty ?? 1)
      if (line.gross_weight != null) {
        gross += num(line.gross_weight)
        hasGross = true
      }
      if (line.bag_wt != null) {
        bagWt += num(line.bag_wt)
        hasBag = true
      }
      netOrig += num(line.originalWeightGm ?? line.weightGm)
      billWt += num(line.weightGm)
      const mv = computeMcValueForPdf(line, rateSlab)
      if (mv != null) mcValue += mv
      if (line.fixed_price != null && line.fixed_price > 0) fixed += num(line.fixed_price)
      if (line.lineTotalInr != null) amount += num(line.lineTotalInr)
    }

    out.push({
      ...first,
      barcode: group.length > 1 ? `${group.length} items` : first.barcode || first.code || '—',
      code: first.code,
      qty: pcs,
      gross_weight: hasGross ? Math.round(gross * 1000) / 1000 : null,
      bag_wt: hasBag ? Math.round(bagWt * 1000) / 1000 : null,
      originalWeightGm: netOrig > 0 ? Math.round(netOrig * 1000) / 1000 : first.originalWeightGm,
      weightGm: billWt > 0 ? Math.round(billWt * 1000) / 1000 : first.weightGm,
      lineTotalInr: amount > 0 ? amount : first.lineTotalInr,
      fixed_price: fixed > 0 ? fixed : first.fixed_price,
      /** Synthetic field for PDF MCValue column total */
      displayMcInr: mcValue > 0 ? mcValue : first.displayMcInr,
    })
  }
  return out
}

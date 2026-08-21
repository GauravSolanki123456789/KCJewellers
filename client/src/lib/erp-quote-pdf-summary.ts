import type { ErpBillLine } from '@/components/reseller/erp/erp-ui'
import type { ErpRateSlab } from '@/lib/erp-billing-pricing'
import { billingMcDisplay } from '@/lib/erp-billing-display'

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

export function computeMcValueForPdf(line: ErpBillLine, rateSlab: ErpRateSlab): number | null {
  const mcRaw = billingMcDisplay(line, rateSlab)
  const mc = typeof mcRaw === 'number' ? mcRaw : Number(mcRaw)
  if (!Number.isFinite(mc) || mc <= 0) return null
  const mcType = String(line.mc_type || '').toUpperCase()
  if (mcType.includes('/PC') || mcType === 'MC/PC' || mcType.includes('PER PC')) {
    return Math.round(mc)
  }
  const wt = line.weightGm
  if (wt == null || !Number.isFinite(Number(wt))) return null
  return Math.round(mc * Number(wt))
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
      if (mv != null) mcValue += mv * num(line.qty ?? 1)
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

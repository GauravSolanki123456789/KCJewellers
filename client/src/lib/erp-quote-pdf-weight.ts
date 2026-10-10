import type { ErpBillLine } from '@/components/reseller/erp/erp-ui'
import { billingWastageDisplay } from '@/lib/erp-billing-display'
import type { ErpRateSlab } from '@/lib/erp-billing-pricing'
import { isPiecePricedBillLine } from '@/lib/erp-billing-pricing'

/** Footer TOTAL WEIGHT — net×pcs (fixed rate) or (net+wastage%)×pcs (rate unfix). */
export function pdfFooterTotalWeightGm(
  lines: ErpBillLine[],
  ratesUnfixed: boolean,
  rateSlab: ErpRateSlab,
): number {
  let sum = 0
  for (const line of lines) {
    if (line.manualCategory === 'gift' || line.mrpMode || isPiecePricedBillLine(line)) continue
    const net = Number(line.originalWeightGm ?? line.weightGm) || 0
    const qty = Math.max(1, Number(line.qty) || 1)
    if (net <= 0) continue
    if (ratesUnfixed) {
      const wastRaw = billingWastageDisplay(line, rateSlab)
      const wast = typeof wastRaw === 'number' ? wastRaw : Number(wastRaw) || 0
      const perPc = wast > 0 ? net * (1 + wast / 100) : net
      sum += perPc * qty
    } else {
      sum += net * qty
    }
  }
  return Math.round(sum * 100) / 100
}

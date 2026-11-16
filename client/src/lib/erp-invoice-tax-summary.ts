import type { ErpBillLine } from '@/components/reseller/erp/erp-ui'
import { isShippingChargeLine } from '@/lib/erp-billing-shortcuts'

export function roundInr2(n: number): number {
  return Math.round(n * 100) / 100
}

/** GST-exempt ₹ in this invoice row (shipping merged under GIFT ITEMS, etc.). */
export function invoiceLineShippingExemptInr(line: ErpBillLine): number {
  if (isShippingChargeLine(line)) return Number(line.lineTotalInr) || 0
  const merged = Number(line.invoiceMergedShippingInr) || 0
  if (merged > 0) return merged
  return 0
}

export function lineAmountCountsTowardGst(
  line: ErpBillLine,
  displayTaxableInr: number,
): number {
  const exempt = invoiceLineShippingExemptInr(line)
  if (exempt <= 0) return displayTaxableInr
  return Math.max(0, roundInr2(displayTaxableInr - exempt))
}

export type MarlechaTaxSummary = {
  taxable: number
  gstAmt: number
  rawTotal: number
  roundedTotal: number
  roundOff: number
}

export function computeMarlechaTaxSummary(params: {
  lines: ErpBillLine[]
  lineDisplayTaxable: (line: ErpBillLine) => number
  gstOffOnBill: boolean
  targetNetInr: number
  fallbackGstInr?: number
}): MarlechaTaxSummary {
  const { lines, lineDisplayTaxable, gstOffOnBill, targetNetInr, fallbackGstInr } = params
  let taxable = 0
  let gstBase = 0
  for (const line of lines) {
    const amt = roundInr2(lineDisplayTaxable(line))
    taxable = roundInr2(taxable + amt)
    gstBase = roundInr2(gstBase + lineAmountCountsTowardGst(line, amt))
  }

  let gstAmt = 0
  if (!gstOffOnBill) {
    gstAmt = roundInr2(gstBase * 0.03)
  } else if (fallbackGstInr != null && Number.isFinite(fallbackGstInr)) {
    gstAmt = roundInr2(fallbackGstInr)
  }

  const rawTotal = roundInr2(taxable + gstAmt)
  const roundedTotal = Math.round(targetNetInr > 0 ? targetNetInr : rawTotal)
  const roundOff = roundInr2(roundedTotal - rawTotal)
  return { taxable, gstAmt, rawTotal, roundedTotal, roundOff }
}

/** Pick gift / shipping MRP row to absorb whole-rupee PDF drift (not paise round-off). */
export function findInvoiceShippingGiftAdjustIndex(lines: ErpBillLine[]): number {
  const shipIdx = lines.findIndex((l) => isShippingChargeLine(l))
  if (shipIdx >= 0) return shipIdx
  let mergedIdx = -1
  for (let i = 0; i < lines.length; i++) {
    if ((Number(lines[i]?.invoiceMergedShippingInr) || 0) > 0) mergedIdx = i
  }
  if (mergedIdx >= 0) return mergedIdx
  for (let i = lines.length - 1; i >= 0; i--) {
    const l = lines[i]!
    if (l.mrpMode || l.manualCategory === 'gift') return i
  }
  return lines.length > 0 ? lines.length - 1 : -1
}

/**
 * When shipping is on the bill, nudge the gift/shipping invoice row so Net matches the till
 * and Round Off stays within ±₹0.99 (paise only).
 */
export function reconcileInvoiceShippingGiftRowForTargetNet(
  groups: ErpBillLine[],
  targetNetInr: number,
  lineDisplayTaxable: (line: ErpBillLine) => number,
  gstOffOnBill: boolean,
): ErpBillLine[] {
  const hasShipping =
    groups.some((l) => isShippingChargeLine(l)) ||
    groups.some((l) => (Number(l.invoiceMergedShippingInr) || 0) > 0)
  if (!hasShipping) return groups

  const target = Math.round(targetNetInr)
  if (!target) return groups

  let working = groups.map((l) => ({ ...l }))
  for (let pass = 0; pass < 3; pass++) {
    const summary = computeMarlechaTaxSummary({
      lines: working,
      lineDisplayTaxable,
      gstOffOnBill,
      targetNetInr: target,
    })
    const drift = summary.roundedTotal - summary.rawTotal
    if (Math.abs(drift) < 1) return working

    const idx = findInvoiceShippingGiftAdjustIndex(working)
    if (idx < 0) return working

    const row = working[idx]!
    const base = Number(row.lineTotalInr) || 0
    /** Pull taxable display down/up — shipping is GST-exempt so ₹1 row ≈ ₹1 net. */
    const adjusted = Math.max(0, roundInr2(base + drift))
    working[idx] = {
      ...row,
      lineTotalInr: adjusted,
      invoiceMergedShippingInr:
        Number(row.invoiceMergedShippingInr) > 0 || isShippingChargeLine(row)
          ? adjusted
          : row.invoiceMergedShippingInr,
    }
  }
  return working
}
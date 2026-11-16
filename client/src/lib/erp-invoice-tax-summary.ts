import type { ErpBillLine } from '@/components/reseller/erp/erp-ui'
import { isShippingChargeLine } from '@/lib/erp-billing-shortcuts'

export function roundInr2(n: number): number {
  return Math.round(n * 100) / 100
}

/** Bill has a shipping charge (own row or merged under GIFT ITEMS on Marlecha PDF). */
export function invoiceHasShippingCharge(lines: ErpBillLine[]): boolean {
  return (
    lines.some((l) => isShippingChargeLine(l)) ||
    lines.some((l) => (Number(l.invoiceMergedShippingInr) || 0) > 0)
  )
}

export function invoiceShippingDisplayTaxableInr(
  line: ErpBillLine,
  gstOffOnBill: boolean,
): number {
  const total =
    isShippingChargeLine(line) || (Number(line.invoiceMergedShippingInr) || 0) > 0
      ? Number(line.lineTotalInr) || 0
      : 0
  if (total <= 0) return 0
  if (gstOffOnBill) return roundInr2(total)
  return roundInr2(total / 1.03)
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
  for (const line of lines) {
    const amt = roundInr2(lineDisplayTaxable(line))
    taxable = roundInr2(taxable + amt)
  }

  let gstAmt = 0
  if (!gstOffOnBill) {
    gstAmt = roundInr2(taxable * 0.03)
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
    /** Nudge shipping / gift row (pre-GST column is lineTotal/1.03 when GST is on). */
    const adjusted = Math.max(0, roundInr2(base + drift * 1.03))
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
import type { ErpBill, ErpBillLine } from '@/components/reseller/erp/erp-ui'
import { isEstimateBilled } from '@/lib/erp-estimate-status'
import { parseRateSlabFromNotes } from '@/lib/erp-billing-pricing'

export type EstimateDuplicateBarcode = {
  barcode: string
  product: string
  estimates: string[]
}

function lineBarcode(line: ErpBillLine): string {
  return String(line.barcode || line.code || '').trim()
}

export function findDuplicateBarcodesAcrossEstimates(bills: ErpBill[]): EstimateDuplicateBarcode[] {
  const byBarcode = new Map<string, { product: string; estimates: Set<string> }>()
  for (const bill of bills) {
    const quoteNo = bill.bill_number || `Estimate ${bill.id}`
    for (const line of bill.lines || []) {
      const bc = lineBarcode(line)
      if (!bc) continue
      const key = bc.toLowerCase()
      const row = byBarcode.get(key) || {
        product: line.name || line.sku || bc,
        estimates: new Set<string>(),
      }
      row.estimates.add(quoteNo)
      if (!row.product && line.name) row.product = line.name
      byBarcode.set(key, row)
    }
  }
  return [...byBarcode.entries()]
    .filter(([, v]) => v.estimates.size > 1)
    .map(([barcode, v]) => ({
      barcode,
      product: v.product,
      estimates: [...v.estimates],
    }))
}

export function validateEstimatesForCombinedBilling(bills: ErpBill[]): {
  ok: boolean
  error?: string
  duplicates?: EstimateDuplicateBarcode[]
} {
  if (bills.length < 2) {
    return { ok: false, error: 'Select at least two estimations to bill together.' }
  }
  const billed = bills.filter((b) => isEstimateBilled(b))
  if (billed.length) {
    return {
      ok: false,
      error: `Already billed: ${billed.map((b) => b.bill_number).join(', ')}`,
    }
  }
  const customers = new Set(
    bills.map((b) => String(b.customer_id || b.customer_name || '').trim()).filter(Boolean),
  )
  if (customers.size > 1) {
    return {
      ok: false,
      error: 'All selected estimations must be for the same customer.',
    }
  }
  const slabs = new Set(
    bills.map(
      (b) =>
        String(
          (b.session as { rateSlab?: string } | undefined)?.rateSlab ||
            parseRateSlabFromNotes(b.notes) ||
            'R',
        ).trim() || 'R',
    ),
  )
  if (slabs.size > 1) {
    return {
      ok: false,
      error: 'All selected estimations must use the same rate slab (R / W / F).',
    }
  }
  const duplicates = findDuplicateBarcodesAcrossEstimates(bills)
  if (duplicates.length) {
    return { ok: false, error: 'Duplicate barcodes across estimations.', duplicates }
  }
  return { ok: true }
}

export function mergeEstimateLines(bills: ErpBill[]): ErpBillLine[] {
  return bills.flatMap((b) =>
    (b.lines || []).map((line) => ({
      ...line,
      source_estimate_id: b.id,
      source_estimate_number: b.bill_number,
    })),
  )
}

export function formatDuplicateBarcodeMessage(duplicates: EstimateDuplicateBarcode[]): string {
  const rows = duplicates.map(
    (d) => `• ${d.barcode} (${d.product}) — in ${d.estimates.join(' & ')}`,
  )
  return `Cannot bill these estimations together — the same barcode appears in more than one quote:\n\n${rows.join('\n')}\n\nRemove or change the duplicate item in one estimation, then try again.`
}

export function combinedEstimateLabel(bills: ErpBill[]): string {
  return bills.map((b) => b.bill_number).filter(Boolean).join(', ')
}

import type { ErpBill, ErpBillLine } from '@/components/reseller/erp/erp-ui'
import { formatErpDateDdMmYyyy } from '@/lib/erp-date-format'
import type { ErpBillSession } from '@/lib/erp-bill-session'
import {
  computeErpQuoteTotals,
  enrichErpBillLinesForDisplay,
} from '@/lib/erp-quote-pdf'
import { formatErpInr } from '@/lib/reseller-erp-modules'

const LINE_HEADERS = [
  '#',
  'Barcode',
  'SKU',
  'Style',
  'Product',
  'W%',
  'Rate',
  'MC',
  'MCType',
  'MCValue',
  'PCS',
  'Metal',
  'Weight (g)',
  'HSN',
  'Amount (₹)',
] as const

function cell(v: string | number | null | undefined): string | number {
  if (v == null || v === '') return ''
  return v
}

function lineToRow(l: ErpBillLine, idx: number): (string | number)[] {
  const wPct = l.displayWastagePct ?? l.wastage_pct
  const mcVal = l.displayMcInr ?? l.mc_rate
  return [
    idx + 1,
    cell(l.barcode || l.code),
    cell(l.sku),
    cell(l.style_code),
    cell(l.name),
    cell(wPct),
    l.rateLocked ? '' : cell(l.ratePerGram),
    cell(l.mc_rate),
    cell(l.mc_type),
    cell(mcVal),
    cell(l.qty ?? 1),
    cell(l.metal_type),
    cell(l.weightGm),
    cell(l.hsn_code),
    cell(l.lineTotalInr),
  ]
}

function buildSummaryTable(
  bill: ErpBill,
  kind: 'estimate' | 'sale',
  session: ErpBillSession,
): (string | number)[][] {
  const label = kind === 'estimate' ? 'Estimate / Quotation' : 'Sales bill'
  return [
    ['Field', 'Value'],
    ['Document type', label],
    ['Bill number', bill.bill_number],
    ['Date', formatErpDateDdMmYyyy(bill.bill_date ?? bill.created_at)],
    ['Customer', bill.customer_name || ''],
    ['Mobile', session.mobile || ''],
    ['GSTIN', session.customerGst || ''],
    ['Address', session.address || ''],
    ['Rate slab', session.rateSlab || ''],
    ['Status', bill.status],
    ['Payment', session.paymentMethod || ''],
    ['Advance paid (₹)', session.advancePaidInr ?? ''],
    ['Collected (₹)', session.collectedAmountInr ?? ''],
    ['Net total (₹)', bill.total_inr ?? ''],
    ['Notes', bill.notes || ''],
  ]
}

function setColumnWidths(ws: import('xlsx').WorkSheet, widths: number[]) {
  ws['!cols'] = widths.map((wch) => ({ wch }))
}

export async function downloadBillDetailExcel(
  bill: ErpBill,
  kind: 'estimate' | 'sale',
  slabSettingsRaw?: unknown,
) {
  const XLSX = await import('xlsx')
  const session = (bill.session || {}) as ErpBillSession
  const enriched = enrichErpBillLinesForDisplay(bill, slabSettingsRaw)
  const totals = computeErpQuoteTotals({ ...bill, lines: enriched }, slabSettingsRaw)
  const title = kind === 'estimate' ? 'Quotation report' : 'Sales bill report'

  const rows: (string | number)[][] = []
  rows.push([title])
  rows.push([bill.bill_number, bill.customer_name || '', formatErpDateDdMmYyyy(bill.bill_date ?? bill.created_at)])
  rows.push([])
  rows.push(['Bill summary'])
  rows.push(...buildSummaryTable(bill, kind, session))
  rows.push([])
  rows.push(['Order summary — scanned line items'])
  rows.push([...LINE_HEADERS])
  if (enriched.length) {
    for (let i = 0; i < enriched.length; i++) {
      rows.push(lineToRow(enriched[i], i))
    }
  } else {
    rows.push(['(no line items)'])
  }
  rows.push([])
  rows.push(['Totals'])
  rows.push(['Items', totals.count])
  rows.push(['Total weight (g)', Math.round(totals.weight * 100) / 100])
  rows.push(['Subtotal (₹)', totals.subtotal])
  rows.push(['GST (₹)', totals.gst])
  rows.push(['Net total (₹)', totals.net])
  if (totals.advancePaid != null && totals.advancePaid > 0) {
    rows.push(['Advance paid (₹)', totals.advancePaid])
  }
  if (totals.balanceDue != null && totals.balanceDue > 0) {
    rows.push(['Balance due (₹)', totals.balanceDue])
  }

  const ws = XLSX.utils.aoa_to_sheet(rows)
  setColumnWidths(ws, [14, 18, 16, 14, 22, 8, 10, 10, 10, 10, 8, 10, 12, 10, 14])

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Report')

  const lineSheetRows: (string | number)[][] = [[...LINE_HEADERS]]
  for (let i = 0; i < enriched.length; i++) {
    lineSheetRows.push(lineToRow(enriched[i], i))
  }
  lineSheetRows.push([])
  lineSheetRows.push(['Items', totals.count, 'Net total', formatErpInr(totals.net)])
  const wsLines = XLSX.utils.aoa_to_sheet(lineSheetRows)
  setColumnWidths(wsLines, [6, 16, 18, 14, 22, 8, 10, 10, 10, 10, 8, 10, 12, 10, 14])
  XLSX.utils.book_append_sheet(wb, wsLines, 'Line items')

  const slug = bill.bill_number.replace(/\W+/g, '_')
  XLSX.writeFile(wb, `${slug}-${bill.customer_name?.replace(/\W+/g, '_') || 'customer'}.xlsx`)
}

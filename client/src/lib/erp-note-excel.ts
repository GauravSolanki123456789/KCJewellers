import type { ErpBill } from '@/components/reseller/erp/erp-ui'
import type { ErpBillSession } from '@/lib/erp-bill-session'
import { formatErpDateDdMmYyyy } from '@/lib/erp-date-format'
import { enrichReturnBillLinesForExport } from '@/lib/erp-sales-return'

const RETURN_LINE_HEADERS = [
  '#',
  'Source bill',
  'Barcode',
  'SKU',
  'Style',
  'Product',
  'Net wt (g)',
  'Met slab %',
  'Bill wt (g)',
  'Wast %',
  'Rate ₹/g',
  'MC',
  'MC type',
  'Metal ₹',
  'MC ₹',
  'Stone ₹',
  'Box ₹',
  'Taxable ₹',
  'GST ₹',
  'Line amount ₹',
  'Invoice item',
  'HSN',
  'Metal type',
  'Original billed ₹',
] as const

function cell(v: string | number | null | undefined): string | number {
  if (v == null || v === '') return ''
  return v
}

function setColumnWidths(ws: import('xlsx').WorkSheet, widths: number[]) {
  ws['!cols'] = widths.map((wch) => ({ wch }))
}

export async function downloadCreditDebitNoteExcel(
  bill: ErpBill,
  kind: 'credit' | 'debit',
  slabSettingsRaw?: unknown,
) {
  const XLSX = await import('xlsx')
  const session = (bill.session || {}) as ErpBillSession & {
    reason?: string
    remarks?: string
    againstBills?: string
    taxableInr?: number
    gstInr?: number
    rateMode?: string
    customGoldPerG?: number | null
    customSilverPerG?: number | null
    originalNet?: number
    customNet?: number
    returnWeightGm?: number
    rateSlab?: string
  }
  const title = kind === 'credit' ? 'Credit note' : 'Debit note'
  const enriched = enrichReturnBillLinesForExport(bill, slabSettingsRaw)

  const rows: (string | number)[][] = [
    [title],
    [],
    ['Document no.', bill.bill_number],
    ['Date', formatErpDateDdMmYyyy(bill.bill_date || bill.created_at)],
    ['Customer', bill.customer_name || ''],
    ['Mobile', session.mobile || ''],
    ['Against bill(s)', session.againstBills || ''],
    ['Rate slab', session.rateSlab || ''],
    ['Return rate mode', session.rateMode === 'custom' ? 'Custom rate' : 'Same billed rate'],
    ...(session.rateMode === 'custom'
      ? [
          ['Custom gold ₹/g', session.customGoldPerG ?? ''],
          ['Custom silver ₹/g', session.customSilverPerG ?? ''],
        ]
      : []),
    ['Reason', session.reason || ''],
    ['Remarks', session.remarks || bill.notes || ''],
    [],
    ['Summary'],
    ['Taxable amount', Number(session.taxableInr) || ''],
    ['GST', Number(session.gstInr) || ''],
    ['Net amount', Number(bill.total_inr) || 0],
    ...(session.originalNet != null ? [['Original billed net', session.originalNet]] : []),
    ...(session.returnWeightGm != null ? [['Return weight (g)', session.returnWeightGm]] : []),
    [],
    ['Returned products — calculation detail'],
    [...RETURN_LINE_HEADERS],
  ]

  if (enriched.length) {
    enriched.forEach((row, idx) => {
      const { line, breakdown, netWt, billWt, metSlabPct, metalRate } = row
      const gst = (Number(breakdown.cgst) || 0) + (Number(breakdown.sgst) || 0)
      rows.push([
        idx + 1,
        cell((line as { source_bill_number?: string }).source_bill_number),
        cell(line.barcode || line.code),
        cell(line.sku),
        cell(line.style_code),
        cell(line.name),
        cell(netWt),
        cell(metSlabPct),
        cell(billWt),
        cell(line.wastage_pct),
        cell(metalRate),
        cell(line.mc_rate),
        cell(line.mc_type),
        cell(Math.round((Number(breakdown.metal) || 0) * 100) / 100),
        cell(Math.round((Number(breakdown.mc) || 0) * 100) / 100),
        cell(Math.round((Number(breakdown.stone) || 0) * 100) / 100),
        cell(Math.round((Number(line.box_charges) || 0) * 100) / 100),
        cell(Math.round((Number(breakdown.taxable) || 0) * 100) / 100),
        cell(Math.round(gst * 100) / 100),
        cell(Math.round((Number(line.lineTotalInr) || Number(breakdown.total) || 0) * 100) / 100),
        cell(line.invoice_item_name),
        cell(line.hsn_code),
        cell(line.metal_type),
        cell((line as { originalTotalInr?: number }).originalTotalInr),
      ])
    })
  } else {
    rows.push(['(no line items)'])
  }

  rows.push([])
  rows.push(['Items', enriched.length])
  rows.push(['Net total (₹)', Number(bill.total_inr) || 0])

  const ws = XLSX.utils.aoa_to_sheet(rows)
  setColumnWidths(ws, [22, 36])

  const lineSheetRows: (string | number)[][] = [[...RETURN_LINE_HEADERS]]
  enriched.forEach((row, idx) => {
    const { line, breakdown, netWt, billWt, metSlabPct, metalRate } = row
    const gst = (Number(breakdown.cgst) || 0) + (Number(breakdown.sgst) || 0)
    lineSheetRows.push([
      idx + 1,
      cell((line as { source_bill_number?: string }).source_bill_number),
      cell(line.barcode || line.code),
      cell(line.sku),
      cell(line.style_code),
      cell(line.name),
      cell(netWt),
      cell(metSlabPct),
      cell(billWt),
      cell(line.wastage_pct),
      cell(metalRate),
      cell(line.mc_rate),
      cell(line.mc_type),
      cell(Math.round((Number(breakdown.metal) || 0) * 100) / 100),
      cell(Math.round((Number(breakdown.mc) || 0) * 100) / 100),
      cell(Math.round((Number(breakdown.stone) || 0) * 100) / 100),
      cell(Math.round((Number(line.box_charges) || 0) * 100) / 100),
      cell(Math.round((Number(breakdown.taxable) || 0) * 100) / 100),
      cell(Math.round(gst * 100) / 100),
      cell(Math.round((Number(line.lineTotalInr) || Number(breakdown.total) || 0) * 100) / 100),
      cell(line.invoice_item_name),
      cell(line.hsn_code),
      cell(line.metal_type),
      cell((line as { originalTotalInr?: number }).originalTotalInr),
    ])
  })

  const wsLines = XLSX.utils.aoa_to_sheet(lineSheetRows)
  setColumnWidths(wsLines, [4, 12, 16, 14, 12, 20, 10, 10, 10, 8, 10, 8, 10, 10, 10, 10, 10, 10, 10, 12, 18, 10, 12, 12])

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, title)
  XLSX.utils.book_append_sheet(wb, wsLines, 'Line items')

  const slug = bill.bill_number.replace(/\W+/g, '_')
  XLSX.writeFile(wb, `${slug}.xlsx`)
}

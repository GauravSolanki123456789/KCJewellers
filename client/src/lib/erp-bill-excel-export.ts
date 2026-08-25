import type { ErpBill, ErpBillLine } from '@/components/reseller/erp/erp-ui'
import { formatErpDateDdMmYyyy } from '@/lib/erp-date-format'
import type { ErpBillSession } from '@/lib/erp-bill-session'

function lineRow(l: ErpBillLine, idx: number) {
  return {
    '#': idx + 1,
    Barcode: l.barcode || l.code || '',
    SKU: l.sku || '',
    Style: l.style_code || '',
    Product: l.name || '',
    'Invoice item': l.invoice_item_name || '',
    HSN: l.hsn_code || '',
    Size: l.size ?? '',
    Qty: l.qty ?? 1,
    'Weight (g)': l.weightGm ?? '',
    Purity: l.purity ?? '',
    'Wastage %': l.wastage_pct ?? '',
    'Rate/g': l.ratePerGram ?? '',
    'MC rate': l.mc_rate ?? '',
    'MC type': l.mc_type ?? '',
    Metal: l.metal_type || '',
    'Line total (₹)': l.lineTotalInr ?? '',
  }
}

export async function downloadBillDetailExcel(bill: ErpBill, kind: 'estimate' | 'sale') {
  const XLSX = await import('xlsx')
  const session = (bill.session || {}) as ErpBillSession
  const label = kind === 'estimate' ? 'Estimate' : 'Sales bill'

  const summaryRows = [
    { Field: 'Type', Value: label },
    { Field: 'Bill number', Value: bill.bill_number },
    { Field: 'Date', Value: formatErpDateDdMmYyyy(bill.bill_date ?? bill.created_at) },
    { Field: 'Customer', Value: bill.customer_name || '' },
    { Field: 'Mobile', Value: session.mobile || '' },
    { Field: 'GSTIN', Value: session.customerGst || '' },
    { Field: 'Address', Value: session.address || '' },
    { Field: 'Rate slab', Value: session.rateSlab || '' },
    { Field: 'Status', Value: bill.status },
    { Field: 'Net total (₹)', Value: bill.total_inr },
    { Field: 'Advance paid (₹)', Value: session.advancePaidInr ?? '' },
    { Field: 'Collected (₹)', Value: session.collectedAmountInr ?? '' },
    { Field: 'Payment', Value: session.paymentMethod || '' },
    { Field: 'Notes', Value: bill.notes || '' },
  ]

  const lines = (bill.lines || []).map(lineRow)
  const wsSummary = XLSX.utils.json_to_sheet(summaryRows)
  const wsLines = XLSX.utils.json_to_sheet(
    lines.length ? lines : [{ Barcode: '(no line items)' }],
  )
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, wsSummary, 'Summary')
  XLSX.utils.book_append_sheet(wb, wsLines, 'Line items')
  const slug = bill.bill_number.replace(/\W+/g, '_')
  XLSX.writeFile(wb, `${slug}-${bill.customer_name?.replace(/\W+/g, '_') || 'customer'}.xlsx`)
}

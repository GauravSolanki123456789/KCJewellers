import type { ErpBill } from '@/components/reseller/erp/erp-ui'
import type { ErpBillSession } from '@/lib/erp-bill-session'
import { formatErpDateDdMmYyyy } from '@/lib/erp-date-format'

export async function downloadCreditDebitNoteExcel(bill: ErpBill, kind: 'credit' | 'debit') {
  const XLSX = await import('xlsx')
  const session = (bill.session || {}) as ErpBillSession & {
    reason?: string
    remarks?: string
    againstBills?: string
    taxableInr?: number
    gstInr?: number
  }
  const title = kind === 'credit' ? 'Credit note' : 'Debit note'
  const rows: (string | number)[][] = [
    [title],
    [],
    ['Document no.', bill.bill_number],
    ['Date', formatErpDateDdMmYyyy(bill.bill_date || bill.created_at)],
    ['Customer', bill.customer_name || ''],
    ['Against bill(s)', session.againstBills || ''],
    ['Reason', session.reason || ''],
    ['Remarks', session.remarks || bill.notes || ''],
    [],
    ['Taxable amount', Number(session.taxableInr) || ''],
    ['GST', Number(session.gstInr) || ''],
    ['Net amount', Number(bill.total_inr) || 0],
  ]
  const ws = XLSX.utils.aoa_to_sheet(rows)
  ws['!cols'] = [{ wch: 22 }, { wch: 36 }]
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, title)
  const slug = bill.bill_number.replace(/\W+/g, '_')
  XLSX.writeFile(wb, `${slug}.xlsx`)
}

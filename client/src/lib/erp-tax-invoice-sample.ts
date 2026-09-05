import type { ErpBill } from '@/components/reseller/erp/erp-ui'

/** Sample bill matching Marlecha paper invoice for template preview. */
export function sampleBillForTaxInvoicePreview(): ErpBill {
  return {
    id: 0,
    bill_number: 'SA1361',
    bill_type: 'sale',
    status: 'final',
    bill_date: '2026-09-05',
    created_at: '2026-09-05T00:00:00.000Z',
    customer_name: 'G.DIVYA LAKSHMI REDDY',
    total_inr: 6706,
    lines: [
      {
        name: 'SILVER ARTICLES',
        invoice_item_name: 'SILVER ARTICLES',
        hsn_code: '711411',
        weightGm: 16,
        gross_weight: 16,
        lineTotalInr: 6511,
        qty: 1,
      },
    ],
    session: {
      placeOfSupply: '37 - Andhra Pradesh',
      paymentMethod: 'upi',
      address:
        'DR.NO.86-2-21/C5, 3RD FLOOR K.V.N.R.PLAZA\nSANGEETHA VENKAT REDDY STREET\nJ.N.ROAD\nRAJAMUNDRY\nANDHRA PRADESH - 533103',
    },
  }
}

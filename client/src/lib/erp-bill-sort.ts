import type { ErpBill } from '@/components/reseller/erp/erp-ui'

export function erpBillSeq(billNumber: string | undefined): number {
  const m = String(billNumber || '').match(/(\d+)\s*$/)
  return m ? parseInt(m[1], 10) : 0
}

/** Newest bill numbers first (ESTIMATE-0005 → ESTIMATE-0001). */
export function sortErpBillsDesc(list: ErpBill[]): ErpBill[] {
  return [...list].sort((a, b) => {
    const sa = erpBillSeq(a.bill_number)
    const sb = erpBillSeq(b.bill_number)
    if (sa !== sb) return sb - sa
    return b.id - a.id
  })
}

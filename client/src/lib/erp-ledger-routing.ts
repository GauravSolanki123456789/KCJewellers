/** Route completed sales without valid GSTIN to Hitesh/Jainav ledger (not official SALE bills). */

export type ErpPaymentMethod = 'cash' | 'upi' | 'gpay' | 'card' | 'bank' | 'mixed'

export function hasValidGstin(gst: string | null | undefined): boolean {
  const s = String(gst || '').trim().toUpperCase()
  return /^[0-9]{2}[A-Z0-9]{13}$/.test(s)
}

export function previewLedgerLane(
  paymentMethod: ErpPaymentMethod,
  cashAmountInr?: string | number | null,
  onlineAmountInr?: string | number | null,
): 'hitesh' | 'jainav' {
  if (paymentMethod === 'mixed') {
    const online = Number(onlineAmountInr) || 0
    return online > 0 ? 'hitesh' : 'jainav'
  }
  if (['upi', 'gpay', 'card', 'bank'].includes(paymentMethod)) return 'hitesh'
  return 'jainav'
}

export function shouldRouteSaleToShadow(session: {
  customerGst?: string | null
  paymentMethod?: string | null
  onlineAmountInr?: number | string | null
}): boolean {
  if (!hasValidGstin(session.customerGst)) return true
  const pay = String(session.paymentMethod || 'cash').trim().toLowerCase()
  if (pay === 'cash') return true
  if (pay === 'mixed') return !(Number(session.onlineAmountInr) > 0)
  return false
}

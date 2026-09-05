/** Route completed sales without valid GSTIN to Hitesh/Jainav ledger (not official SALE bills). */

export type ErpPaymentMethod = 'cash' | 'upi' | 'gpay' | 'card' | 'bank' | 'mixed'

export function hasValidGstin(gst: string | null | undefined): boolean {
  const s = String(gst || '').trim().toUpperCase()
  return /^[0-9]{2}[A-Z0-9]{13}$/.test(s)
}

export function previewLedgerLane(
  paymentMethod: ErpPaymentMethod,
  collectedAmountInr?: string | number | null,
): 'hitesh' | 'jainav' {
  if (paymentMethod === 'cash') {
    const n = Number(collectedAmountInr)
    if (Number.isFinite(n) && collectedAmountInr != null && String(collectedAmountInr).trim() !== '') {
      return 'jainav'
    }
  }
  return 'hitesh'
}

/** Cash bills with amount received go to Jainav ledger; all other payments → official GST (SCB001…). */
export function shouldRouteSaleToShadow(session: {
  customerGst?: string | null
  paymentMethod?: string | null
  collectedAmountInr?: number | string | null
}): boolean {
  const pay = String(session.paymentMethod || 'bank').trim().toLowerCase()
  if (pay !== 'cash') return false
  const collected = session.collectedAmountInr
  if (collected == null || String(collected).trim() === '') return false
  const n = Number(collected)
  return Number.isFinite(n) && n >= 0
}

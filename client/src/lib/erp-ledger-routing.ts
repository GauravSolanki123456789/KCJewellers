/** Route completed sales without valid GSTIN to Hitesh/Jainav ledger (not official SALE bills). */

export type ErpPaymentMethod = 'cash' | 'upi' | 'gpay' | 'card' | 'bank' | 'mixed'

export function hasValidGstin(gst: string | null | undefined): boolean {
  const s = String(gst || '').trim().toUpperCase()
  return /^[0-9]{2}[A-Z0-9]{13}$/.test(s)
}

export function previewLedgerLane(
  paymentMethod: ErpPaymentMethod,
  collectedAmountInr?: string | number | null,
  jainavModeUnlocked = false,
): 'hitesh' | 'jainav' {
  if (jainavModeUnlocked) return 'jainav'
  const pay = String(paymentMethod || '').trim().toLowerCase()
  const raw = collectedAmountInr
  const collectedSet = raw != null && String(raw).trim() !== '' && Number.isFinite(Number(raw))
  return pay === 'cash' && collectedSet ? 'jainav' : 'hitesh'
}

/** Jainav unlock, or cash + cash-received amount, routes the sale to the SCB lane. */
export function shouldRouteSaleToShadow(session: {
  customerGst?: string | null
  paymentMethod?: string | null
  collectedAmountInr?: number | string | null
  jainavModeUnlocked?: boolean
}): boolean {
  if (session.jainavModeUnlocked) return true
  const pay = String(session.paymentMethod || '').trim().toLowerCase()
  const raw = session.collectedAmountInr
  const collectedSet = raw != null && String(raw).trim() !== '' && Number.isFinite(Number(raw))
  return pay === 'cash' && collectedSet
}

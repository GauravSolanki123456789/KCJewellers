/** Route completed sales without valid GSTIN to Hitesh/Jainav ledger (not official SALE bills). */

export type ErpPaymentMethod = 'cash' | 'upi' | 'gpay' | 'card' | 'bank' | 'mixed'

export function hasValidGstin(gst: string | null | undefined): boolean {
  const s = String(gst || '').trim().toUpperCase()
  return /^[0-9]{2}[A-Z0-9]{13}$/.test(s)
}

export function previewLedgerLane(
  _paymentMethod: ErpPaymentMethod,
  _collectedAmountInr?: string | number | null,
  jainavModeUnlocked = false,
): 'hitesh' | 'jainav' {
  return jainavModeUnlocked ? 'jainav' : 'hitesh'
}

/** Only an unlocked Jainav session routes a sale to the lane / SCB ledger. */
export function shouldRouteSaleToShadow(session: {
  customerGst?: string | null
  paymentMethod?: string | null
  collectedAmountInr?: number | string | null
  jainavModeUnlocked?: boolean
}): boolean {
  return !!session.jainavModeUnlocked
}

/** Human-readable ledger transaction type (no internal shadow labels). */
export function formatLedgerTransactionKind(kind: string | null | undefined): string {
  const k = String(kind || '').trim().toLowerCase()
  if (!k || k === 'shadow_sale') return 'Sale'
  if (k === 'sale') return 'Sale'
  if (k === 'payment_in') return 'Payment'
  if (k === 'payment_out') return 'Payment out'
  if (k === 'bill_advance') return 'Advance'
  if (k === 'suspense_in') return 'Suspense'
  if (k === 'adjustment') return 'Adjustment'
  return k.replace(/_/g, ' ')
}

/** PDF-safe INR prefix (Helvetica lacks ₹ glyph — avoids superscript artifacts). */
export function formatPdfInr(amount: number | null | undefined): string {
  if (amount == null || !Number.isFinite(Number(amount))) return '—'
  return `Rs. ${Math.round(Number(amount)).toLocaleString('en-IN')}`
}

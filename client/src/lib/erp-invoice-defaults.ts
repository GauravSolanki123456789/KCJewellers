export function defaultInvoiceItemName(metalType?: string | null, productName?: string | null): string {
  const m = (metalType || '').toLowerCase()
  if (m.includes('gold')) return 'GOLD JEWELLERY'
  if (m.includes('silver') && m.includes('bullion')) return 'SILVER BULLION'
  if (m.includes('silver')) return 'SILVER JEWELLERY'
  if (m.includes('platinum')) return 'PLATINUM JEWELLERY'
  if (m.includes('diamond') || m.includes('fancy')) return 'FANCY JEWELLERY'
  const name = (productName || '').toLowerCase()
  if (name.includes('silver')) return 'SILVER JEWELLERY'
  if (name.includes('gold')) return 'GOLD JEWELLERY'
  return 'JEWELLERY'
}

export function defaultHsnCode(metalType?: string | null): string {
  const m = (metalType || '').toLowerCase()
  if (m.includes('gold')) return '711319'
  if (m.includes('bullion')) return '710692'
  return '711311'
}

export type SoldBillConflict = {
  barcode: string
  source?: string
  sold_bill?: {
    bill_id?: number
    bill_number?: string
    customer_name?: string | null
    mobile?: string | null
    address?: string | null
    bill_date?: string | null
    created_at?: string | null
    total_inr?: number | null
    status?: string | null
  } | null
}

export function formatSoldStockMessage(conflicts: SoldBillConflict[]): string {
  if (!conflicts.length) return 'This item is already sold.'
  const lines = conflicts.map((c) => {
    const b = c.sold_bill
    if (!b) return `${c.barcode}: already sold`
    const parts = [
      b.bill_number ? `Bill ${b.bill_number}` : null,
      b.customer_name ? `Customer: ${b.customer_name}` : null,
      b.mobile ? `Mob: ${b.mobile}` : null,
      b.address ? `Address: ${b.address}` : null,
      b.total_inr != null ? `Amount: ₹${Math.round(b.total_inr).toLocaleString('en-IN')}` : null,
    ].filter(Boolean)
    return `${c.barcode} — ${parts.join(' · ')}`
  })
  return `Stock already sold:\n${lines.join('\n')}`
}

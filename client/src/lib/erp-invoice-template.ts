export type ErpInvoiceTemplateId = 'marlecha' | 'default'

export function resolveInvoiceTemplateId(
  brandLabel: string,
  gstLegalName?: string | null,
  settingsTemplate?: string | null,
): ErpInvoiceTemplateId {
  const configured = String(settingsTemplate || '').trim().toLowerCase()
  if (configured === 'marlecha') return 'marlecha'
  if (configured === 'default') return 'default'
  const hay = `${brandLabel} ${gstLegalName || ''}`.toUpperCase()
  if (hay.includes('MARLECHA')) return 'marlecha'
  return 'default'
}

export function panFromGstin(gstin?: string | null): string {
  const s = String(gstin || '').trim().toUpperCase()
  if (s.length < 12) return ''
  return s.slice(2, 12)
}

export function gstStateCodeFromGstin(gstin?: string | null): string {
  const s = String(gstin || '').trim()
  return s.length >= 2 ? s.slice(0, 2) : ''
}

export function parsePlaceOfSupplyStateCode(place?: string | null): string {
  const s = String(place || '').trim()
  const m = s.match(/^(\d{2})\b/)
  return m ? m[1] : ''
}

export function isInterstateSupply(opts: {
  sellerGstin?: string | null
  placeOfSupply?: string | null
  buyerGstin?: string | null
}): boolean {
  const seller = gstStateCodeFromGstin(opts.sellerGstin)
  if (!seller) return false
  const buyer = gstStateCodeFromGstin(opts.buyerGstin)
  if (buyer) return buyer !== seller
  const pos = parsePlaceOfSupplyStateCode(opts.placeOfSupply)
  if (pos) return pos !== seller
  return false
}

export function paymentMethodInvoiceLabel(method?: string | null): string {
  const m = String(method || '').trim().toLowerCase()
  if (m === 'upi') return 'G.PAY'
  if (m === 'bank') return 'BANK TRANSFER'
  if (m === 'cash') return 'CASH'
  if (m === 'mixed') return 'MIXED'
  if (m === 'card') return 'CARD'
  return m ? m.toUpperCase() : 'CASH'
}

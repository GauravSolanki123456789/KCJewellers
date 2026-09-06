/** Indian GST state codes → place-of-supply label (e.g. "33 - Tamil Nadu"). */

export const GST_STATE_OPTIONS: { code: string; name: string }[] = [
  { code: '01', name: 'Jammu & Kashmir' },
  { code: '02', name: 'Himachal Pradesh' },
  { code: '03', name: 'Punjab' },
  { code: '04', name: 'Chandigarh' },
  { code: '05', name: 'Uttarakhand' },
  { code: '06', name: 'Haryana' },
  { code: '07', name: 'Delhi' },
  { code: '08', name: 'Rajasthan' },
  { code: '09', name: 'Uttar Pradesh' },
  { code: '10', name: 'Bihar' },
  { code: '11', name: 'Sikkim' },
  { code: '12', name: 'Arunachal Pradesh' },
  { code: '13', name: 'Nagaland' },
  { code: '14', name: 'Manipur' },
  { code: '15', name: 'Mizoram' },
  { code: '16', name: 'Tripura' },
  { code: '17', name: 'Meghalaya' },
  { code: '18', name: 'Assam' },
  { code: '19', name: 'West Bengal' },
  { code: '20', name: 'Jharkhand' },
  { code: '21', name: 'Odisha' },
  { code: '22', name: 'Chhattisgarh' },
  { code: '23', name: 'Madhya Pradesh' },
  { code: '24', name: 'Gujarat' },
  { code: '26', name: 'Dadra & Nagar Haveli and Daman & Diu' },
  { code: '27', name: 'Maharashtra' },
  { code: '29', name: 'Karnataka' },
  { code: '30', name: 'Goa' },
  { code: '31', name: 'Lakshadweep' },
  { code: '32', name: 'Kerala' },
  { code: '33', name: 'Tamil Nadu' },
  { code: '34', name: 'Puducherry' },
  { code: '35', name: 'Andaman & Nicobar Islands' },
  { code: '36', name: 'Telangana' },
  { code: '37', name: 'Andhra Pradesh' },
  { code: '38', name: 'Ladakh' },
]

const BY_CODE = new Map(GST_STATE_OPTIONS.map((s) => [s.code, s.name]))
const BY_NAME = new Map(GST_STATE_OPTIONS.map((s) => [s.name.toUpperCase(), s.name]))

export function formatPlaceOfSupply(stateCode?: string | null, stateName?: string | null): string {
  const code = String(stateCode || '').trim().padStart(2, '0').slice(0, 2)
  const name = String(stateName || '').trim()
  if (code && BY_CODE.has(code)) return `${code} - ${BY_CODE.get(code)}`
  if (name) {
    const hit = BY_NAME.get(name.toUpperCase())
    if (hit) {
      const c = GST_STATE_OPTIONS.find((s) => s.name === hit)?.code
      return c ? `${c} - ${hit}` : name
    }
    return name
  }
  return ''
}

export function placeOfSupplyFromGstin(gstin?: string | null): string {
  const g = String(gstin || '').trim()
  if (g.length < 2) return ''
  return formatPlaceOfSupply(g.slice(0, 2), null)
}

export function inferStateNameFromText(text?: string | null): string | null {
  const hay = String(text || '').toUpperCase()
  for (const s of GST_STATE_OPTIONS) {
    if (hay.includes(s.name.toUpperCase())) return s.name
  }
  return null
}

export function resolveCustomerPlaceOfSupply(params: {
  customerState?: string | null
  customerGstin?: string | null
  resellerDefault?: string | null
  sellerGstin?: string | null
}): string {
  const fromState = formatPlaceOfSupply(null, params.customerState)
  if (fromState) return fromState
  const fromGst = placeOfSupplyFromGstin(params.customerGstin)
  if (fromGst) return fromGst
  const reseller = String(params.resellerDefault || '').trim()
  if (reseller) return reseller
  const seller = placeOfSupplyFromGstin(params.sellerGstin)
  if (seller) return seller
  return '33 - Tamil Nadu'
}

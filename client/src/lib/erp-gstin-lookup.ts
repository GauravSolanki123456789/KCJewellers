import axios from '@/lib/axios'
import { GST_STATE_OPTIONS } from '@/lib/erp-place-of-supply'

export type ErpGstinLookupDetails = {
  gstin: string
  name?: string
  legal_name?: string
  trade_name?: string
  pan?: string
  address?: string
  state?: string
  state_code?: string
  place_of_supply?: string
  mobile?: string
  company_status?: string
}

export async function fetchErpGstinDetails(gstin: string): Promise<ErpGstinLookupDetails> {
  const res = await axios.post<{ success: boolean; details: ErpGstinLookupDetails }>(
    '/api/reseller/erp/gstin-lookup',
    { gstin: gstin.trim().toUpperCase() },
  )
  return res.data.details
}

/** Match GSTZen state name to CRM dropdown option. */
export function matchGstStateName(raw?: string | null): string {
  const hay = String(raw || '').trim()
  if (!hay) return ''
  const exact = GST_STATE_OPTIONS.find((s) => s.name.toLowerCase() === hay.toLowerCase())
  if (exact) return exact.name
  const partial = GST_STATE_OPTIONS.find((s) => hay.toLowerCase().includes(s.name.toLowerCase()))
  return partial?.name || hay
}

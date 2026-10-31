import axios from '@/lib/axios'

export type CrmOccasion = 'birthday' | 'anniversary' | 'custom'

export type CrmCampaign = {
  id: number
  occasion: CrmOccasion | string
  name: string
  message: string
  image_url?: string | null
  discount_pct: number
  coupon_code?: string | null
  uses_per_year: number
  is_active: boolean
}

export type CrmScheme = {
  id: number
  name: string
  details?: string | null
  sort_order: number
  is_active: boolean
}

export type SchemeTick = {
  scheme_id: number
  explained?: boolean
  interested?: boolean
  joined?: boolean
}

export async function fetchCrmCampaigns(): Promise<CrmCampaign[]> {
  const { data } = await axios.get<{ campaigns: CrmCampaign[] }>('/api/reseller/erp/crm/campaigns')
  return data.campaigns || []
}

export async function saveCrmCampaign(
  payload: Partial<CrmCampaign> & { name: string },
  id?: number,
): Promise<CrmCampaign> {
  if (id) {
    const { data } = await axios.put<{ campaign: CrmCampaign }>(`/api/reseller/erp/crm/campaigns/${id}`, payload)
    return data.campaign
  }
  const { data } = await axios.post<{ campaign: CrmCampaign }>('/api/reseller/erp/crm/campaigns', payload)
  return data.campaign
}

export async function deleteCrmCampaign(id: number): Promise<void> {
  await axios.delete(`/api/reseller/erp/crm/campaigns/${id}`)
}

export async function uploadCrmCampaignImage(id: number, file: File): Promise<CrmCampaign> {
  const form = new FormData()
  form.append('image', file)
  const { data } = await axios.post<{ campaign: CrmCampaign }>(
    `/api/reseller/erp/crm/campaigns/${id}/image`,
    form,
    { headers: { 'Content-Type': 'multipart/form-data' } },
  )
  return data.campaign
}

export async function sendCrmCampaign(body: {
  customer_id: number
  campaign_id?: number
  occasion?: CrmOccasion | string
}): Promise<{
  success: boolean
  sent_via: string
  message: string
  wa_href: string | null
  cloud_error?: string | null
}> {
  const { data } = await axios.post('/api/reseller/erp/crm/campaigns/send', body)
  return data
}

export async function fetchCrmSchemes(activeOnly = false): Promise<CrmScheme[]> {
  const { data } = await axios.get<{ schemes: CrmScheme[] }>('/api/reseller/erp/crm/schemes', {
    params: activeOnly ? { active: '1' } : {},
  })
  return data.schemes || []
}

export async function saveCrmScheme(
  payload: Partial<CrmScheme> & { name: string },
  id?: number,
): Promise<CrmScheme> {
  if (id) {
    const { data } = await axios.put<{ scheme: CrmScheme }>(`/api/reseller/erp/crm/schemes/${id}`, payload)
    return data.scheme
  }
  const { data } = await axios.post<{ scheme: CrmScheme }>('/api/reseller/erp/crm/schemes', payload)
  return data.scheme
}

export async function deleteCrmScheme(id: number): Promise<void> {
  await axios.delete(`/api/reseller/erp/crm/schemes/${id}`)
}

export type SchemeStats = {
  schemes: { id: number; name: string; explained: number; interested: number; joined: number }[]
  totals: { explained: number; interested: number; joined: number }
  join_rate_pct: number
  by_operator?: {
    operator_id: number | null
    name: string
    explained: number
    interested: number
    joined: number
    join_rate_pct: number
  }[]
}

export async function fetchSchemeStats(from?: string, to?: string): Promise<SchemeStats> {
  const { data } = await axios.get<SchemeStats>('/api/reseller/erp/crm/scheme-stats', {
    params: { from, to },
  })
  return data
}

export async function deleteSchemeActivityLogs(operatorId?: number | null): Promise<void> {
  await axios.delete('/api/reseller/erp/crm/scheme-logs', {
    data: operatorId != null ? { operator_id: operatorId } : { operator_id: null, clear_unassigned: false },
  })
}

import axios from '@/lib/axios'

export type MetalRoutingCounter = {
  id: number
  name: string
  slug: string
  sort_order: number
  is_active: boolean
  incharge_operator_id: number | null
  incharge?: { id: number; displayName: string } | null
}

export type MetalPurity = {
  id: number
  metal_type: 'gold' | 'silver' | string
  label: string
  default_charge_pct: number | null
  sort_order: number
  is_active: boolean
}

export type MetalStockLot = {
  id: number
  metal_type: string
  purity_id: number | null
  purity?: { id: number; label: string; metal_type: string } | null
  counter_id: number | null
  counter?: { id: number; name: string } | null
  operator_id: number | null
  operator?: { id: number; displayName: string } | null
  parent_lot_id: number | null
  gross_gm: number
  charge_pct: number | null
  pure_gm: number
  status: string
  notes: string | null
  move_date: string
  from_customer_id?: number | null
  from_customer?: { id: number; name: string; mobile?: string | null } | null
  held_by_customer_id?: number | null
  held_by_customer?: { id: number; name: string; mobile?: string | null } | null
  created_at?: string
  updated_at?: string
}

export type MetalLotEvent = {
  id: number
  lot_id: number
  event_type: string
  gross_gm: number | null
  from_counter_name?: string | null
  to_counter_name?: string | null
  from_operator_name?: string | null
  to_operator_name?: string | null
  from_customer?: { id: number; name: string; mobile?: string | null } | null
  to_customer?: { id: number; name: string; mobile?: string | null } | null
  notes?: string | null
  created_at: string
}

export type MetalLotJourney = {
  root_lot_id: number
  lot: MetalStockLot
  lots: MetalStockLot[]
  events: MetalLotEvent[]
}

export type MetalRoutingBootstrap = {
  role: 'admin' | 'manager' | 'counter' | 'viewer'
  manager: { id: number; displayName: string } | null
  counters: MetalRoutingCounter[]
  myCounterIds: number[]
  isMetalRoutingManager?: boolean
}

export type MetalStockReportRow = {
  counter_id: number | null
  counter_name: string
  purity_id: number | null
  purity_label: string
  opening_pure_gm: number
  received_pure_gm: number
  closing_pure_gm: number
}

export type MetalStaffReport = {
  from: string
  to: string
  operator: { id: number; displayName: string }
  summary: {
    movement_count: number
    total_pure_gm: number
    received_pure_gm: number
    split_pure_gm: number
  }
  movements: MetalStockLot[]
}

const BASE = '/api/reseller/erp/metal-routing'

export async function fetchMetalRoutingBootstrap(): Promise<MetalRoutingBootstrap> {
  const { data } = await axios.get<MetalRoutingBootstrap>(`${BASE}/bootstrap`)
  return data
}

export async function fetchMetalCounters(): Promise<MetalRoutingCounter[]> {
  const { data } = await axios.get<{ counters: MetalRoutingCounter[] }>(`${BASE}/counters`)
  return data.counters ?? []
}

export async function createMetalCounter(name: string): Promise<MetalRoutingCounter> {
  const { data } = await axios.post<{ counter: MetalRoutingCounter }>(`${BASE}/counters`, { name })
  return data.counter
}

export async function updateMetalCounter(
  id: number,
  body: Partial<{ name: string; incharge_operator_id: number | null; is_active: boolean }>,
): Promise<MetalRoutingCounter> {
  const { data } = await axios.patch<{ counter: MetalRoutingCounter }>(`${BASE}/counters/${id}`, body)
  return data.counter
}

export async function deleteMetalCounter(id: number): Promise<void> {
  await axios.delete(`${BASE}/counters/${id}`)
}

export async function setMetalRoutingManager(operatorId: number): Promise<void> {
  await axios.put(`${BASE}/manager`, { operator_id: operatorId })
}

export async function fetchMetalPurities(metalType?: 'gold' | 'silver'): Promise<MetalPurity[]> {
  const { data } = await axios.get<{ purities: MetalPurity[] }>(`${BASE}/purities`, {
    params: metalType ? { metal_type: metalType } : {},
  })
  return data.purities ?? []
}

export async function createMetalPurity(body: {
  metal_type: 'gold' | 'silver'
  label: string
  default_charge_pct?: number | null
  sort_order?: number
}): Promise<MetalPurity> {
  const { data } = await axios.post<{ purity: MetalPurity }>(`${BASE}/purities`, body)
  return data.purity
}

export async function updateMetalPurity(
  id: number,
  body: Partial<{ label: string; default_charge_pct: number | null; sort_order: number; is_active: boolean }>,
): Promise<MetalPurity> {
  const { data } = await axios.patch<{ purity: MetalPurity }>(`${BASE}/purities/${id}`, body)
  return data.purity
}

export async function deleteMetalPurity(id: number): Promise<void> {
  await axios.delete(`${BASE}/purities/${id}`)
}

export async function fetchMetalLots(params?: {
  metal_type?: 'gold' | 'silver'
  counter_id?: number
  status?: string
}): Promise<MetalStockLot[]> {
  const { data } = await axios.get<{ lots: MetalStockLot[] }>(`${BASE}/lots`, { params })
  return data.lots ?? []
}

export async function receiveMetalLot(body: {
  metal_type: 'gold' | 'silver'
  purity_id: number
  gross_gm: number
  charge_pct?: number
  counter_id?: number
  operator_id?: number
  from_customer_id?: number
  notes?: string
  move_date?: string
}): Promise<MetalStockLot> {
  const { data } = await axios.post<{ lot: MetalStockLot }>(`${BASE}/lots`, body)
  return data.lot
}

export async function splitMetalLot(
  lotId: number,
  parts: {
    pure_gm?: number
    gross_gm?: number
    charge_pct?: number
    counter_id?: number
    operator_id?: number
  }[],
): Promise<{
  parent_id: number
  parent: MetalStockLot | null
  children: MetalStockLot[]
  remaining_gross_gm: number
}> {
  const { data } = await axios.post(`${BASE}/lots/${lotId}/split`, { parts })
  return data
}

export async function updateMetalLot(
  lotId: number,
  body: { purity_id?: number; charge_pct?: number | null },
): Promise<MetalStockLot> {
  const { data } = await axios.patch<{ lot: MetalStockLot }>(`${BASE}/lots/${lotId}`, body)
  return data.lot
}

export async function transferMetalLot(
  lotId: number,
  body: {
    counter_id: number
    gross_gm?: number
    operator_id?: number
    notes?: string
  },
): Promise<{ mode: 'full' | 'partial'; lot: MetalStockLot; transferred?: MetalStockLot }> {
  const { data } = await axios.post(`${BASE}/lots/${lotId}/transfer`, body)
  return data
}

export async function handoverMetalLot(
  lotId: number,
  body: {
    to_customer_id?: number
    to_operator_id?: number
    counter_id?: number
    notes?: string
  },
): Promise<MetalStockLot> {
  const { data } = await axios.post<{ lot: MetalStockLot }>(`${BASE}/lots/${lotId}/handover`, body)
  return data.lot
}

export async function closeMetalLot(lotId: number, notes?: string): Promise<MetalStockLot> {
  const { data } = await axios.post<{ lot: MetalStockLot }>(`${BASE}/lots/${lotId}/close`, { notes })
  return data.lot
}

export async function deleteMetalLot(lotId: number): Promise<void> {
  await axios.delete(`${BASE}/lots/${lotId}`)
}

export async function fetchMetalLotJourney(lotId: number): Promise<MetalLotJourney> {
  const { data } = await axios.get<MetalLotJourney>(`${BASE}/lots/${lotId}/journey`)
  return data
}

export function roundMetalGm(n: number): number {
  return Math.round(Number(n) * 1000) / 1000
}

export function metalGrossExceedsMax(requestedGm: number, maxGm: number): boolean {
  return roundMetalGm(requestedGm) > roundMetalGm(maxGm)
}

export async function fetchMetalStockReport(params: {
  from: string
  to: string
  metal_type?: 'gold' | 'silver'
}): Promise<{ from: string; to: string; metal_type: string; rows: MetalStockReportRow[] }> {
  const { data } = await axios.get(`${BASE}/reports/stock`, { params })
  return data
}

export async function fetchMetalStaffReport(
  operatorId: number,
  params: { from: string; to: string },
): Promise<MetalStaffReport> {
  const { data } = await axios.get<MetalStaffReport>(`${BASE}/reports/staff/${operatorId}`, { params })
  return data
}

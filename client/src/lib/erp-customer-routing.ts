import axios from '@/lib/axios'

export type RoutingCounter = {
  id: number
  name: string
  slug: string
  sort_order: number
  is_active: boolean
  incharge_operator_id: number | null
  incharge?: { id: number; displayName: string } | null
}

export type RoutingBootstrap = {
  role: 'admin' | 'greeter' | 'counter' | 'viewer'
  greeter: { id: number; displayName: string } | null
  counters: RoutingCounter[]
  myCounterIds: number[]
}

export type QueueItem = {
  id: number
  visit_id: number
  counter_id: number
  status: string
  queued_at: string
  customer_id: number
  customer_name: string
  customer_mobile: string | null
  counter_name: string
}

export type ActiveVisit = {
  id: number
  customer_id: number
  customer_name: string
  customer_mobile: string | null
  started_at: string
}

export type FloorTrailStep = {
  label: string
  detail: string
  at: string
}

export type FloorVisit = {
  visit_id: number
  customer_id: number
  customer_name: string
  customer_mobile: string | null
  started_at: string
  status: string
  current_label: string
  current_queue_status: string | null
  current_counter: string | null
  trail: FloorTrailStep[]
  trail_text: string
}

export type VisitTimeline = {
  visit: {
    id: number
    customer_name: string
    customer_mobile: string | null
    status: string
    started_at: string
    ended_at: string | null
  }
  queue: {
    id: number
    counter_name: string
    status: string
    queued_at: string
  }[]
  interactions: {
    id: number
    created_at: string
    counter_name: string | null
    forward_counter_name: string | null
    operator_name: string | null
    outcome: string
    outcome_label: string
    bill_number?: string | null
    bill_amount_inr?: number | string | null
    no_sale_reason?: string | null
    purchase_notes?: string | null
  }[]
  trail: FloorTrailStep[]
}

export async function fetchRoutingBootstrap(): Promise<RoutingBootstrap> {
  const { data } = await axios.get<RoutingBootstrap>('/api/reseller/erp/customer-routing/bootstrap')
  return data
}

export async function fetchLiveQueue(counterId?: number): Promise<QueueItem[]> {
  const { data } = await axios.get<{ queue: QueueItem[] }>(
    '/api/reseller/erp/customer-routing/queue/live',
    { params: counterId ? { counter_id: counterId } : {} },
  )
  return data.queue ?? []
}

export async function fetchActiveVisits(): Promise<ActiveVisit[]> {
  const { data } = await axios.get<{ visits: ActiveVisit[] }>(
    '/api/reseller/erp/customer-routing/visits/active',
  )
  return data.visits ?? []
}

export async function fetchLiveFloor(): Promise<{
  visits: FloorVisit[]
  active_count: number
  counters_busy: { counter_id: number; counter_name: string; active_count: number }[]
}> {
  const { data } = await axios.get('/api/reseller/erp/customer-routing/floor/live')
  return {
    visits: data.visits ?? [],
    active_count: data.active_count ?? 0,
    counters_busy: data.counters_busy ?? [],
  }
}

export async function fetchVisitTimeline(visitId: number): Promise<VisitTimeline> {
  const { data } = await axios.get<VisitTimeline>(
    `/api/reseller/erp/customer-routing/visits/${visitId}/timeline`,
  )
  return data
}

export async function routeCustomerToCounter(payload: {
  customer_id: number
  counter_id: number
  visit_id?: number
}): Promise<{ visit_id: number }> {
  const { data } = await axios.post('/api/reseller/erp/customer-routing/queue', payload)
  return { visit_id: data.visit_id as number }
}

export async function completeQueueItem(
  queueId: number,
  body: {
    outcome: 'sale_closed' | 'forward' | 'no_sale' | 'sale_and_forward' | 'left_shop'
    bill_number?: string
    bill_amount_inr?: number | string
    purchase_notes?: string
    no_sale_reason?: string
    forward_counter_id?: number
  },
): Promise<void> {
  await axios.post(`/api/reseller/erp/customer-routing/queue/${queueId}/complete`, body)
}

export async function startServingQueueItem(queueId: number): Promise<void> {
  await axios.post(`/api/reseller/erp/customer-routing/queue/${queueId}/start`)
}

export async function createCounter(name: string): Promise<RoutingCounter> {
  const { data } = await axios.post<{ counter: RoutingCounter }>(
    '/api/reseller/erp/customer-routing/counters',
    { name },
  )
  return data.counter
}

export async function updateCounter(
  id: number,
  patch: Partial<{ name: string; incharge_operator_id: number | null; is_active: boolean }>,
): Promise<RoutingCounter> {
  const { data } = await axios.patch<{ counter: RoutingCounter }>(
    `/api/reseller/erp/customer-routing/counters/${id}`,
    patch,
  )
  return data.counter
}

export async function deleteCounter(id: number): Promise<void> {
  await axios.delete(`/api/reseller/erp/customer-routing/counters/${id}`)
}

export async function setStoreGreeter(operatorId: number): Promise<void> {
  await axios.put('/api/reseller/erp/customer-routing/greeter', { operator_id: operatorId })
}

export async function fetchRoutingAnalytics(params: {
  from?: string
  to?: string
  operator_id?: number
  view?: 'summary' | 'detailed'
}): Promise<{
  summary: {
    operator_id: number | null
    display_name: string | null
    counter_name: string | null
    interactions: number
    sales: number
    no_sales: number
    forwards_only: number
    conversion_pct: number
  }[]
  lost_sale_reasons: { reason: string; count: number }[]
  routed_by_counter: { counter_name: string; routed: number }[]
  detailed: {
    id: number
    created_at: string
    customer_name: string
    customer_mobile: string | null
    counter_name: string | null
    forward_counter_name: string | null
    operator_name: string | null
    outcome: string
    outcome_label: string
    bill_number?: string | null
    bill_amount_inr?: number | string | null
    no_sale_reason?: string | null
    purchase_notes?: string | null
  }[]
}> {
  const { data } = await axios.get('/api/reseller/erp/customer-routing/analytics', {
    params: {
      ...params,
      view: params.view === 'detailed' ? 'detailed' : undefined,
    },
  })
  return { ...data, detailed: data.detailed ?? [] }
}

export async function exportRoutingAnalyticsExcel(
  analytics: Awaited<ReturnType<typeof fetchRoutingAnalytics>>,
  label: string,
): Promise<void> {
  const XLSX = await import('xlsx')
  const summaryRows = [
    ['Staff', 'Counter', 'Interactions', 'Sales', 'No sale', 'Forwards', 'Conversion %'],
    ...analytics.summary.map((r) => [
      r.display_name || '—',
      r.counter_name || '—',
      r.interactions,
      r.sales,
      r.no_sales,
      r.forwards_only,
      r.conversion_pct,
    ]),
  ]
  const reasonRows = [
    ['Reason', 'Count'],
    ...analytics.lost_sale_reasons.map((r) => [r.reason, r.count]),
  ]
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summaryRows), 'Summary')
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(reasonRows), 'Lost sales')
  XLSX.writeFile(wb, `routing-report-${label.replace(/[^\w.-]+/g, '_')}.xlsx`)
}

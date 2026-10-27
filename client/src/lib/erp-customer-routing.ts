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
  isStoreGreeter?: boolean
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

export async function fetchLiveFloor(params?: {
  day?: string
  from?: string
  to?: string
}): Promise<{
  visits: FloorVisit[]
  active_count: number
  visit_count: number
  range_from: string
  range_to: string
  counters_busy: { counter_id: number; counter_name: string; active_count: number }[]
}> {
  const { data } = await axios.get('/api/reseller/erp/customer-routing/floor/live', { params })
  return {
    visits: data.visits ?? [],
    active_count: data.active_count ?? 0,
    visit_count: data.visit_count ?? data.visits?.length ?? 0,
    range_from: data.range_from ?? '',
    range_to: data.range_to ?? '',
    counters_busy: data.counters_busy ?? [],
  }
}

export async function deleteRoutingVisit(visitId: number): Promise<void> {
  await axios.delete(`/api/reseller/erp/customer-routing/visits/${visitId}`)
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
    estimation_number?: string
    gross_weight_gm?: number | string
    net_weight_gm?: number | string
    transfer_to_billing?: boolean
    follow_up?: {
      required?: boolean
      follow_up_at?: string
      date?: string
      mode?: string
      priority?: 'high' | 'medium' | 'low'
      remarks?: string
    }
  },
): Promise<void> {
  await axios.post(`/api/reseller/erp/customer-routing/queue/${queueId}/complete`, body)
}

export type BillingQueueItem = {
  id: number
  visit_id: number
  customer_id: number
  customer_name: string
  customer_mobile: string | null
  counter_name: string | null
  operator_name: string | null
  estimation_number: string | null
  estimated_amount_inr: number | string | null
  gross_weight_gm: number | string | null
  net_weight_gm: number | string | null
  billing_status: string
  created_at: string
}

export async function fetchBillingQueue(status = 'pending'): Promise<BillingQueueItem[]> {
  const { data } = await axios.get<{ queue: BillingQueueItem[] }>(
    '/api/reseller/erp/customer-routing/billing-queue',
    { params: { status } },
  )
  return data.queue || []
}

export async function completeBillingQueueItem(
  id: number,
  body: {
    invoice_number: string
    payment_mode?: string
    payment_amount_inr?: number | string
    payment_status?: string
  },
): Promise<void> {
  await axios.post(`/api/reseller/erp/customer-routing/billing-queue/${id}/complete`, body)
}

export type LiveStation = {
  counter_id: number
  counter_name: string
  incharge_name: string | null
  salesperson_status: 'with_customer' | 'free'
  active_customer: string | null
  waiting_count: number
  billing_pending: number
}

export type ManagementDashboard = {
  summary: {
    total_visitors: number
    total_purchasers: number
    total_no_purchase: number
    total_sales_inr: number
    overall_conversion_pct: number
    average_bill_inr: number
    follow_ups_pending: number
    follow_ups_overdue: number
    avg_counters_per_visit: number
    top_salespeople?: { operator_id: number | null; name: string; sales_amount_inr: number }[]
    top_counters_by_visitors?: { counter_name: string; visitors: number }[]
    top_counters_by_sales?: { counter_name: string; sales_amount_inr: number }[]
  }
  counter_report: {
    counter_id: number
    counter_name: string
    total_visitors: number
    purchased: number
    no_purchase: number
    transferred_in: number
    transferred_out: number
    conversion_pct: number
    sales_value_inr: number
    average_bill_inr?: number
    follow_ups_created?: number
  }[]
  salesperson_performance: {
    operator_id: number | null
    name: string
    customers_attended: number
    customers_purchased?: number
    sales_amount_inr: number
    conversion_pct: number
    monthly_target_inr: number
    achievement_pct: number | null
    target_gap_inr?: number | null
    bills_count?: number
  }[]
}

export async function fetchManagementDashboard(params: {
  from?: string
  to?: string
  period_key?: string
  period_type?: string
}): Promise<ManagementDashboard> {
  const { data } = await axios.get<ManagementDashboard>(
    '/api/reseller/erp/customer-routing/management-dashboard',
    { params },
  )
  return data
}

export async function fetchLiveStations(): Promise<LiveStation[]> {
  const { data } = await axios.get<{ stations: LiveStation[] }>(
    '/api/reseller/erp/customer-routing/live-stations',
  )
  return data.stations || []
}

export async function saveOperatorSalesTarget(body: {
  operator_id: number
  period_key: string
  period_type?: string
  target_amount_inr: number
}): Promise<void> {
  await axios.put('/api/reseller/erp/customer-routing/sales-targets', body)
}

export type RoutingFollowUp = {
  id: number
  customer_id: number
  customer_name: string
  customer_mobile: string | null
  counter_name: string | null
  operator_name: string | null
  source: string
  status: string
  follow_up_at: string | null
  mode: string | null
  priority: string
  remarks: string | null
  result: string | null
  created_at: string
}

export async function fetchRoutingFollowUps(status = 'open'): Promise<RoutingFollowUp[]> {
  const { data } = await axios.get<{ follow_ups: RoutingFollowUp[] }>(
    '/api/reseller/erp/customer-routing/follow-ups',
    { params: { status } },
  )
  return data.follow_ups || []
}

export async function completeRoutingFollowUp(
  id: number,
  body: { result?: string; status?: string },
): Promise<void> {
  await axios.patch(`/api/reseller/erp/customer-routing/follow-ups/${id}`, {
    status: body.status || 'completed',
    result: body.result,
  })
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

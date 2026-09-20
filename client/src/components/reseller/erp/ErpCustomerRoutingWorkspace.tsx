'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import axios from '@/lib/axios'
import {
  completeQueueItem,
  createCounter,
  deleteCounter,
  deleteRoutingVisit,
  exportRoutingAnalyticsExcel,
  fetchLiveFloor,
  fetchLiveQueue,
  fetchRoutingAnalytics,
  fetchRoutingBootstrap,
  fetchVisitTimeline,
  routeCustomerToCounter,
  setStoreGreeter,
  startServingQueueItem,
  updateCounter,
  type FloorVisit,
  type QueueItem,
  type RoutingBootstrap,
  type VisitTimeline,
} from '@/lib/erp-customer-routing'
import { downloadRoutingReportPdf } from '@/lib/erp-routing-report-pdf'
import {
  ErpRoutingCustomerSuggest,
  type RoutingCustomer,
} from '@/components/reseller/erp/ErpRoutingCustomerSuggest'
import { erpBtnGhost, erpBtnPrimary, erpCardCls, erpInputCls } from '@/components/reseller/erp/erp-ui'
import { RESELLER_ERP_PATH } from '@/lib/routes'
import { erpTodayIso, erpDaysAgoIso } from '@/lib/erp-date-format'
import { useErpOperator } from '@/context/ErpOperatorContext'
import { cn } from '@/lib/utils'
import { Loader2, MapPin, Plus, RefreshCw, Route, Trash2, Users, X } from 'lucide-react'

function formatWalkInAge(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  if (!Number.isFinite(ms) || ms < 0) return ''
  const m = Math.floor(ms / 60000)
  if (m < 1) return 'Just arrived'
  if (m < 60) return `${m}m in store`
  const h = Math.floor(m / 60)
  return `${h}h ${m % 60}m`
}

const NO_SALE_PRESETS = [
  'Price too high',
  'Out of budget',
  'Could not find design',
  'Will come back later',
  'Just browsing',
]

export function ErpCustomerRoutingWorkspace() {
  const { operator, shadowUnlocked } = useErpOperator()
  const [boot, setBoot] = useState<RoutingBootstrap | null>(null)
  const [loading, setLoading] = useState(true)
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')
  const [queue, setQueue] = useState<QueueItem[]>([])
  const [operators, setOperators] = useState<{ id: number; displayName: string }[]>([])
  const [pickedCustomer, setPickedCustomer] = useState<RoutingCustomer | null>(null)
  const [floorVisits, setFloorVisits] = useState<FloorVisit[]>([])
  const [floorBusy, setFloorBusy] = useState<{ counter_name: string; active_count: number }[]>([])
  const [floorSearch, setFloorSearch] = useState('')
  const [floorExpanded, setFloorExpanded] = useState(false)
  const [floorFrom, setFloorFrom] = useState(erpTodayIso())
  const [floorTo, setFloorTo] = useState(erpTodayIso())
  const [floorActiveCount, setFloorActiveCount] = useState(0)
  const [timelineVisitId, setTimelineVisitId] = useState<number | null>(null)
  const [timeline, setTimeline] = useState<VisitTimeline | null>(null)
  const [timelineLoading, setTimelineLoading] = useState(false)
  const [routeCounterId, setRouteCounterId] = useState<number | ''>('')
  const [newCounterName, setNewCounterName] = useState('')
  const [greeterOpId, setGreeterOpId] = useState<number | ''>('')
  const [activeQueueId, setActiveQueueId] = useState<number | null>(null)
  const [outcome, setOutcome] = useState<
    'sale_closed' | 'forward' | 'no_sale' | 'sale_and_forward' | 'left_shop'
  >('sale_closed')
  const [billNumber, setBillNumber] = useState('')
  const [billAmount, setBillAmount] = useState('')
  const [purchaseNotes, setPurchaseNotes] = useState('')
  const [noSaleReason, setNoSaleReason] = useState('')
  const [forwardCounterId, setForwardCounterId] = useState<number | ''>('')
  const [fromDate, setFromDate] = useState(erpDaysAgoIso(7))
  const [toDate, setToDate] = useState(erpTodayIso())
  const [analytics, setAnalytics] = useState<Awaited<ReturnType<typeof fetchRoutingAnalytics>> | null>(
    null,
  )
  const [reportBusy, setReportBusy] = useState(false)
  const [adminTab, setAdminTab] = useState<'counters' | 'analytics'>('counters')
  const [reportView, setReportView] = useState<'summary' | 'detailed'>('summary')

  const reloadBoot = useCallback(async () => {
    const b = await fetchRoutingBootstrap()
    setBoot(b)
    if (b.greeter) setGreeterOpId(b.greeter.id)
  }, [])

  const reloadQueue = useCallback(async () => {
    if (!boot) return
    const incharge = boot.myCounterIds?.length ?? 0
    if (boot.role === 'admin') {
      setQueue(await fetchLiveQueue())
      return
    }
    if (incharge > 0) {
      setQueue(await fetchLiveQueue())
      return
    }
    setQueue([])
  }, [boot])

  const reloadFloor = useCallback(async () => {
    if (!boot || (boot.role !== 'greeter' && boot.role !== 'admin')) return
    try {
      const f = await fetchLiveFloor({ from: floorFrom, to: floorTo })
      setFloorVisits(f.visits)
      setFloorBusy(f.counters_busy)
      setFloorActiveCount(f.active_count)
    } catch {
      /* keep last snapshot */
    }
  }, [boot, floorFrom, floorTo])

  useEffect(() => {
    void (async () => {
      setLoading(true)
      try {
        await reloadBoot()
      } catch (e) {
        setErr('Failed to load routing')
      } finally {
        setLoading(false)
      }
    })()
  }, [reloadBoot])

  useEffect(() => {
    if (!boot) return
    void reloadQueue()
    void reloadFloor()
    const t = window.setInterval(() => {
      void reloadQueue()
      void reloadFloor()
    }, 4000)
    return () => window.clearInterval(t)
  }, [boot, reloadQueue, reloadFloor])

  useEffect(() => {
    if (!boot || (boot.role !== 'greeter' && boot.role !== 'admin')) return
    void reloadFloor()
  }, [floorFrom, floorTo, boot?.role])

  useEffect(() => {
    if (!timelineVisitId) {
      setTimeline(null)
      return
    }
    setTimelineLoading(true)
    void fetchVisitTimeline(timelineVisitId)
      .then(setTimeline)
      .catch(() => setTimeline(null))
      .finally(() => setTimelineLoading(false))
  }, [timelineVisitId])

  useEffect(() => {
    if (boot?.role !== 'admin') return
    void axios
      .get<{ operators: { id: number; displayName: string; role: string }[] }>(
        '/api/reseller/erp/operators',
      )
      .then((r) =>
        setOperators(
          (r.data.operators || []).map((o) => ({ id: o.id, displayName: o.displayName })),
        ),
      )
      .catch(() => setOperators([]))
  }, [boot?.role])

  const role = boot?.role ?? 'viewer'
  const counters = boot?.counters ?? []

  const routeCustomer = async () => {
    if (!pickedCustomer?.id || !routeCounterId) {
      setErr('Choose customer and counter')
      return
    }
    setErr('')
    try {
      await routeCustomerToCounter({
        customer_id: pickedCustomer.id,
        counter_id: Number(routeCounterId),
      })
      setMsg('Customer routed to counter')
      setPickedCustomer(null)
      await Promise.all([reloadQueue(), reloadFloor()])
    } catch (e: unknown) {
      const m =
        e && typeof e === 'object' && 'response' in e
          ? (e as { response?: { data?: { error?: string } } }).response?.data?.error
          : null
      setErr(m || 'Routing failed')
    }
  }

  const submitOutcome = async () => {
    if (!activeQueueId) return
    setErr('')
    try {
      await startServingQueueItem(activeQueueId)
      await completeQueueItem(activeQueueId, {
        outcome,
        bill_number: billNumber || undefined,
        bill_amount_inr: billAmount || undefined,
        purchase_notes: purchaseNotes || undefined,
        no_sale_reason: noSaleReason || undefined,
        forward_counter_id:
          outcome === 'forward' || outcome === 'sale_and_forward'
            ? Number(forwardCounterId)
            : undefined,
      })
      setMsg('Interaction logged')
      setActiveQueueId(null)
      setBillNumber('')
      setBillAmount('')
      setPurchaseNotes('')
      setNoSaleReason('')
      await Promise.all([reloadQueue(), reloadFloor()])
    } catch (e: unknown) {
      const m =
        e && typeof e === 'object' && 'response' in e
          ? (e as { response?: { data?: { error?: string } } }).response?.data?.error
          : null
      setErr(m || 'Could not save outcome')
    }
  }

  const loadAnalytics = async () => {
    setReportBusy(true)
    try {
      const data = await fetchRoutingAnalytics({
        from: fromDate,
        to: toDate,
        view: reportView,
      })
      setAnalytics(data)
    } catch {
      setErr('Failed to load analytics')
    } finally {
      setReportBusy(false)
    }
  }

  const activeItem = useMemo(
    () => queue.find((q) => q.id === activeQueueId) ?? null,
    [queue, activeQueueId],
  )

  const filteredFloor = useMemo(() => {
    const q = floorSearch.trim().toLowerCase()
    if (!q) return floorVisits
    const digits = q.replace(/\D/g, '')
    return floorVisits.filter(
      (v) =>
        v.customer_name.toLowerCase().includes(q) ||
        (digits.length >= 4 && (v.customer_mobile || '').replace(/\D/g, '').includes(digits)) ||
        (v.current_counter || '').toLowerCase().includes(q),
    )
  }, [floorVisits, floorSearch])

  const floorVisible = useMemo(() => {
    const list = filteredFloor
    if (floorExpanded || list.length <= 8) return list
    return list.slice(0, 8)
  }, [filteredFloor, floorExpanded])

  const showLiveFloor = role === 'greeter' || role === 'admin'
  const canWorkCounterQueue =
    role === 'admin' || (boot?.myCounterIds?.length ?? 0) > 0
  const greeterAlsoCounter =
    (boot?.isStoreGreeter || role === 'greeter') && (boot?.myCounterIds?.length ?? 0) > 0

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="size-8 animate-spin text-[var(--color-jewelry-black,#1a1814)]/40" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-[var(--color-jewelry-black,#1a1814)]/70">
          <Route className="mr-1 inline size-4" />
          {role === 'admin'
            ? 'Admin — counters, greeter & analytics'
            : role === 'greeter'
              ? greeterAlsoCounter
                ? 'Greeter & counter — route walk-ins and attend your queue'
                : 'Greeter — route walk-ins to counters'
              : role === 'counter'
                ? 'Your counter queue'
                : 'View only — ask admin for counter or greeter role'}
        </p>
        <button
          type="button"
          className={erpBtnGhost}
          onClick={() => void reloadBoot().then(() => Promise.all([reloadQueue(), reloadFloor()]))}
        >
          <RefreshCw className="size-4" /> Refresh
        </button>
      </div>

      {showLiveFloor ? (
        <div className={`${erpCardCls} space-y-3`}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-semibold text-[var(--color-jewelry-black,#1a1814)]">
              <MapPin className="mr-1 inline size-4 text-[var(--kc-accent,#c41e3a)]" />
              Live store floor
              <span className="ml-2 rounded-full bg-[var(--color-jewelry-black,#1a1814)]/8 px-2 py-0.5 text-xs font-bold tabular-nums">
                {floorActiveCount} active
              </span>
              <span className="ml-1 text-xs font-normal text-[var(--color-jewelry-black,#1a1814)]/55">
                · {floorVisits.length} visit(s) {floorFrom === floorTo ? `on ${floorFrom}` : `${floorFrom} → ${floorTo}`}
              </span>
            </p>
            <input
              className={`${erpInputCls} max-w-[220px] text-sm`}
              placeholder="Search name / mobile / counter"
              value={floorSearch}
              onChange={(e) => setFloorSearch(e.target.value)}
            />
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <label className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-jewelry-black,#1a1814)]/50">
              From
              <input
                type="date"
                className={`${erpInputCls} mt-1 block`}
                value={floorFrom}
                onChange={(e) => setFloorFrom(e.target.value)}
              />
            </label>
            <label className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-jewelry-black,#1a1814)]/50">
              To
              <input
                type="date"
                className={`${erpInputCls} mt-1 block`}
                value={floorTo}
                onChange={(e) => setFloorTo(e.target.value)}
              />
            </label>
            <button type="button" className={erpBtnGhost} onClick={() => void reloadFloor()}>
              Apply dates
            </button>
            <button
              type="button"
              className={erpBtnGhost}
              onClick={() => {
                const t = erpTodayIso()
                setFloorFrom(t)
                setFloorTo(t)
              }}
            >
              Today
            </button>
          </div>
          {floorBusy.length ? (
            <div className="flex flex-wrap gap-2">
              {floorBusy.slice(0, 8).map((b) => (
                <span
                  key={b.counter_name}
                  className="rounded-lg border border-[var(--color-slate-700,#e8e4df)] bg-white px-2 py-1 text-[11px] font-semibold text-[var(--color-jewelry-black,#1a1814)]/80"
                >
                  {b.counter_name}
                  <span className="ml-1 tabular-nums text-[var(--kc-accent,#c41e3a)]">{b.active_count}</span>
                </span>
              ))}
            </div>
          ) : null}
          {floorVisible.length === 0 ? (
            <p className="text-sm text-[var(--color-jewelry-black,#1a1814)]/55">
              No walk-ins on the floor right now.
            </p>
          ) : (
            <ul className="max-h-[min(52vh,420px)] space-y-2 overflow-y-auto pr-1">
              {floorVisible.map((v) => (
                <li key={v.visit_id}>
                  <div className="rounded-xl border border-[var(--color-slate-700,#e8e4df)] bg-white p-3 transition hover:border-[var(--kc-accent,#c41e3a)]/35">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => setTimelineVisitId(v.visit_id)}
                        className="min-w-0 flex-1 text-left"
                      >
                        <p className="truncate font-semibold text-[var(--color-jewelry-black,#1a1814)]">
                          {v.customer_name}
                        </p>
                        <p className="text-xs text-[var(--color-jewelry-black,#1a1814)]/55">
                          {v.customer_mobile || 'No mobile'} ·{' '}
                          {v.status === 'active' ? formatWalkInAge(v.started_at) : 'Completed'}
                        </p>
                      </button>
                      <div className="flex shrink-0 items-center gap-1">
                        <span
                          className={cn(
                            'rounded-lg px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide',
                            v.status !== 'active'
                              ? 'bg-slate-200 text-slate-800'
                              : v.current_queue_status === 'serving'
                                ? 'bg-emerald-100 text-emerald-900'
                                : v.current_queue_status === 'waiting'
                                  ? 'bg-amber-100 text-amber-900'
                                  : 'bg-[var(--color-jewelry-black,#1a1814)]/8 text-[var(--color-jewelry-black,#1a1814)]/70',
                          )}
                        >
                          {v.status !== 'active'
                            ? 'done'
                            : v.current_queue_status || 'in store'}
                        </span>
                        {shadowUnlocked && operator?.role === 'admin' ? (
                          <button
                            type="button"
                            className="rounded-lg border border-rose-500/30 p-1.5 text-rose-700"
                            aria-label="Delete visit"
                            onClick={() =>
                              void deleteRoutingVisit(v.visit_id)
                                .then(() => reloadFloor())
                                .catch(() => setErr('Delete failed — unlock Jainav mode'))
                            }
                          >
                            <Trash2 className="size-3.5" />
                          </button>
                        ) : null}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setTimelineVisitId(v.visit_id)}
                      className="mt-2 w-full text-left"
                    >
                    <p className="mt-2 text-sm font-medium text-[var(--color-jewelry-black,#1a1814)]">
                      {v.current_label}
                    </p>
                    {v.trail_text ? (
                      <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-[var(--color-jewelry-black,#1a1814)]/60">
                        {v.trail_text}
                      </p>
                    ) : null}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
          {filteredFloor.length > 8 ? (
            <button
              type="button"
              className={erpBtnGhost}
              onClick={() => setFloorExpanded((e) => !e)}
            >
              {floorExpanded ? 'Show fewer' : `Show all ${filteredFloor.length} walk-ins`}
            </button>
          ) : null}
        </div>
      ) : null}

      {msg ? (
        <p className="rounded-xl border border-emerald-600/25 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
          {msg}
        </p>
      ) : null}
      {err ? (
        <p className="rounded-xl border border-rose-500/30 bg-rose-50 px-3 py-2 text-sm text-rose-800">{err}</p>
      ) : null}

      {(role === 'greeter' || role === 'admin') && (
        <div className={`${erpCardCls} space-y-3`}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-semibold text-[var(--color-jewelry-black,#1a1814)]">Route customer</p>
            <Link
              href={`${RESELLER_ERP_PATH}/customers`}
              className="inline-flex min-h-[36px] items-center gap-1 rounded-lg border border-[var(--color-slate-700,#e8e4df)] px-3 text-xs font-semibold text-[var(--color-jewelry-black,#1a1814)]"
            >
              <Users className="size-3.5" /> Open CRM
            </Link>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <div>
              <label className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-jewelry-black,#1a1814)]/50">
                Customer
              </label>
              <div className="mt-1">
                <ErpRoutingCustomerSuggest selected={pickedCustomer} onSelect={setPickedCustomer} />
              </div>
            </div>
            <div>
              <label className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-jewelry-black,#1a1814)]/50">
                Counter
              </label>
              <select
                className={`${erpInputCls} mt-1 w-full`}
                value={routeCounterId}
                onChange={(e) => setRouteCounterId(e.target.value ? parseInt(e.target.value, 10) : '')}
              >
                <option value="">Select counter…</option>
                {counters.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                    {c.incharge ? ` (${c.incharge.displayName})` : ''}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <button type="button" className={erpBtnPrimary} onClick={() => void routeCustomer()}>
            Route to counter
          </button>
        </div>
      )}

      {canWorkCounterQueue && (
        <div className={`${erpCardCls} space-y-3`}>
          <p className="font-semibold text-[var(--color-jewelry-black,#1a1814)]">Live queue</p>
          {queue.length === 0 ? (
            <p className="text-sm text-[var(--color-jewelry-black,#1a1814)]/55">No customers waiting.</p>
          ) : (
            <ul className="space-y-2">
              {queue.map((q) => (
                <li
                  key={q.id}
                  className="flex flex-col gap-2 rounded-xl border border-[var(--color-slate-700,#e8e4df)] bg-white p-3 sm:flex-row sm:items-center"
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-[var(--color-jewelry-black,#1a1814)]">{q.customer_name}</p>
                    <p className="text-xs text-[var(--color-jewelry-black,#1a1814)]/55">
                      {q.counter_name}
                      {q.customer_mobile ? ` · ${q.customer_mobile}` : ''} · {q.status}
                    </p>
                  </div>
                  <button
                    type="button"
                    className={erpBtnPrimary}
                    onClick={() => {
                      setActiveQueueId(q.id)
                      setOutcome('sale_closed')
                    }}
                  >
                    Attend
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {activeItem ? (
        <div className={`${erpCardCls} space-y-3 border-[var(--kc-accent,#c41e3a)]/30`}>
          <p className="font-semibold text-[var(--color-jewelry-black,#1a1814)]">
            Outcome — {activeItem.customer_name}
          </p>
          <div className="flex flex-wrap gap-2">
            {(
              [
                ['sale_closed', 'Sale closed'],
                ['forward', 'Forward only'],
                ['no_sale', 'No sale'],
                ['sale_and_forward', 'Sale + forward'],
                ['left_shop', 'Left shop'],
              ] as const
            ).map(([k, label]) => (
              <button
                key={k}
                type="button"
                onClick={() => setOutcome(k)}
                className={cn(
                  'min-h-[40px] rounded-xl border px-3 text-xs font-semibold',
                  outcome === k
                    ? 'border-[var(--kc-accent,#c41e3a)]/40 bg-[var(--kc-accent,#c41e3a)]/[0.08] text-[var(--color-jewelry-black,#1a1814)]'
                    : 'border-[var(--color-slate-700,#e8e4df)] text-[var(--color-jewelry-black,#1a1814)]/75',
                )}
              >
                {label}
              </button>
            ))}
          </div>
          {(outcome === 'sale_closed' || outcome === 'sale_and_forward') && (
            <div className="grid gap-2 sm:grid-cols-2">
              <input
                className={erpInputCls}
                placeholder="Bill number (optional)"
                value={billNumber}
                onChange={(e) => setBillNumber(e.target.value)}
              />
              <input
                className={erpInputCls}
                placeholder="Bill amount ₹"
                value={billAmount}
                onChange={(e) => setBillAmount(e.target.value)}
                inputMode="decimal"
              />
              <input
                className={`${erpInputCls} sm:col-span-2`}
                placeholder="What was bought (optional)"
                value={purchaseNotes}
                onChange={(e) => setPurchaseNotes(e.target.value)}
              />
            </div>
          )}
          {(outcome === 'no_sale' || outcome === 'left_shop') && (
            <div className="space-y-2">
              <select
                className={erpInputCls}
                value={noSaleReason}
                onChange={(e) => setNoSaleReason(e.target.value)}
              >
                <option value="">Reason for not buying…</option>
                {NO_SALE_PRESETS.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
              <input
                className={erpInputCls}
                placeholder="Or type custom reason (required)"
                value={noSaleReason}
                onChange={(e) => setNoSaleReason(e.target.value)}
              />
            </div>
          )}
          {(outcome === 'forward' || outcome === 'sale_and_forward') && (
            <select
              className={erpInputCls}
              value={forwardCounterId}
              onChange={(e) => setForwardCounterId(e.target.value ? parseInt(e.target.value, 10) : '')}
            >
              <option value="">Forward to counter…</option>
              {counters
                .filter((c) => c.id !== activeItem.counter_id)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
            </select>
          )}
          <div className="flex flex-wrap gap-2">
            <button type="button" className={erpBtnPrimary} onClick={() => void submitOutcome()}>
              Save & clear queue
            </button>
            <button type="button" className={erpBtnGhost} onClick={() => setActiveQueueId(null)}>
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      {role === 'admin' && (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {(['counters', 'analytics'] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setAdminTab(t)}
                className={cn(
                  'min-h-[40px] rounded-xl px-4 text-sm font-semibold',
                  adminTab === t
                    ? 'bg-[var(--kc-accent,#c41e3a)] text-white'
                    : 'border border-[var(--color-slate-700,#e8e4df)] text-[var(--color-jewelry-black,#1a1814)]/75',
                )}
              >
                {t === 'counters' ? 'Counters & staff' : 'Analytics'}
              </button>
            ))}
          </div>

          {adminTab === 'counters' ? (
            <div className={`${erpCardCls} space-y-4`}>
              <div className="flex flex-col gap-2 sm:flex-row">
                <input
                  className={`${erpInputCls} flex-1`}
                  placeholder="New counter name (e.g. Ring counter)"
                  value={newCounterName}
                  onChange={(e) => setNewCounterName(e.target.value)}
                />
                <button
                  type="button"
                  className={erpBtnPrimary}
                  onClick={() =>
                    void createCounter(newCounterName.trim())
                      .then(() => {
                        setNewCounterName('')
                        setMsg('Counter added')
                        return reloadBoot()
                      })
                      .catch(() => setErr('Could not add counter'))
                  }
                >
                  <Plus className="size-4" /> Add counter
                </button>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <div>
                  <label className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-jewelry-black,#1a1814)]/50">
                    Store greeter incharge
                  </label>
                  <select
                    className={`${erpInputCls} mt-1 w-full`}
                    value={greeterOpId}
                    onChange={(e) => setGreeterOpId(e.target.value ? parseInt(e.target.value, 10) : '')}
                  >
                    <option value="">Select greeter…</option>
                    {operators.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.displayName}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex items-end">
                  <button
                    type="button"
                    className={erpBtnGhost}
                    disabled={!greeterOpId}
                    onClick={() =>
                      void setStoreGreeter(Number(greeterOpId))
                        .then(() => {
                          setMsg('Greeter updated')
                          return reloadBoot()
                        })
                        .catch(() => setErr('Could not set greeter'))
                    }
                  >
                    Save greeter
                  </button>
                </div>
              </div>
              <ul className="space-y-2">
                {counters.map((c) => (
                  <li
                    key={c.id}
                    className="rounded-xl border border-[var(--color-slate-700,#e8e4df)] bg-white p-3"
                  >
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                      <p className="min-w-0 flex-1 font-semibold text-[var(--color-jewelry-black,#1a1814)]">
                        {c.name}
                      </p>
                      <select
                        className={`${erpInputCls} max-w-xs`}
                        value={c.incharge_operator_id ?? ''}
                        onChange={(e) => {
                          const v = e.target.value ? parseInt(e.target.value, 10) : null
                          void updateCounter(c.id, { incharge_operator_id: v })
                            .then(() => reloadBoot())
                            .catch(() => setErr('Could not assign incharge'))
                        }}
                      >
                        <option value="">Incharge staff…</option>
                        {operators.map((o) => (
                          <option key={o.id} value={o.id}>
                            {o.displayName}
                          </option>
                        ))}
                      </select>
                      {shadowUnlocked && operator?.role === 'admin' ? (
                        <button
                          type="button"
                          className="inline-flex min-h-[36px] items-center gap-1 rounded-lg border border-rose-500/30 px-2 text-xs text-rose-700"
                          onClick={() =>
                            void deleteCounter(c.id)
                              .then(() => reloadBoot())
                              .catch(() => setErr('Delete failed — unlock Jainav mode'))
                          }
                        >
                          <Trash2 className="size-3.5" /> Delete
                        </button>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <div className={`${erpCardCls} space-y-3`}>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                <input
                  type="date"
                  className={erpInputCls}
                  value={fromDate}
                  onChange={(e) => setFromDate(e.target.value)}
                />
                <input
                  type="date"
                  className={erpInputCls}
                  value={toDate}
                  onChange={(e) => setToDate(e.target.value)}
                />
                <div className="flex gap-1 rounded-xl border border-[var(--color-slate-700,#e8e4df)] p-1">
                  {(['summary', 'detailed'] as const).map((v) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setReportView(v)}
                      className={cn(
                        'min-h-[36px] flex-1 rounded-lg text-xs font-semibold capitalize',
                        reportView === v
                          ? 'bg-[var(--kc-accent,#c41e3a)] text-white'
                          : 'text-[var(--color-jewelry-black,#1a1814)]/75',
                      )}
                    >
                      {v}
                    </button>
                  ))}
                </div>
                <button type="button" className={erpBtnPrimary} disabled={reportBusy} onClick={() => void loadAnalytics()}>
                  {reportBusy ? <Loader2 className="size-4 animate-spin" /> : null}
                  Load report
                </button>
              </div>
              {analytics ? (
                <>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[480px] text-left text-sm text-[var(--color-jewelry-black,#1a1814)]">
                      <thead>
                        <tr className="border-b border-[var(--color-slate-700,#e8e4df)] text-[10px] uppercase tracking-wide text-[var(--color-jewelry-black,#1a1814)]/50">
                          <th className="py-2 pr-2">Staff</th>
                          <th className="py-2 pr-2">Counter</th>
                          <th className="py-2 pr-2">Routed</th>
                          <th className="py-2 pr-2">Sales</th>
                          <th className="py-2 pr-2">No sale</th>
                          <th className="py-2">Conv %</th>
                        </tr>
                      </thead>
                      <tbody>
                        {analytics.summary.map((r, i) => (
                          <tr key={i} className="border-b border-[var(--color-slate-700,#e8e4df)]/40">
                            <td className="py-2 pr-2">{r.display_name || '—'}</td>
                            <td className="py-2 pr-2">{r.counter_name || '—'}</td>
                            <td className="py-2 pr-2 tabular-nums">{r.interactions}</td>
                            <td className="py-2 pr-2 tabular-nums">{r.sales}</td>
                            <td className="py-2 pr-2 tabular-nums">{r.no_sales}</td>
                            <td className="py-2 tabular-nums">{r.conversion_pct}%</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {analytics.lost_sale_reasons.length ? (
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-jewelry-black,#1a1814)]/50">
                        Lost sale reasons
                      </p>
                      <ul className="mt-2 space-y-1 text-sm">
                        {analytics.lost_sale_reasons.map((r) => (
                          <li key={r.reason} className="flex justify-between gap-2">
                            <span>{r.reason}</span>
                            <span className="tabular-nums font-medium">{r.count}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                  {reportView === 'detailed' && analytics.detailed.length ? (
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[640px] text-left text-sm text-[var(--color-jewelry-black,#1a1814)]">
                        <thead>
                          <tr className="border-b border-[var(--color-slate-700,#e8e4df)] text-[10px] uppercase tracking-wide text-[var(--color-jewelry-black,#1a1814)]/50">
                            <th className="py-2 pr-2">When</th>
                            <th className="py-2 pr-2">Customer</th>
                            <th className="py-2 pr-2">Counter</th>
                            <th className="py-2 pr-2">Staff</th>
                            <th className="py-2 pr-2">Outcome</th>
                            <th className="py-2">Notes</th>
                          </tr>
                        </thead>
                        <tbody>
                          {analytics.detailed.map((r) => (
                            <tr key={r.id} className="border-b border-[var(--color-slate-700,#e8e4df)]/40">
                              <td className="py-2 pr-2 text-xs whitespace-nowrap">
                                {new Date(r.created_at).toLocaleString('en-IN', {
                                  dateStyle: 'short',
                                  timeStyle: 'short',
                                })}
                              </td>
                              <td className="py-2 pr-2">
                                {r.customer_name}
                                {r.customer_mobile ? (
                                  <span className="block text-xs text-[var(--color-jewelry-black,#1a1814)]/55">
                                    {r.customer_mobile}
                                  </span>
                                ) : null}
                              </td>
                              <td className="py-2 pr-2">{r.counter_name || '—'}</td>
                              <td className="py-2 pr-2">{r.operator_name || '—'}</td>
                              <td className="py-2 pr-2">{r.outcome_label}</td>
                              <td className="py-2 text-xs text-[var(--color-jewelry-black,#1a1814)]/65">
                                {r.bill_number ? `Bill ${r.bill_number}` : ''}
                                {r.no_sale_reason ? r.no_sale_reason : r.purchase_notes || '—'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : null}
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      className={erpBtnGhost}
                      onClick={() =>
                        void exportRoutingAnalyticsExcel(analytics, `${fromDate}_${toDate}`)
                      }
                    >
                      Download Excel
                    </button>
                    <button
                      type="button"
                      className={erpBtnGhost}
                      onClick={() =>
                        void downloadRoutingReportPdf({
                          from: fromDate,
                          to: toDate,
                          summary: analytics.summary,
                          detailed: analytics.detailed.map((r) => ({
                            ...r,
                            outcome_label: r.outcome_label,
                          })),
                          lostReasons: analytics.lost_sale_reasons,
                          view: reportView,
                        })
                      }
                    >
                      Preview PDF
                    </button>
                  </div>
                </>
              ) : null}
            </div>
          )}
        </div>
      )}

      {timelineVisitId ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/45 p-3 sm:items-center"
          role="dialog"
          aria-modal
        >
          <div className="max-h-[90vh] w-full max-w-lg overflow-hidden rounded-2xl border border-[var(--color-slate-700,#e8e4df)] bg-[var(--color-pearl,#faf8f5)] shadow-xl">
            <div className="flex items-center justify-between border-b border-[var(--color-slate-700,#e8e4df)] px-4 py-3">
              <p className="font-semibold text-[var(--color-jewelry-black,#1a1814)]">Visit timeline</p>
              <button
                type="button"
                className="rounded-lg p-2 text-[var(--color-jewelry-black,#1a1814)]/70"
                onClick={() => setTimelineVisitId(null)}
                aria-label="Close"
              >
                <X className="size-5" />
              </button>
            </div>
            <div className="max-h-[calc(90vh-56px)] overflow-y-auto p-4">
              {timelineLoading ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="size-8 animate-spin text-[var(--color-jewelry-black,#1a1814)]/40" />
                </div>
              ) : timeline ? (
                <div className="space-y-4">
                  <div>
                    <p className="text-lg font-semibold text-[var(--color-jewelry-black,#1a1814)]">
                      {timeline.visit.customer_name}
                    </p>
                    <p className="text-sm text-[var(--color-jewelry-black,#1a1814)]/55">
                      {timeline.visit.customer_mobile || 'No mobile'} · {timeline.visit.status}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wide text-[var(--color-jewelry-black,#1a1814)]/50">
                      Journey
                    </p>
                    <ol className="mt-2 space-y-2 border-l-2 border-[var(--kc-accent,#c41e3a)]/25 pl-3">
                      {timeline.trail.map((t, i) => (
                        <li key={i} className="text-sm">
                          <p className="font-medium text-[var(--color-jewelry-black,#1a1814)]">{t.label}</p>
                          <p className="text-xs text-[var(--color-jewelry-black,#1a1814)]/60">{t.detail}</p>
                          <p className="text-[10px] text-[var(--color-jewelry-black,#1a1814)]/45">
                            {new Date(t.at).toLocaleString('en-IN', {
                              dateStyle: 'short',
                              timeStyle: 'short',
                            })}
                          </p>
                        </li>
                      ))}
                      {!timeline.trail.length ? (
                        <li className="text-sm text-[var(--color-jewelry-black,#1a1814)]/55">No interactions yet.</li>
                      ) : null}
                    </ol>
                  </div>
                  {timeline.queue.length ? (
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wide text-[var(--color-jewelry-black,#1a1814)]/50">
                        Queue history
                      </p>
                      <ul className="mt-2 space-y-1 text-sm text-[var(--color-jewelry-black,#1a1814)]">
                        {timeline.queue.map((q) => (
                          <li key={q.id} className="flex justify-between gap-2 rounded-lg bg-white px-2 py-1.5">
                            <span>{q.counter_name}</span>
                            <span className="text-xs capitalize text-[var(--color-jewelry-black,#1a1814)]/55">
                              {q.status}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </div>
              ) : (
                <p className="py-6 text-center text-sm text-[var(--color-jewelry-black,#1a1814)]/55">
                  Could not load timeline.
                </p>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

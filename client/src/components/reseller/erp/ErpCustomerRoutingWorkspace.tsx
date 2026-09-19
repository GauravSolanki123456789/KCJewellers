'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import axios from '@/lib/axios'
import {
  completeQueueItem,
  createCounter,
  deleteCounter,
  exportRoutingAnalyticsExcel,
  fetchLiveQueue,
  fetchRoutingAnalytics,
  fetchRoutingBootstrap,
  routeCustomerToCounter,
  setStoreGreeter,
  startServingQueueItem,
  updateCounter,
  type QueueItem,
  type RoutingBootstrap,
} from '@/lib/erp-customer-routing'
import { erpBtnGhost, erpBtnPrimary, erpCardCls, erpInputCls } from '@/components/reseller/erp/erp-ui'
import { RESELLER_ERP_PATH } from '@/lib/routes'
import { erpTodayIso, erpDaysAgoIso } from '@/lib/erp-date-format'
import { useErpOperator } from '@/context/ErpOperatorContext'
import { cn } from '@/lib/utils'
import { Loader2, Plus, RefreshCw, Route, Trash2, Users } from 'lucide-react'

type ErpCustomer = { id: number; name: string; mobile?: string | null }

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
  const [customers, setCustomers] = useState<ErpCustomer[]>([])
  const [operators, setOperators] = useState<{ id: number; displayName: string }[]>([])
  const [selectedCustomerId, setSelectedCustomerId] = useState<number | ''>('')
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

  const reloadBoot = useCallback(async () => {
    const b = await fetchRoutingBootstrap()
    setBoot(b)
    if (b.greeter) setGreeterOpId(b.greeter.id)
  }, [])

  const reloadQueue = useCallback(async () => {
    if (!boot) return
    const cid = boot.role === 'counter' && boot.myCounterIds[0] ? boot.myCounterIds[0] : undefined
    const q = await fetchLiveQueue(cid)
    setQueue(q)
  }, [boot])

  useEffect(() => {
    void (async () => {
      setLoading(true)
      try {
        await reloadBoot()
        const [custRes] = await Promise.all([
          axios.get<{ customers: ErpCustomer[] }>('/api/reseller/erp/customers', {
            params: { limit: 200 },
          }),
        ])
        setCustomers(custRes.data.customers || [])
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
    const t = window.setInterval(() => void reloadQueue(), 4000)
    return () => window.clearInterval(t)
  }, [boot, reloadQueue])

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
    if (!selectedCustomerId || !routeCounterId) {
      setErr('Choose customer and counter')
      return
    }
    setErr('')
    try {
      await routeCustomerToCounter({
        customer_id: Number(selectedCustomerId),
        counter_id: Number(routeCounterId),
      })
      setMsg('Customer routed to counter')
      setSelectedCustomerId('')
      await reloadQueue()
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
      await reloadQueue()
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
              ? 'Greeter — route walk-ins to counters'
              : role === 'counter'
                ? 'Your counter queue'
                : 'View only — ask admin for counter or greeter role'}
        </p>
        <button type="button" className={erpBtnGhost} onClick={() => void reloadBoot().then(() => reloadQueue())}>
          <RefreshCw className="size-4" /> Refresh
        </button>
      </div>

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
              <select
                className={`${erpInputCls} mt-1 w-full`}
                value={selectedCustomerId}
                onChange={(e) =>
                  setSelectedCustomerId(e.target.value ? parseInt(e.target.value, 10) : '')
                }
              >
                <option value="">Select customer…</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                    {c.mobile ? ` · ${c.mobile}` : ''}
                  </option>
                ))}
              </select>
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

      {(role === 'counter' || role === 'admin') && (
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
              <div className="grid gap-2 sm:grid-cols-3">
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
                  <button
                    type="button"
                    className={erpBtnGhost}
                    onClick={() =>
                      void exportRoutingAnalyticsExcel(analytics, `${fromDate}_${toDate}`)
                    }
                  >
                    Download Excel
                  </button>
                </>
              ) : null}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

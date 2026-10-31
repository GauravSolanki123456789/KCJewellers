'use client'

import { useEffect, useState } from 'react'
import {
  fetchLiveStations,
  fetchManagementDashboard,
  saveOperatorSalesTarget,
  type LiveStation,
  type ManagementDashboard,
} from '@/lib/erp-customer-routing'
import { erpBtnPrimary, erpCardCls, erpInputCls } from '@/components/reseller/erp/erp-ui'
import { erpDaysAgoIso, erpTodayIso } from '@/lib/erp-date-format'
import { BarChart3, Loader2, Radio } from 'lucide-react'
import { cn } from '@/lib/utils'

type Props = {
  operators: { id: number; displayName: string }[]
  onMsg?: (m: string) => void
  onErr?: (m: string) => void
}

function StatTile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-[var(--color-slate-700,#e8e4df)] bg-white p-3">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-jewelry-black,#1a1814)]/50">
        {label}
      </p>
      <p className="mt-1 text-xl font-bold tabular-nums text-[var(--color-jewelry-black,#1a1814)]">
        {value}
      </p>
      {sub ? (
        <p className="mt-0.5 text-xs text-[var(--color-jewelry-black,#1a1814)]/55">{sub}</p>
      ) : null}
    </div>
  )
}

export function ErpRoutingManagementDashboard({ operators, onMsg, onErr }: Props) {
  const [fromDate, setFromDate] = useState(erpDaysAgoIso(7))
  const [toDate, setToDate] = useState(erpTodayIso())
  const [periodKey, setPeriodKey] = useState(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  })
  const [data, setData] = useState<ManagementDashboard | null>(null)
  const [stations, setStations] = useState<LiveStation[]>([])
  const [busy, setBusy] = useState(false)
  const [targetDrafts, setTargetDrafts] = useState<Record<number, string>>({})

  const load = async () => {
    setBusy(true)
    try {
      const [dash, live] = await Promise.all([
        fetchManagementDashboard({ from: fromDate, to: toDate, period_key: periodKey }),
        fetchLiveStations().catch(() => [] as LiveStation[]),
      ])
      setData(dash)
      setStations(live)
      const drafts: Record<number, string> = {}
      for (const p of dash.salesperson_performance) {
        if (p.operator_id != null && p.monthly_target_inr > 0) {
          drafts[p.operator_id] = String(p.monthly_target_inr)
        }
      }
      setTargetDrafts((prev) => ({ ...drafts, ...prev }))
    } catch {
      onErr?.('Failed to load management dashboard')
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    void load()
    const t = window.setInterval(() => {
      void fetchLiveStations()
        .then(setStations)
        .catch(() => undefined)
    }, 5000)
    return () => window.clearInterval(t)
    // initial dashboard load once; live counters keep polling
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const saveTarget = async (operatorId: number) => {
    const raw = targetDrafts[operatorId] || ''
    const n = Number(String(raw).replace(/,/g, ''))
    if (!Number.isFinite(n) || n < 0) {
      onErr?.('Enter a valid target amount')
      return
    }
    try {
      await saveOperatorSalesTarget({
        operator_id: operatorId,
        period_key: periodKey,
        period_type: 'month',
        target_amount_inr: n,
      })
      onMsg?.('Sales target saved')
      await load()
    } catch {
      onErr?.('Could not save target')
    }
  }

  const s = data?.summary

  return (
    <div className="space-y-4">
      <div className={`${erpCardCls} space-y-3`}>
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-jewelry-black,#1a1814)]/50">
            From
            <input
              type="date"
              className={`${erpInputCls} mt-1 block`}
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
            />
          </label>
          <label className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-jewelry-black,#1a1814)]/50">
            To
            <input
              type="date"
              className={`${erpInputCls} mt-1 block`}
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
            />
          </label>
          <label className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-jewelry-black,#1a1814)]/50">
            Target month
            <input
              type="month"
              className={`${erpInputCls} mt-1 block`}
              value={periodKey}
              onChange={(e) => setPeriodKey(e.target.value)}
            />
          </label>
          <button type="button" className={erpBtnPrimary} disabled={busy} onClick={() => void load()}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : null}
            Load dashboard
          </button>
        </div>
      </div>

      {stations.length ? (
        <div className={`${erpCardCls} space-y-3`}>
          <p className="font-semibold text-[var(--color-jewelry-black,#1a1814)]">
            <Radio className="mr-1 inline size-4 text-[var(--kc-accent,#c41e3a)]" />
            Live counter station
          </p>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {stations.map((st) => (
              <div
                key={st.counter_id}
                className="rounded-xl border border-[var(--color-slate-700,#e8e4df)] bg-white p-3"
              >
                <p className="font-semibold text-[var(--color-jewelry-black,#1a1814)]">{st.counter_name}</p>
                <p className="mt-1 text-xs text-[var(--color-jewelry-black,#1a1814)]/65">
                  Incharge: {st.incharge_name || '—'}
                </p>
                <p
                  className={cn(
                    'mt-2 inline-flex rounded-lg px-2 py-0.5 text-[10px] font-bold uppercase',
                    st.salesperson_status === 'with_customer'
                      ? 'bg-emerald-100 text-emerald-900'
                      : 'bg-slate-100 text-slate-800',
                  )}
                >
                  {st.salesperson_status === 'with_customer' ? 'With customer' : 'Free'}
                </p>
                {st.active_customer ? (
                  <p className="mt-2 text-sm font-medium text-[var(--color-jewelry-black,#1a1814)]">
                    {st.active_customer}
                  </p>
                ) : null}
                <p className="mt-1 text-xs tabular-nums text-[var(--color-jewelry-black,#1a1814)]/60">
                  Waiting: {st.waiting_count} · Billing: {st.billing_pending}
                </p>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {s ? (
        <>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <StatTile label="Total visitors" value={String(s.total_visitors)} />
            <StatTile label="Purchasers" value={String(s.total_purchasers)} />
            <StatTile
              label="Conversion"
              value={`${s.overall_conversion_pct}%`}
              sub={`${s.total_no_purchase} no-purchase`}
            />
            <StatTile
              label="Total sales"
              value={`₹${s.total_sales_inr.toLocaleString('en-IN')}`}
              sub={`Avg bill ₹${s.average_bill_inr.toLocaleString('en-IN')}`}
            />
            <StatTile
              label="Follow-ups"
              value={`${s.follow_ups_pending} open`}
              sub={`${s.follow_ups_overdue} overdue`}
            />
            <StatTile
              label="Avg counters / visit"
              value={String(s.avg_counters_per_visit)}
            />
          </div>

          <div className={`${erpCardCls} overflow-x-auto`}>
            <p className="mb-2 font-semibold text-[var(--color-jewelry-black,#1a1814)]">
              <BarChart3 className="mr-1 inline size-4" />
              Counter-wise report
            </p>
            <table className="w-full min-w-[640px] text-left text-sm text-[var(--color-jewelry-black,#1a1814)]">
              <thead>
                <tr className="border-b border-[var(--color-slate-700,#e8e4df)] text-[10px] uppercase tracking-wide text-[var(--color-jewelry-black,#1a1814)]/50">
                  <th className="py-2 pr-2">Counter</th>
                  <th className="py-2 pr-2">Visitors</th>
                  <th className="py-2 pr-2">Purchased</th>
                  <th className="py-2 pr-2">No sale</th>
                  <th className="py-2 pr-2">In / Out</th>
                  <th className="py-2 pr-2">Conv %</th>
                  <th className="py-2">Sales ₹</th>
                </tr>
              </thead>
              <tbody>
                {(data?.counter_report || []).map((r) => (
                  <tr key={r.counter_id} className="border-b border-[var(--color-slate-700,#e8e4df)]/40">
                    <td className="py-2 pr-2 font-medium">{r.counter_name}</td>
                    <td className="py-2 pr-2 tabular-nums">{r.total_visitors}</td>
                    <td className="py-2 pr-2 tabular-nums">{r.purchased}</td>
                    <td className="py-2 pr-2 tabular-nums">{r.no_purchase}</td>
                    <td className="py-2 pr-2 tabular-nums text-xs">
                      {r.transferred_in}/{r.transferred_out}
                    </td>
                    <td className="py-2 pr-2 tabular-nums">{r.conversion_pct}%</td>
                    <td className="py-2 tabular-nums">
                      {r.sales_value_inr.toLocaleString('en-IN')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className={`${erpCardCls} overflow-x-auto`}>
            <p className="mb-2 font-semibold text-[var(--color-jewelry-black,#1a1814)]">
              Salesperson targets & achievement
            </p>
            <table className="w-full min-w-[720px] text-left text-sm text-[var(--color-jewelry-black,#1a1814)]">
              <thead>
                <tr className="border-b border-[var(--color-slate-700,#e8e4df)] text-[10px] uppercase tracking-wide text-[var(--color-jewelry-black,#1a1814)]/50">
                  <th className="py-2 pr-2">Staff</th>
                  <th className="py-2 pr-2">Attended</th>
                  <th className="py-2 pr-2">Sales ₹</th>
                  <th className="py-2 pr-2">Conv %</th>
                  <th className="py-2 pr-2">Target ₹</th>
                  <th className="py-2 pr-2">Ach %</th>
                  <th className="py-2">Save</th>
                </tr>
              </thead>
              <tbody>
                {(data?.salesperson_performance || []).map((p) => (
                  <tr key={p.operator_id ?? p.name} className="border-b border-[var(--color-slate-700,#e8e4df)]/40">
                    <td className="py-2 pr-2">{p.name}</td>
                    <td className="py-2 pr-2 tabular-nums">{p.customers_attended}</td>
                    <td className="py-2 pr-2 tabular-nums">
                      {p.sales_amount_inr.toLocaleString('en-IN')}
                    </td>
                    <td className="py-2 pr-2 tabular-nums">{p.conversion_pct}%</td>
                    <td className="py-2 pr-2">
                      {p.operator_id != null ? (
                        <input
                          className={`${erpInputCls} max-w-[120px]`}
                          inputMode="decimal"
                          placeholder="Monthly target"
                          value={targetDrafts[p.operator_id] ?? ''}
                          onChange={(e) =>
                            setTargetDrafts((d) => ({
                              ...d,
                              [p.operator_id!]: e.target.value,
                            }))
                          }
                        />
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="py-2 pr-2 tabular-nums">
                      {p.achievement_pct != null ? `${p.achievement_pct}%` : '—'}
                    </td>
                    <td className="py-2">
                      {p.operator_id != null ? (
                        <button
                          type="button"
                          className="text-xs font-semibold text-[var(--kc-accent,#c41e3a)]"
                          onClick={() => void saveTarget(p.operator_id!)}
                        >
                          Save
                        </button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!data?.salesperson_performance?.length && operators.length ? (
              <p className="text-sm text-[var(--color-jewelry-black,#1a1814)]/55">
                No interactions in this date range yet. Set monthly targets below when staff have activity.
              </p>
            ) : null}
            {operators.length && !data?.salesperson_performance?.length ? (
              <ul className="mt-3 space-y-2">
                {operators.map((o) => (
                  <li
                    key={o.id}
                    className="flex flex-wrap items-center gap-2 rounded-lg border border-[var(--color-slate-700,#e8e4df)] p-2"
                  >
                    <span className="min-w-[120px] text-sm font-medium text-[var(--color-jewelry-black,#1a1814)]">
                      {o.displayName}
                    </span>
                    <input
                      className={`${erpInputCls} max-w-[140px]`}
                      placeholder="Monthly target ₹"
                      value={targetDrafts[o.id] ?? ''}
                      onChange={(e) =>
                        setTargetDrafts((d) => ({ ...d, [o.id]: e.target.value }))
                      }
                    />
                    <button
                      type="button"
                      className="text-xs font-semibold text-[var(--kc-accent,#c41e3a)]"
                      onClick={() => void saveTarget(o.id)}
                    >
                      Save target
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        </>
      ) : (
        <p className="text-sm text-[var(--color-jewelry-black,#1a1814)]/55">
          Choose a date range and load the management dashboard.
        </p>
      )}
    </div>
  )
}

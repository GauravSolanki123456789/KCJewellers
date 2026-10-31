'use client'

import { useEffect, useState } from 'react'
import { fetchLiveStations, type LiveStation } from '@/lib/erp-customer-routing'
import { erpCardCls } from '@/components/reseller/erp/erp-ui'
import { cn } from '@/lib/utils'
import { Loader2, Radio } from 'lucide-react'

function formatLakhs(inr: number): string {
  if (!inr) return '₹0'
  if (inr >= 100000) return `₹${(inr / 100000).toFixed(2)} L`
  return `₹${inr.toLocaleString('en-IN')}`
}

export function ErpRoutingLiveStationsPanel() {
  const [stations, setStations] = useState<LiveStation[]>([])
  const [busy, setBusy] = useState(true)

  const load = async () => {
    try {
      setStations(await fetchLiveStations())
    } catch {
      setStations([])
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    void load()
    const t = window.setInterval(() => void load(), 5000)
    return () => window.clearInterval(t)
  }, [])

  return (
    <div className={`${erpCardCls} space-y-3`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-semibold text-[var(--color-jewelry-black,#1a1814)]">
            <Radio className="mr-1 inline size-4 text-[var(--kc-accent,#c41e3a)]" />
            Live counter station
          </p>
          <p className="mt-0.5 text-xs text-[var(--color-jewelry-black,#1a1814)]/55">
            Real-time counters, waiting customers and today&apos;s sales — refreshes every 5s.
          </p>
        </div>
        {busy ? <Loader2 className="size-5 animate-spin text-[var(--color-jewelry-black,#1a1814)]/40" /> : null}
      </div>
      {!stations.length && !busy ? (
        <p className="text-sm text-[var(--color-jewelry-black,#1a1814)]/55">
          No active counters. Add counters under admin settings.
        </p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {stations.map((st) => {
            const active = st.salesperson_status === 'with_customer'
            return (
              <div
                key={st.counter_id}
                className="rounded-xl border border-[var(--color-slate-700,#e8e4df)] bg-white p-3 shadow-sm"
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="font-semibold text-[var(--color-jewelry-black,#1a1814)]">{st.counter_name}</p>
                  <span
                    className={cn(
                      'shrink-0 rounded-lg px-2 py-0.5 text-[10px] font-bold uppercase',
                      active ? 'bg-sky-100 text-sky-900' : 'bg-emerald-100 text-emerald-900',
                    )}
                  >
                    {active ? 'Active' : 'Ready'}
                  </span>
                </div>
                <p className="mt-1 text-xs text-[var(--color-jewelry-black,#1a1814)]/65">
                  {st.incharge_name || 'No incharge assigned'}
                </p>
                <div className="mt-3 rounded-lg border border-[var(--color-slate-700,#e8e4df)]/70 bg-[var(--color-jewelry-black,#1a1814)]/[0.02] p-2">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-jewelry-black,#1a1814)]/45">
                    Staff
                  </p>
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <span
                      className={cn(
                        'rounded-md px-2 py-0.5 text-[10px] font-bold uppercase',
                        active ? 'bg-sky-100 text-sky-900' : 'bg-emerald-100 text-emerald-900',
                      )}
                    >
                      {active ? 'With customer' : 'Available'}
                    </span>
                    {st.active_customer ? (
                      <span className="text-sm font-medium text-[var(--color-jewelry-black,#1a1814)]">
                        {st.active_customer}
                      </span>
                    ) : null}
                  </div>
                </div>
                <dl className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
                  <div className="rounded-lg bg-[var(--color-jewelry-black,#1a1814)]/[0.04] p-2">
                    <dt className="text-[var(--color-jewelry-black,#1a1814)]/50">Waiting</dt>
                    <dd className="mt-0.5 text-base font-bold tabular-nums text-[var(--color-jewelry-black,#1a1814)]">
                      {st.waiting_count}
                    </dd>
                  </div>
                  <div className="rounded-lg bg-[var(--color-jewelry-black,#1a1814)]/[0.04] p-2">
                    <dt className="text-[var(--color-jewelry-black,#1a1814)]/50">Done today</dt>
                    <dd className="mt-0.5 text-base font-bold tabular-nums text-[var(--color-jewelry-black,#1a1814)]">
                      {st.completed_today ?? 0}
                    </dd>
                  </div>
                  <div className="rounded-lg bg-[var(--color-jewelry-black,#1a1814)]/[0.04] p-2">
                    <dt className="text-[var(--color-jewelry-black,#1a1814)]/50">Sales</dt>
                    <dd className="mt-0.5 text-sm font-bold tabular-nums text-[var(--color-jewelry-black,#1a1814)]">
                      {formatLakhs(st.sales_today_inr ?? 0)}
                    </dd>
                  </div>
                </dl>
                {st.billing_pending ? (
                  <p className="mt-2 text-[11px] font-medium text-amber-800">
                    Billing queue: {st.billing_pending}
                  </p>
                ) : null}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

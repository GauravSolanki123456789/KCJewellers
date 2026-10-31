'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  completeRoutingFollowUp,
  deleteRoutingFollowUp,
  exportTableExcel,
  fetchRoutingFollowUps,
  type RoutingFollowUp,
} from '@/lib/erp-customer-routing'
import { erpBtnGhost, erpBtnPrimary, erpCardCls, erpInputCls } from '@/components/reseller/erp/erp-ui'
import { downloadRoutingTablePdf } from '@/lib/erp-routing-report-pdf'
import { appPrompt } from '@/lib/app-notice'
import { cn } from '@/lib/utils'
import { Clock, Loader2 } from 'lucide-react'

type Props = {
  onMsg?: (m: string) => void
  onErr?: (m: string) => void
  jainavUnlocked?: boolean
}

function badge(cls: string, label: string) {
  return (
    <span className={cn('inline-flex rounded-lg px-2 py-0.5 text-[10px] font-bold uppercase', cls)}>
      {label}
    </span>
  )
}

export function ErpRoutingFollowUpReport({ onMsg, onErr, jainavUnlocked }: Props) {
  const [rows, setRows] = useState<RoutingFollowUp[]>([])
  const [statusFilter, setStatusFilter] = useState<'all' | 'open' | 'completed'>('all')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setBusy(true)
    try {
      const all = await fetchRoutingFollowUps('all')
      setRows(all)
    } catch {
      onErr?.('Failed to load follow-ups')
    } finally {
      setBusy(false)
    }
  }, [onErr])

  useEffect(() => {
    void load()
  }, [load])

  const filtered = useMemo(() => {
    if (statusFilter === 'all') return rows
    if (statusFilter === 'open') return rows.filter((r) => r.status !== 'completed')
    return rows.filter((r) => r.status === 'completed')
  }, [rows, statusFilter])

  const stats = useMemo(() => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    let dueToday = 0
    let pending = 0
    let completed = 0
    for (const r of rows) {
      if (r.status === 'completed') completed++
      else pending++
      if (r.follow_up_at) {
        const d = new Date(r.follow_up_at)
        d.setHours(0, 0, 0, 0)
        if (d.getTime() <= today.getTime() && r.status !== 'completed') dueToday++
      }
    }
    return { total: rows.length, pending, completed, dueToday }
  }, [rows])

  const markDone = async (id: number) => {
    const result = await appPrompt('Result / customer response (optional)')
    if (result == null) return
    try {
      await completeRoutingFollowUp(id, { result })
      onMsg?.('Follow-up updated')
      await load()
    } catch {
      onErr?.('Could not update follow-up')
    }
  }

  return (
    <div className="space-y-3">
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ['Total', String(stats.total), 'This period'],
          ['Pending', String(stats.pending), 'Needs action'],
          ['Completed', String(stats.completed), 'Closed'],
          ['Due today', String(stats.dueToday), stats.dueToday ? 'Needs action' : 'On track'],
        ].map(([label, value, sub]) => (
          <div key={label} className={`${erpCardCls} p-3`}>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-jewelry-black,#1a1814)]/50">
              {label}
            </p>
            <p className="mt-1 text-xl font-bold tabular-nums text-[var(--color-jewelry-black,#1a1814)]">
              {value}
            </p>
            <p className="mt-0.5 text-xs text-[var(--color-jewelry-black,#1a1814)]/55">{sub}</p>
          </div>
        ))}
      </div>

      <div className={`${erpCardCls} space-y-3`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="font-semibold text-[var(--color-jewelry-black,#1a1814)]">
            <Clock className="mr-1 inline size-4 text-[var(--kc-accent,#c41e3a)]" />
            Follow-up report
          </p>
          <div className="flex flex-wrap gap-2">
            <select
              className={erpInputCls}
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
            >
              <option value="all">All statuses</option>
              <option value="open">Open</option>
              <option value="completed">Completed</option>
            </select>
            <button type="button" className={erpBtnPrimary} disabled={busy} onClick={() => void load()}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : null}
              Refresh
            </button>
            <button
              type="button"
              className={erpBtnGhost}
              onClick={() =>
                void exportTableExcel(
                  'Follow-ups',
                  ['Customer', 'Mobile', 'Source', 'Counter', 'Staff', 'Reason', 'Due', 'Status'],
                  filtered.map((f) => [
                    f.customer_name,
                    f.customer_mobile || '',
                    f.source,
                    f.counter_name || '',
                    f.operator_name || '',
                    f.remarks || '',
                    f.follow_up_at || f.created_at,
                    f.status,
                  ]),
                  'follow-ups-report',
                )
              }
            >
              Download Excel
            </button>
            <button
              type="button"
              className={erpBtnGhost}
              onClick={() =>
                void downloadRoutingTablePdf({
                  title: 'Follow-up report',
                  from: '—',
                  to: '—',
                  headers: ['Customer', 'Source', 'Counter', 'Status'],
                  rows: filtered.map((f) => [
                    f.customer_name,
                    f.source,
                    f.counter_name || '—',
                    f.status,
                  ]),
                  filename: 'follow-ups-report',
                })
              }
            >
              Preview PDF
            </button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm text-[var(--color-jewelry-black,#1a1814)]">
            <thead>
              <tr className="border-b border-[var(--color-slate-700,#e8e4df)] text-[10px] uppercase tracking-wide text-[var(--color-jewelry-black,#1a1814)]/50">
                <th className="py-2 pr-2">Customer</th>
                <th className="py-2 pr-2">Source</th>
                <th className="py-2 pr-2">Counter</th>
                <th className="py-2 pr-2">Staff</th>
                <th className="py-2 pr-2">Reason</th>
                <th className="py-2 pr-2">Due</th>
                <th className="py-2 pr-2">Status</th>
                <th className="py-2">Action</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((f) => (
                <tr key={f.id} className="border-b border-[var(--color-slate-700,#e8e4df)]/40">
                  <td className="py-2 pr-2">
                    <p className="font-medium">{f.customer_name}</p>
                    <p className="text-xs text-[var(--color-jewelry-black,#1a1814)]/55">{f.customer_mobile || '—'}</p>
                  </td>
                  <td className="py-2 pr-2">
                    {badge(
                      String(f.source || '').toLowerCase().includes('scheme')
                        ? 'bg-violet-100 text-violet-900'
                        : 'bg-amber-100 text-amber-900',
                      f.source || 'visit',
                    )}
                  </td>
                  <td className="py-2 pr-2 text-xs">{f.counter_name || '—'}</td>
                  <td className="py-2 pr-2 text-xs">{f.operator_name || '—'}</td>
                  <td className="py-2 pr-2 text-xs max-w-[140px]">{f.remarks || '—'}</td>
                  <td className="py-2 pr-2 text-xs whitespace-nowrap">
                    {f.follow_up_at
                      ? new Date(f.follow_up_at).toLocaleDateString('en-IN')
                      : new Date(f.created_at).toLocaleDateString('en-IN')}
                  </td>
                  <td className="py-2 pr-2">
                    {f.status === 'completed'
                      ? badge('bg-emerald-100 text-emerald-900', 'Done')
                      : badge('bg-amber-100 text-amber-900', 'Pending')}
                  </td>
                  <td className="py-2">
                    <div className="flex flex-wrap gap-1">
                      {f.status !== 'completed' ? (
                        <button type="button" className={erpBtnGhost} onClick={() => void markDone(f.id)}>
                          Complete
                        </button>
                      ) : null}
                      {jainavUnlocked ? (
                        <button
                          type="button"
                          className="text-xs font-semibold text-rose-700"
                          onClick={() => {
                            void deleteRoutingFollowUp(f.id)
                              .then(() => {
                                onMsg?.('Follow-up deleted')
                                return load()
                              })
                              .catch(() => onErr?.('Delete failed'))
                          }}
                        >
                          Delete
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!filtered.length ? (
            <p className="py-6 text-center text-sm text-[var(--color-jewelry-black,#1a1814)]/55">
              No follow-ups in this view.
            </p>
          ) : null}
        </div>
      </div>
    </div>
  )
}

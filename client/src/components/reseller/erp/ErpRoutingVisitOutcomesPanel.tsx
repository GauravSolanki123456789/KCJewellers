'use client'

import { useState } from 'react'
import { fetchVisitOutcomes, exportTableExcel, type VisitOutcomeRow } from '@/lib/erp-customer-routing'
import { erpBtnGhost, erpBtnPrimary, erpCardCls, erpInputCls } from '@/components/reseller/erp/erp-ui'
import { downloadRoutingTablePdf } from '@/lib/erp-routing-report-pdf'
import { erpDaysAgoIso, erpTodayIso } from '@/lib/erp-date-format'
import { cn } from '@/lib/utils'
import { CheckCircle2, Loader2 } from 'lucide-react'

type Props = {
  onErr?: (m: string) => void
}

function resultBadge(result: string) {
  const r = result.toLowerCase()
  if (r === 'purchased') return 'bg-emerald-100 text-emerald-900'
  if (r === 'no_purchase') return 'bg-amber-100 text-amber-900'
  if (r === 'in_progress') return 'bg-sky-100 text-sky-900'
  if (r === 'transferred') return 'bg-violet-100 text-violet-900'
  return 'bg-slate-100 text-slate-800'
}

function resultLabel(result: string) {
  const r = result.toLowerCase()
  if (r === 'purchased') return 'Purchased'
  if (r === 'no_purchase') return 'No purchase'
  if (r === 'in_progress') return 'In progress'
  if (r === 'transferred') return 'Transferred'
  return result
}

export function ErpRoutingVisitOutcomesPanel({ onErr }: Props) {
  const [fromDate, setFromDate] = useState(erpDaysAgoIso(0))
  const [toDate, setToDate] = useState(erpTodayIso())
  const [rows, setRows] = useState<VisitOutcomeRow[]>([])
  const [busy, setBusy] = useState(false)

  const load = async () => {
    setBusy(true)
    try {
      setRows(await fetchVisitOutcomes({ from: fromDate, to: toDate }))
    } catch {
      onErr?.('Failed to load visit outcomes')
      setRows([])
    } finally {
      setBusy(false)
    }
  }

  const summary = rows.reduce(
    (acc, r) => {
      acc.total++
      if (r.final_result === 'purchased') acc.purchased++
      else if (r.final_result === 'no_purchase') acc.noPurchase++
      else if (r.final_result === 'in_progress') acc.inProgress++
      return acc
    },
    { total: 0, purchased: 0, noPurchase: 0, inProgress: 0 },
  )

  return (
    <div className="space-y-3">
      <div className={`${erpCardCls} flex flex-wrap items-end gap-2`}>
        <label className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-jewelry-black,#1a1814)]/50">
          From
          <input type="date" className={`${erpInputCls} mt-1 block`} value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
        </label>
        <label className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-jewelry-black,#1a1814)]/50">
          To
          <input type="date" className={`${erpInputCls} mt-1 block`} value={toDate} onChange={(e) => setToDate(e.target.value)} />
        </label>
        <button type="button" className={erpBtnPrimary} disabled={busy} onClick={() => void load()}>
          {busy ? <Loader2 className="size-4 animate-spin" /> : null}
          Load outcomes
        </button>
        {rows.length ? (
          <>
            <button
              type="button"
              className={erpBtnGhost}
              onClick={() =>
                void exportTableExcel(
                  'Visit outcomes',
                  ['Customer', 'Mobile', 'Counters', 'Staff', 'Result', 'Amount', 'No purchase', 'Scheme'],
                  rows.map((r) => [
                    r.customer_name,
                    r.customer_mobile || '',
                    r.counters_trail,
                    r.salespersons,
                    r.final_result,
                    r.amount_inr ?? '',
                    r.no_purchase_reason || '',
                    r.scheme,
                  ]),
                  `visit-outcomes-${fromDate}_${toDate}`,
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
                  title: 'Final visit results',
                  from: fromDate,
                  to: toDate,
                  headers: ['Customer', 'Result', 'Counters', 'Amount'],
                  rows: rows.map((r) => [
                    r.customer_name,
                    resultLabel(r.final_result),
                    r.counters_trail,
                    r.amount_inr != null ? String(r.amount_inr) : '—',
                  ]),
                  filename: `visit-outcomes-${fromDate}_${toDate}`,
                })
              }
            >
              Preview PDF
            </button>
          </>
        ) : null}
      </div>

      {rows.length ? (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ['Visits', summary.total],
            ['Purchased', summary.purchased],
            ['No purchase', summary.noPurchase],
            ['In progress', summary.inProgress],
          ].map(([label, value]) => (
            <div key={label} className={`${erpCardCls} p-3`}>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-jewelry-black,#1a1814)]/50">
                {label}
              </p>
              <p className="mt-1 text-xl font-bold tabular-nums text-[var(--color-jewelry-black,#1a1814)]">
                {value}
              </p>
            </div>
          ))}
        </div>
      ) : null}

      <div className={`${erpCardCls} overflow-x-auto`}>
        <p className="mb-2 font-semibold text-[var(--color-jewelry-black,#1a1814)]">
          <CheckCircle2 className="mr-1 inline size-4 text-[var(--kc-accent,#c41e3a)]" />
          Final visit results
        </p>
        <table className="w-full min-w-[760px] text-left text-sm text-[var(--color-jewelry-black,#1a1814)]">
          <thead>
            <tr className="border-b border-[var(--color-slate-700,#e8e4df)] text-[10px] uppercase tracking-wide text-[var(--color-jewelry-black,#1a1814)]/50">
              <th className="py-2 pr-2">Customer</th>
              <th className="py-2 pr-2">Counters</th>
              <th className="py-2 pr-2">Staff</th>
              <th className="py-2 pr-2">Result</th>
              <th className="py-2 pr-2">Amount</th>
              <th className="py-2 pr-2">No purchase</th>
              <th className="py-2">Scheme</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.visit_id} className="border-b border-[var(--color-slate-700,#e8e4df)]/40">
                <td className="py-2 pr-2">
                  <p className="font-medium">{r.customer_name}</p>
                  <p className="text-xs text-[var(--color-jewelry-black,#1a1814)]/55">{r.customer_mobile || '—'}</p>
                </td>
                <td className="py-2 pr-2 text-xs max-w-[160px]">{r.counters_trail}</td>
                <td className="py-2 pr-2 text-xs">{r.salespersons}</td>
                <td className="py-2 pr-2">
                  <span
                    className={cn(
                      'inline-flex rounded-lg px-2 py-0.5 text-[10px] font-bold uppercase',
                      resultBadge(r.final_result),
                    )}
                  >
                    {resultLabel(r.final_result)}
                  </span>
                </td>
                <td className="py-2 pr-2 tabular-nums">
                  {r.amount_inr != null ? `₹${r.amount_inr.toLocaleString('en-IN')}` : '—'}
                </td>
                <td className="py-2 pr-2 text-xs max-w-[120px]">{r.no_purchase_reason || '—'}</td>
                <td className="py-2 text-xs">{r.scheme}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length && !busy ? (
          <p className="py-6 text-center text-sm text-[var(--color-jewelry-black,#1a1814)]/55">
            Load a date range to see visit outcomes.
          </p>
        ) : null}
      </div>
    </div>
  )
}

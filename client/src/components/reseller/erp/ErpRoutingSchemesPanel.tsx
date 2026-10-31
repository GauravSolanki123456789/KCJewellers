'use client'

import { useEffect, useState } from 'react'
import { fetchSchemeStats, type SchemeStats } from '@/lib/erp-crm'
import { exportTableExcel } from '@/lib/erp-customer-routing'
import { erpBtnGhost, erpBtnPrimary, erpCardCls, erpInputCls } from '@/components/reseller/erp/erp-ui'
import { downloadRoutingTablePdf } from '@/lib/erp-routing-report-pdf'
import { erpDaysAgoIso, erpTodayIso } from '@/lib/erp-date-format'
import { Diamond, Loader2 } from 'lucide-react'

type Props = {
  onErr?: (m: string) => void
}

export function ErpRoutingSchemesPanel({ onErr }: Props) {
  const [fromDate, setFromDate] = useState(erpDaysAgoIso(30))
  const [toDate, setToDate] = useState(erpTodayIso())
  const [stats, setStats] = useState<SchemeStats | null>(null)
  const [busy, setBusy] = useState(false)

  const load = async () => {
    setBusy(true)
    try {
      setStats(await fetchSchemeStats(fromDate, toDate))
    } catch {
      onErr?.('Failed to load scheme performance')
      setStats(null)
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const t = stats?.totals

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
          Load
        </button>
        {stats ? (
          <>
            <button
              type="button"
              className={erpBtnGhost}
              onClick={() =>
                void exportTableExcel(
                  'Schemes',
                  ['Salesperson', 'Explained', 'Interested', 'Joined', 'Join rate'],
                  (stats.by_operator || []).map((r) => [
                    r.name,
                    r.explained,
                    r.interested,
                    r.joined,
                    `${r.join_rate_pct}%`,
                  ]),
                  `schemes-${fromDate}_${toDate}`,
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
                  title: 'Scheme performance',
                  from: fromDate,
                  to: toDate,
                  headers: ['Salesperson', 'Explained', 'Joined', 'Join rate'],
                  rows: (stats.by_operator || []).map((r) => [
                    r.name,
                    String(r.explained),
                    String(r.joined),
                    `${r.join_rate_pct}%`,
                  ]),
                  filename: `schemes-${fromDate}_${toDate}`,
                })
              }
            >
              Preview PDF
            </button>
          </>
        ) : null}
      </div>

      {t ? (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ['Explained', t.explained],
            ['Interested', t.interested],
            ['Joined', t.joined],
            ['Join rate', `${stats?.join_rate_pct ?? 0}%`],
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
          <Diamond className="mr-1 inline size-4 text-[var(--kc-accent,#c41e3a)]" />
          Salesperson scheme activity
        </p>
        <table className="w-full min-w-[480px] text-left text-sm text-[var(--color-jewelry-black,#1a1814)]">
          <thead>
            <tr className="border-b border-[var(--color-slate-700,#e8e4df)] text-[10px] uppercase tracking-wide text-[var(--color-jewelry-black,#1a1814)]/50">
              <th className="py-2 pr-2">Salesperson</th>
              <th className="py-2 pr-2">Explained</th>
              <th className="py-2 pr-2">Interested</th>
              <th className="py-2 pr-2">Joined</th>
              <th className="py-2">Join rate</th>
            </tr>
          </thead>
          <tbody>
            {(stats?.by_operator || []).map((r) => (
              <tr key={r.operator_id ?? r.name} className="border-b border-[var(--color-slate-700,#e8e4df)]/40">
                <td className="py-2 pr-2 font-medium">{r.name}</td>
                <td className="py-2 pr-2 tabular-nums">{r.explained}</td>
                <td className="py-2 pr-2 tabular-nums">{r.interested}</td>
                <td className="py-2 pr-2 tabular-nums">{r.joined}</td>
                <td className="py-2 tabular-nums">{r.join_rate_pct}%</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!stats?.by_operator?.length ? (
          <p className="py-4 text-sm text-[var(--color-jewelry-black,#1a1814)]/55">
            No scheme ticks in this range yet. Staff mark schemes when completing counter interactions.
          </p>
        ) : null}
      </div>

      {stats?.schemes?.length ? (
        <div className={`${erpCardCls} overflow-x-auto`}>
          <p className="mb-2 text-sm font-semibold text-[var(--color-jewelry-black,#1a1814)]">By scheme</p>
          <ul className="space-y-2 text-sm">
            {stats.schemes.map((s) => (
              <li
                key={s.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--color-slate-700,#e8e4df)] px-3 py-2"
              >
                <span className="font-medium text-[var(--color-jewelry-black,#1a1814)]">{s.name}</span>
                <span className="tabular-nums text-[var(--color-jewelry-black,#1a1814)]/75">
                  {s.explained} / {s.interested} / {s.joined}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  )
}

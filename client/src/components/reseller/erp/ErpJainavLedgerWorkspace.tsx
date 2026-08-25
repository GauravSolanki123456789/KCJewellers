'use client'

import { useCallback, useEffect, useState } from 'react'
import axios from '@/lib/axios'
import { Download } from 'lucide-react'
import { ErpDateInput } from '@/components/reseller/erp/ErpDateInput'
import { erpBtnPrimary, erpCardCls, erpErr, erpInputCls } from '@/components/reseller/erp/erp-ui'
import { formatErpInr } from '@/lib/reseller-erp-modules'

type LaneBill = {
  id: number | string
  bill_number: string
  lane: 'hitesh' | 'jainav'
  customer_name?: string
  payment_method?: string
  total_inr: number
  bill_date: string
  source?: string
}

function firstOfMonthIso() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

function todayIso() {
  return new Date().toISOString().slice(0, 10)
}

export function ErpJainavLedgerWorkspace() {
  const [from, setFrom] = useState(firstOfMonthIso())
  const [to, setTo] = useState(todayIso())
  const [lane, setLane] = useState<'both' | 'hitesh' | 'jainav'>('both')
  const [bills, setBills] = useState<LaneBill[]>([])
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  const load = useCallback(async () => {
    setBusy(true)
    setMsg(null)
    try {
      const res = await axios.get<{ bills: LaneBill[] }>('/api/reseller/erp/shadow/bills', {
        params: {
          from,
          to,
          lane: lane === 'both' ? undefined : lane,
        },
      })
      setBills(res.data.bills || [])
    } catch (e) {
      setMsg(erpErr(e))
      setBills([])
    } finally {
      setBusy(false)
    }
  }, [from, to, lane])

  useEffect(() => {
    void load()
  }, [load])

  const totals = bills.reduce(
    (acc, b) => {
      acc.count += 1
      acc.inr += b.total_inr || 0
      if (b.lane === 'hitesh' || b.source === 'official_gst') {
        acc.hitesh += b.total_inr || 0
        acc.hiteshCount += 1
      }
      if (b.lane === 'jainav') {
        acc.jainav += b.total_inr || 0
        acc.jainavCount += 1
      }
      return acc
    },
    { count: 0, inr: 0, hitesh: 0, jainav: 0, hiteshCount: 0, jainavCount: 0 },
  )

  const exportCsv = async () => {
    setBusy(true)
    try {
      const exportLane = lane === 'both' ? 'both' : lane
      const res = await axios.get('/api/reseller/erp/shadow/export', {
        params: { lane: exportLane, from, to },
        responseType: 'blob',
      })
      const url = URL.createObjectURL(res.data)
      const a = document.createElement('a')
      a.href = url
      a.download = `jainav-ledger-${exportLane}-${from}.csv`
      a.click()
      URL.revokeObjectURL(url)
      setMsg('Ledger CSV downloaded.')
    } catch (e) {
      setMsg(erpErr(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className={erpCardCls}>
        <p className="mb-1 text-sm font-semibold text-[var(--color-jewelry-black,#1a1814)]">Jainav lane ledger</p>
        <p className="mb-3 text-xs text-[var(--color-jewelry-black,#1a1814)]/55">
          Separate from the customer payment ledger — shows Hitesh & Jainav lane bills only.
        </p>
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-xs font-medium text-[var(--color-jewelry-black,#1a1814)]/70">
            From
            <ErpDateInput className={`${erpInputCls} mt-1`} value={from} onChange={setFrom} />
          </label>
          <label className="text-xs font-medium text-[var(--color-jewelry-black,#1a1814)]/70">
            To
            <ErpDateInput className={`${erpInputCls} mt-1`} value={to} onChange={setTo} />
          </label>
          <div className="flex flex-wrap gap-2">
            {(['both', 'hitesh', 'jainav'] as const).map((l) => (
              <button
                key={l}
                type="button"
                className={`min-h-[40px] rounded-xl border px-3 text-xs font-semibold capitalize ${
                  lane === l
                    ? 'border-emerald-700 bg-emerald-700 text-white'
                    : 'border-[var(--color-slate-700,#e8e4df)] bg-white text-[var(--color-jewelry-black,#1a1814)]'
                }`}
                onClick={() => setLane(l)}
              >
                {l === 'both' ? 'Both' : l}
              </button>
            ))}
          </div>
          <button type="button" className={erpBtnPrimary} disabled={busy} onClick={() => void exportCsv()}>
            <Download className="size-4" />
            Export CSV
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { l: 'Bills', v: String(totals.count) },
          { l: 'Total', v: formatErpInr(totals.inr) },
          { l: 'Hitesh', v: `${totals.hiteshCount} · ${formatErpInr(totals.hitesh)}` },
          { l: 'Jainav', v: `${totals.jainavCount} · ${formatErpInr(totals.jainav)}` },
        ].map((c) => (
          <div key={c.l} className={erpCardCls}>
            <p className="text-[10px] font-semibold uppercase text-[var(--color-jewelry-black,#1a1814)]/45">{c.l}</p>
            <p className="mt-1 text-sm font-semibold tabular-nums text-[var(--color-jewelry-black,#1a1814)]">{c.v}</p>
          </div>
        ))}
      </div>

      {msg ? (
        <p className="rounded-xl border border-[var(--color-slate-700,#e8e4df)] bg-white px-3 py-2 text-xs">{msg}</p>
      ) : null}

      <div className={erpCardCls}>
        <p className="mb-3 text-sm font-semibold text-[var(--color-jewelry-black,#1a1814)]">
          Entries {busy ? '…' : ''}
        </p>
        <ul className="space-y-2">
          {bills.map((b) => (
            <li
              key={String(b.id)}
              className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--color-slate-700,#e8e4df)] bg-white px-3 py-2.5 text-sm"
            >
              <div className="min-w-0">
                <span className="font-mono font-semibold text-[var(--color-jewelry-black,#1a1814)]">{b.bill_number}</span>
                <span className="ml-2 rounded-full bg-[var(--color-slate-900,#f7f4ef)] px-2 py-0.5 text-[10px] font-semibold uppercase">
                  {b.source === 'official_gst' ? 'GST' : b.lane}
                </span>
                <p className="text-xs text-[var(--color-jewelry-black,#1a1814)]/55">
                  {b.bill_date} · {b.customer_name || 'Walk-in'} · {b.payment_method || 'cash'}
                </p>
              </div>
              <span className="font-semibold tabular-nums">{formatErpInr(b.total_inr)}</span>
            </li>
          ))}
          {!bills.length && !busy ? (
            <li className="py-8 text-center text-sm text-[var(--color-jewelry-black,#1a1814)]/45">No entries in range.</li>
          ) : null}
        </ul>
      </div>
    </div>
  )
}

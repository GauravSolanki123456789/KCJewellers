'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import axios from '@/lib/axios'
import {
  erpBtnGhost,
  erpBtnPrimary,
  erpCardCls,
  erpErr,
  erpInputCls,
  type ErpBill,
} from '@/components/reseller/erp/erp-ui'
import { formatErpInr, resellerErpModulePath } from '@/lib/reseller-erp-modules'
import { Download, Eye, Loader2, Receipt, Trash2, X } from 'lucide-react'

const STATUSES = ['draft', 'completed', 'paid', 'cancelled'] as const

function fmtDate(iso?: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return String(iso).slice(0, 10)
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

export function ErpSalesBillsWorkspace() {
  const [bills, setBills] = useState<ErpBill[]>([])
  const [busy, setBusy] = useState(false)
  const [q, setQ] = useState('')
  const [status, setStatus] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [viewBill, setViewBill] = useState<ErpBill | null>(null)

  const load = useCallback(async () => {
    const params: Record<string, string> = { bill_type: 'sale' }
    if (q.trim()) params.q = q.trim()
    if (status) params.status = status
    if (from) params.from = from
    if (to) params.to = to
    try {
      const res = await axios.get<{ bills: ErpBill[] }>('/api/reseller/erp/bills', { params })
      const list = (res.data.bills || []).filter((b) => String(b.bill_type || '').toLowerCase() === 'sale')
      setBills(list)
      setSelected(new Set())
    } catch (e) {
      console.error('erp sales bills load:', e)
      try {
        const res = await axios.get<{ bills: ErpBill[] }>('/api/reseller/erp/bills')
        setBills((res.data.bills || []).filter((b) => String(b.bill_type || '').toLowerCase() === 'sale'))
        setSelected(new Set())
      } catch {
        setBills([])
      }
    }
  }, [q, status, from, to])

  useEffect(() => {
    const t = setTimeout(() => {
      void load().catch(() => setBills([]))
    }, 200)
    return () => clearTimeout(t)
  }, [load])

  const stats = useMemo(() => {
    const now = new Date()
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
    const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    let totalValue = 0
    let monthCount = 0
    let todayCount = 0
    for (const b of bills) {
      totalValue += Number(b.total_inr) || 0
      const created = b.created_at ? new Date(b.created_at) : null
      if (created && !Number.isNaN(created.getTime())) {
        if (created >= monthStart) monthCount++
        if (created >= dayStart) todayCount++
      }
    }
    return { total: bills.length, totalValue, monthCount, todayCount }
  }, [bills])

  const toggleAll = () => {
    if (selected.size === bills.length) setSelected(new Set())
    else setSelected(new Set(bills.map((b) => b.id)))
  }

  const toggleOne = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const deleteOne = async (id: number) => {
    if (!confirm('Delete this sales bill?')) return
    setBusy(true)
    try {
      await axios.delete(`/api/reseller/erp/bills/${id}`)
      if (viewBill?.id === id) setViewBill(null)
      await load()
    } catch (e) {
      alert(erpErr(e))
    } finally {
      setBusy(false)
    }
  }

  const deleteSelected = async () => {
    if (!selected.size || !confirm(`Delete ${selected.size} sales bill(s)?`)) return
    setBusy(true)
    try {
      await axios.post('/api/reseller/erp/bills/bulk-delete', { ids: Array.from(selected) })
      setViewBill(null)
      await load()
    } catch (e) {
      alert(erpErr(e))
    } finally {
      setBusy(false)
    }
  }

  const exportRows = async (rows: ErpBill[]) => {
    const XLSX = await import('xlsx')
    const data = rows.map((b) => ({
      'Bill No': b.bill_number,
      Date: fmtDate(b.created_at ?? b.bill_date),
      Customer: b.customer_name || '',
      Items: b.lines?.length ?? 0,
      Amount: b.total_inr,
      Status: b.status,
      Notes: b.notes || '',
    }))
    const ws = XLSX.utils.json_to_sheet(data.length ? data : [{ 'Bill No': '' }])
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Sales')
    XLSX.writeFile(wb, `erp-sales-bills-${new Date().toISOString().slice(0, 10)}.xlsx`)
  }

  const openView = async (id: number) => {
    setBusy(true)
    try {
      const res = await axios.get<{ bill: ErpBill }>(`/api/reseller/erp/bills/${id}`)
      setViewBill(res.data.bill)
    } catch (e) {
      alert(erpErr(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-semibold text-[var(--color-jewelry-black,#1a1814)]">
          <Receipt className="size-4 text-emerald-700" />
          Sales bill history
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-emerald-600 px-4 text-sm font-semibold text-white"
            disabled={busy || bills.length === 0}
            onClick={() => void exportRows(bills)}
          >
            <Download className="size-4" />
            Export all
          </button>
          <button
            type="button"
            className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-rose-600 px-4 text-sm font-semibold text-white disabled:opacity-60"
            disabled={busy || selected.size === 0}
            onClick={() => void deleteSelected()}
          >
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
            Delete selected
          </button>
        </div>
      </div>

      <div className={`${erpCardCls} grid gap-3 sm:grid-cols-2 lg:grid-cols-4`}>
        <input className={erpInputCls} placeholder="Search bill no, customer…" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className={erpInputCls} value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <label className="text-xs text-[var(--color-jewelry-black,#1a1814)]/55">
          From
          <input type="date" className={`${erpInputCls} mt-1`} value={from} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label className="text-xs text-[var(--color-jewelry-black,#1a1814)]/55">
          To
          <input type="date" className={`${erpInputCls} mt-1`} value={to} onChange={(e) => setTo(e.target.value)} />
        </label>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          { label: 'Total sales', value: String(stats.total), cls: 'bg-emerald-50 text-emerald-900 border-emerald-100' },
          { label: 'Total value', value: formatErpInr(stats.totalValue), cls: 'bg-blue-50 text-blue-900 border-blue-100' },
          { label: 'This month', value: String(stats.monthCount), cls: 'bg-violet-50 text-violet-900 border-violet-100' },
          { label: 'Today', value: String(stats.todayCount), cls: 'bg-amber-50 text-amber-900 border-amber-100' },
        ].map((c) => (
          <div key={c.label} className={`rounded-2xl border px-3 py-3 ${c.cls}`}>
            <p className="text-[10px] font-semibold uppercase tracking-wide opacity-70">{c.label}</p>
            <p className="mt-1 text-lg font-bold tabular-nums">{c.value}</p>
          </div>
        ))}
      </div>

      <div className={`${erpCardCls} overflow-x-auto p-0`}>
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b border-[var(--color-slate-700,#e8e4df)] bg-[var(--color-slate-900,#faf8f4)] text-left text-xs text-[var(--color-jewelry-black,#1a1814)]/55">
              <th className="px-3 py-2.5">
                <input
                  type="checkbox"
                  checked={bills.length > 0 && selected.size === bills.length}
                  onChange={toggleAll}
                  aria-label="Select all"
                />
              </th>
              <th className="px-3 py-2.5 font-semibold">Bill no</th>
              <th className="px-3 py-2.5 font-semibold">Date</th>
              <th className="px-3 py-2.5 font-semibold">Customer</th>
              <th className="px-3 py-2.5 font-semibold">Items</th>
              <th className="px-3 py-2.5 font-semibold">Net total</th>
              <th className="px-3 py-2.5 font-semibold">Status</th>
              <th className="px-3 py-2.5 font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody>
            {bills.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-12 text-center text-[var(--color-jewelry-black,#1a1814)]/45">
                  No sales bills in this period.
                </td>
              </tr>
            ) : (
              bills.map((b) => (
                <tr key={b.id} className="border-b border-[var(--color-slate-700,#e8e4df)]/50">
                  <td className="px-3 py-2.5">
                    <input type="checkbox" checked={selected.has(b.id)} onChange={() => toggleOne(b.id)} aria-label={`Select ${b.bill_number}`} />
                  </td>
                  <td className="px-3 py-2.5 font-semibold text-emerald-800">{b.bill_number}</td>
                  <td className="px-3 py-2.5 tabular-nums">{fmtDate(b.created_at ?? b.bill_date)}</td>
                  <td className="max-w-[140px] truncate px-3 py-2.5">{b.customer_name || '—'}</td>
                  <td className="px-3 py-2.5 tabular-nums">{b.lines?.length ?? 0}</td>
                  <td className="px-3 py-2.5 font-semibold tabular-nums text-[var(--kc-accent,#c41e3a)]">
                    {formatErpInr(b.total_inr)}
                  </td>
                  <td className="px-3 py-2.5">
                    <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-bold uppercase text-emerald-800">
                      {b.status}
                    </span>
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex flex-wrap gap-1">
                      <button
                        type="button"
                        className="inline-flex size-9 items-center justify-center rounded-lg border border-[var(--color-slate-700,#e8e4df)] hover:bg-[var(--color-slate-900,#faf8f4)]"
                        title="View bill"
                        onClick={() => void openView(b.id)}
                      >
                        <Eye className="size-4" />
                      </button>
                      <button
                        type="button"
                        className="inline-flex size-9 items-center justify-center rounded-lg border border-rose-200 text-rose-600 hover:bg-rose-50"
                        title="Delete"
                        onClick={() => void deleteOne(b.id)}
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <Link href={resellerErpModulePath('billing')} className={erpBtnPrimary}>
        New sale in billing
      </Link>

      {viewBill ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-3 sm:items-center">
          <div className={`${erpCardCls} max-h-[85vh] w-full max-w-lg overflow-y-auto`}>
            <div className="mb-3 flex items-start justify-between gap-2">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-jewelry-black,#1a1814)]/45">Sales bill</p>
                <h3 className="text-lg font-bold text-[var(--color-jewelry-black,#1a1814)]">{viewBill.bill_number}</h3>
                <p className="text-sm text-[var(--color-jewelry-black,#1a1814)]/60">
                  {viewBill.customer_name || 'Walk-in'} · {fmtDate(viewBill.created_at ?? viewBill.bill_date)}
                </p>
              </div>
              <button type="button" className={erpBtnGhost} onClick={() => setViewBill(null)} aria-label="Close">
                <X className="size-4" />
              </button>
            </div>
            <ul className="space-y-2 border-t border-[var(--color-slate-700,#e8e4df)] pt-3">
              {(viewBill.lines || []).map((line, i) => (
                <li key={`${line.barcode || line.code}-${i}`} className="flex items-start justify-between gap-2 text-sm">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{line.name}</p>
                    <p className="text-xs text-[var(--color-jewelry-black,#1a1814)]/50">
                      {line.barcode || line.code}
                      {line.weightGm != null ? ` · ${line.weightGm} gm` : ''}
                    </p>
                  </div>
                  <span className="shrink-0 font-semibold tabular-nums text-emerald-700">
                    {formatErpInr(line.lineTotalInr ?? 0)}
                  </span>
                </li>
              ))}
            </ul>
            <div className="mt-4 flex items-center justify-between border-t border-[var(--color-slate-700,#e8e4df)] pt-3">
              <span className="text-sm font-semibold">Net total</span>
              <span className="text-lg font-bold tabular-nums text-[var(--kc-accent,#c41e3a)]">
                {formatErpInr(viewBill.total_inr)}
              </span>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

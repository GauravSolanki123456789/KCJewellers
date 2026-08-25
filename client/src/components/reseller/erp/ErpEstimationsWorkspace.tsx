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
import { ErpQuotePdfButton } from '@/components/reseller/erp/ErpQuotePdfShare'
import { ErpBillPreviewModal } from '@/components/reseller/erp/ErpBillPreviewModal'
import { ErpDateInput } from '@/components/reseller/erp/ErpDateInput'
import { formatErpInr, resellerErpModulePath } from '@/lib/reseller-erp-modules'
import { downloadBillDetailExcel } from '@/lib/erp-bill-excel-export'
import { erpDateFilterToIso, formatErpDateDdMmYyyy } from '@/lib/erp-date-format'
import { useAuth } from '@/hooks/useAuth'
import { type WholesaleUserFields } from '@/lib/customer-tier'
import {
  ESTIMATE_FILTER_STATUSES,
  ESTIMATE_STATUSES,
  estimateStatusBadgeClass,
  formatEstimateStatusLabel,
  isEstimateBilled,
  resolveBillEstimateStatus,
} from '@/lib/erp-estimate-status'
import type { ErpBillSession } from '@/lib/erp-bill-session'
import {
  Download,
  Eye,
  FileSpreadsheet,
  Loader2,
  Pencil,
  ScrollText,
  Trash2,
} from 'lucide-react'

const STATUSES = ESTIMATE_STATUSES
const FILTER_STATUSES = ESTIMATE_FILTER_STATUSES

function estimateBillSeq(billNumber: string | undefined): number {
  const m = String(billNumber || '').match(/(\d+)\s*$/)
  return m ? parseInt(m[1], 10) : 0
}

function sortEstimatesAsc(list: ErpBill[]): ErpBill[] {
  return [...list].sort((a, b) => {
    const sa = estimateBillSeq(a.bill_number)
    const sb = estimateBillSeq(b.bill_number)
    if (sa !== sb) return sa - sb
    return a.id - b.id
  })
}

export function ErpEstimationsWorkspace() {
  const auth = useAuth()
  const brandLabel =
    (auth.user as WholesaleUserFields)?.business_name?.trim() || 'Our store'

  const [bills, setBills] = useState<ErpBill[]>([])
  const [busy, setBusy] = useState(false)
  const [q, setQ] = useState('')
  const [status, setStatus] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [previewBill, setPreviewBill] = useState<ErpBill | null>(null)
  const [statusBusyId, setStatusBusyId] = useState<number | null>(null)

  const load = useCallback(async () => {
    const params: Record<string, string> = { bill_type: 'estimate' }
    if (q.trim()) params.q = q.trim()
    if (status) params.status = status
    const fromIso = erpDateFilterToIso(from)
    const toIso = erpDateFilterToIso(to)
    if (fromIso) params.from = fromIso
    if (toIso) params.to = toIso
    try {
      const res = await axios.get<{ bills: ErpBill[] }>('/api/reseller/erp/bills', { params })
      const list = (res.data.bills || []).filter(
        (b) => String(b.bill_type || '').toLowerCase() === 'estimate',
      )
      const filtered =
        status === 'billed'
          ? list.filter((b) => isEstimateBilled(b))
          : status === 'unbilled'
            ? list.filter((b) => !isEstimateBilled(b))
            : list
      setBills(sortEstimatesAsc(filtered))
      setSelected(new Set())
    } catch (e) {
      console.error('erp estimations load:', e)
      try {
        const res = await axios.get<{ bills: ErpBill[] }>('/api/reseller/erp/bills')
        setBills(
          sortEstimatesAsc(
            (res.data.bills || []).filter((b) => String(b.bill_type || '').toLowerCase() === 'estimate'),
          ),
        )
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
    if (!confirm('Delete this estimation?')) return
    setBusy(true)
    try {
      await axios.delete(`/api/reseller/erp/bills/${id}`)
      await load()
    } catch (e) {
      alert(erpErr(e))
    } finally {
      setBusy(false)
    }
  }

  const deleteSelected = async () => {
    if (!selected.size || !confirm(`Delete ${selected.size} estimation(s)?`)) return
    setBusy(true)
    try {
      await axios.post('/api/reseller/erp/bills/bulk-delete', { ids: Array.from(selected) })
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
      'Quote No': b.bill_number,
      Date: formatErpDateDdMmYyyy(b.created_at ?? b.bill_date),
      Customer: b.customer_name || '',
      Items: b.lines?.length ?? 0,
      Amount: b.total_inr,
      Status: formatEstimateStatusLabel(resolveBillEstimateStatus(b)),
      Notes: b.notes || '',
    }))
    const ws = XLSX.utils.json_to_sheet(data.length ? data : [{ 'Quote No': '' }])
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Estimations')
    XLSX.writeFile(wb, `erp-estimations-${new Date().toISOString().slice(0, 10)}.xlsx`)
  }

  const changeStatus = async (id: number, nextStatus: string) => {
    const bill = bills.find((b) => b.id === id)
    if (bill && isEstimateBilled(bill)) {
      alert('This estimation is already billed — status cannot be changed.')
      return
    }
    setStatusBusyId(id)
    try {
      await axios.patch(`/api/reseller/erp/bills/${id}`, { status: nextStatus })
      setBills((prev) =>
        prev.map((b) => (b.id === id ? { ...b, status: nextStatus } : b)),
      )
    } catch (e) {
      alert(erpErr(e))
    } finally {
      setStatusBusyId(null)
    }
  }

  const billingEditPath = (id: number) => `${resellerErpModulePath('billing')}?edit=${id}`

  const openPreview = async (id: number) => {
    setBusy(true)
    try {
      const res = await axios.get<{ bill: ErpBill }>(`/api/reseller/erp/bills/${id}`)
      setPreviewBill(res.data.bill)
    } catch (e) {
      alert(erpErr(e))
    } finally {
      setBusy(false)
    }
  }

  const downloadBillExcel = async (id: number) => {
    setBusy(true)
    try {
      const res = await axios.get<{ bill: ErpBill }>(`/api/reseller/erp/bills/${id}`)
      await downloadBillDetailExcel(res.data.bill, 'estimate')
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
          <ScrollText className="size-4 text-[var(--kc-accent,#c41e3a)]" />
          Quotation history
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
        <input
          className={erpInputCls}
          placeholder="Search quote no, customer, customer number…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <select className={erpInputCls} value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          {FILTER_STATUSES.map((s) => (
            <option key={s} value={s}>
              {formatEstimateStatusLabel(s)}
            </option>
          ))}
        </select>
        <label className="text-xs text-[var(--color-jewelry-black,#1a1814)]/55">
          From (dd/mm/yyyy)
          <ErpDateInput className={`${erpInputCls} mt-1`} value={from} onChange={setFrom} />
        </label>
        <label className="text-xs text-[var(--color-jewelry-black,#1a1814)]/55">
          To (dd/mm/yyyy)
          <ErpDateInput className={`${erpInputCls} mt-1`} value={to} onChange={setTo} />
        </label>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          { label: 'Total quotations', value: String(stats.total), cls: 'bg-blue-50 text-blue-900 border-blue-100' },
          { label: 'Total value', value: formatErpInr(stats.totalValue), cls: 'bg-emerald-50 text-emerald-900 border-emerald-100' },
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
              <th className="px-3 py-2.5 font-semibold">Quote no</th>
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
                  No estimations in this period.
                </td>
              </tr>
            ) : (
              bills.map((b) => {
                const effectiveStatus = resolveBillEstimateStatus(b)
                const billed = isEstimateBilled(b) || effectiveStatus === 'billed'
                const session = (b.session || {}) as ErpBillSession
                const saleBillNo = session.billedSaleBillNumber
                return (
                <tr key={b.id} className="border-b border-[var(--color-slate-700,#e8e4df)]/50">
                  <td className="px-3 py-2.5">
                    <input type="checkbox" checked={selected.has(b.id)} onChange={() => toggleOne(b.id)} aria-label={`Select ${b.bill_number}`} />
                  </td>
                  <td className="px-3 py-2.5">
                    {billed ? (
                      <button
                        type="button"
                        className="font-semibold text-emerald-800 hover:underline"
                        onClick={() => void openPreview(b.id)}
                      >
                        {b.bill_number}
                      </button>
                    ) : (
                      <Link href={billingEditPath(b.id)} className="font-semibold text-blue-700 hover:underline">
                        {b.bill_number}
                      </Link>
                    )}
                  </td>
                  <td className="px-3 py-2.5 tabular-nums">{formatErpDateDdMmYyyy(b.created_at ?? b.bill_date)}</td>
                  <td className="max-w-[140px] truncate px-3 py-2.5">{b.customer_name || '—'}</td>
                  <td className="px-3 py-2.5 tabular-nums">{b.lines?.length ?? 0}</td>
                  <td className="px-3 py-2.5 font-semibold tabular-nums text-[var(--kc-accent,#c41e3a)]">
                    {formatErpInr(b.total_inr)}
                  </td>
                  <td className="px-3 py-2.5">
                    {billed ? (
                      <div className="space-y-1">
                        <span
                          className={`inline-flex min-h-[36px] items-center rounded-full border px-3 py-0.5 text-[10px] font-bold uppercase ${estimateStatusBadgeClass('billed')}`}
                        >
                          Billed
                        </span>
                        {saleBillNo ? (
                          <p className="text-[10px] font-medium text-emerald-800/80">→ {saleBillNo}</p>
                        ) : null}
                      </div>
                    ) : (
                      <select
                        className={`min-h-[36px] rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase ${estimateStatusBadgeClass(effectiveStatus)}`}
                        value={effectiveStatus}
                        disabled={statusBusyId === b.id}
                        onChange={(e) => void changeStatus(b.id, e.target.value)}
                        aria-label={`Status for ${b.bill_number}`}
                      >
                        {STATUSES.map((s) => (
                          <option key={s} value={s}>
                            {formatEstimateStatusLabel(s)}
                          </option>
                        ))}
                      </select>
                    )}
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex flex-wrap gap-1">
                      {!billed ? (
                        <Link
                          href={billingEditPath(b.id)}
                          className="inline-flex size-9 items-center justify-center rounded-lg border border-[var(--color-slate-700,#e8e4df)] hover:bg-[var(--color-slate-900,#faf8f4)]"
                          title="Edit in billing"
                        >
                          <Pencil className="size-4" />
                        </Link>
                      ) : null}
                      <button
                        type="button"
                        className="inline-flex size-9 items-center justify-center rounded-lg border border-[var(--color-slate-700,#e8e4df)] hover:bg-[var(--color-slate-900,#faf8f4)]"
                        title="Preview"
                        onClick={() => void openPreview(b.id)}
                      >
                        <Eye className="size-4" />
                      </button>
                      <button
                        type="button"
                        className="inline-flex size-9 items-center justify-center rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100"
                        title="Download Excel report"
                        onClick={() => void downloadBillExcel(b.id)}
                      >
                        <FileSpreadsheet className="size-4" />
                      </button>
                      <ErpQuotePdfButton
                        bill={b}
                        brandLabel={brandLabel}
                        customerName={b.customer_name}
                        mobile={b.session?.mobile}
                        label=""
                        className="inline-flex size-9 items-center justify-center rounded-lg border border-[var(--color-slate-700,#e8e4df)] hover:bg-[var(--color-slate-900,#faf8f4)]"
                      />
                      <button
                        type="button"
                        className="inline-flex size-9 items-center justify-center rounded-lg border border-rose-200 text-rose-600 hover:bg-rose-50"
                        onClick={() => void deleteOne(b.id)}
                        title="Delete"
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              )})
            )}
          </tbody>
        </table>
      </div>

      {selected.size > 0 ? (
        <div className="flex flex-wrap gap-2">
          <button type="button" className={erpBtnGhost} onClick={() => void exportRows(bills.filter((b) => selected.has(b.id)))}>
            <FileSpreadsheet className="size-4" />
            Export selected ({selected.size})
          </button>
          <Link href={resellerErpModulePath('billing')} className={erpBtnPrimary}>
            New quotation in billing
          </Link>
        </div>
      ) : (
        <Link href={resellerErpModulePath('billing')} className={`${erpBtnPrimary} inline-flex`}>
          Create quotation in billing
        </Link>
      )}

      <ErpBillPreviewModal bill={previewBill} kind="estimate" onClose={() => setPreviewBill(null)} />
    </div>
  )
}

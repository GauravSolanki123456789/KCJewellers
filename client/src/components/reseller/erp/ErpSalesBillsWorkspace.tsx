'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import axios from '@/lib/axios'
import { useAuth } from '@/hooks/useAuth'
import { type WholesaleUserFields } from '@/lib/customer-tier'
import {
  erpBtnPrimary,
  erpCardCls,
  erpErr,
  erpInputCls,
  type ErpBill,
} from '@/components/reseller/erp/erp-ui'
import { ErpBillPreviewModal } from '@/components/reseller/erp/ErpBillPreviewModal'
import { ErpBillSavedModal } from '@/components/reseller/erp/ErpBillSavedModal'
import { ErpComplianceDialog, type ErpComplianceSuccessMeta } from '@/components/reseller/erp/ErpComplianceDialog'
import { ErpDateInput } from '@/components/reseller/erp/ErpDateInput'
import { buildErpSalesPdfPayload } from '@/lib/erp-sales-pdf'
import type { PdfShareSheetPayload } from '@/lib/pdf-share'
import type { ErpBillSession } from '@/lib/erp-bill-session'
import { formatErpInr, resellerErpModulePath } from '@/lib/reseller-erp-modules'
import { downloadBillDetailExcel } from '@/lib/erp-bill-excel-export'
import { erpDateFilterToIso, formatErpDateDdMmYyyy, isoToDdMmYyyyInput, erpDefaultHistoryFromIso } from '@/lib/erp-date-format'
import { sortErpBillsDesc } from '@/lib/erp-bill-sort'
import { summarizeBillsMetalTotals } from '@/lib/erp-bill-metal-totals'
import { Download, Eye, FileCheck, FileSpreadsheet, Loader2, Receipt, Trash2, Truck } from 'lucide-react'

const STATUSES = ['draft', 'completed', 'paid', 'cancelled'] as const

export function ErpSalesBillsWorkspace() {
  const auth = useAuth()
  const brandLabel = useMemo(() => {
    const name = auth.user && (auth.user as WholesaleUserFields).business_name
    return typeof name === 'string' && name.trim() ? name.trim() : 'Our store'
  }, [auth.user])

  const [bills, setBills] = useState<ErpBill[]>([])
  const [busy, setBusy] = useState(false)
  const [q, setQ] = useState('')
  const [status, setStatus] = useState('')
  const [from, setFrom] = useState(() => isoToDdMmYyyyInput(erpDefaultHistoryFromIso()))
  const [to, setTo] = useState('')
  const [onDate, setOnDate] = useState('')
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [viewBill, setViewBill] = useState<ErpBill | null>(null)
  const [complianceBill, setComplianceBill] = useState<ErpBill | null>(null)
  const [complianceKind, setComplianceKind] = useState<'e-invoice' | 'e-way'>('e-invoice')
  const [complianceOpen, setComplianceOpen] = useState(false)
  const [complianceSuccessOpen, setComplianceSuccessOpen] = useState(false)
  const [complianceSuccessBill, setComplianceSuccessBill] = useState<ErpBill | null>(null)
  const [complianceSuccessPdf, setComplianceSuccessPdf] = useState<PdfShareSheetPayload | null>(null)
  const [complianceSuccessVariant, setComplianceSuccessVariant] = useState<'e-invoice' | 'e-way'>('e-invoice')
  const [complianceSuccessNote, setComplianceSuccessNote] = useState<string | null>(null)
  const [complianceSuccessMobile, setComplianceSuccessMobile] = useState('')

  const load = useCallback(async () => {
    const params: Record<string, string> = { bill_type: 'sale' }
    if (q.trim()) params.q = q.trim()
    if (status) params.status = status
    const onIso = erpDateFilterToIso(onDate)
    if (onIso) params.on = onIso
    else {
      const fromIso = erpDateFilterToIso(from)
      const toIso = erpDateFilterToIso(to)
      if (fromIso) params.from = fromIso
      if (toIso) params.to = toIso
    }
    try {
      const res = await axios.get<{ bills: ErpBill[] }>('/api/reseller/erp/bills', { params })
      const list = (res.data.bills || []).filter((b) => String(b.bill_type || '').toLowerCase() === 'sale')
      setBills(sortErpBillsDesc(list))
      setSelected(new Set())
    } catch (e) {
      console.error('erp sales bills load:', e)
      try {
        const res = await axios.get<{ bills: ErpBill[] }>('/api/reseller/erp/bills')
        setBills(
          sortErpBillsDesc(
            (res.data.bills || []).filter((b) => String(b.bill_type || '').toLowerCase() === 'sale'),
          ),
        )
        setSelected(new Set())
      } catch {
        setBills([])
      }
    }
  }, [q, status, from, to, onDate])

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

  const metal = useMemo(() => summarizeBillsMetalTotals(bills), [bills])

  const periodMetalLabel = onDate.trim()
    ? `On ${onDate.trim()}`
    : from.trim() || to.trim()
      ? 'Selected period'
      : 'Last 3 days'

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
      Date: formatErpDateDdMmYyyy(b.created_at ?? b.bill_date),
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

  const openCompliance = async (id: number, kind: 'e-invoice' | 'e-way') => {
    setBusy(true)
    try {
      const res = await axios.get<{ bill: ErpBill }>(`/api/reseller/erp/bills/${id}`)
      setComplianceBill(res.data.bill)
      setComplianceKind(kind)
      setComplianceOpen(true)
    } catch (e) {
      alert(erpErr(e))
    } finally {
      setBusy(false)
    }
  }

  const onComplianceSuccess = async (bill: ErpBill, meta?: ErpComplianceSuccessMeta) => {
    setBills((prev) => prev.map((b) => (b.id === bill.id ? bill : b)))
    if (viewBill?.id === bill.id) setViewBill(bill)

    const session = (bill.session || {}) as ErpBillSession
    const isEinvoice = complianceKind === 'e-invoice'
    setComplianceSuccessVariant(isEinvoice ? 'e-invoice' : 'e-way')
    setComplianceSuccessMobile(session.mobile || '')
    setComplianceSuccessBill(bill)

    const noteParts: string[] = []
    if (meta?.irn) noteParts.push(`IRN: ${meta.irn}`)
    if (meta?.ewb_no) noteParts.push(`EWB: ${meta.ewb_no}`)
    if (meta?.sandbox) noteParts.push('(Sandbox mode)')
    setComplianceSuccessNote(noteParts.length ? noteParts.join(' · ') : meta?.message || null)

    if (isEinvoice) {
      try {
        const payload = await buildErpSalesPdfPayload({
          bill,
          brandLabel,
          customerName: bill.customer_name,
          mobile: session.mobile,
          customerAddress: session.address,
          customerPan: session.pan,
          customerGst: session.customerGst,
          slabSettingsRaw: auth.user,
          taxInvoiceMode: true,
        })
        setComplianceSuccessPdf(payload)
        setComplianceSuccessOpen(true)
      } catch (e) {
        console.error(e)
        alert(
          `E-invoice generated${meta?.irn ? `: ${meta.irn}` : ''}${meta?.sandbox ? '\n\n(Sandbox mode)' : ''}\n\nTax invoice PDF could not be created.`,
        )
      }
    } else {
      setComplianceSuccessPdf(null)
      setComplianceSuccessOpen(true)
    }
  }

  const onComplianceSuccessDone = () => {
    setComplianceSuccessBill(null)
    setComplianceSuccessPdf(null)
    setComplianceSuccessNote(null)
  }

  const downloadTaxInvoiceForBill = async (bill: ErpBill) => {
    const session = (bill.session || {}) as ErpBillSession
    const payload = await buildErpSalesPdfPayload({
      bill,
      brandLabel,
      customerName: bill.customer_name,
      mobile: session.mobile,
      customerAddress: session.address,
      customerPan: session.pan,
      customerGst: session.customerGst,
      slabSettingsRaw: auth.user,
      taxInvoiceMode: true,
    })
    setComplianceSuccessVariant('e-invoice')
    setComplianceSuccessMobile(session.mobile || '')
    setComplianceSuccessBill(bill)
    setComplianceSuccessPdf(payload)
    setComplianceSuccessNote(
      bill.compliance?.einvoice?.irn ? `IRN: ${bill.compliance.einvoice.irn}` : null,
    )
    setComplianceSuccessOpen(true)
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

  const downloadBillExcel = async (id: number) => {
    setBusy(true)
    try {
      const res = await axios.get<{ bill: ErpBill }>(`/api/reseller/erp/bills/${id}`)
      await downloadBillDetailExcel(res.data.bill, 'sale', auth.user)
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

      <div className={`${erpCardCls} grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5`}>
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
          From (dd/mm/yyyy)
          <ErpDateInput
            className={`${erpInputCls} mt-1`}
            value={from}
            onChange={(v) => {
              setFrom(v)
              if (v.trim()) setOnDate('')
            }}
          />
        </label>
        <label className="text-xs text-[var(--color-jewelry-black,#1a1814)]/55">
          To (dd/mm/yyyy)
          <ErpDateInput
            className={`${erpInputCls} mt-1`}
            value={to}
            onChange={(v) => {
              setTo(v)
              if (v.trim()) setOnDate('')
            }}
          />
        </label>
        <label className="text-xs text-[var(--color-jewelry-black,#1a1814)]/55">
          On date (dd/mm/yyyy)
          <ErpDateInput
            className={`${erpInputCls} mt-1`}
            value={onDate}
            onChange={(v) => {
              setOnDate(v)
              if (v.trim()) {
                setFrom('')
                setTo('')
              }
            }}
          />
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

      <div className={`${erpCardCls} space-y-2`}>
        <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-jewelry-black,#1a1814)]/45">
          Metal summary · {periodMetalLabel} (GST sales only)
        </p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[
            { label: 'Gold weight', value: `${metal.goldWeightGm.toFixed(3)} g` },
            { label: 'Silver weight', value: `${metal.silverWeightGm.toFixed(3)} g` },
            { label: 'Gold value', value: formatErpInr(metal.goldValueInr) },
            { label: 'Silver value', value: formatErpInr(metal.silverValueInr) },
          ].map((c) => (
            <div
              key={c.label}
              className="rounded-xl border border-[var(--color-slate-700,#e8e4df)] bg-[var(--color-slate-900,#faf8f4)] px-3 py-2.5"
            >
              <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-jewelry-black,#1a1814)]/45">
                {c.label}
              </p>
              <p className="mt-0.5 text-sm font-bold tabular-nums text-[var(--color-jewelry-black,#1a1814)]">
                {c.value}
              </p>
            </div>
          ))}
        </div>
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
              <th className="px-3 py-2.5 font-semibold">GST</th>
              <th className="px-3 py-2.5 font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody>
            {bills.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-4 py-12 text-center text-[var(--color-jewelry-black,#1a1814)]/45">
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
                  <td className="px-3 py-2.5 tabular-nums">{formatErpDateDdMmYyyy(b.created_at ?? b.bill_date)}</td>
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
                    <div className="flex flex-col gap-1">
                      {b.compliance?.einvoice?.irn ? (
                        <span className="text-[9px] font-semibold text-emerald-700">IRN ✓</span>
                      ) : null}
                      {b.compliance?.eway?.ewb_no ? (
                        <span className="text-[9px] font-semibold text-blue-700">EWB ✓</span>
                      ) : null}
                    </div>
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
                        className="inline-flex size-9 items-center justify-center rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100"
                        title="Download Excel report"
                        onClick={() => void downloadBillExcel(b.id)}
                      >
                        <FileSpreadsheet className="size-4" />
                      </button>
                      <button
                        type="button"
                        className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2 text-[10px] font-semibold text-emerald-900 hover:bg-emerald-100"
                        title={b.compliance?.einvoice?.irn ? 'Download tax invoice' : 'Generate e-invoice'}
                        onClick={() => void openCompliance(b.id, 'e-invoice')}
                      >
                        {b.compliance?.einvoice?.irn ? (
                          <Download className="size-3.5" />
                        ) : (
                          <FileCheck className="size-3.5" />
                        )}
                        <span className="hidden sm:inline">{b.compliance?.einvoice?.irn ? 'Tax inv' : 'E-inv'}</span>
                      </button>
                      <button
                        type="button"
                        className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-blue-200 bg-blue-50 px-2 text-[10px] font-semibold text-blue-900 hover:bg-blue-100"
                        title="Generate e-way bill"
                        onClick={() => void openCompliance(b.id, 'e-way')}
                      >
                        <Truck className="size-3.5" />
                        <span className="hidden sm:inline">E-way</span>
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

      <ErpBillPreviewModal bill={viewBill} kind="sale" onClose={() => setViewBill(null)} />
      <ErpComplianceDialog
        open={complianceOpen}
        onOpenChange={setComplianceOpen}
        bill={complianceBill}
        kind={complianceKind}
        onSuccess={(bill, meta) => void onComplianceSuccess(bill, meta)}
        onDownloadTaxInvoice={downloadTaxInvoiceForBill}
      />
      <ErpBillSavedModal
        open={complianceSuccessOpen}
        onOpenChange={setComplianceSuccessOpen}
        bill={complianceSuccessBill}
        pdfPayload={complianceSuccessPdf}
        defaultMobile={complianceSuccessMobile}
        variant={complianceSuccessVariant}
        complianceNote={complianceSuccessNote}
        autoDownload={!!complianceSuccessPdf}
        brandLabel={brandLabel}
        slabSettingsRaw={auth.user}
        taxInvoiceMode={complianceSuccessVariant === 'e-invoice'}
        onDone={onComplianceSuccessDone}
      />
    </div>
  )
}

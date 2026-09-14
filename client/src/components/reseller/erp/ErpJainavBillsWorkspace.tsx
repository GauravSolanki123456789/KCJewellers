'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import axios from '@/lib/axios'
import { useAuth } from '@/hooks/useAuth'
import { useErpOperator } from '@/context/ErpOperatorContext'
import { type WholesaleUserFields } from '@/lib/customer-tier'
import {
  erpBtnGhost,
  erpCardCls,
  erpErr,
  erpInputCls,
  type ErpBill,
} from '@/components/reseller/erp/erp-ui'
import { ErpBillPreviewModal } from '@/components/reseller/erp/ErpBillPreviewModal'
import { ErpDateInput } from '@/components/reseller/erp/ErpDateInput'
import { buildErpSalesPdfPayload } from '@/lib/erp-sales-pdf'
import { openPdfBlobInViewer } from '@/lib/pdf-share'
import type { ErpBillSession } from '@/lib/erp-bill-session'
import { formatErpInr } from '@/lib/reseller-erp-modules'
import { appConfirm } from '@/lib/app-notice'
import { downloadBillDetailExcel } from '@/lib/erp-bill-excel-export'
import { erpDateFilterToIso, formatErpDateDdMmYyyy, isoToDdMmYyyyInput, erpDefaultHistoryFromIso } from '@/lib/erp-date-format'
import { sortErpBillsDesc } from '@/lib/erp-bill-sort'
import { summarizeBillsMetalTotals } from '@/lib/erp-bill-metal-totals'
import { Download, Eye, FileSpreadsheet, FileText, Loader2, Receipt, Trash2 } from 'lucide-react'

export function ErpJainavBillsWorkspace() {
  const { canDeleteRecords } = useErpOperator()
  const auth = useAuth()
  const brandLabel = useMemo(() => {
    const name = auth.user && (auth.user as WholesaleUserFields).business_name
    return typeof name === 'string' && name.trim() ? name.trim() : 'Our store'
  }, [auth.user])

  const [bills, setBills] = useState<ErpBill[]>([])
  const [busy, setBusy] = useState(false)
  const [q, setQ] = useState('')
  const [from, setFrom] = useState(() => isoToDdMmYyyyInput(erpDefaultHistoryFromIso()))
  const [to, setTo] = useState('')
  const [onDate, setOnDate] = useState('')
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [viewBill, setViewBill] = useState<ErpBill | null>(null)

  const load = useCallback(async () => {
    const params: Record<string, string> = { bill_type: 'sale' }
    if (q.trim()) params.q = q.trim()
    const onIso = erpDateFilterToIso(onDate)
    if (onIso) params.on = onIso
    else {
      const fromIso = erpDateFilterToIso(from)
      const toIso = erpDateFilterToIso(to)
      if (fromIso) params.from = fromIso
      if (toIso) params.to = toIso
    }
    try {
      const res = await axios.get<{ bills: ErpBill[] }>('/api/reseller/erp/shadow/documents', { params })
      setBills(sortErpBillsDesc(res.data.bills || []))
      setSelected(new Set())
    } catch (e) {
      console.error('jainav bills load:', e)
      setBills([])
    }
  }, [q, from, to, onDate])

  useEffect(() => {
    const t = setTimeout(() => {
      void load().catch(() => setBills([]))
    }, 200)
    return () => clearTimeout(t)
  }, [load])

  const stats = useMemo(() => {
    let totalValue = 0
    for (const b of bills) totalValue += Number(b.total_inr) || 0
    return { total: bills.length, totalValue }
  }, [bills])

  const metal = useMemo(() => summarizeBillsMetalTotals(bills), [bills])

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
    if (!(await appConfirm('Delete this bill? Linked cash received will also be removed.'))) return
    setBusy(true)
    try {
      await axios.delete(`/api/reseller/erp/shadow/documents/${id}`)
      if (viewBill?.id === id) setViewBill(null)
      await load()
    } catch (e) {
      alert(erpErr(e))
    } finally {
      setBusy(false)
    }
  }

  const deleteSelected = async () => {
    if (!selected.size || !(await appConfirm(`Delete ${selected.size} bill(s)? Linked cash received will also be removed.`))) {
      return
    }
    setBusy(true)
    try {
      await axios.post('/api/reseller/erp/shadow/documents/bulk-delete', { ids: Array.from(selected) })
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
    }))
    const ws = XLSX.utils.json_to_sheet(data.length ? data : [{ 'Bill No': '' }])
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Bills')
    XLSX.writeFile(wb, `bills-${new Date().toISOString().slice(0, 10)}.xlsx`)
  }

  const openView = async (id: number) => {
    setBusy(true)
    try {
      const res = await axios.get<{ bill: ErpBill }>(`/api/reseller/erp/shadow/documents/${id}`)
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
      const res = await axios.get<{ bill: ErpBill }>(`/api/reseller/erp/shadow/documents/${id}`)
      await downloadBillDetailExcel(res.data.bill, 'sale', auth.user)
    } catch (e) {
      alert(erpErr(e))
    } finally {
      setBusy(false)
    }
  }

  const viewBillPdf = async (id: number) => {
    setBusy(true)
    try {
      const res = await axios.get<{ bill: ErpBill }>(`/api/reseller/erp/shadow/documents/${id}`)
      const bill = res.data.bill
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
        taxInvoiceMode: false,
      })
      await openPdfBlobInViewer(payload.blob, {
        filename: payload.filename,
        title: payload.title,
        text: payload.text,
        fallbackWhatsAppText: payload.fallbackWhatsAppText,
        fallbackWhatsAppHref: payload.fallbackWhatsAppHref,
        customerWhatsAppHref: payload.customerWhatsAppHref,
        customerMobile: payload.customerMobile,
        brandLabel: payload.brandLabel,
      })
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
          Jainav bills
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
          {canDeleteRecords ? (
            <button
              type="button"
              className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-rose-600 px-4 text-sm font-semibold text-white disabled:opacity-60"
              disabled={busy || selected.size === 0}
              onClick={() => void deleteSelected()}
            >
              {busy ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
              Delete selected
            </button>
          ) : null}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <div className={erpCardCls}>
          <p className="text-[10px] font-bold uppercase tracking-wide text-[#1a1814]/45">Bills</p>
          <p className="mt-1 text-xl font-bold tabular-nums text-[#1a1814]">{stats.total}</p>
        </div>
        <div className={erpCardCls}>
          <p className="text-[10px] font-bold uppercase tracking-wide text-[#1a1814]/45">Value</p>
          <p className="mt-1 text-xl font-bold tabular-nums text-[#1a1814]">{formatErpInr(stats.totalValue)}</p>
        </div>
      </div>

      <div className={`${erpCardCls} space-y-2`}>
        <p className="text-[10px] font-semibold uppercase tracking-wide text-[#1a1814]/45">Metal summary</p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[
            { label: 'Gold weight', value: `${metal.goldWeightGm.toFixed(3)} g` },
            { label: 'Silver weight', value: `${metal.silverWeightGm.toFixed(3)} g` },
            { label: 'Gold value', value: formatErpInr(metal.goldValueInr) },
            { label: 'Silver value', value: formatErpInr(metal.silverValueInr) },
          ].map((c) => (
            <div key={c.label} className="rounded-xl border border-[#e8e4df] bg-[#faf8f4] px-3 py-2.5">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-[#1a1814]/45">{c.label}</p>
              <p className="mt-0.5 text-sm font-bold tabular-nums text-[#1a1814]">{c.value}</p>
            </div>
          ))}
        </div>
      </div>

      <div className={`${erpCardCls} grid gap-3 sm:grid-cols-2 lg:grid-cols-4`}>
        <input
          className={erpInputCls}
          placeholder="Search bill no or customer…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <label className="text-xs text-[#1a1814]/55">
          From
          <ErpDateInput
            className={`${erpInputCls} mt-1`}
            value={from}
            onChange={(v) => {
              setFrom(v)
              if (v.trim()) setOnDate('')
            }}
          />
        </label>
        <label className="text-xs text-[#1a1814]/55">
          To
          <ErpDateInput
            className={`${erpInputCls} mt-1`}
            value={to}
            onChange={(v) => {
              setTo(v)
              if (v.trim()) setOnDate('')
            }}
          />
        </label>
        <label className="text-xs text-[#1a1814]/55">
          On date
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

      <div className={`${erpCardCls} overflow-x-auto`}>
        <table className="min-w-full text-left text-xs">
          <thead className="bg-[#f7f4ef] text-[10px] font-bold uppercase tracking-wide text-[#1a1814]/55">
            <tr>
              <th className="px-3 py-2.5">
                <input
                  type="checkbox"
                  checked={bills.length > 0 && selected.size === bills.length}
                  onChange={toggleAll}
                  aria-label="Select all"
                />
              </th>
              <th className="px-3 py-2.5">Bill no</th>
              <th className="px-3 py-2.5">Date</th>
              <th className="px-3 py-2.5">Customer</th>
              <th className="px-3 py-2.5 text-right">Items</th>
              <th className="px-3 py-2.5 text-right">Amount</th>
              <th className="px-3 py-2.5">Actions</th>
            </tr>
          </thead>
          <tbody>
            {bills.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-3 py-8 text-center text-sm text-[#1a1814]/50">
                  No bills in this period.
                </td>
              </tr>
            ) : (
              bills.map((b) => (
                <tr key={b.id} className="border-t border-[#e8e4df]/70">
                  <td className="px-3 py-2.5">
                    <input
                      type="checkbox"
                      checked={selected.has(b.id)}
                      onChange={() => toggleOne(b.id)}
                      aria-label={`Select ${b.bill_number}`}
                    />
                  </td>
                  <td className="px-3 py-2.5 font-mono font-semibold text-[#1a1814]">{b.bill_number}</td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-[#1a1814]">
                    {formatErpDateDdMmYyyy(b.bill_date || b.created_at)}
                  </td>
                  <td className="px-3 py-2.5 text-[#1a1814]">{b.customer_name || 'Walk-in'}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-[#1a1814]">{b.lines?.length ?? 0}</td>
                  <td className="px-3 py-2.5 text-right font-semibold tabular-nums text-[#1a1814]">
                    {formatErpInr(b.total_inr)}
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex flex-wrap gap-1.5">
                      <button type="button" className={erpBtnGhost} onClick={() => void openView(b.id)}>
                        <Eye className="size-3.5" />
                        Preview
                      </button>
                      <button type="button" className={erpBtnGhost} onClick={() => void viewBillPdf(b.id)}>
                        <FileText className="size-3.5" />
                        PDF
                      </button>
                      <button type="button" className={erpBtnGhost} onClick={() => void downloadBillExcel(b.id)}>
                        <FileSpreadsheet className="size-3.5" />
                        Excel
                      </button>
                      {canDeleteRecords ? (
                        <button type="button" className={erpBtnGhost} onClick={() => void deleteOne(b.id)}>
                          <Trash2 className="size-3.5" />
                          Delete
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {viewBill ? (
        <ErpBillPreviewModal bill={viewBill} kind="sale" onClose={() => setViewBill(null)} />
      ) : null}
    </div>
  )
}

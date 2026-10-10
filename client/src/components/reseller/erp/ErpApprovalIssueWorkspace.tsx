'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useErpModuleSession } from '@/hooks/useErpModuleSession'
import Link from 'next/link'
import axios from '@/lib/axios'
import { useAuth } from '@/hooks/useAuth'
import { useErpOperator } from '@/context/ErpOperatorContext'
import { type WholesaleUserFields } from '@/lib/customer-tier'
import {
  erpBtnGhost,
  erpBtnPrimary,
  erpCardCls,
  erpErr,
  erpInputCls,
  type ErpBill,
} from '@/components/reseller/erp/erp-ui'
import { ErpDateInput } from '@/components/reseller/erp/ErpDateInput'
import { buildErpSalesPdfPayload } from '@/lib/erp-sales-pdf'
import { openPdfBlobInViewer } from '@/lib/pdf-share'
import type { ErpBillSession } from '@/lib/erp-bill-session'
import { resellerErpModulePath } from '@/lib/reseller-erp-modules'
import { appConfirm } from '@/lib/app-notice'
import { erpDateFilterToIso, formatErpDateDdMmYyyy, isoToDdMmYyyyInput, erpDefaultHistoryFromIso } from '@/lib/erp-date-format'
import { sortErpBillsDesc } from '@/lib/erp-bill-sort'
import { ClipboardList, FileText, Loader2, RotateCcw, ShoppingCart, Trash2 } from 'lucide-react'

export function ErpApprovalIssueWorkspace() {
  const { canDeleteRecords, canAccessModule, shadowUnlocked } = useErpOperator()
  const auth = useAuth()
  const brandLabel = useMemo(() => {
    const name = auth.user && (auth.user as WholesaleUserFields).business_name
    return typeof name === 'string' && name.trim() ? name.trim() : 'Our store'
  }, [auth.user])
  const canEstimates = canAccessModule('estimations')

  const [bills, setBills] = useState<ErpBill[]>([])
  const [busy, setBusy] = useState(false)
  const [q, setQ] = useState('')
  const [from, setFrom] = useState(() => isoToDdMmYyyyInput(erpDefaultHistoryFromIso()))
  const [to, setTo] = useState('')
  const [onDate, setOnDate] = useState('')
  const [actionId, setActionId] = useState<number | null>(null)

  const sessionRestore = useErpModuleSession(
    'approval-issue',
    () => ({ q, from, to, onDate }),
    [q, from, to, onDate],
  )
  const sessionAppliedRef = useRef(false)
  useEffect(() => {
    if (sessionAppliedRef.current || !sessionRestore) return
    sessionAppliedRef.current = true
    if (sessionRestore.q) setQ(sessionRestore.q)
    if (sessionRestore.from) setFrom(sessionRestore.from)
    if (sessionRestore.to) setTo(sessionRestore.to)
    if (sessionRestore.onDate) setOnDate(sessionRestore.onDate)
  }, [sessionRestore])

  const load = useCallback(async () => {
    const params: Record<string, string> = { bill_type: 'approval' }
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
      const res = await axios.get<{ bills: ErpBill[] }>('/api/reseller/erp/bills', { params })
      setBills(
        sortErpBillsDesc(
          (res.data.bills || []).filter((b) => String(b.bill_type || '').toLowerCase() === 'approval'),
        ),
      )
    } catch (e) {
      console.error('erp approvals load:', e)
      setBills([])
    }
  }, [q, from, to, onDate])

  useEffect(() => {
    const t = setTimeout(() => {
      void load()
    }, 200)
    return () => clearTimeout(t)
  }, [load])

  const downloadPdf = async (id: number) => {
    setBusy(true)
    try {
      const res = await axios.get<{ bill: ErpBill }>(`/api/reseller/erp/bills/${id}`)
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
        approvalIssue: true,
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

  const returnToEstimate = async (b: ErpBill) => {
    const ok = await appConfirm(
      `Convert ${b.bill_number} back to an estimate? Stock on this challan will return to inventory.`,
    )
    if (!ok) return
    setActionId(b.id)
    try {
      await axios.post(`/api/reseller/erp/approvals/${b.id}/return`, {})
      await load()
    } catch (e) {
      alert(erpErr(e))
    } finally {
      setActionId(null)
    }
  }

  const convertToBill = async (b: ErpBill) => {
    const jainavNote = shadowUnlocked
      ? ' Jainav mode is on — this will save as a hidden Jainav bill, not an official SCB.'
      : ' This becomes a sales bill (SCB). Stock stays out of inventory.'
    const ok = await appConfirm(`Convert ${b.bill_number} to a bill?${jainavNote}`)
    if (!ok) return
    setActionId(b.id)
    try {
      const res = await axios.post<{ success?: boolean; shadow?: boolean; bill?: { bill_number?: string } }>(
        `/api/reseller/erp/approvals/${b.id}/bill`,
        {},
      )
      await load()
      if (res.data.shadow) {
        alert('Saved as a Jainav bill. It is not shown on official sales.')
      }
    } catch (e) {
      alert(erpErr(e))
    } finally {
      setActionId(null)
    }
  }

  const deleteOne = async (id: number) => {
    if (!(await appConfirm('Delete this approval? Stock will return to inventory. This cannot be undone.'))) return
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

  const rowActions = (b: ErpBill) => {
    const acting = actionId === b.id
    return (
      <div className="flex flex-wrap gap-1">
        <button
          type="button"
          className="inline-flex size-9 items-center justify-center rounded-lg border border-[var(--color-slate-700,#e8e4df)] text-[var(--color-jewelry-black,#1a1814)] hover:bg-[var(--color-slate-900,#faf8f4)]"
          title="Download Delivery Challan [Issue]"
          disabled={busy}
          onClick={() => void downloadPdf(b.id)}
        >
          <FileText className="size-4" />
        </button>
        <button
          type="button"
          className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-amber-200 bg-amber-50 px-2 text-[11px] font-semibold text-amber-950 disabled:opacity-60"
          title="Convert back to estimate"
          disabled={acting}
          onClick={() => void returnToEstimate(b)}
        >
          {acting ? <Loader2 className="size-3.5 animate-spin" /> : <RotateCcw className="size-3.5" />}
          Estimate
        </button>
        <button
          type="button"
          className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2 text-[11px] font-semibold text-emerald-900 disabled:opacity-60"
          title="Convert to sales bill"
          disabled={acting}
          onClick={() => void convertToBill(b)}
        >
          {acting ? <Loader2 className="size-3.5 animate-spin" /> : <ShoppingCart className="size-3.5" />}
          Bill
        </button>
        {canDeleteRecords ? (
          <button
            type="button"
            className="inline-flex size-9 items-center justify-center rounded-lg border border-rose-200 text-rose-600 hover:bg-rose-50"
            title="Delete (Jainav)"
            onClick={() => void deleteOne(b.id)}
          >
            <Trash2 className="size-4" />
          </button>
        ) : null}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-semibold text-[var(--color-jewelry-black,#1a1814)]">
          <ClipboardList className="size-4 text-emerald-700" />
          Approval issues
        </div>
        {canEstimates ? (
          <Link href={resellerErpModulePath('estimations')} className={erpBtnGhost}>
            Open estimates
          </Link>
        ) : null}
      </div>
      <p className="text-xs leading-relaxed text-[var(--color-jewelry-black,#1a1814)]/55">
        Issue an estimate from the Estimates tab. Stock leaves inventory until you convert back to an estimate or
        convert to a sales bill.
      </p>

      <div className={`${erpCardCls} grid gap-3 sm:grid-cols-2 lg:grid-cols-4`}>
        <input
          className={erpInputCls}
          placeholder="Search GAI no, customer…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
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
              if (v.trim()) setFrom('')
            }}
          />
        </label>
      </div>

      <div className="space-y-3 md:hidden">
        {bills.length === 0 ? (
          <div className={`${erpCardCls} py-10 text-center text-sm text-[var(--color-jewelry-black,#1a1814)]/45`}>
            No approval issues in this period.
          </div>
        ) : (
          bills.map((b) => {
            const session = (b.session || {}) as ErpBillSession
            const narration = String(session.approvalNarration || '').trim()
            return (
              <div key={b.id} className={erpCardCls}>
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-semibold text-blue-800">{b.bill_number}</p>
                  <p className="text-xs tabular-nums text-[var(--color-jewelry-black,#1a1814)]/55">
                    {formatErpDateDdMmYyyy(b.created_at ?? b.bill_date)}
                  </p>
                </div>
                <p className="mt-1 text-sm font-medium text-[var(--color-jewelry-black,#1a1814)]">
                  {b.customer_name || 'Walk-in'}
                </p>
                <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-[var(--color-jewelry-black,#1a1814)]">
                  {narration || '—'}
                </p>
                <p className="mt-1 text-xs text-[var(--color-jewelry-black,#1a1814)]/55">
                  {b.lines?.length ?? 0} item{(b.lines?.length ?? 0) === 1 ? '' : 's'}
                </p>
                <div className="mt-3">{rowActions(b)}</div>
              </div>
            )
          })
        )}
      </div>

      <div className={`${erpCardCls} hidden overflow-x-auto p-0 md:block`}>
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b border-[var(--color-slate-700,#e8e4df)] bg-[var(--color-slate-900,#faf8f4)] text-left text-xs text-[var(--color-jewelry-black,#1a1814)]/55">
              <th className="px-3 py-2.5 font-semibold">GAI no</th>
              <th className="px-3 py-2.5 font-semibold">Date</th>
              <th className="px-3 py-2.5 font-semibold">Customer</th>
              <th className="px-3 py-2.5 font-semibold">Narration</th>
              <th className="px-3 py-2.5 font-semibold">Items</th>
              <th className="px-3 py-2.5 font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody>
            {bills.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center text-[var(--color-jewelry-black,#1a1814)]/45">
                  No approval issues in this period.
                </td>
              </tr>
            ) : (
              bills.map((b) => {
                const session = (b.session || {}) as ErpBillSession
                const narration = String(session.approvalNarration || '').trim()
                return (
                  <tr key={b.id} className="border-b border-[var(--color-slate-700,#e8e4df)]/50 text-[var(--color-jewelry-black,#1a1814)]">
                    <td className="px-3 py-2.5 font-semibold text-blue-800">{b.bill_number}</td>
                    <td className="px-3 py-2.5 tabular-nums">
                      {formatErpDateDdMmYyyy(b.created_at ?? b.bill_date)}
                    </td>
                    <td className="max-w-[140px] truncate px-3 py-2.5">{b.customer_name || '—'}</td>
                    <td className="max-w-[180px] truncate px-3 py-2.5">{narration || '—'}</td>
                    <td className="px-3 py-2.5 tabular-nums">{b.lines?.length ?? 0}</td>
                    <td className="px-3 py-2.5">{rowActions(b)}</td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

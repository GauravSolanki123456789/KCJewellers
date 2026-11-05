'use client'

import { useCallback, useEffect, useState } from 'react'
import axios from '@/lib/axios'
import { useAuth } from '@/hooks/useAuth'
import { ArrowLeft, Download, FileText, Loader2, Receipt } from 'lucide-react'
import { ErpDateInput } from '@/components/reseller/erp/ErpDateInput'
import { erpBtnGhost, erpBtnPrimary, erpCardCls, erpErr, erpInputCls } from '@/components/reseller/erp/erp-ui'
import { formatErpInr } from '@/lib/reseller-erp-modules'
import { formatErpDateDdMmYyyy, erpDateFilterToIso } from '@/lib/erp-date-format'
import {
  buildGstSalesPeriodLabel,
  previewGstSalesRegisterPdf,
  type GstSalesRegisterPdfReport,
} from '@/lib/erp-ledger-gst-sales-register-pdf'
import {
  previewLaneBillsDetailPdf,
  type LaneBillDetail,
} from '@/lib/erp-ledger-lane-bills-detail-pdf'

type GstApiReport = {
  bills: GstSalesRegisterPdfReport['bills']
  summary: GstSalesRegisterPdfReport['summary']
  metal: GstSalesRegisterPdfReport['metal']
}

type LaneApiReport = {
  bills: LaneBillDetail[]
  summary: { total: number; totalValue: number; monthCount: number; todayCount: number }
  metal: GstApiReport['metal']
}

type Props = {
  reportId: 'gst_sales_register' | 'lane_all_bills_detail'
  laneMode: boolean
  defaultFrom: string
  defaultTo: string
  onBack: () => void
}

export function ErpLedgerSalesReportsSection({
  reportId,
  laneMode,
  defaultFrom,
  defaultTo,
  onBack,
}: Props) {
  const auth = useAuth()
  const [from, setFrom] = useState(defaultFrom)
  const [to, setTo] = useState('')
  const [onDate, setOnDate] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [gstData, setGstData] = useState<GstApiReport | null>(null)
  const [laneData, setLaneData] = useState<LaneApiReport | null>(null)

  useEffect(() => {
    setFrom(defaultFrom)
  }, [defaultFrom])

  const shopName = (() => {
    const u = auth.user as Record<string, unknown> | null | undefined
    return String(u?.business_name || u?.shop_name || u?.name || '').trim() || undefined
  })()

  const scope = laneMode ? 'lane' : 'official'

  const load = useCallback(async () => {
    setBusy(true)
    setErr(null)
    try {
      const params: Record<string, string> = { ledger_scope: scope }
      const onIso = erpDateFilterToIso(onDate)
      if (onIso) params.on = onIso
      else {
        const fromIso = erpDateFilterToIso(from)
        const toIso = erpDateFilterToIso(to)
        if (fromIso) params.from = fromIso
        if (toIso) params.to = toIso
      }
      if (reportId === 'gst_sales_register') {
        const res = await axios.get<GstApiReport>('/api/reseller/erp/ledger/reports/gst-sales-register', { params })
        setGstData(res.data)
        setLaneData(null)
      } else {
        const res = await axios.get<LaneApiReport>('/api/reseller/erp/ledger/reports/lane-all-bills', { params })
        setLaneData(res.data)
        setGstData(null)
      }
    } catch (e) {
      setErr(erpErr(e))
      setGstData(null)
      setLaneData(null)
    } finally {
      setBusy(false)
    }
  }, [reportId, scope, from, to, onDate])

  useEffect(() => {
    void load()
  }, [load])

  const exportCsv = async () => {
    const params = new URLSearchParams({ ledger_scope: scope })
    const onIso = erpDateFilterToIso(onDate)
    if (onIso) params.set('on', onIso)
    else {
      const fromIso = erpDateFilterToIso(from)
      const toIso = erpDateFilterToIso(to)
      if (fromIso) params.set('from', fromIso)
      if (toIso) params.set('to', toIso)
    }
    const path =
      reportId === 'gst_sales_register'
        ? '/api/reseller/erp/ledger/reports/gst-sales-register/export'
        : '/api/reseller/erp/ledger/reports/lane-all-bills/export'
    const res = await axios.get(`${path}?${params.toString()}`, { responseType: 'blob' })
    const blob = new Blob([res.data], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download =
      reportId === 'gst_sales_register'
        ? `gst-sales-register-${new Date().toISOString().slice(0, 10)}.csv`
        : `lane-all-bills-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const previewPdf = async () => {
    const periodLabel = buildGstSalesPeriodLabel(
      erpDateFilterToIso(from) || '',
      erpDateFilterToIso(to) || '',
      erpDateFilterToIso(onDate) || '',
    )
    setBusy(true)
    setErr(null)
    try {
      if (reportId === 'gst_sales_register' && gstData) {
        await previewGstSalesRegisterPdf({
          shopName,
          periodLabel,
          summary: gstData.summary,
          metal: gstData.metal,
          bills: gstData.bills,
        })
      } else if (reportId === 'lane_all_bills_detail' && laneData) {
        await previewLaneBillsDetailPdf({
          shopName,
          periodLabel,
          bills: laneData.bills,
        })
      }
    } catch (e) {
      setErr(erpErr(e))
    } finally {
      setBusy(false)
    }
  }

  const title =
    reportId === 'gst_sales_register' ? 'GST sales bills register' : 'All bills (lane ledger)'

  const summary = gstData?.summary || laneData?.summary
  const metal = gstData?.metal || laneData?.metal
  const bills = gstData?.bills || []
  const laneBills = laneData?.bills || []

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className={erpBtnGhost} onClick={onBack}>
          <ArrowLeft className="size-4" />
          All reports
        </button>
        <p className="inline-flex items-center gap-2 text-sm font-semibold text-[var(--color-jewelry-black,#1a1814)]">
          <Receipt className="size-4 text-[var(--kc-accent,#c41e3a)]" />
          {title}
        </p>
      </div>

      <div className={`${erpCardCls} space-y-3`}>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="text-xs text-[var(--color-jewelry-black,#1a1814)]/55">
            From
            <ErpDateInput className={`${erpInputCls} mt-1`} value={onDate ? '' : from} onChange={setFrom} />
          </label>
          <label className="text-xs text-[var(--color-jewelry-black,#1a1814)]/55">
            To
            <ErpDateInput className={`${erpInputCls} mt-1`} value={onDate ? '' : to} onChange={setTo} />
          </label>
          <label className="text-xs text-[var(--color-jewelry-black,#1a1814)]/55">
            On date
            <ErpDateInput className={`${erpInputCls} mt-1`} value={onDate} onChange={setOnDate} />
          </label>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className={erpBtnPrimary} disabled={busy} onClick={() => void load()}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : null}
            Run report
          </button>
          <button type="button" className={erpBtnGhost} disabled={busy} onClick={() => void exportCsv()}>
            <Download className="size-4" />
            Excel (CSV)
          </button>
          <button
            type="button"
            className={erpBtnGhost}
            disabled={busy || (!gstData?.bills?.length && !laneData?.bills?.length)}
            onClick={() => void previewPdf()}
          >
            <FileText className="size-4" />
            Preview PDF
          </button>
        </div>
        {err ? (
          <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-800">
            {err}
          </p>
        ) : null}
      </div>

      {summary ? (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[
            { label: 'Total sales', value: String(summary.total) },
            { label: 'Total value', value: formatErpInr(summary.totalValue) },
            { label: 'This month', value: String(summary.monthCount) },
            { label: 'Today', value: String(summary.todayCount) },
          ].map((k) => (
            <div key={k.label} className="rounded-xl border border-[var(--color-slate-700,#e8e4df)] bg-white px-3 py-2">
              <p className="text-[10px] font-bold uppercase text-[var(--color-jewelry-black,#1a1814)]/45">{k.label}</p>
              <p className="text-lg font-semibold tabular-nums">{k.value}</p>
            </div>
          ))}
        </div>
      ) : null}

      {metal ? (
        <div className={`${erpCardCls} space-y-2`}>
          <p className="text-[10px] font-bold uppercase text-[var(--color-jewelry-black,#1a1814)]/50">
            Metal summary — selected period
          </p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <p className="text-xs">
              Gold: <strong>{metal.goldWeightGm.toFixed(3)} g</strong> · {formatErpInr(metal.goldValueInr)}
            </p>
            <p className="text-xs">
              Silver: <strong>{metal.silverWeightGm.toFixed(3)} g</strong> · {formatErpInr(metal.silverValueInr)}
            </p>
          </div>
        </div>
      ) : null}

      {reportId === 'gst_sales_register' ? (
        <div className="overflow-x-auto rounded-xl border border-[var(--color-slate-700,#e8e4df)] bg-white">
          <table className="min-w-full text-left text-xs">
            <thead className="bg-[var(--color-slate-900,#f7f4ef)] text-[10px] font-bold uppercase text-[var(--color-jewelry-black,#1a1814)]/55">
              <tr>
                <th className="px-3 py-2.5">Bill no</th>
                <th className="px-3 py-2.5">Date</th>
                <th className="px-3 py-2.5">Customer</th>
                <th className="px-3 py-2.5 text-right">Items</th>
                <th className="px-3 py-2.5 text-right">Net total</th>
                <th className="px-3 py-2.5">Status</th>
                <th className="px-3 py-2.5">GST</th>
              </tr>
            </thead>
            <tbody>
              {!bills.length && !busy ? (
                <tr>
                  <td colSpan={7} className="px-3 py-10 text-center text-[var(--color-jewelry-black,#1a1814)]/45">
                    No GST sales in this period.
                  </td>
                </tr>
              ) : (
                bills.map((b) => (
                  <tr key={b.bill_number} className="border-t border-[var(--color-slate-700,#e8e4df)]/60">
                    <td className="px-3 py-2.5 font-semibold text-emerald-800">{b.bill_number}</td>
                    <td className="px-3 py-2.5">{formatErpDateDdMmYyyy(b.bill_date)}</td>
                    <td className="px-3 py-2.5">{b.customer_name || '—'}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{b.item_count}</td>
                    <td className="px-3 py-2.5 text-right font-semibold tabular-nums">{formatErpInr(b.total_inr)}</td>
                    <td className="px-3 py-2.5">{String(b.status || '').toUpperCase()}</td>
                    <td className="px-3 py-2.5">{b.gst_enabled ? 'Yes' : '—'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="space-y-3">
          {!laneBills.length && !busy ? (
            <p className="text-center text-sm text-[var(--color-jewelry-black,#1a1814)]/45">No bills in this period.</p>
          ) : (
            laneBills.slice(0, 40).map((b) => (
              <details
                key={`${b.source}-${b.bill_number}`}
                className="rounded-xl border border-[var(--color-slate-700,#e8e4df)] bg-white px-3 py-2"
              >
                <summary className="cursor-pointer text-sm font-semibold text-[var(--color-jewelry-black,#1a1814)]">
                  {b.bill_number} — {b.customer_name} — {formatErpInr(b.total_inr)}
                  <span className="ml-2 text-[10px] font-normal uppercase text-[var(--color-jewelry-black,#1a1814)]/45">
                    {b.source === 'shadow' ? `Lane ${b.lane}` : 'Official'}
                  </span>
                </summary>
                <div className="mt-2 overflow-x-auto">
                  <table className="min-w-full text-[11px]">
                    <thead>
                      <tr className="text-[10px] uppercase text-[var(--color-jewelry-black,#1a1814)]/45">
                        <th className="px-2 py-1 text-left">#</th>
                        <th className="px-2 py-1 text-left">Barcode</th>
                        <th className="px-2 py-1 text-left">Product</th>
                        <th className="px-2 py-1 text-right">Wt</th>
                        <th className="px-2 py-1 text-right">Rate</th>
                        <th className="px-2 py-1 text-right">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(b.lines || []).map((line, i) => (
                        <tr key={i} className="border-t border-stone-100">
                          <td className="px-2 py-1">{i + 1}</td>
                          <td className="px-2 py-1">{line.barcode || line.code || '—'}</td>
                          <td className="px-2 py-1">{line.invoice_item_name || line.name || '—'}</td>
                          <td className="px-2 py-1 text-right">{Number(line.weightGm ?? line.weight_gm ?? 0).toFixed(2)}</td>
                          <td className="px-2 py-1 text-right">{Number(line.unitInr ?? line.rate ?? 0).toFixed(2)}</td>
                          <td className="px-2 py-1 text-right">
                            {formatErpInr(
                              Number(line.lineTotalInr ?? line.line_total_inr) ||
                                (Number(line.unitInr ?? line.rate) || 0) * (Number(line.qty) || 1),
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            ))
          )}
          {laneBills.length > 40 ? (
            <p className="text-xs text-[var(--color-jewelry-black,#1a1814)]/50">
              Showing first 40 bills — use PDF export for the full set ({laneBills.length} total).
            </p>
          ) : null}
        </div>
      )}
    </div>
  )
}

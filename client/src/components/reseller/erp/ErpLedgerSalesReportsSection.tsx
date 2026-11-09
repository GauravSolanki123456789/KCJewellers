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

type SalesApiReport = {
  bills: GstSalesRegisterPdfReport['bills']
  summary: GstSalesRegisterPdfReport['summary']
  metal: GstSalesRegisterPdfReport['metal']
}

type Props = {
  reportId: 'gst_sales_register' | 'lane_all_bills_detail'
  laneMode: boolean
  defaultFrom: string
  defaultTo: string
  onBack: () => void
}

const tableBorder = 'border border-[var(--color-slate-700,#e8e4df)]'
const cellBorder = `${tableBorder} px-2 py-2 sm:px-3 sm:py-2.5`

function hasGoldMetal(metal: SalesApiReport['metal']) {
  return (metal.goldWeightGm || 0) > 0.0005 || (metal.goldValueInr || 0) > 0.005
}

function SalesBillsTable({
  bills,
  busy,
  emptyMessage,
}: {
  bills: GstSalesRegisterPdfReport['bills']
  busy: boolean
  emptyMessage: string
}) {
  return (
    <div className="overflow-x-auto rounded-xl bg-white">
      <table className={`min-w-full border-collapse text-left text-xs ${tableBorder}`}>
        <thead className="bg-[var(--color-slate-900,#f7f4ef)] text-[10px] font-bold uppercase text-[var(--color-jewelry-black,#1a1814)]/55">
          <tr>
            <th className={cellBorder}>Bill no</th>
            <th className={cellBorder}>Date</th>
            <th className={cellBorder}>Customer</th>
            <th className={`${cellBorder} text-right`}>Items</th>
            <th className={`${cellBorder} text-right`}>Net total</th>
          </tr>
        </thead>
        <tbody>
          {!bills.length && !busy ? (
            <tr>
              <td colSpan={5} className={`${cellBorder} py-10 text-center text-[var(--color-jewelry-black,#1a1814)]/45`}>
                {emptyMessage}
              </td>
            </tr>
          ) : (
            bills.map((b) => (
              <tr key={`${b.bill_date}-${b.bill_number}`}>
                <td className={`${cellBorder} font-semibold text-emerald-800`}>{b.bill_number}</td>
                <td className={cellBorder}>{formatErpDateDdMmYyyy(b.bill_date)}</td>
                <td className={`${cellBorder} break-words`}>{b.customer_name || '—'}</td>
                <td className={`${cellBorder} text-right tabular-nums`}>{b.item_count}</td>
                <td className={`${cellBorder} text-right font-semibold tabular-nums`}>{formatErpInr(b.total_inr)}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  )
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
  const [to, setTo] = useState(defaultTo)
  const [onDate, setOnDate] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [data, setData] = useState<SalesApiReport | null>(null)

  useEffect(() => {
    setFrom(defaultFrom)
    setTo(defaultTo)
  }, [defaultFrom, defaultTo])

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
      const path =
        reportId === 'gst_sales_register'
          ? '/api/reseller/erp/ledger/reports/gst-sales-register'
          : '/api/reseller/erp/ledger/reports/lane-all-bills'
      const res = await axios.get<SalesApiReport>(path, { params })
      setData(res.data)
    } catch (e) {
      setErr(erpErr(e))
      setData(null)
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
        : `sales-bills-register-${new Date().toISOString().slice(0, 10)}.csv`
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
      if (!data) return
      const isGst = reportId === 'gst_sales_register'
      await previewGstSalesRegisterPdf(
        {
          shopName,
          periodLabel,
          reportTitle: isGst ? 'GST sales bills register' : 'Sales bills register',
          summary: data.summary,
          metal: data.metal,
          bills: data.bills,
        },
        {
          downloadName: isGst
            ? `gst-sales-register-${new Date().toISOString().slice(0, 10)}.pdf`
            : `sales-bills-register-${new Date().toISOString().slice(0, 10)}.pdf`,
          viewerTitle: isGst ? 'GST sales bills register' : 'Sales bills register',
        },
      )
    } catch (e) {
      setErr(erpErr(e))
    } finally {
      setBusy(false)
    }
  }

  const title =
    reportId === 'gst_sales_register' ? 'GST sales bills register' : 'All bills (lane ledger)'

  const summary = data?.summary
  const metal = data?.metal
  const bills = data?.bills || []
  const showGold = metal ? hasGoldMetal(metal) : false

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
            disabled={busy || !data?.bills?.length}
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
              <p className="text-lg font-semibold tabular-nums text-[var(--color-jewelry-black,#1a1814)]">{k.value}</p>
            </div>
          ))}
        </div>
      ) : null}

      {metal ? (
        <div className={`${erpCardCls} space-y-2`}>
          <p className="text-[10px] font-bold uppercase text-[var(--color-jewelry-black,#1a1814)]/50">
            Metal summary — selected period
          </p>
          <div className="flex flex-wrap gap-x-6 gap-y-2 text-xs text-[var(--color-jewelry-black,#1a1814)]">
            {showGold ? (
              <p>
                Gold: <strong>{metal.goldWeightGm.toFixed(3)} g</strong> · {formatErpInr(metal.goldValueInr)}
              </p>
            ) : null}
            <p>
              Silver: <strong>{metal.silverWeightGm.toFixed(3)} g</strong> · {formatErpInr(metal.silverValueInr)}
            </p>
          </div>
        </div>
      ) : null}

      <SalesBillsTable
        bills={bills}
        busy={busy}
        emptyMessage={
          reportId === 'gst_sales_register' ? 'No GST sales in this period.' : 'No bills in this period.'
        }
      />
    </div>
  )
}

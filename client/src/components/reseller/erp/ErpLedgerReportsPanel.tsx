'use client'

import { Fragment, useCallback, useEffect, useState } from 'react'
import axios from '@/lib/axios'
import {
  ArrowLeft,
  ChevronRight,
  Download,
  FileText,
  Loader2,
  Users,
} from 'lucide-react'
import { ErpDateInput } from '@/components/reseller/erp/ErpDateInput'
import { erpBtnGhost, erpBtnPrimary, erpCardCls, erpErr, erpInputCls } from '@/components/reseller/erp/erp-ui'
import { formatErpInr } from '@/lib/reseller-erp-modules'
import { formatErpDateDdMmYyyy } from '@/lib/erp-date-format'
import {
  type CustomerAccountData,
  type CustomerAccountTx,
} from '@/components/reseller/erp/ErpCustomerAccountPanel'
import { formatLedgerTransactionKind } from '@/lib/erp-ledger-labels'
import { formatLedgerBalanceCell, formatMetalGm } from '@/lib/erp-ledger-metal'
import { useAuth } from '@/hooks/useAuth'
import {
  customerBalancesReportToPdfPayload,
  previewCustomerBalancesPdf,
} from '@/lib/erp-ledger-customer-balances-pdf'

type ReportId = 'customer_balances'

type ReportMeta = {
  id: ReportId
  title: string
  description: string
  icon: typeof Users
}

const REPORTS: ReportMeta[] = [
  {
    id: 'customer_balances',
    title: 'Customer balances',
    description: '',
    icon: Users,
  },
]

type BalanceRow = {
  customer_id: number
  name: string
  mobile: string
  gstin: string
  address: string
  total_billed_inr: number
  total_paid_inr: number
  balance_due_inr: number
  metal_balance_gm: number
  bill_numbers: string[]
  transaction_count: number
}

type BalancesReport = {
  rows: BalanceRow[]
  summary: {
    customer_count: number
    total_balance_due_inr: number
    total_receivable_inr: number
    total_payable_inr: number
  }
}

type Props = {
  laneMode?: boolean
  defaultFrom: string
  defaultTo: string
  onOpenCustomerLedger?: (customerId: number) => void
}

export function ErpLedgerReportsPanel({
  laneMode = false,
  defaultFrom,
  defaultTo,
  onOpenCustomerLedger,
}: Props) {
  const auth = useAuth()
  const [activeReport, setActiveReport] = useState<ReportId | null>(null)
  const [from, setFrom] = useState(defaultFrom)
  const [to, setTo] = useState(defaultTo)
  const [onDate, setOnDate] = useState('')
  const [showAllCustomers, setShowAllCustomers] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [data, setData] = useState<BalancesReport | null>(null)
  const [expandedId, setExpandedId] = useState<number | null>(null)
  const [detailBusy, setDetailBusy] = useState(false)
  const [detail, setDetail] = useState<CustomerAccountData | null>(null)

  useEffect(() => {
    setFrom(defaultFrom)
    setTo(defaultTo)
  }, [defaultFrom, defaultTo])

  const loadBalances = useCallback(async () => {
    setBusy(true)
    setErr(null)
    try {
      const params: Record<string, string> = {}
      if (onDate) params.on = onDate
      else {
        if (from) params.from = from
        if (to) params.to = to
      }
      if (showAllCustomers) params.all = '1'
      const res = await axios.get<BalancesReport>('/api/reseller/erp/ledger/reports/customer-balances', {
        params,
      })
      setData(res.data)
    } catch (e) {
      setErr(erpErr(e))
      setData(null)
    } finally {
      setBusy(false)
    }
  }, [from, to, onDate, showAllCustomers])

  useEffect(() => {
    if (activeReport === 'customer_balances') void loadBalances()
    // Run once when the report is opened. Date filters apply via Run report.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeReport])

  const loadDetail = useCallback(
    async (customerId: number) => {
      setDetailBusy(true)
      try {
        const path = laneMode
          ? '/api/reseller/erp/shadow/customer-account'
          : '/api/reseller/erp/ledger/customer-account'
        const params: Record<string, string | number> = { customer_id: customerId }
        if (onDate) params.on = onDate
        else {
          if (from) params.from = from
          if (to) params.to = to
        }
        const res = await axios.get<CustomerAccountData>(path, { params })
        setDetail(res.data)
      } catch {
        setDetail(null)
      } finally {
        setDetailBusy(false)
      }
    },
    [laneMode, from, to, onDate],
  )

  const toggleExpand = (row: BalanceRow) => {
    if (expandedId === row.customer_id) {
      setExpandedId(null)
      setDetail(null)
      return
    }
    setExpandedId(row.customer_id)
    void loadDetail(row.customer_id)
  }

  const exportCsv = async () => {
    const params = new URLSearchParams()
    params.set('format', 'csv')
    if (onDate) params.set('on', onDate)
    else {
      if (from) params.set('from', from)
      if (to) params.set('to', to)
    }
    if (showAllCustomers) params.set('all', '1')
    const url = `/api/reseller/erp/ledger/reports/customer-balances/export?${params.toString()}`
    const res = await axios.get(url, { responseType: 'blob' })
    const blob = new Blob([res.data], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `customer-balances-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const previewPdf = async () => {
    if (!data?.rows?.length) return
    setBusy(true)
    setErr(null)
    try {
      const u = auth.user as Record<string, unknown> | null | undefined
      const shopName =
        String(u?.shop_name || u?.business_name || u?.name || '').trim() || undefined
      await previewCustomerBalancesPdf(
        customerBalancesReportToPdfPayload(data, {
          from: onDate ? '' : from,
          to: onDate ? '' : to,
          onDate,
          shopName,
        }),
      )
    } catch (e) {
      setErr(erpErr(e))
    } finally {
      setBusy(false)
    }
  }

  if (!activeReport) {
    return (
      <div className="space-y-3">
        <p className="text-sm font-semibold text-[var(--color-jewelry-black,#1a1814)]">Ledger reports</p>
        <div className="grid gap-3 sm:grid-cols-2">
          {REPORTS.map((r) => {
            const Icon = r.icon
            return (
              <button
                key={r.id}
                type="button"
                className={`${erpCardCls} flex min-h-[72px] w-full flex-col items-start gap-2 text-left transition hover:border-emerald-600/40`}
                onClick={() => setActiveReport(r.id)}
              >
                <span className="inline-flex items-center gap-2 text-sm font-semibold text-[var(--color-jewelry-black,#1a1814)]">
                  <Icon className="size-4 text-[var(--kc-accent,#c41e3a)]" aria-hidden />
                  {r.title}
                </span>
                <span className="mt-auto inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-800">
                  Open <ChevronRight className="size-3.5" />
                </span>
              </button>
            )
          })}
        </div>
      </div>
    )
  }

  const meta = REPORTS.find((r) => r.id === activeReport)

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className={erpBtnGhost}
          onClick={() => {
            setActiveReport(null)
            setExpandedId(null)
            setDetail(null)
          }}
        >
          <ArrowLeft className="size-4" />
          All reports
        </button>
        <p className="text-sm font-semibold text-[var(--color-jewelry-black,#1a1814)]">{meta?.title}</p>
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
            <ErpDateInput
              className={`${erpInputCls} mt-1`}
              value={onDate}
              onChange={(v) => {
                setOnDate(v)
              }}
            />
          </label>
          <label className="flex min-h-[44px] items-end gap-2 pb-1 text-xs font-medium text-[var(--color-jewelry-black,#1a1814)]">
            <input
              type="checkbox"
              className="size-4"
              checked={showAllCustomers}
              onChange={(e) => setShowAllCustomers(e.target.checked)}
            />
            Include zero balance
          </label>
        </div>

        <div className="flex flex-wrap gap-2">
          <button type="button" className={erpBtnPrimary} disabled={busy} onClick={() => void loadBalances()}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : null}
            Run report
          </button>
          <button
            type="button"
            className={erpBtnGhost}
            disabled={busy || !data?.rows?.length}
            onClick={() => void exportCsv()}
          >
            <Download className="size-4" />
            Excel (CSV)
          </button>
          <button
            type="button"
            className={erpBtnGhost}
            disabled={busy || !data?.rows?.length}
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

        {data?.summary ? (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <div className="rounded-xl border border-[var(--color-slate-700,#e8e4df)] bg-white px-3 py-2">
              <p className="text-[10px] font-bold uppercase text-[var(--color-jewelry-black,#1a1814)]/45">Customers</p>
              <p className="text-lg font-semibold tabular-nums text-[var(--color-jewelry-black,#1a1814)]">
                {data.summary.customer_count}
              </p>
            </div>
            <div className="rounded-xl border border-emerald-200 bg-emerald-50/80 px-3 py-2">
              <p className="text-[10px] font-bold uppercase text-emerald-900/70">They owe you</p>
              <p className="text-lg font-semibold tabular-nums text-emerald-900">
                {formatErpInr(data.summary.total_receivable_inr)}
              </p>
            </div>
            <div className="rounded-xl border border-rose-200 bg-rose-50/80 px-3 py-2">
              <p className="text-[10px] font-bold uppercase text-rose-900/70">You owe them</p>
              <p className="text-lg font-semibold tabular-nums text-rose-900">
                {formatErpInr(data.summary.total_payable_inr)}
              </p>
            </div>
          </div>
        ) : null}
      </div>

      <div className="overflow-x-auto rounded-xl border border-[var(--color-slate-700,#e8e4df)] bg-white">
        <table className="min-w-full text-left text-xs">
          <thead className="bg-[var(--color-slate-900,#f7f4ef)] text-[10px] font-bold uppercase text-[var(--color-jewelry-black,#1a1814)]/55">
            <tr>
              <th className="px-3 py-2.5">Customer</th>
              <th className="px-3 py-2.5">Mobile</th>
              <th className="px-3 py-2.5 hidden md:table-cell">GSTIN</th>
              <th className="px-3 py-2.5 text-right">Balance due</th>
              <th className="px-3 py-2.5 hidden sm:table-cell">Bills</th>
              <th className="px-3 py-2.5 w-24" />
            </tr>
          </thead>
          <tbody>
            {!data?.rows?.length && !busy ? (
              <tr>
                <td colSpan={6} className="px-3 py-10 text-center text-[var(--color-jewelry-black,#1a1814)]/45">
                  Run the report to see customers with outstanding balances.
                </td>
              </tr>
            ) : (
              data?.rows.map((row) => {
                const open = expandedId === row.customer_id
                return (
                  <Fragment key={row.customer_id}>
                    <tr
                      className="border-t border-[var(--color-slate-700,#e8e4df)]/60"
                    >
                      <td className="px-3 py-2.5 font-medium text-[var(--color-jewelry-black,#1a1814)]">
                        {row.name}
                      </td>
                      <td className="px-3 py-2.5 tabular-nums">{row.mobile || '—'}</td>
                      <td className="px-3 py-2.5 hidden md:table-cell">{row.gstin || '—'}</td>
                      <td className="px-3 py-2.5 text-right font-semibold tabular-nums">
                        {formatErpInr(row.balance_due_inr)}
                      </td>
                      <td className="px-3 py-2.5 hidden max-w-[140px] truncate sm:table-cell">
                        {(row.bill_numbers || []).slice(0, 3).join(', ') || '—'}
                      </td>
                      <td className="px-3 py-2.5">
                        <button
                          type="button"
                          className="text-[10px] font-semibold text-emerald-800 underline"
                          onClick={() => toggleExpand(row)}
                        >
                          {open ? 'Hide' : 'Detail'}
                        </button>
                      </td>
                    </tr>
                    {open ? (
                      <tr key={`${row.customer_id}-detail`} className="bg-[var(--color-slate-900,#f7f4ef)]/40">
                        <td colSpan={6} className="px-3 py-3">
                          {detailBusy ? (
                            <p className="flex items-center gap-2 text-xs text-[var(--color-jewelry-black,#1a1814)]/55">
                              <Loader2 className="size-4 animate-spin" /> Loading transactions…
                            </p>
                          ) : detail && detail.customer.id === row.customer_id ? (
                            <div className="space-y-3">
                              <div className="grid gap-2 text-xs sm:grid-cols-2 lg:grid-cols-4">
                                <p>
                                  <span className="text-[var(--color-jewelry-black,#1a1814)]/50">GSTIN </span>
                                  {detail.customer.gstin || '—'}
                                </p>
                                <p>
                                  <span className="text-[var(--color-jewelry-black,#1a1814)]/50">Address </span>
                                  {detail.customer.address || row.address || '—'}
                                </p>
                                <p>
                                  <span className="text-[var(--color-jewelry-black,#1a1814)]/50">Metal bal. </span>
                                  {formatMetalGm(detail.summary.metal_balance_gm)}
                                </p>
                                <p>
                                  <span className="text-[var(--color-jewelry-black,#1a1814)]/50">Bills </span>
                                  {(row.bill_numbers || []).join(', ') || '—'}
                                </p>
                              </div>
                              {onOpenCustomerLedger ? (
                                <button
                                  type="button"
                                  className="text-xs font-semibold text-emerald-800 underline"
                                  onClick={() => onOpenCustomerLedger(row.customer_id)}
                                >
                                  Open in Customer ledger tab
                                </button>
                              ) : null}
                              <div className="overflow-x-auto rounded-lg border border-[var(--color-slate-700,#e8e4df)] bg-white">
                                <table className="min-w-full text-[11px]">
                                  <thead className="text-[10px] font-bold uppercase text-[var(--color-jewelry-black,#1a1814)]/45">
                                    <tr>
                                      <th className="px-2 py-2">Date</th>
                                      <th className="px-2 py-2">Type</th>
                                      <th className="px-2 py-2">Ref</th>
                                      <th className="px-2 py-2 text-right">Debit</th>
                                      <th className="px-2 py-2 text-right">Credit</th>
                                      <th className="px-2 py-2 text-right">Balance</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {detail.transactions.map((t: CustomerAccountTx, i) => (
                                      <tr key={`${t.ref}-${i}`} className="border-t border-[var(--color-slate-700,#e8e4df)]/50">
                                        <td className="px-2 py-1.5 whitespace-nowrap">
                                          {formatErpDateDdMmYyyy(t.date)}
                                        </td>
                                        <td className="px-2 py-1.5">{formatLedgerTransactionKind(t.kind)}</td>
                                        <td className="px-2 py-1.5">{t.ref || '—'}</td>
                                        <td className="px-2 py-1.5 text-right tabular-nums">
                                          {t.debit ? formatErpInr(t.debit) : '—'}
                                        </td>
                                        <td className="px-2 py-1.5 text-right tabular-nums">
                                          {t.credit ? formatErpInr(t.credit) : '—'}
                                        </td>
                                        <td className="px-2 py-1.5 text-right tabular-nums font-medium">
                                          {formatLedgerBalanceCell(t.balance_inr, t.balance_metal_gm)}
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          ) : (
                            <p className="text-xs text-[var(--color-jewelry-black,#1a1814)]/45">No detail loaded.</p>
                          )}
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                )
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

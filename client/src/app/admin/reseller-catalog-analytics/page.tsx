'use client'

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import axios from '@/lib/axios'
import AdminGuard from '@/components/AdminGuard'
import CatalogInquiryCard, { patchCatalogInquiryStatus } from '@/components/catalog/CatalogInquiryCard'
import {
  ArrowLeft,
  BarChart3,
  ChevronRight,
  Loader2,
  MessageCircle,
} from 'lucide-react'
import {
  CATALOG_INQUIRY_PERIOD_OPTIONS,
  formatCatalogInr,
  formatCatalogWhen,
  type CatalogInquiryPeriod,
  type CatalogInquiryRow,
  type CatalogInquiryStatus,
} from '@/lib/catalog-inquiry-shared'
import { KC_ADMIN_INBOX_REFRESH_EVENT } from '@/lib/admin-inbox-summary'

type ResellerRow = {
  reseller_id: number
  reseller_label: string
  custom_domain: string | null
  links_created: number
  inquiry_count: number
  completed_count?: number
  total_pieces: number
  total_inr: number
  completed_inr?: number
  last_inquiry_at: string | null
}

type AnalyticsPayload = {
  period: string
  summary: {
    linksCreated: number
    linksExpired: number
    resellersActive: number
    inquiryCount: number
    completedCount: number
    totalPieces: number
    totalInr: number
    completedInr: number
    noSaleCount: number
  }
  byReseller: ResellerRow[]
  resellerDetail: {
    resellerId: number
    resellerLabel: string
    customDomain: string | null
    linksCreated: number
    inquiryCount: number
    completedCount: number
    totalPieces: number
    totalInr: number
    completedInr: number
    lastInquiryAt: string | null
  } | null
  recentInquiries: CatalogInquiryRow[]
}

function ResellerCatalogAnalyticsContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const resellerIdParam = searchParams.get('reseller')
  const periodParam = (searchParams.get('period') || '30') as CatalogInquiryPeriod
  const selectedResellerId =
    resellerIdParam && /^\d+$/.test(resellerIdParam) ? parseInt(resellerIdParam, 10) : null

  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<AnalyticsPayload | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<number | null>(null)
  const [statusBusyId, setStatusBusyId] = useState<number | null>(null)

  const setView = useCallback(
    (resellerId: number | null, period: CatalogInquiryPeriod) => {
      const params = new URLSearchParams()
      params.set('period', period)
      if (resellerId != null) params.set('reseller', String(resellerId))
      router.push(`/admin/reseller-catalog-analytics?${params.toString()}`)
    },
    [router],
  )

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await axios.get<AnalyticsPayload>('/api/admin/reseller-catalog-analytics', {
        params: {
          period: periodParam,
          ...(selectedResellerId != null ? { reseller_id: selectedResellerId } : {}),
        },
      })
      setData(res.data)
      window.dispatchEvent(new Event(KC_ADMIN_INBOX_REFRESH_EVENT))
    } catch {
      setData(null)
      setError('Could not load analytics.')
    } finally {
      setLoading(false)
    }
  }, [periodParam, selectedResellerId])

  useEffect(() => {
    void load()
  }, [load])

  const handleStatusChange = useCallback(
    async (id: number, status: CatalogInquiryStatus) => {
      setStatusBusyId(id)
      try {
        await patchCatalogInquiryStatus('admin', id, status)
        await load()
      } finally {
        setStatusBusyId(null)
      }
    },
    [load],
  )

  const summary = useMemo(() => {
    if (selectedResellerId != null && data?.resellerDetail) {
      const d = data.resellerDetail
      return {
        linksCreated: d.linksCreated,
        inquiryCount: d.inquiryCount,
        completedCount: d.completedCount,
        totalPieces: d.totalPieces,
        totalInr: d.totalInr,
        completedInr: d.completedInr,
      }
    }
    return data?.summary
  }, [selectedResellerId, data])

  const inquiries = data?.recentInquiries ?? []

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 pb-24 text-slate-100 sm:py-8">
      <Link
        href="/admin"
        className="mb-5 inline-flex items-center gap-2 text-sm text-slate-400 transition hover:text-amber-400"
      >
        <ArrowLeft className="size-4" />
        Admin
      </Link>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold text-amber-400 sm:text-2xl">
            <BarChart3 className="size-6 sm:size-7" />
            Reseller catalogue activity
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-400">
            Pick a reseller to see their WhatsApp & PDF shortlists. Mark &quot;No sale&quot; to
            exclude from quoted totals. &quot;Sale completed&quot; tracks confirmed sales.
          </p>
        </div>
        <label className="flex shrink-0 flex-col gap-1 text-sm text-slate-400 sm:items-end">
          <span>Period</span>
          <select
            className="min-h-[44px] rounded-xl border border-slate-700 bg-slate-900 px-3 py-2.5 text-slate-100"
            value={periodParam}
            onChange={(e) => {
              setExpandedId(null)
              setView(selectedResellerId, e.target.value as CatalogInquiryPeriod)
            }}
          >
            {CATALOG_INQUIRY_PERIOD_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="size-8 animate-spin text-amber-500" />
        </div>
      ) : error ? (
        <p className="mt-8 rounded-xl border border-rose-900/50 bg-rose-950/40 px-4 py-3 text-sm text-rose-200">
          {error}
        </p>
      ) : selectedResellerId == null ? (
        <>
          <div className="mt-6 grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-3 lg:grid-cols-5">
            {[
              { label: 'Links created', value: String(data?.summary.linksCreated ?? 0) },
              { label: 'Inquiries', value: String(data?.summary.inquiryCount ?? 0) },
              { label: 'Sales completed', value: String(data?.summary.completedCount ?? 0) },
              { label: 'Quoted value', value: formatCatalogInr(data?.summary.totalInr ?? 0) },
              { label: 'Completed ₹', value: formatCatalogInr(data?.summary.completedInr ?? 0) },
            ].map((card) => (
              <div
                key={card.label}
                className="rounded-2xl border border-slate-800 bg-slate-900/60 px-3 py-3 sm:px-4"
              >
                <p className="text-[10px] uppercase tracking-wide text-slate-500 sm:text-[11px]">
                  {card.label}
                </p>
                <p className="mt-1 text-base font-semibold tabular-nums text-slate-100 sm:text-lg">
                  {card.value}
                </p>
              </div>
            ))}
          </div>

          <section className="mt-8">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
              Resellers
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              Tap a reseller to open their inquiries for the selected period.
            </p>
            <ul className="mt-4 space-y-3">
              {(data?.byReseller ?? []).length === 0 ? (
                <li className="rounded-2xl border border-slate-800 px-4 py-10 text-center text-sm text-slate-500">
                  No reseller catalogue activity in this period.
                </li>
              ) : (
                data?.byReseller.map((row) => (
                  <li key={row.reseller_id}>
                    <button
                      type="button"
                      onClick={() => setView(row.reseller_id, periodParam)}
                      className="flex w-full min-h-[72px] items-center gap-3 rounded-2xl border border-slate-800 bg-slate-900/50 px-4 py-3 text-left transition hover:border-amber-700/40 hover:bg-slate-900 active:scale-[0.99]"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-slate-100">{row.reseller_label}</p>
                        {row.custom_domain ? (
                          <p className="text-xs text-slate-500">{row.custom_domain}</p>
                        ) : null}
                        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-400">
                          <span>{row.inquiry_count} inquiries</span>
                          <span>{row.completed_count ?? 0} completed</span>
                          <span>{row.total_pieces} pcs quoted</span>
                          {row.last_inquiry_at ? (
                            <span>Last {formatCatalogWhen(row.last_inquiry_at)}</span>
                          ) : null}
                        </div>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-lg font-bold tabular-nums text-emerald-400">
                          {formatCatalogInr(row.total_inr)}
                        </p>
                        <p className="text-[11px] text-slate-500">
                          {formatCatalogInr(row.completed_inr ?? 0)} completed
                        </p>
                      </div>
                      <ChevronRight className="size-5 shrink-0 text-slate-500" />
                    </button>
                  </li>
                ))
              )}
            </ul>
          </section>
        </>
      ) : (
        <>
          <button
            type="button"
            onClick={() => setView(null, periodParam)}
            className="mt-4 inline-flex items-center gap-2 text-sm text-amber-400 hover:text-amber-300"
          >
            <ArrowLeft className="size-4" />
            All resellers
          </button>

          <header className="mt-4 rounded-2xl border border-amber-900/30 bg-amber-950/20 px-4 py-4">
            <h2 className="text-lg font-semibold text-amber-200">
              {data?.resellerDetail?.resellerLabel ?? 'Reseller'}
            </h2>
            {data?.resellerDetail?.customDomain ? (
              <p className="text-sm text-slate-400">{data.resellerDetail.customDomain}</p>
            ) : null}
          </header>

          <div className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
            {[
              { label: 'Links', value: String(summary?.linksCreated ?? 0) },
              { label: 'Inquiries', value: String(summary?.inquiryCount ?? 0) },
              { label: 'Completed', value: String(summary?.completedCount ?? 0) },
              { label: 'Pieces quoted', value: String(summary?.totalPieces ?? 0) },
              { label: 'Quoted ₹', value: formatCatalogInr(summary?.totalInr ?? 0) },
              { label: 'Completed ₹', value: formatCatalogInr(summary?.completedInr ?? 0) },
            ].map((card) => (
              <div
                key={card.label}
                className="rounded-2xl border border-slate-800 bg-slate-900/60 px-3 py-3"
              >
                <p className="text-[10px] uppercase tracking-wide text-slate-500">{card.label}</p>
                <p className="mt-1 text-base font-semibold tabular-nums text-slate-100">
                  {card.value}
                </p>
              </div>
            ))}
          </div>

          <section className="mt-8">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
              Inquiries · {CATALOG_INQUIRY_PERIOD_OPTIONS.find((p) => p.value === periodParam)?.label}
            </h3>
            {inquiries.length === 0 ? (
              <p className="mt-4 rounded-2xl border border-slate-800 px-4 py-10 text-center text-sm text-slate-500">
                No inquiries in this period.
              </p>
            ) : (
              <ul className="mt-4 space-y-3">
                {inquiries.map((inq) => (
                  <CatalogInquiryCard
                    key={inq.id}
                    inquiry={inq}
                    expanded={expandedId === inq.id}
                    onToggle={() => setExpandedId(expandedId === inq.id ? null : inq.id)}
                    onStatusChange={handleStatusChange}
                    statusBusyId={statusBusyId}
                    theme="admin"
                  />
                ))}
              </ul>
            )}
          </section>
        </>
      )}

      <p className="mt-8 flex items-start gap-2 text-xs leading-relaxed text-slate-500">
        <MessageCircle className="mt-0.5 size-3.5 shrink-0" />
        Each WhatsApp or PDF tap logs one inquiry. Resellers can mark status from their profile.
        &quot;No sale&quot; rows are hidden from quoted totals.
      </p>
    </div>
  )
}

export default function ResellerCatalogAnalyticsPage() {
  return (
    <AdminGuard>
      <SuspenseWrap />
    </AdminGuard>
  )
}

function SuspenseWrap() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center">
          <Loader2 className="size-8 animate-spin text-amber-500" />
        </div>
      }
    >
      <ResellerCatalogAnalyticsContent />
    </Suspense>
  )
}

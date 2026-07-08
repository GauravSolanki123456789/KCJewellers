'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import axios from '@/lib/axios'
import AdminGuard from '@/components/AdminGuard'
import {
  ArrowLeft,
  BarChart3,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  FileText,
  Filter,
  Loader2,
  MessageCircle,
  X,
} from 'lucide-react'

type PeriodKey = 'today' | '7' | '30' | '90'

type InquiryLine = {
  name?: string
  code?: string
  qty?: number
  unitInr?: number | null
  lineTotalInr?: number | null
}

type InquiryRow = {
  id: number
  shared_catalog_id: string | null
  reseller_user_id: number | null
  source: string
  line_count: number
  total_pieces: number
  total_inr: number | null
  catalog_url: string | null
  created_at: string
  reseller_label: string | null
  reseller_domain?: string | null
  lines?: InquiryLine[]
}

type ResellerRow = {
  reseller_id: number
  reseller_label: string
  custom_domain: string | null
  links_created: number
  inquiry_count: number
  total_pieces: number
  total_inr: number
  last_inquiry_at: string | null
}

type AnalyticsPayload = {
  period: string
  days: number
  since: string
  until: string | null
  summary: {
    linksCreated: number
    linksExpired: number
    resellersActive: number
    inquiryCount: number
    totalPieces: number
    totalInr: number
  }
  byReseller: ResellerRow[]
  recentInquiries: InquiryRow[]
}

const PERIOD_OPTIONS: { value: PeriodKey; label: string }[] = [
  { value: 'today', label: 'Today (IST)' },
  { value: '7', label: 'Last 7 days' },
  { value: '30', label: 'Last 30 days' },
  { value: '90', label: 'Last 90 days' },
]

function formatInr(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—'
  return `₹${Math.round(n).toLocaleString('en-IN')}`
}

function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

function sourceLabel(source: string): string {
  const s = source.toLowerCase()
  if (s === 'pdf') return 'PDF'
  if (s === 'whatsapp') return 'WhatsApp'
  return source
}

function ResellerCatalogAnalyticsContent() {
  const [period, setPeriod] = useState<PeriodKey>('30')
  const [resellerFilter, setResellerFilter] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<AnalyticsPayload | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<number | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await axios.get<AnalyticsPayload>('/api/admin/reseller-catalog-analytics', {
        params: { period },
      })
      setData(res.data)
    } catch {
      setData(null)
      setError('Could not load analytics.')
    } finally {
      setLoading(false)
    }
  }, [period])

  useEffect(() => {
    void load()
  }, [load])

  const s = data?.summary

  const filteredInquiries = useMemo(() => {
    const list = data?.recentInquiries ?? []
    if (resellerFilter == null) return list
    return list.filter((row) => row.reseller_user_id === resellerFilter)
  }, [data?.recentInquiries, resellerFilter])

  const filteredResellerLabel = useMemo(() => {
    if (resellerFilter == null) return null
    return (
      data?.byReseller.find((r) => r.reseller_id === resellerFilter)?.reseller_label ??
      filteredInquiries[0]?.reseller_label ??
      'Reseller'
    )
  }, [resellerFilter, data?.byReseller, filteredInquiries])

  const filteredSummary = useMemo(() => {
    if (resellerFilter == null) return s
    const row = data?.byReseller.find((r) => r.reseller_id === resellerFilter)
    if (!row) {
      return {
        linksCreated: 0,
        linksExpired: 0,
        resellersActive: 1,
        inquiryCount: filteredInquiries.length,
        totalPieces: filteredInquiries.reduce((n, i) => n + (i.total_pieces || 0), 0),
        totalInr: filteredInquiries.reduce((n, i) => n + (i.total_inr || 0), 0),
      }
    }
    return {
      linksCreated: row.links_created,
      linksExpired: 0,
      resellersActive: 1,
      inquiryCount: row.inquiry_count,
      totalPieces: row.total_pieces,
      totalInr: row.total_inr,
    }
  }, [resellerFilter, s, data?.byReseller, filteredInquiries])

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
            Shared links and customer shortlists sent via WhatsApp or PDF from{' '}
            <code className="rounded bg-slate-800/80 px-1 text-slate-300">/shared/[uuid]</code>{' '}
            pages. Each tap on WhatsApp or PDF is logged as one inquiry.
          </p>
        </div>
        <label className="flex shrink-0 flex-col gap-1 text-sm text-slate-400 sm:items-end">
          <span>Period</span>
          <select
            className="min-h-[44px] rounded-xl border border-slate-700 bg-slate-900 px-3 py-2.5 text-slate-100"
            value={period}
            onChange={(e) => {
              setPeriod(e.target.value as PeriodKey)
              setResellerFilter(null)
              setExpandedId(null)
            }}
          >
            {PERIOD_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {resellerFilter != null ? (
        <div className="mt-4 flex flex-wrap items-center gap-2 rounded-xl border border-amber-900/40 bg-amber-950/20 px-3 py-2.5 text-sm">
          <Filter className="size-4 shrink-0 text-amber-500" />
          <span className="text-slate-300">
            Showing inquiries for{' '}
            <span className="font-medium text-amber-300">{filteredResellerLabel}</span>
          </span>
          <button
            type="button"
            onClick={() => {
              setResellerFilter(null)
              setExpandedId(null)
            }}
            className="ml-auto inline-flex min-h-[36px] items-center gap-1 rounded-lg border border-slate-700 px-2.5 py-1 text-xs text-slate-300 transition hover:border-slate-500 hover:text-slate-100"
          >
            <X className="size-3.5" />
            Clear filter
          </button>
        </div>
      ) : null}

      {loading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="size-8 animate-spin text-amber-500" />
        </div>
      ) : error ? (
        <p className="mt-8 rounded-xl border border-rose-900/50 bg-rose-950/40 px-4 py-3 text-sm text-rose-200">
          {error}
        </p>
      ) : (
        <>
          <div className="mt-6 grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-3 lg:grid-cols-6">
            {[
              { label: 'Links created', value: String(filteredSummary?.linksCreated ?? 0) },
              { label: 'Links expired', value: String(resellerFilter ? '—' : s?.linksExpired ?? 0) },
              { label: 'Resellers active', value: String(resellerFilter ? 1 : s?.resellersActive ?? 0) },
              { label: 'Inquiries', value: String(filteredSummary?.inquiryCount ?? 0) },
              { label: 'Pieces quoted', value: String(filteredSummary?.totalPieces ?? 0) },
              { label: 'Quoted value', value: formatInr(filteredSummary?.totalInr ?? 0) },
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
              By reseller
            </h2>
            <div className="mt-3 hidden overflow-x-auto rounded-2xl border border-slate-800 md:block">
              <table className="min-w-[720px] w-full text-left text-sm">
                <thead className="bg-slate-900/80 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Reseller</th>
                    <th className="px-4 py-3 text-right">Links</th>
                    <th className="px-4 py-3 text-right">Inquiries</th>
                    <th className="px-4 py-3 text-right">Pieces</th>
                    <th className="px-4 py-3 text-right">Quoted ₹</th>
                    <th className="px-4 py-3">Last inquiry</th>
                  </tr>
                </thead>
                <tbody>
                  {(data?.byReseller ?? []).length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-10 text-center text-slate-500">
                        No reseller catalogue activity in this period.
                      </td>
                    </tr>
                  ) : (
                    data?.byReseller.map((row) => {
                      const active = resellerFilter === row.reseller_id
                      return (
                        <tr
                          key={row.reseller_id}
                          className={`cursor-pointer border-t border-slate-800/80 transition hover:bg-slate-900/50 ${
                            active ? 'bg-amber-950/25' : ''
                          }`}
                          onClick={() => {
                            setResellerFilter(active ? null : row.reseller_id)
                            setExpandedId(null)
                          }}
                        >
                          <td className="px-4 py-3">
                            <p className="font-medium text-slate-100">{row.reseller_label}</p>
                            {row.custom_domain ? (
                              <p className="text-xs text-slate-500">{row.custom_domain}</p>
                            ) : null}
                            <p className="mt-0.5 text-[11px] text-amber-500/80">
                              {active ? 'Showing orders below' : 'Tap to view orders'}
                            </p>
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums">{row.links_created}</td>
                          <td className="px-4 py-3 text-right tabular-nums">{row.inquiry_count}</td>
                          <td className="px-4 py-3 text-right tabular-nums">{row.total_pieces}</td>
                          <td className="px-4 py-3 text-right tabular-nums font-medium text-emerald-400">
                            {formatInr(row.total_inr)}
                          </td>
                          <td className="px-4 py-3 text-xs text-slate-400">
                            {row.last_inquiry_at ? formatWhen(row.last_inquiry_at) : '—'}
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>

            <div className="mt-3 space-y-2 md:hidden">
              {(data?.byReseller ?? []).length === 0 ? (
                <p className="rounded-2xl border border-slate-800 px-4 py-8 text-center text-sm text-slate-500">
                  No reseller catalogue activity in this period.
                </p>
              ) : (
                data?.byReseller.map((row) => {
                  const active = resellerFilter === row.reseller_id
                  return (
                    <button
                      key={row.reseller_id}
                      type="button"
                      onClick={() => {
                        setResellerFilter(active ? null : row.reseller_id)
                        setExpandedId(null)
                      }}
                      className={`w-full rounded-2xl border px-4 py-3 text-left transition ${
                        active
                          ? 'border-amber-700/50 bg-amber-950/25'
                          : 'border-slate-800 bg-slate-900/50 active:bg-slate-900'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="font-medium text-slate-100">{row.reseller_label}</p>
                          {row.custom_domain ? (
                            <p className="text-xs text-slate-500">{row.custom_domain}</p>
                          ) : null}
                        </div>
                        <p className="shrink-0 text-sm font-semibold tabular-nums text-emerald-400">
                          {formatInr(row.total_inr)}
                        </p>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-400">
                        <span>{row.links_created} links</span>
                        <span>{row.inquiry_count} inquiries</span>
                        <span>{row.total_pieces} pcs</span>
                      </div>
                    </button>
                  )
                })
              )}
            </div>
          </section>

          <section className="mt-10">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
                  Individual inquiries
                </h2>
                <p className="mt-1 text-xs text-slate-500">
                  {filteredInquiries.length} order{filteredInquiries.length === 1 ? '' : 's'} in
                  selected period
                  {resellerFilter ? ` · ${filteredResellerLabel}` : ''}
                </p>
              </div>
            </div>

            {filteredInquiries.length === 0 ? (
              <p className="mt-4 rounded-2xl border border-slate-800 px-4 py-10 text-center text-sm text-slate-500">
                No customer shortlists recorded in this period
                {resellerFilter ? ' for this reseller' : ''}.
              </p>
            ) : (
              <ul className="mt-4 space-y-3">
                {filteredInquiries.map((inq) => {
                  const open = expandedId === inq.id
                  const lines = inq.lines ?? []
                  const SourceIcon = inq.source.toLowerCase() === 'pdf' ? FileText : MessageCircle
                  return (
                    <li
                      key={inq.id}
                      className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/40"
                    >
                      <button
                        type="button"
                        className="flex w-full min-h-[56px] flex-col gap-2 px-4 py-3 text-left sm:flex-row sm:items-center sm:justify-between"
                        onClick={() => setExpandedId(open ? null : inq.id)}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="inline-flex items-center gap-1 rounded-full bg-slate-800 px-2 py-0.5 text-[11px] font-medium text-slate-300">
                              <SourceIcon className="size-3" />
                              {sourceLabel(inq.source)}
                            </span>
                            <span className="text-xs text-slate-500">{formatWhen(inq.created_at)}</span>
                          </div>
                          <p className="mt-1 truncate text-sm font-medium text-slate-100">
                            {inq.reseller_label ?? 'Unknown reseller'}
                            {inq.reseller_domain ? (
                              <span className="font-normal text-slate-500"> · {inq.reseller_domain}</span>
                            ) : null}
                          </p>
                          <p className="mt-0.5 text-xs text-slate-400">
                            {inq.total_pieces} pcs · {inq.line_count} line
                            {inq.line_count === 1 ? '' : 's'}
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-3">
                          <span className="text-lg font-semibold tabular-nums text-emerald-400">
                            {formatInr(inq.total_inr)}
                          </span>
                          {open ? (
                            <ChevronUp className="size-5 text-slate-500" />
                          ) : (
                            <ChevronDown className="size-5 text-slate-500" />
                          )}
                        </div>
                      </button>

                      {open ? (
                        <div className="border-t border-slate-800/80 px-4 py-3">
                          {lines.length === 0 ? (
                            <p className="text-sm text-slate-500">No line details saved.</p>
                          ) : (
                            <ul className="space-y-2">
                              {lines.map((line, idx) => (
                                <li
                                  key={`${inq.id}-${idx}`}
                                  className="rounded-xl border border-slate-800/80 bg-slate-950/40 px-3 py-2.5 text-sm"
                                >
                                  <div className="flex flex-wrap items-start justify-between gap-2">
                                    <div className="min-w-0">
                                      <p className="font-medium text-slate-100">{line.name ?? 'Item'}</p>
                                      {line.code ? (
                                        <p className="text-xs text-slate-500">Ref: {line.code}</p>
                                      ) : null}
                                    </div>
                                    <p className="shrink-0 font-medium tabular-nums text-emerald-400">
                                      {formatInr(line.lineTotalInr ?? null)}
                                    </p>
                                  </div>
                                  <p className="mt-1 text-xs text-slate-400">
                                    Qty {line.qty ?? 1}
                                    {line.unitInr != null ? (
                                      <>
                                        {' '}
                                        × {formatInr(line.unitInr)} incl. GST
                                      </>
                                    ) : null}
                                  </p>
                                </li>
                              ))}
                            </ul>
                          )}
                          {inq.catalog_url ? (
                            <a
                              href={inq.catalog_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="mt-3 inline-flex min-h-[40px] items-center gap-1.5 text-xs text-amber-400 transition hover:text-amber-300"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <ExternalLink className="size-3.5" />
                              Open catalogue link
                            </a>
                          ) : null}
                        </div>
                      ) : null}
                    </li>
                  )
                })}
              </ul>
            )}
          </section>

          <p className="mt-8 flex items-start gap-2 text-xs leading-relaxed text-slate-500">
            <MessageCircle className="mt-0.5 size-3.5 shrink-0" />
            Inquiries are recorded when a customer taps WhatsApp or shares a PDF shortlist — quoted
            interest only, not confirmed KC checkout orders. Totals per reseller match the sum of
            individual inquiries below.
          </p>
        </>
      )}
    </div>
  )
}

export default function ResellerCatalogAnalyticsPage() {
  return (
    <AdminGuard>
      <ResellerCatalogAnalyticsContent />
    </AdminGuard>
  )
}

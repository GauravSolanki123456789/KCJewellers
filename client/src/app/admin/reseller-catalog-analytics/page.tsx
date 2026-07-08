'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import axios from '@/lib/axios'
import AdminGuard from '@/components/AdminGuard'
import { ArrowLeft, BarChart3, Loader2, MessageCircle } from 'lucide-react'

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
  days: number
  since: string
  summary: {
    linksCreated: number
    linksExpired: number
    resellersActive: number
    inquiryCount: number
    totalPieces: number
    totalInr: number
  }
  byReseller: ResellerRow[]
}

function formatInr(n: number): string {
  if (!Number.isFinite(n)) return '—'
  return `₹${Math.round(n).toLocaleString('en-IN')}`
}

function ResellerCatalogAnalyticsContent() {
  const [days, setDays] = useState(30)
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<AnalyticsPayload | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await axios.get<AnalyticsPayload>('/api/admin/reseller-catalog-analytics', {
        params: { days },
      })
      setData(res.data)
    } catch {
      setData(null)
      setError('Could not load analytics.')
    } finally {
      setLoading(false)
    }
  }, [days])

  useEffect(() => {
    void load()
  }, [load])

  const s = data?.summary

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 text-slate-100">
      <Link
        href="/admin"
        className="mb-6 inline-flex items-center gap-2 text-sm text-slate-400 transition hover:text-amber-400"
      >
        <ArrowLeft className="size-4" />
        Admin
      </Link>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold text-amber-400">
            <BarChart3 className="size-7" />
            Reseller catalogue activity
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-400">
            Shared links created and customer shortlists sent via WhatsApp or PDF from{' '}
            <code className="text-slate-300">/shared/[uuid]</code> pages.
          </p>
        </div>
        <label className="text-sm text-slate-400">
          Period
          <select
            className="ml-2 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100"
            value={days}
            onChange={(e) => setDays(parseInt(e.target.value, 10) || 30)}
          >
            <option value={7}>Last 7 days</option>
            <option value={30}>Last 30 days</option>
            <option value={90}>Last 90 days</option>
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
      ) : (
        <>
          <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {[
              { label: 'Links created', value: String(s?.linksCreated ?? 0) },
              { label: 'Links expired', value: String(s?.linksExpired ?? 0) },
              { label: 'Resellers active', value: String(s?.resellersActive ?? 0) },
              { label: 'Inquiries', value: String(s?.inquiryCount ?? 0) },
              { label: 'Pieces quoted', value: String(s?.totalPieces ?? 0) },
              { label: 'Quoted value', value: formatInr(s?.totalInr ?? 0) },
            ].map((card) => (
              <div
                key={card.label}
                className="rounded-2xl border border-slate-800 bg-slate-900/60 px-4 py-3"
              >
                <p className="text-[11px] uppercase tracking-wide text-slate-500">{card.label}</p>
                <p className="mt-1 text-lg font-semibold tabular-nums text-slate-100">{card.value}</p>
              </div>
            ))}
          </div>

          <div className="mt-8 overflow-x-auto rounded-2xl border border-slate-800">
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
                  data?.byReseller.map((row) => (
                    <tr key={row.reseller_id} className="border-t border-slate-800/80">
                      <td className="px-4 py-3">
                        <p className="font-medium text-slate-100">{row.reseller_label}</p>
                        {row.custom_domain ? (
                          <p className="text-xs text-slate-500">{row.custom_domain}</p>
                        ) : null}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">{row.links_created}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{row.inquiry_count}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{row.total_pieces}</td>
                      <td className="px-4 py-3 text-right tabular-nums font-medium text-emerald-400">
                        {formatInr(row.total_inr)}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-400">
                        {row.last_inquiry_at
                          ? new Date(row.last_inquiry_at).toLocaleString('en-IN', {
                              dateStyle: 'medium',
                              timeStyle: 'short',
                            })
                          : '—'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <p className="mt-6 flex items-start gap-2 text-xs leading-relaxed text-slate-500">
            <MessageCircle className="mt-0.5 size-3.5 shrink-0" />
            Inquiries are recorded when a customer taps WhatsApp or shares a PDF shortlist from a shared
            catalogue page — this reflects quoted interest, not confirmed KC checkout orders.
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

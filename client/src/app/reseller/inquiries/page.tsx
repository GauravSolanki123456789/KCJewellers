'use client'

import { Suspense, useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import axios from '@/lib/axios'
import { useAuth } from '@/hooks/useAuth'
import { useCustomerTier } from '@/context/CustomerTierContext'
import { CUSTOMER_TIER } from '@/lib/customer-tier'
import CatalogInquiryCard, { patchCatalogInquiryStatus } from '@/components/catalog/CatalogInquiryCard'
import {
  ArrowLeft,
  Loader2,
  MessageCircle,
  ShoppingBag,
} from 'lucide-react'
import {
  CATALOG_INQUIRY_PERIOD_OPTIONS,
  formatCatalogInr,
  type CatalogInquiryPeriod,
  type CatalogInquiryRow,
  type CatalogInquiryStatus,
} from '@/lib/catalog-inquiry-shared'
import { PROFILE_PATH } from '@/lib/routes'

type ResellerInquiriesPayload = {
  period: string
  summary: {
    inquiryCount: number
    completedCount: number
    pendingCount: number
    totalPieces: number
    quotedInr: number
    completedInr: number
  }
  inquiries: CatalogInquiryRow[]
}

function ResellerInquiriesContent() {
  const auth = useAuth()
  const { customerTier } = useCustomerTier()
  const isReseller = customerTier === CUSTOMER_TIER.RESELLER
  const [period, setPeriod] = useState<CatalogInquiryPeriod>('30')
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<ResellerInquiriesPayload | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<number | null>(null)
  const [statusBusyId, setStatusBusyId] = useState<number | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await axios.get<ResellerInquiriesPayload>('/api/reseller/catalog-inquiries', {
        params: { period },
      })
      setData(res.data)
    } catch {
      setData(null)
      setError('Could not load catalogue inquiries.')
    } finally {
      setLoading(false)
    }
  }, [period])

  useEffect(() => {
    if (auth.isAuthenticated && isReseller) void load()
    else setLoading(false)
  }, [auth.isAuthenticated, isReseller, load])

  const handleStatusChange = useCallback(
    async (id: number, status: CatalogInquiryStatus) => {
      setStatusBusyId(id)
      try {
        await patchCatalogInquiryStatus('reseller', id, status)
        await load()
      } finally {
        setStatusBusyId(null)
      }
    },
    [load],
  )

  if (!auth.isAuthenticated) {
    return (
      <div className="kc-profile-page flex min-h-screen flex-col items-center justify-center px-6 text-center">
        <p className="text-[var(--color-jewelry-black,#1a1814)]">Sign in to view catalogue inquiries.</p>
        <Link href={PROFILE_PATH} className="kc-btn-theme mt-4 min-h-[44px] px-6">
          Go to profile
        </Link>
      </div>
    )
  }

  if (!isReseller) {
    return (
      <div className="kc-profile-page flex min-h-screen flex-col items-center justify-center px-6 text-center">
        <p className="text-[var(--color-jewelry-black,#1a1814)]">
          Catalogue inquiries are available for reseller accounts.
        </p>
        <Link href={PROFILE_PATH} className="kc-btn-theme mt-4 min-h-[44px] px-6">
          Back to profile
        </Link>
      </div>
    )
  }

  const s = data?.summary

  return (
    <div className="kc-profile-page min-h-screen bg-[var(--color-slate-950,#0f172a)] pb-24">
      <main className="mx-auto max-w-lg px-4 py-6 md:max-w-xl md:py-8">
        <Link
          href={PROFILE_PATH}
          className="mb-5 inline-flex items-center gap-2 text-sm text-[var(--color-jewelry-black,#1a1814)]/55 transition hover:text-[var(--kc-accent,#c41e3a)]"
        >
          <ArrowLeft className="size-4" />
          Profile
        </Link>

        <header className="mb-6">
          <h1 className="flex items-center gap-2 text-xl font-semibold text-[var(--color-jewelry-black,#1a1814)]">
            <ShoppingBag className="size-6 text-[var(--kc-accent,#c41e3a)]" />
            Catalogue inquiries
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-[var(--color-jewelry-black,#1a1814)]/55">
            When customers tap WhatsApp or PDF on your shared catalogue links, they appear here.
            Mark completed sales or &quot;No sale&quot; to keep your totals accurate.
          </p>
        </header>

        <label className="mb-6 flex flex-col gap-1 text-sm text-[var(--color-jewelry-black,#1a1814)]/55">
          Period
          <select
            className="min-h-[44px] rounded-xl border border-[var(--color-slate-700,#e8e4df)] bg-white px-3 py-2.5"
            value={period}
            onChange={(e) => {
              setPeriod(e.target.value as CatalogInquiryPeriod)
              setExpandedId(null)
            }}
          >
            {CATALOG_INQUIRY_PERIOD_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>

        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="size-8 animate-spin text-[var(--kc-accent,#c41e3a)]" />
          </div>
        ) : error ? (
          <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
            {error}
          </p>
        ) : (
          <>
            <div className="mb-6 grid grid-cols-2 gap-2">
              {[
                { label: 'Inquiries', value: String(s?.inquiryCount ?? 0) },
                { label: 'Completed', value: String(s?.completedCount ?? 0) },
                { label: 'Quoted ₹', value: formatCatalogInr(s?.quotedInr ?? 0) },
                { label: 'Completed ₹', value: formatCatalogInr(s?.completedInr ?? 0) },
              ].map((card) => (
                <div
                  key={card.label}
                  className="kc-profile-card rounded-2xl px-3 py-3"
                >
                  <p className="text-[10px] uppercase tracking-wide text-[var(--color-jewelry-black,#1a1814)]/45">
                    {card.label}
                  </p>
                  <p className="mt-1 text-base font-semibold tabular-nums text-[var(--color-jewelry-black,#1a1814)]">
                    {card.value}
                  </p>
                </div>
              ))}
            </div>

            {s?.pendingCount ? (
              <p className="mb-4 rounded-xl border border-amber-200/80 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                {s.pendingCount} pending — review and mark as completed or no sale.
              </p>
            ) : null}

            {(data?.inquiries ?? []).length === 0 ? (
              <p className="kc-profile-card rounded-2xl px-4 py-10 text-center text-sm text-[var(--color-jewelry-black,#1a1814)]/55">
                No inquiries in this period yet.
              </p>
            ) : (
              <ul className="space-y-3">
                {data?.inquiries.map((inq) => (
                  <CatalogInquiryCard
                    key={inq.id}
                    inquiry={inq}
                    expanded={expandedId === inq.id}
                    onToggle={() => setExpandedId(expandedId === inq.id ? null : inq.id)}
                    onStatusChange={handleStatusChange}
                    statusBusyId={statusBusyId}
                    theme="reseller"
                  />
                ))}
              </ul>
            )}
          </>
        )}

        <p className="mt-8 flex items-start gap-2 text-xs leading-relaxed text-[var(--color-jewelry-black,#1a1814)]/45">
          <MessageCircle className="mt-0.5 size-3.5 shrink-0" />
          These are customer shortlists — not KC checkout orders. Use status to track what actually
          converted.
        </p>
      </main>
    </div>
  )
}

export default function ResellerInquiriesPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center">
          <Loader2 className="size-8 animate-spin text-[var(--kc-accent,#c41e3a)]" />
        </div>
      }
    >
      <ResellerInquiriesContent />
    </Suspense>
  )
}

'use client'

import { Suspense, useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { pdf } from '@react-pdf/renderer'
import { Loader2, Download, BookMarked, ArrowLeft, Scale, IndianRupee } from 'lucide-react'
import axios from '@/lib/axios'
import { useAuth } from '@/hooks/useAuth'
import { useLoginModal } from '@/context/LoginModalContext'
import { useCustomerTier } from '@/context/CustomerTierContext'
import { LedgerPdfDocument, type LedgerTxnRow } from '@/lib/ledger-pdf-document'
import { CATALOG_PATH, PROFILE_PATH } from '@/lib/routes'

type LedgerResponse = {
  rupee_balance: number
  fine_metal_balance_grams: number
  transactions: LedgerTxnRow[]
}

function labelForCategory(cat: string): string {
  const c = String(cat || '').toUpperCase()
  if (c === 'PURCHASE') return 'Purchase'
  if (c === 'CASH_PAYMENT') return 'Cash Payment'
  if (c === 'METAL_DEPOSIT') return 'Metal Deposit'
  return cat
}

export default function LedgerPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center gap-3 text-slate-400">
          <Loader2 className="size-9 animate-spin text-amber-500" />
          <span className="text-sm">Loading ledger…</span>
        </div>
      }
    >
      <LedgerContent />
    </Suspense>
  )
}

function LedgerContent() {
  const auth = useAuth()
  const { open: openLogin } = useLoginModal()
  const { hasB2bPortalAccess, tierReady } = useCustomerTier()
  const [data, setData] = useState<LedgerResponse | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    setErr(null)
    try {
      const res = await axios.get<LedgerResponse>('/api/b2b/ledger')
      setData(res.data)
    } catch (e: unknown) {
      const msg = e && typeof e === 'object' && 'response' in e
        ? (e as { response?: { data?: { error?: string } } }).response?.data?.error
        : null
      setErr(msg || 'Could not load ledger')
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!tierReady) return
    if (!auth.isAuthenticated) {
      setLoading(false)
      return
    }
    if (!hasB2bPortalAccess) {
      setLoading(false)
      return
    }
    load()
  }, [tierReady, auth.isAuthenticated, hasB2bPortalAccess, load])

  const user = auth.user as { name?: string; email?: string; mobile_number?: string } | undefined

  const downloadPdf = async () => {
    if (!data) return
    const doc = (
      <LedgerPdfDocument
        name={user?.name || 'Customer'}
        email={user?.email || ''}
        mobile={user?.mobile_number ? `+91 ${user.mobile_number}` : ''}
        rupeeBalance={data.rupee_balance}
        fineMetalGrams={data.fine_metal_balance_grams}
        transactions={data.transactions}
        generatedAt={new Date().toLocaleString('en-IN')}
      />
    )
    const blob = await pdf(doc).toBlob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `kc-jewellers-ledger-${new Date().toISOString().slice(0, 10)}.pdf`
    a.click()
    URL.revokeObjectURL(url)
  }

  if (!tierReady || (auth.isAuthenticated && loading)) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center gap-3">
        <Loader2 className="size-9 animate-spin text-emerald-500" />
        <span className="text-sm text-slate-500">Loading your ledger…</span>
      </div>
    )
  }

  if (!auth.isAuthenticated) {
    return (
      <div className="min-h-[70vh] flex flex-col items-center justify-center px-5 bg-gradient-to-b from-slate-950 to-slate-900 text-center">
        <div className="glass-card w-full max-w-md rounded-2xl border border-white/10 p-8">
          <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-2xl bg-emerald-950/50 ring-1 ring-emerald-500/20">
            <BookMarked className="size-7 text-emerald-400/90" aria-hidden />
          </div>
          <h1 className="text-lg font-semibold text-slate-100">B2B ledger</h1>
          <p className="mt-2 text-sm leading-relaxed text-slate-400">
            Sign in to view rupee and fine-metal balances and download your statement.
          </p>
          <button
            type="button"
            onClick={() => openLogin(PROFILE_PATH + '/ledger')}
            className="mt-6 inline-flex min-h-[48px] w-full touch-manipulation items-center justify-center rounded-xl bg-amber-500 px-5 text-sm font-semibold text-slate-950 shadow-lg shadow-amber-950/30 hover:bg-amber-400"
          >
            Sign in
          </button>
        </div>
      </div>
    )
  }

  if (!hasB2bPortalAccess) {
    return (
      <div className="min-h-[70vh] flex flex-col items-center justify-center px-5 text-center">
        <div className="glass-card max-w-md rounded-2xl border border-white/10 p-8">
          <p className="text-sm leading-relaxed text-slate-400">
            The B2B ledger (Khata) is only for wholesale accounts. Reseller logins use the catalogue with your
            pricing; contact KC Jewellers if you need full B2B wholesale access.
          </p>
          <Link
            href={CATALOG_PATH}
            className="mt-6 inline-flex min-h-[48px] w-full touch-manipulation items-center justify-center rounded-xl border border-white/15 bg-white/5 px-5 text-sm font-medium text-slate-200 hover:bg-white/10"
          >
            Back to catalogue
          </Link>
        </div>
      </div>
    )
  }

  if (err || !data) {
    return (
      <div className="min-h-[50vh] flex flex-col items-center justify-center px-5 text-center">
        <p className="text-red-400/90 mb-4 text-sm">{err || 'No data'}</p>
        <button
          type="button"
          onClick={load}
          className="min-h-[44px] rounded-xl bg-white/10 px-6 text-sm font-medium text-amber-400 hover:bg-white/15"
        >
          Retry
        </button>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-950 to-slate-900/90 text-slate-100 kc-pb-mobile-nav md:pb-14">
      <div className="max-w-4xl mx-auto px-4 py-5 md:py-10">
        <Link
          href={PROFILE_PATH}
          className="inline-flex min-h-[44px] items-center gap-2 text-sm text-slate-400 transition hover:text-amber-500"
        >
          <ArrowLeft className="size-4 shrink-0" />
          Profile
        </Link>

        <div className="mt-6 rounded-2xl border border-emerald-500/15 bg-gradient-to-br from-emerald-950/30 to-slate-900/40 p-5 md:p-6 shadow-xl shadow-black/20">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-emerald-400/80">Khata</p>
              <h1 className="mt-1 text-2xl font-bold tracking-tight text-white md:text-3xl">Account ledger</h1>
              <p className="mt-2 text-sm text-slate-400">Rupee and fine-metal balances — export for your records.</p>
            </div>
            <button
              type="button"
              onClick={downloadPdf}
              className="inline-flex min-h-[48px] w-full touch-manipulation items-center justify-center gap-2 rounded-xl border border-emerald-500/40 bg-emerald-600/20 px-5 text-sm font-semibold text-emerald-200 shadow-inner transition hover:bg-emerald-600/30 sm:w-auto sm:shrink-0"
            >
              <Download className="size-4 shrink-0" />
              Download PDF
            </button>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="glass-card rounded-2xl border border-white/10 p-5 md:p-6">
            <div className="mb-3 flex items-center gap-2">
              <div className="flex size-10 items-center justify-center rounded-xl bg-slate-800/80 ring-1 ring-white/10">
                <IndianRupee className="size-5 text-amber-400/90" aria-hidden />
              </div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Rupee balance</p>
            </div>
            <p className="text-2xl font-bold tabular-nums text-white md:text-3xl">
              ₹{data.rupee_balance.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
            <p className="mt-2 text-xs leading-relaxed text-slate-500">Per posted entries — positive typically means amount owed.</p>
          </div>
          <div className="glass-card rounded-2xl border border-emerald-500/20 p-5 md:p-6">
            <div className="mb-3 flex items-center gap-2">
              <div className="flex size-10 items-center justify-center rounded-xl bg-emerald-950/50 ring-1 ring-emerald-500/20">
                <Scale className="size-5 text-emerald-400" aria-hidden />
              </div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Fine metal</p>
            </div>
            <p className="text-2xl font-bold tabular-nums text-emerald-400 md:text-3xl">
              {data.fine_metal_balance_grams.toLocaleString('en-IN', { maximumFractionDigits: 3 })} g
            </p>
            <p className="mt-2 text-xs leading-relaxed text-slate-500">Gold / silver fine weight from ledger lines.</p>
          </div>
        </div>

        <h2 className="mt-8 mb-3 text-sm font-semibold text-slate-300">Recent activity</h2>

        {/* Mobile: stacked cards */}
        <div className="space-y-3 md:hidden">
          {data.transactions.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-700 py-12 text-center text-sm text-slate-500">
              No transactions yet.
            </div>
          ) : (
            data.transactions.map((t) => (
              <div
                key={t.id}
                className="rounded-2xl border border-slate-800/90 bg-slate-900/40 p-4 shadow-sm shadow-black/15"
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="inline-flex rounded-lg bg-slate-800 px-2.5 py-1 text-xs font-semibold text-amber-200/95">
                    {labelForCategory(t.txn_category)}
                  </span>
                  <time className="text-[11px] text-slate-500 tabular-nums">
                    {new Date(t.created_at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}
                  </time>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-[10px] font-medium uppercase tracking-wide text-slate-500">Amount</p>
                    <p className="mt-0.5 font-semibold tabular-nums text-slate-100">
                      ₹{Number(t.amount_rupees).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] font-medium uppercase tracking-wide text-slate-500">Metal (g)</p>
                    <p className="mt-0.5 font-semibold tabular-nums text-slate-200">
                      {Number(t.fine_metal_grams).toLocaleString('en-IN', { maximumFractionDigits: 3 })}
                    </p>
                  </div>
                </div>
                {(t.description || '') && (
                  <p className="mt-3 border-t border-slate-800/80 pt-3 text-xs leading-relaxed text-slate-500">
                    {t.description}
                  </p>
                )}
              </div>
            ))
          )}
        </div>

        {/* Desktop: table */}
        <div className="hidden md:block rounded-2xl border border-slate-800/90 bg-slate-900/30 overflow-hidden shadow-lg shadow-black/20">
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[640px]">
              <thead>
                <tr className="border-b border-slate-800 bg-slate-900/90 text-left text-[11px] uppercase tracking-wider text-slate-400">
                  <th className="px-4 py-3.5 font-semibold">Date</th>
                  <th className="px-4 py-3.5 font-semibold">Type</th>
                  <th className="px-4 py-3.5 font-semibold text-right">₹</th>
                  <th className="px-4 py-3.5 font-semibold text-right">Metal (g)</th>
                  <th className="px-4 py-3.5 font-semibold">Note</th>
                </tr>
              </thead>
              <tbody>
                {data.transactions.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-14 text-center text-slate-500">
                      No transactions yet.
                    </td>
                  </tr>
                ) : (
                  data.transactions.map((t) => (
                    <tr key={t.id} className="border-b border-slate-800/60 transition-colors hover:bg-slate-800/30">
                      <td className="px-4 py-3 text-slate-400 whitespace-nowrap text-xs">
                        {new Date(t.created_at).toLocaleString('en-IN')}
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-flex rounded-md bg-slate-800 px-2 py-0.5 text-xs font-medium text-amber-200/90">
                          {labelForCategory(t.txn_category)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-slate-200">
                        {Number(t.amount_rupees).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-slate-300">
                        {Number(t.fine_metal_grams).toLocaleString('en-IN', { maximumFractionDigits: 3 })}
                      </td>
                      <td className="px-4 py-3 text-slate-500 text-xs max-w-[220px]">
                        {t.description || '—'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}

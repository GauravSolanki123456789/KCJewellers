'use client'

import { useState, useEffect, useCallback, Suspense } from 'react'
import axios from '@/lib/axios'
import { useAuth } from '@/hooks/useAuth'
import { useLoginModal } from '@/context/LoginModalContext'
import Link from 'next/link'
import {
  ArrowLeft,
  Wallet,
  TrendingUp,
  Loader2,
  AlertTriangle,
  X,
  CheckCircle2,
  XCircle,
} from 'lucide-react'

type UserSip = {
  id: number
  plan_id: number
  plan_name: string
  metal_type?: string | null
  duration_months: number
  installment_amount?: number | null
  jeweler_benefit_percentage?: number | null
  start_date: string
  maturity_date?: string | null
  status: string
  total_paid: number
  total_grams_accumulated: number
}

export default function ProfileSipsPage() {
  const auth = useAuth()
  const { open: openLoginModal } = useLoginModal()
  const [sips, setSips] = useState<UserSip[]>([])
  const [loading, setLoading] = useState(true)
  const [cancelModal, setCancelModal] = useState<UserSip | null>(null)
  const [cancelling, setCancelling] = useState(false)
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  const showToast = (type: 'success' | 'error', message: string) => {
    setToast({ type, message })
    setTimeout(() => setToast(null), 4000)
  }

  const load = useCallback(async () => {
    if (!auth.isAuthenticated) {
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const res = await axios.get('/api/user/sips')
      setSips(Array.isArray(res.data) ? res.data : [])
    } catch {
      setSips([])
      showToast('error', 'Failed to load your SIPs')
    } finally {
      setLoading(false)
    }
  }, [auth.isAuthenticated])

  useEffect(() => {
    load()
  }, [load])

  const handleCancelConfirm = async () => {
    if (!cancelModal) return
    setCancelling(true)
    try {
      await axios.post(`/api/user/sips/${cancelModal.id}/cancel`)
      showToast('success', 'Cancellation requested. Payout will be processed by admin.')
      setCancelModal(null)
      load()
    } catch (err: unknown) {
      const msg =
        err && typeof err === 'object' && 'response' in err
          ? (err as { response?: { data?: { error?: string } } }).response?.data?.error
          : 'Failed to cancel'
      showToast('error', msg || 'Failed to cancel')
    } finally {
      setCancelling(false)
    }
  }

  const getProgress = (sip: UserSip) => {
    const inst = Number(sip.installment_amount) || 1
    const monthsPaid = Math.floor(Number(sip.total_paid) / inst)
    const dur = sip.duration_months || 12
    return Math.min(100, (monthsPaid / dur) * 100)
  }

  const isDiamond = (m: string | null | undefined) =>
    (m || '').toLowerCase() === 'diamond'

  const statusBadge = (s: string) => {
    const st = (s || '').toLowerCase()
    if (st === 'active') return 'bg-emerald-500/20 text-emerald-400'
    if (st === 'completed') return 'bg-cyan-500/20 text-cyan-400'
    if (st === 'cancellation_requested') return 'bg-amber-500/20 text-amber-400'
    if (st === 'cancelled_and_refunded') return 'bg-slate-500/20 text-slate-400'
    return 'bg-slate-500/20 text-slate-400'
  }

  const statusLabel = (s: string) => {
    const st = (s || '').toLowerCase()
    if (st === 'cancellation_requested') return 'Cancellation Requested'
    if (st === 'cancelled_and_refunded') return 'Cancelled & Refunded'
    return st.charAt(0).toUpperCase() + st.slice(1)
  }

  const canCancel = (s: UserSip) =>
    (s.status || '').toLowerCase() === 'active'

  if (!auth.isAuthenticated) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100">
        <main className="max-w-2xl mx-auto px-4 py-8 pb-24">
          <Link
            href="/profile"
            className="inline-flex items-center gap-2 text-slate-400 hover:text-amber-500 mb-6 transition-colors"
          >
            <ArrowLeft className="size-4" /> Back to Profile
          </Link>
          <div className="rounded-2xl border border-white/10 bg-slate-900/50 p-12 text-center">
            <Wallet className="size-14 text-slate-600 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-slate-200 mb-2">Sign in to view your SIPs</h2>
            <p className="text-slate-500 text-sm mb-6">Track your investments and manage your SIP plans</p>
            <button
              onClick={() => openLoginModal('/profile/sips')}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold transition-colors"
            >
              Sign In
            </button>
          </div>
        </main>
      </div>
    )
  }

  return (
    <Suspense fallback={<div className="min-h-screen bg-slate-950 flex items-center justify-center"><div className="text-slate-400">Loading...</div></div>}>
      <div className="min-h-screen bg-slate-950 text-slate-100">
        <main className="max-w-2xl mx-auto px-4 py-6 sm:py-8 pb-24 md:pb-16">
          <Link
            href="/profile"
            className="inline-flex items-center gap-2 text-slate-400 hover:text-amber-500 mb-6 transition-colors"
          >
            <ArrowLeft className="size-4" /> Back to Profile
          </Link>

          <div className="mb-8">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20">
                <TrendingUp className="size-6 text-amber-500" />
              </div>
              <div>
                <h1 className="text-xl sm:text-2xl font-bold text-slate-100">My SIP Investments</h1>
                <p className="text-slate-500 text-sm">Track and manage your active plans</p>
              </div>
            </div>
          </div>

          {loading ? (
            <div className="flex flex-col items-center justify-center py-20">
              <Loader2 className="size-12 text-amber-500 animate-spin mb-4" />
              <p className="text-slate-500">Loading your SIPs…</p>
            </div>
          ) : sips.length === 0 ? (
            <div className="rounded-2xl border border-white/10 bg-slate-900/50 p-12 text-center">
              <Wallet className="size-14 text-slate-600 mx-auto mb-4" />
              <p className="text-slate-400 text-lg">No SIP investments yet</p>
              <p className="text-slate-500 text-sm mt-1">Start investing with our Gold, Silver or Diamond plans</p>
              <Link
                href="/sip"
                className="mt-6 inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold transition-colors"
              >
                Browse Plans
              </Link>
            </div>
          ) : (
            <div className="space-y-6">
              {sips.map((sip) => (
                <div
                  key={sip.id}
                  className="rounded-2xl border border-white/10 bg-slate-900/60 overflow-hidden"
                >
                  <div className="p-5 sm:p-6">
                    <div className="flex items-start justify-between gap-3 mb-4">
                      <div>
                        <h3 className="text-lg font-semibold text-slate-100">{sip.plan_name}</h3>
                        <span className="inline-flex mt-1 px-2 py-0.5 rounded-lg text-xs font-medium capitalize bg-slate-700/80 text-slate-300">
                          {sip.metal_type || 'Gold'}
                        </span>
                      </div>
                      <span className={`shrink-0 inline-flex px-2.5 py-1 rounded-lg text-xs font-medium ${statusBadge(sip.status)}`}>
                        {statusLabel(sip.status)}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-4 mb-4">
                      <div>
                        <div className="text-xs text-slate-500 mb-0.5">Total Amount Paid</div>
                        <div className="font-semibold text-amber-400 tabular-nums">
                          ₹{Number(sip.total_paid).toLocaleString('en-IN')}
                        </div>
                      </div>
                      <div>
                        <div className="text-xs text-slate-500 mb-0.5">Monthly Installment</div>
                        <div className="font-medium text-slate-200 tabular-nums">
                          ₹{Number(sip.installment_amount || 0).toLocaleString('en-IN')}
                        </div>
                      </div>
                      {!isDiamond(sip.metal_type) && (
                        <div className="col-span-2">
                          <div className="text-xs text-slate-500 mb-0.5">Accumulated Grams</div>
                          <div className="font-semibold text-cyan-400 tabular-nums">
                            {Number(sip.total_grams_accumulated || 0).toFixed(4)} g
                          </div>
                        </div>
                      )}
                    </div>

                    {canCancel(sip) && (
                      <>
                        <div className="mb-4">
                          <div className="flex justify-between text-xs text-slate-500 mb-1">
                            <span>Progress</span>
                            <span>{Math.round(getProgress(sip))}%</span>
                          </div>
                          <div className="h-2 rounded-full bg-slate-800 overflow-hidden">
                            <div
                              className="h-full rounded-full bg-amber-500/80 transition-all duration-500"
                              style={{ width: `${getProgress(sip)}%` }}
                            />
                          </div>
                        </div>
                        <button
                          onClick={() => setCancelModal(sip)}
                          className="w-full py-2.5 rounded-xl border border-slate-600 text-slate-400 hover:text-amber-400 hover:border-amber-500/40 text-sm font-medium transition-colors"
                        >
                          Cancel & Withdraw
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="mt-8 text-center">
            <Link
              href="/sip"
              className="inline-flex items-center gap-2 text-amber-500 hover:text-amber-400 text-sm font-medium"
            >
              Browse more plans
            </Link>
          </div>
        </main>
      </div>

      {/* Cancel Warning Modal */}
      {cancelModal && (
        <>
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40"
            onClick={() => !cancelling && setCancelModal(null)}
            aria-hidden="true"
          />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div
              className="w-full max-w-md rounded-2xl bg-slate-900 border border-slate-700/80 shadow-2xl overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between p-4 sm:p-5 border-b border-slate-700/80">
                <h2 className="text-lg font-semibold text-slate-100 flex items-center gap-2">
                  <AlertTriangle className="size-5 text-amber-400" />
                  Cancel SIP?
                </h2>
                <button
                  onClick={() => !cancelling && setCancelModal(null)}
                  className="p-2 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
                >
                  <X className="size-5" />
                </button>
              </div>
              <div className="p-4 sm:p-5 space-y-4">
                <p className="text-slate-300">
                  Are you sure? You will lose maturity benefits. Your total amount paid (₹{Number(cancelModal.total_paid).toLocaleString('en-IN')}) will be refunded after admin approval.
                </p>
                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => !cancelling && setCancelModal(null)}
                    className="flex-1 py-2.5 rounded-xl border border-slate-600 text-slate-200 font-medium hover:bg-slate-800 transition-colors"
                  >
                    Keep SIP
                  </button>
                  <button
                    onClick={handleCancelConfirm}
                    disabled={cancelling}
                    className="flex-1 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
                  >
                    {cancelling ? <Loader2 className="size-5 animate-spin" /> : <XCircle className="size-5" />}
                    Yes, Cancel
                  </button>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-[9999] transition-all duration-300">
          <div
            className={`px-6 py-4 rounded-lg shadow-xl font-medium text-sm flex items-center gap-3 border-2 min-w-[280px] max-w-[90vw] ${
              toast.type === 'success'
                ? 'bg-emerald-500/95 text-white border-emerald-400'
                : 'bg-red-500/95 text-white border-red-400'
            }`}
          >
            {toast.type === 'success' ? (
              <CheckCircle2 className="size-5 shrink-0" />
            ) : (
              <XCircle className="size-5 shrink-0" />
            )}
            <span>{toast.message}</span>
          </div>
        </div>
      )}
    </Suspense>
  )
}

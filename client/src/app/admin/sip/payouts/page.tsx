'use client'

import { useState, useEffect, useCallback, Suspense } from 'react'
import axios from '@/lib/axios'
import AdminGuard from '@/components/AdminGuard'
import Link from 'next/link'
import {
  ArrowLeft,
  Wallet,
  User,
  Phone,
  Calendar,
  IndianRupee,
  CheckCircle2,
  XCircle,
  Loader2,
  X,
} from 'lucide-react'

type PayoutRequest = {
  id: number
  user_sip_id?: number | null
  user_id?: number | null
  requested_amount?: number | null
  amount?: number | null
  request_date?: string | null
  status: string
  admin_remarks?: string | null
  paid_on_date?: string | null
  grams?: number | null
  customer_name?: string | null
  customer_email?: string | null
  customer_phone?: string | null
  customer_mobile?: string | null
  plan_name?: string | null
  plan_metal_type?: string | null
  plan_duration_months?: number | null
}

export default function AdminSipPayoutsPage() {
  const [items, setItems] = useState<PayoutRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const [processingId, setProcessingId] = useState<number | null>(null)
  const [payoutModal, setPayoutModal] = useState<PayoutRequest | null>(null)
  const [remarks, setRemarks] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const showToast = (type: 'success' | 'error', message: string) => {
    setToast({ type, message })
    setTimeout(() => setToast(null), 4000)
  }

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await axios.get('/api/admin/sip/payouts')
      setItems(Array.isArray(res.data) ? res.data : [])
    } catch {
      setItems([])
      showToast('error', 'Failed to load payout requests')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const openPayoutModal = (p: PayoutRequest) => {
    setPayoutModal(p)
    setRemarks(p.admin_remarks || '')
  }

  const closePayoutModal = () => {
    setPayoutModal(null)
    setRemarks('')
    setProcessingId(null)
  }

  const handleMarkPaid = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!payoutModal) return
    setSubmitting(true)
    setProcessingId(payoutModal.id)
    try {
      await axios.post(`/api/admin/sip/payouts/${payoutModal.id}/mark-paid`, {
        admin_remarks: remarks.trim() || undefined,
      })
      showToast('success', 'Payout marked as paid')
      closePayoutModal()
      load()
    } catch (err: unknown) {
      const msg = err && typeof err === 'object' && 'response' in err
        ? (err as { response?: { data?: { error?: string } } }).response?.data?.error
        : 'Failed to process payout'
      showToast('error', msg || 'Failed to process payout')
    } finally {
      setSubmitting(false)
      setProcessingId(null)
    }
  }

  const formatDate = (d: string | null | undefined) => {
    if (!d) return '—'
    try {
      return new Date(d).toLocaleString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    } catch {
      return d
    }
  }

  const getAmount = (p: PayoutRequest) =>
    Number(p.requested_amount ?? p.amount ?? 0)

  const getPhone = (p: PayoutRequest) =>
    p.customer_mobile || p.customer_phone || '—'

  const getPlanDetails = (p: PayoutRequest) => {
    if (p.plan_name) {
      const metal = p.plan_metal_type ? ` ${String(p.plan_metal_type).charAt(0).toUpperCase() + String(p.plan_metal_type).slice(1)}` : ''
      const dur = p.plan_duration_months ? ` • ${p.plan_duration_months} mo` : ''
      return `${p.plan_name}${metal}${dur}`
    }
    return p.user_sip_id ? `SIP #${p.user_sip_id}` : '—'
  }

  const statusBadge = (status: string) => {
    const s = (status || '').toLowerCase()
    if (s === 'paid') return 'bg-emerald-500/20 text-emerald-400'
    if (s === 'rejected') return 'bg-red-500/20 text-red-400'
    if (s === 'pending' || s === 'pending_admin_approval') return 'bg-amber-500/20 text-amber-400'
    return 'bg-slate-500/20 text-slate-400'
  }

  const statusLabel = (status: string) => {
    const s = (status || '').toLowerCase()
    if (s === 'pending_admin_approval') return 'Pending'
    return s.charAt(0).toUpperCase() + s.slice(1)
  }

  const pendingItems = items.filter((p) => {
    const s = (p.status || '').toLowerCase()
    return s === 'pending' || s === 'pending_admin_approval'
  })

  return (
    <Suspense fallback={<div className="min-h-screen bg-slate-950 flex items-center justify-center"><div className="text-slate-400">Loading...</div></div>}>
      <AdminGuard>
        <div className="min-h-screen bg-slate-950 text-slate-100">
          <main className="max-w-6xl mx-auto px-4 py-6 sm:py-8 pb-24 sm:pb-12">
            <Link
              href="/admin"
              className="inline-flex items-center gap-2 text-slate-400 hover:text-amber-500 mb-6 transition-colors"
            >
              <ArrowLeft className="size-4" /> Back to Dashboard
            </Link>

            <div className="mb-6 sm:mb-8">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20">
                    <Wallet className="size-6 text-amber-500" />
                  </div>
                  <div>
                    <h1 className="text-xl sm:text-2xl font-bold text-slate-100">SIP Payout Requests</h1>
                    <p className="text-slate-500 text-sm">Process withdrawal requests from SIP cancellations</p>
                  </div>
                </div>
                {pendingItems.length > 0 && (
                  <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-amber-500/20 text-amber-400 text-sm font-medium border border-amber-500/30">
                    {pendingItems.length} pending
                  </span>
                )}
              </div>
            </div>

            <div className="rounded-xl border border-white/10 bg-slate-900/50 overflow-hidden">
              {loading ? (
                <div className="p-12 sm:p-16 text-center">
                  <Loader2 className="size-10 text-amber-500 animate-spin mx-auto" />
                  <p className="text-slate-500 mt-4">Loading payout requests…</p>
                </div>
              ) : items.length === 0 ? (
                <div className="p-12 sm:p-16 text-center">
                  <Wallet className="size-14 text-slate-600 mx-auto mb-4" />
                  <p className="text-slate-400 text-lg">No payout requests</p>
                  <p className="text-slate-500 text-sm mt-1">
                    When customers cancel their SIP and request a refund, requests will appear here.
                  </p>
                  <Link
                    href="/admin/sip/plans"
                    className="mt-6 inline-flex items-center gap-2 text-amber-500 hover:text-amber-400 text-sm font-medium"
                  >
                    Manage SIP Plans →
                  </Link>
                </div>
              ) : (
                <>
                  {/* Mobile: Card layout */}
                  <div className="sm:hidden divide-y divide-white/5 p-4 space-y-4">
                    {items.map((p) => {
                      const isPending = ['pending', 'pending_admin_approval'].includes((p.status || '').toLowerCase())
                      return (
                        <div
                          key={p.id}
                          className="rounded-xl border border-white/10 bg-slate-800/40 p-4 space-y-3"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <Calendar className="size-4 text-slate-500 shrink-0" />
                              <span className="text-slate-400 text-sm">{formatDate(p.request_date)}</span>
                            </div>
                            <span className={`inline-flex px-2 py-0.5 rounded-lg text-xs font-medium ${statusBadge(p.status)}`}>
                              {statusLabel(p.status)}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <User className="size-4 text-slate-500 shrink-0" />
                            <div>
                              <div className="font-medium text-slate-200">{p.customer_name || 'Unknown'}</div>
                              <div className="flex items-center gap-1 text-xs text-slate-500">
                                <Phone className="size-3" /> {getPhone(p)}
                              </div>
                            </div>
                          </div>
                          <div className="text-sm text-slate-400">
                            Plan: {getPlanDetails(p)}
                          </div>
                          <div className="flex items-center justify-between pt-2 border-t border-white/5">
                            <span className="font-semibold text-amber-400 tabular-nums">
                              ₹{getAmount(p).toLocaleString('en-IN')}
                            </span>
                            {isPending && (
                              <button
                                onClick={() => openPayoutModal(p)}
                                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-sm transition-colors"
                              >
                                <CheckCircle2 className="size-4" /> Process Payout
                              </button>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>

                  {/* Desktop: Table */}
                  <div className="hidden sm:block overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-white/10 bg-slate-800/40">
                          <th className="text-left py-4 px-5 text-slate-400 font-medium text-sm">Date Requested</th>
                          <th className="text-left py-4 px-5 text-slate-400 font-medium text-sm">Customer</th>
                          <th className="text-left py-4 px-5 text-slate-400 font-medium text-sm">Plan Details</th>
                          <th className="text-right py-4 px-5 text-slate-400 font-medium text-sm">Amount</th>
                          <th className="text-left py-4 px-5 text-slate-400 font-medium text-sm">Status</th>
                          <th className="text-right py-4 px-5 text-slate-400 font-medium text-sm">Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {items.map((p) => {
                          const isPending = ['pending', 'pending_admin_approval'].includes((p.status || '').toLowerCase())
                          return (
                            <tr key={p.id} className="border-b border-white/5 hover:bg-white/[0.02] transition-colors">
                              <td className="py-4 px-5">
                                <div className="flex items-center gap-2 text-slate-400 text-sm">
                                  <Calendar className="size-4 shrink-0 opacity-60" />
                                  {formatDate(p.request_date)}
                                </div>
                              </td>
                              <td className="py-4 px-5">
                                <div>
                                  <div className="font-medium text-slate-200">{p.customer_name || 'Unknown'}</div>
                                  <div className="flex items-center gap-1 text-xs text-slate-500">
                                    <Phone className="size-3" /> {getPhone(p)}
                                  </div>
                                </div>
                              </td>
                              <td className="py-4 px-5 text-slate-400 text-sm">
                                {getPlanDetails(p)}
                              </td>
                              <td className="py-4 px-5 text-right">
                                <span className="font-semibold text-amber-400 tabular-nums">
                                  ₹{getAmount(p).toLocaleString('en-IN')}
                                </span>
                              </td>
                              <td className="py-4 px-5">
                                <span className={`inline-flex px-2.5 py-1 rounded-lg text-xs font-medium ${statusBadge(p.status)}`}>
                                  {statusLabel(p.status)}
                                </span>
                              </td>
                              <td className="py-4 px-5 text-right">
                                {isPending ? (
                                  <button
                                    onClick={() => openPayoutModal(p)}
                                    className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-sm transition-colors"
                                  >
                                    <CheckCircle2 className="size-4" /> Process Payout
                                  </button>
                                ) : (
                                  <span className="text-slate-500 text-sm">—</span>
                                )}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>

            <div className="mt-6 flex flex-wrap gap-4">
              <Link
                href="/admin/sip/plans"
                className="inline-flex items-center gap-2 text-amber-500 hover:text-amber-400 text-sm font-medium"
              >
                Manage SIP Plans
              </Link>
              <Link
                href="/admin/sip/movements"
                className="inline-flex items-center gap-2 text-slate-400 hover:text-slate-200 text-sm font-medium"
              >
                Gold Lot Movements
              </Link>
            </div>
          </main>
        </div>

        {/* Process Payout Modal */}
        {payoutModal && (
          <>
            <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40" onClick={() => !submitting && closePayoutModal()} aria-hidden="true" />
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
              <div
                className="w-full max-w-md rounded-2xl bg-slate-900 border border-slate-700/80 shadow-2xl overflow-hidden"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center justify-between p-4 sm:p-5 border-b border-slate-700/80">
                  <h2 className="text-lg font-semibold text-slate-100">Process Payout</h2>
                  <button
                    onClick={() => !submitting && closePayoutModal()}
                    className="p-2 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
                  >
                    <X className="size-5" />
                  </button>
                </div>
                <form onSubmit={handleMarkPaid} className="p-4 sm:p-5 space-y-4">
                  <div className="rounded-xl bg-slate-800/50 border border-slate-700/60 p-4">
                    <div className="text-sm text-slate-400 mb-1">Amount to pay</div>
                    <div className="flex items-center gap-2">
                      <IndianRupee className="size-5 text-amber-500" />
                      <span className="text-2xl font-bold text-amber-400 tabular-nums">
                        ₹{getAmount(payoutModal).toLocaleString('en-IN')}
                      </span>
                    </div>
                    <div className="mt-2 text-sm text-slate-500">
                      Customer: {payoutModal.customer_name || 'Unknown'} • {getPhone(payoutModal)}
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-400 mb-1.5">
                      Admin Remarks (NEFT/UPI transaction ID, etc.)
                    </label>
                    <textarea
                      value={remarks}
                      onChange={(e) => setRemarks(e.target.value)}
                      placeholder="e.g. UPI ref: 123456789"
                      rows={3}
                      className="w-full px-4 py-2.5 rounded-lg bg-slate-800 border border-slate-600 text-slate-100 placeholder:text-slate-500 focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500/50 outline-none transition-all resize-none"
                    />
                  </div>
                  <div className="flex gap-3 pt-2">
                    <button
                      type="button"
                      onClick={closePayoutModal}
                      disabled={submitting}
                      className="flex-1 py-2.5 rounded-xl border border-slate-600 text-slate-200 font-medium hover:bg-slate-800 transition-colors disabled:opacity-50"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={submitting}
                      className="flex-1 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
                    >
                      {submitting ? <Loader2 className="size-5 animate-spin" /> : <CheckCircle2 className="size-5" />}
                      Mark as Paid
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </>
        )}

        {/* Toast */}
        {toast && (
          <div className="fixed top-20 left-1/2 -translate-x-1/2 z-[9999] transition-all duration-300">
            <div
              className={`px-6 py-4 rounded-lg shadow-xl font-medium text-sm flex items-center gap-3 border-2 min-w-[280px] max-w-[90vw] ${
                toast.type === 'success' ? 'bg-emerald-500/95 text-white border-emerald-400' : 'bg-red-500/95 text-white border-red-400'
              }`}
            >
              {toast.type === 'success' ? <CheckCircle2 className="size-5 shrink-0" /> : <XCircle className="size-5 shrink-0" />}
              <span>{toast.message}</span>
            </div>
          </div>
        )}
      </AdminGuard>
    </Suspense>
  )
}

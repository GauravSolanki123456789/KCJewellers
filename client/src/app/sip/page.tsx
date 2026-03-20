'use client'

import { useEffect, useState, useMemo, useCallback, useRef } from 'react'
import axios from '@/lib/axios'
import { useAuth } from '@/hooks/useAuth'
import { useLoginModal } from '@/context/LoginModalContext'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  Sparkles,
  Gem,
  LayoutGrid,
  TrendingUp,
  Shield,
  ArrowRight,
  Loader2,
  X,
  CheckCircle2,
  XCircle,
} from 'lucide-react'

type SipPlan = {
  id: number
  name: string
  metal_type?: string | null
  duration_months: number
  installment_amount?: number | null
  jeweler_benefit_percentage?: number | null
  is_active: boolean
  min_amount?: number
}

const METAL_TABS = [
  { key: 'gold', label: 'Gold', icon: Sparkles },
  { key: 'silver', label: 'Silver', icon: LayoutGrid },
  { key: 'diamond', label: 'Diamond', icon: Gem },
] as const

type MetalKey = (typeof METAL_TABS)[number]['key']

function planMatchesMetal(plan: SipPlan, metal: MetalKey): boolean {
  const m = (plan.metal_type || '').toLowerCase()
  if (metal === 'gold') return m === 'gold' || !m
  if (metal === 'silver') return m === 'silver'
  if (metal === 'diamond') return m === 'diamond'
  return false
}

export default function SipMarketingPage() {
  const auth = useAuth()
  const { open: openLoginModal } = useLoginModal()
  const router = useRouter()
  const [plans, setPlans] = useState<SipPlan[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedMetal, setSelectedMetal] = useState<MetalKey>('gold')
  const [confirmPlan, setConfirmPlan] = useState<SipPlan | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const razorpayScriptLoaded = useRef(false)

  const showToast = (type: 'success' | 'error', message: string) => {
    setToast({ type, message })
    setTimeout(() => setToast(null), 4000)
  }

  const loadRazorpayScript = (): Promise<void> => {
    if (razorpayScriptLoaded.current || (typeof window !== 'undefined' && window.Razorpay)) {
      razorpayScriptLoaded.current = true
      return Promise.resolve()
    }
    return new Promise((resolve) => {
      const script = document.createElement('script')
      script.src = 'https://checkout.razorpay.com/v1/checkout.js'
      script.async = true
      script.onload = () => {
        razorpayScriptLoaded.current = true
        resolve()
      }
      script.onerror = () => resolve()
      document.body.appendChild(script)
    })
  }

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await axios.get('/api/sip/plans')
      setPlans(Array.isArray(res.data) ? res.data : [])
    } catch {
      setPlans([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const filteredPlans = useMemo(
    () => plans.filter((p) => planMatchesMetal(p, selectedMetal)),
    [plans, selectedMetal],
  )

  const handleStartInvesting = (plan: SipPlan) => {
    if (!auth.isAuthenticated) {
      openLoginModal('/sip')
      return
    }
    setConfirmPlan(plan)
  }

  const handleConfirmSubscribe = async () => {
    if (!confirmPlan || !auth.isAuthenticated) return
    setSubmitting(true)
    try {
      await loadRazorpayScript()
      if (!window.Razorpay) {
        showToast('error', 'Payment gateway failed to load. Please refresh and try again.')
        setSubmitting(false)
        return
      }

      const checkoutRes = await axios.post('/api/sip/checkout', { plan_id: confirmPlan.id })
      const { subscription_id, key_id } = checkoutRes.data
      if (!subscription_id || !key_id) {
        showToast('error', 'Could not create subscription. Please try again.')
        setSubmitting(false)
        return
      }

      const razorpayKeyId = process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID || key_id

      const options = {
        key: razorpayKeyId,
        subscription_id,
        name: 'KC Jewellers',
        description: `SIP: ${confirmPlan.name}`,
        prefill: {
          email: (auth.user as { email?: string })?.email || '',
          contact: (auth.user as { mobile_number?: string })?.mobile_number || '',
        },
        handler: async (rzpResponse: {
          razorpay_payment_id: string
          razorpay_subscription_id: string
          razorpay_signature: string
        }) => {
          try {
            showToast('success', 'Verifying payment…')
            await axios.post('/api/sip/verify-subscription', {
              razorpay_payment_id: rzpResponse.razorpay_payment_id,
              razorpay_subscription_id: rzpResponse.razorpay_subscription_id,
              razorpay_signature: rzpResponse.razorpay_signature,
              plan_id: confirmPlan.id,
            })
            showToast('success', 'Subscription activated! Redirecting to your dashboard.')
            setConfirmPlan(null)
            setTimeout(() => router.push('/profile/sips'), 1500)
          } catch (verifyErr: unknown) {
            const msg =
              verifyErr && typeof verifyErr === 'object' && 'response' in verifyErr
                ? (verifyErr as { response?: { data?: { error?: string } } }).response?.data?.error
                : 'Verification failed'
            showToast('error', msg || 'Verification failed. Please contact support.')
          } finally {
            setSubmitting(false)
          }
        },
        modal: {
          ondismiss: () => setSubmitting(false),
        },
        theme: { color: '#eab308' },
      }

      const rzp = new window.Razorpay(options)
      rzp.on('payment.failed', () => {
        showToast('error', 'Payment failed. Please try again.')
        setSubmitting(false)
      })
      rzp.open()
    } catch (err: unknown) {
      const msg =
        err && typeof err === 'object' && 'response' in err
          ? (err as { response?: { data?: { error?: string } } }).response?.data?.error
          : 'Failed to start subscription'
      showToast('error', msg || 'Failed to start subscription')
      setSubmitting(false)
    }
  }

  const getInstallment = (p: SipPlan) =>
    Number(p.installment_amount ?? p.min_amount ?? 0)

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <main className="max-w-5xl mx-auto px-4 py-6 sm:py-10 pb-28 md:pb-16">
        {/* Hero */}
        <section className="text-center mb-10 sm:mb-14">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400 text-sm font-medium mb-6">
            <TrendingUp className="size-4" />
            Systematic Investment Plan
          </div>
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold text-slate-100 mb-4">
            Invest Monthly,{' '}
            <span className="bg-gradient-to-r from-amber-400 to-yellow-500 bg-clip-text text-transparent">
              Secure Your Future
            </span>
          </h1>
          <p className="text-slate-400 text-lg max-w-2xl mx-auto mb-6">
            Build wealth with disciplined monthly investments in Gold, Silver or Diamond. 
            Flexible plans with easy withdrawals and transparent pricing.
          </p>
          <div className="flex flex-wrap justify-center gap-4 text-slate-500 text-sm">
            <span className="flex items-center gap-2">
              <Shield className="size-4 text-amber-500/70" />
              Secure & Transparent
            </span>
            <span className="flex items-center gap-2">
              <TrendingUp className="size-4 text-amber-500/70" />
              Flexible Tenure
            </span>
            <span className="flex items-center gap-2">
              <Sparkles className="size-4 text-amber-500/70" />
              Exclusive Rewards
            </span>
          </div>
        </section>

        {/* Metal Tabs */}
        <div className="flex justify-center mb-8 px-1">
          <div className="inline-flex w-full sm:w-auto p-1 rounded-xl bg-slate-900/80 border border-slate-800 shadow-lg">
            {METAL_TABS.map(({ key, label, icon: Icon }) => {
              const isActive = selectedMetal === key
              return (
                <button
                  key={key}
                  onClick={() => setSelectedMetal(key)}
                  className={`flex-1 sm:flex-initial flex items-center justify-center gap-2 px-4 sm:px-5 py-3 sm:py-2.5 rounded-lg text-sm font-semibold transition-all duration-200 min-w-0 ${
                    isActive
                      ? 'bg-amber-500 text-slate-950 shadow-md ring-2 ring-amber-400/30'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50 active:bg-slate-800'
                  }`}
                >
                  <Icon className="size-4 shrink-0" />
                  <span className="truncate">{label}</span>
                </button>
              )
            })}
          </div>
        </div>

        {/* Plans Grid */}
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20">
            <Loader2 className="size-12 text-amber-500 animate-spin mb-4" />
            <p className="text-slate-500">Loading plans…</p>
          </div>
        ) : filteredPlans.length === 0 ? (
          <div className="text-center py-16 rounded-2xl bg-slate-900/50 border border-slate-800">
            <Sparkles className="size-14 text-slate-600 mx-auto mb-4" />
            <p className="text-slate-400 text-lg">No {METAL_TABS.find((t) => t.key === selectedMetal)?.label} plans available</p>
            <p className="text-slate-500 text-sm mt-1">Check back later or browse other metals</p>
          </div>
        ) : (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {filteredPlans.map((plan) => (
              <div
                key={plan.id}
                className="rounded-2xl border border-white/10 bg-slate-900/60 overflow-hidden hover:border-amber-500/30 transition-all group"
              >
                <div className="p-6 sm:p-6">
                  <div className="flex items-start justify-between gap-2 mb-4">
                    <h3 className="text-lg font-semibold text-slate-100 group-hover:text-amber-400 transition-colors">
                      {plan.name}
                    </h3>
                    <span className="shrink-0 px-2 py-0.5 rounded-lg text-xs font-medium capitalize bg-slate-700/80 text-slate-300">
                      {plan.metal_type || 'Gold'}
                    </span>
                  </div>
                  <div className="space-y-3 text-sm">
                    <div className="flex justify-between">
                      <span className="text-slate-500">Monthly</span>
                      <span className="font-semibold text-amber-400 tabular-nums">
                        ₹{getInstallment(plan).toLocaleString('en-IN')}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Duration</span>
                      <span className="text-slate-200">{plan.duration_months} months</span>
                    </div>
                  </div>
                  <button
                    onClick={() => handleStartInvesting(plan)}
                    className="mt-6 w-full py-3 px-4 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold transition-colors flex items-center justify-center gap-2 group/btn"
                  >
                    Start Investing
                    <ArrowRight className="size-4 group-hover/btn:translate-x-0.5 transition-transform" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Link to Profile SIPs when logged in */}
        {auth.isAuthenticated && (
          <div className="mt-10 text-center">
            <Link
              href="/profile/sips"
              className="inline-flex items-center gap-2 text-amber-500 hover:text-amber-400 text-sm font-medium"
            >
              View my SIP investments →
            </Link>
          </div>
        )}
      </main>

      {/* Confirm Subscribe Modal */}
      {confirmPlan && (
        <>
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40"
            onClick={() => !submitting && setConfirmPlan(null)}
            aria-hidden="true"
          />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div
              className="w-full max-w-md rounded-2xl bg-slate-900 border border-slate-700/80 shadow-2xl overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between p-4 sm:p-5 border-b border-slate-700/80">
                <h2 className="text-lg font-semibold text-slate-100">Confirm Subscription</h2>
                <button
                  onClick={() => !submitting && setConfirmPlan(null)}
                  className="p-2 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
                >
                  <X className="size-5" />
                </button>
              </div>
              <div className="p-4 sm:p-5 space-y-4">
                <p className="text-slate-300">
                  You are about to subscribe to <strong className="text-amber-400">{confirmPlan.name}</strong>.
                </p>
                <div className="rounded-xl bg-slate-800/50 border border-slate-700/60 p-4 space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Monthly installment</span>
                    <span className="text-amber-400 font-medium">₹{getInstallment(confirmPlan).toLocaleString('en-IN')}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Duration</span>
                    <span className="text-slate-200">{confirmPlan.duration_months} months</span>
                  </div>
                </div>
                <p className="text-slate-500 text-xs">
                  You can cancel anytime and request a withdrawal. Admin will process your payout manually.
                </p>
                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => !submitting && setConfirmPlan(null)}
                    className="flex-1 py-2.5 rounded-xl border border-slate-600 text-slate-200 font-medium hover:bg-slate-800 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleConfirmSubscribe}
                    disabled={submitting}
                    className="flex-1 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
                  >
                    {submitting ? <Loader2 className="size-5 animate-spin" /> : <CheckCircle2 className="size-5" />}
                    Confirm
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
    </div>
  )
}

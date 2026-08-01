'use client'

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import Script from 'next/script'
import { useSearchParams } from 'next/navigation'
import axios from '@/lib/axios'
import { useAuth } from '@/hooks/useAuth'
import { useResellerBranding } from '@/context/ResellerBrandingContext'
import SharedCatalogSignInModal, {
  type SharedCatalogCustomerIdentity,
} from '@/components/shared-catalog/SharedCatalogSignInModal'
import { formatErpInr } from '@/lib/reseller-erp-modules'
import { Gem, Loader2, ShieldCheck, Wallet } from 'lucide-react'

type RazorpayCtor = new (opts: Record<string, unknown>) => { open: () => void }

type DigiTier = {
  metal_key: string
  retail_rate_per_gram: number
  discount_inr: number
  effective_rate_per_gram: number
}

type DigiConfig = {
  business_name: string
  metal: 'gold' | 'silver'
  tiers: DigiTier[]
  payments_configured: boolean
  razorpay_key_id: string | null
  otp_enabled: boolean
  updated_at?: string | null
}

type Holding = { metal_key: string; balance_grams: number }

const GOLD_LABELS: Record<string, string> = {
  gold_24k: '24K (999)',
  gold_22k: '22K (916)',
  gold_18k: '18K (750)',
}

function gramsPreview(amount: number, rate: number) {
  if (amount <= 0 || rate <= 0) return 0
  return Math.round((amount / rate) * 1_000_000) / 1_000_000
}

function DigiPurchaseInner({ metal }: { metal: 'gold' | 'silver' }) {
  const auth = useAuth()
  const rb = useResellerBranding()
  const searchParams = useSearchParams()
  const inviteCode = searchParams.get('code') || searchParams.get('invite') || ''

  const [config, setConfig] = useState<DigiConfig | null>(null)
  const [loadErr, setLoadErr] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [signInOpen, setSignInOpen] = useState(false)
  const [selectedMetalKey, setSelectedMetalKey] = useState('')
  const [amount, setAmount] = useState('')
  const [payBusy, setPayBusy] = useState(false)
  const [payMsg, setPayMsg] = useState<string | null>(null)
  const [holdings, setHoldings] = useState<Holding[]>([])
  const [scriptReady, setScriptReady] = useState(false)
  const [identity, setIdentity] = useState<SharedCatalogCustomerIdentity | null>(null)
  const [signedIn, setSignedIn] = useState(false)

  useEffect(() => {
    if (auth.isAuthenticated) setSignedIn(true)
  }, [auth.isAuthenticated])

  const storeQuery = useMemo(() => {
    const q: Record<string, string> = { metal }
    if (rb.customDomainHost && typeof window !== 'undefined') {
      q.domain = window.location.hostname
    } else if (inviteCode) {
      q.code = inviteCode
    } else if (typeof window !== 'undefined') {
      q.domain = window.location.hostname
    }
    return q
  }, [metal, rb.customDomainHost, inviteCode])

  const storeBody = useMemo(() => {
    const b: Record<string, string> = {}
    if (rb.customDomainHost && typeof window !== 'undefined') {
      b.domain = window.location.hostname
    } else if (inviteCode) {
      b.code = inviteCode
    } else if (typeof window !== 'undefined') {
      b.domain = window.location.hostname
    }
    return b
  }, [rb.customDomainHost, inviteCode])

  const loadConfig = useCallback(async () => {
    setLoading(true)
    setLoadErr(null)
    try {
      const res = await axios.get<DigiConfig>('/api/public/digi/config', {
        params: storeQuery,
      })
      setConfig(res.data)
      const first = res.data.tiers[0]?.metal_key
      if (first) setSelectedMetalKey(first)
    } catch (e: unknown) {
      const msg =
        (e as { response?: { data?: { error?: string } } })?.response?.data?.error ||
        'Could not load rates.'
      setLoadErr(msg)
      setConfig(null)
    } finally {
      setLoading(false)
    }
  }, [storeQuery])

  const loadWallet = useCallback(async () => {
    if (!signedIn && !auth.isAuthenticated) return
    try {
      const res = await axios.get<{ holdings: Holding[] }>('/api/public/digi/wallet', {
        params: storeQuery,
        withCredentials: true,
      })
      setHoldings(res.data.holdings || [])
    } catch {
      setHoldings([])
    }
  }, [signedIn, auth.isAuthenticated, storeQuery])

  useEffect(() => {
    void loadConfig()
  }, [loadConfig])

  useEffect(() => {
    if (signedIn || auth.isAuthenticated) void loadWallet()
  }, [signedIn, auth.isAuthenticated, loadWallet])

  const selectedTier = config?.tiers.find((t) => t.metal_key === selectedMetalKey) || config?.tiers[0]
  const amountNum = Number(amount) || 0
  const previewGrams = selectedTier
    ? gramsPreview(amountNum, selectedTier.effective_rate_per_gram)
    : 0

  const productTitle = metal === 'gold' ? 'DigiGold' : 'DigiSilver'
  const brandName = config?.business_name || rb.businessName || 'Jeweller'

  const handlePay = async () => {
    if (!signedIn && !auth.isAuthenticated) {
      setSignInOpen(true)
      return
    }
    if (!config?.payments_configured || !config.razorpay_key_id) {
      setPayMsg('Online payments are not set up yet. Please contact the store.')
      return
    }
    if (!selectedTier || amountNum < 100) {
      setPayMsg('Enter at least ₹100')
      return
    }
    setPayBusy(true)
    setPayMsg(null)
    try {
      const orderRes = await axios.post<{
        digi_order_id: number
        razorpay_order_id: string
        razorpay_key_id: string
        grams: number
      }>(
        '/api/public/digi/create-order',
        {
          ...storeBody,
          metal_key: selectedTier.metal_key,
          amount_inr: amountNum,
        },
        { withCredentials: true },
      )
      const { digi_order_id, razorpay_order_id, razorpay_key_id, grams } = orderRes.data
      if (!(window as Window & { Razorpay?: RazorpayCtor }).Razorpay) {
        setPayMsg('Payment gateway failed to load. Refresh and try again.')
        return
      }
      const Razorpay = (window as Window & { Razorpay: RazorpayCtor }).Razorpay
      const rzp = new Razorpay({
        key: razorpay_key_id,
        amount: Math.round(amountNum * 100),
        currency: 'INR',
        name: brandName,
        description: `${productTitle} — ${grams.toFixed(3)} g`,
        order_id: razorpay_order_id,
        handler: async (response: {
          razorpay_order_id: string
          razorpay_payment_id: string
          razorpay_signature: string
        }) => {
          try {
            const verify = await axios.post<{ ok: boolean; grams: number; holdings: Holding[] }>(
              '/api/public/digi/verify-payment',
              {
                digi_order_id,
                razorpay_order_id: response.razorpay_order_id,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_signature: response.razorpay_signature,
              },
              { withCredentials: true },
            )
            setHoldings(verify.data.holdings || [])
            setPayMsg(`Success! ${verify.data.grams.toFixed(3)} g added to your account.`)
            setAmount('')
          } catch (err: unknown) {
            const msg =
              (err as { response?: { data?: { error?: string } } })?.response?.data?.error ||
              'Payment received but verification failed. Contact the store with your payment ID.'
            setPayMsg(msg)
          }
        },
        prefill: {
          contact:
            identity?.mobile ||
            String((auth.user as { mobile_number?: string } | undefined)?.mobile_number || ''),
          name:
            identity?.name ||
            String((auth.user as { name?: string } | undefined)?.name || ''),
        },
        theme: { color: '#c41e3a' },
      })
      rzp.open()
    } catch (e: unknown) {
      const msg =
        (e as { response?: { data?: { error?: string } } })?.response?.data?.error ||
        'Could not start payment.'
      setPayMsg(msg)
    } finally {
      setPayBusy(false)
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center text-[var(--color-jewelry-black,#1a1814)]/55">
        <Loader2 className="size-8 animate-spin" />
      </div>
    )
  }

  if (loadErr || !config) {
    return (
      <div className="mx-auto max-w-md px-4 py-12 text-center">
        <p className="text-sm text-rose-700">{loadErr || 'Unavailable'}</p>
      </div>
    )
  }

  return (
    <>
      <Script
        src="https://checkout.razorpay.com/v1/checkout.js"
        strategy="lazyOnload"
        onLoad={() => setScriptReady(true)}
      />

      <div className="mx-auto max-w-md px-4 py-6 sm:py-10">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex size-14 items-center justify-center rounded-2xl bg-[var(--kc-accent,#c41e3a)]/10 ring-1 ring-[var(--kc-accent,#c41e3a)]/20">
            <Gem className="size-7 text-[var(--kc-accent,#c41e3a)]" />
          </div>
          <h1 className="text-2xl font-bold text-[var(--color-jewelry-black,#1a1814)]">{productTitle}</h1>
          <p className="mt-1 text-sm text-[var(--color-jewelry-black,#1a1814)]/60">{brandName}</p>
          <p className="mt-2 text-xs text-[var(--color-jewelry-black,#1a1814)]/45">
            Buy at today&apos;s rate minus special discount · weight saved in your account
          </p>
        </div>

        {signedIn || auth.isAuthenticated ? (
          holdings.length > 0 ? (
          <div className="mb-4 rounded-2xl border border-emerald-200 bg-emerald-50/80 p-4">
            <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-emerald-900">
              <Wallet className="size-4" />
              Your balance
            </div>
            <ul className="space-y-1 text-sm text-emerald-900/90">
              {holdings.map((h) => (
                <li key={h.metal_key} className="flex justify-between tabular-nums">
                  <span>
                    {metal === 'gold' ? GOLD_LABELS[h.metal_key] || h.metal_key : 'Silver'}
                  </span>
                  <strong>{h.balance_grams.toFixed(3)} g</strong>
                </li>
              ))}
            </ul>
          </div>
          ) : null
        ) : null}

        <div className="kc-profile-card space-y-4 rounded-2xl p-4 sm:p-5">
          {metal === 'gold' && config.tiers.length > 1 ? (
            <label className="block text-sm">
              <span className="font-medium text-[var(--color-jewelry-black,#1a1814)]/80">Purity</span>
              <select
                className="kc-input mt-1 w-full"
                value={selectedMetalKey}
                onChange={(e) => setSelectedMetalKey(e.target.value)}
              >
                {config.tiers.map((t) => (
                  <option key={t.metal_key} value={t.metal_key}>
                    {GOLD_LABELS[t.metal_key] || t.metal_key} — {formatErpInr(t.effective_rate_per_gram)}/g
                  </option>
                ))}
              </select>
            </label>
          ) : selectedTier ? (
            <div className="rounded-xl bg-[var(--color-slate-900,#faf8f4)] p-3 text-sm">
              <p className="text-[var(--color-jewelry-black,#1a1814)]/55">Effective rate</p>
              <p className="text-xl font-bold tabular-nums text-[var(--color-jewelry-black,#1a1814)]">
                {formatErpInr(selectedTier.effective_rate_per_gram)}
                <span className="text-sm font-normal text-[var(--color-jewelry-black,#1a1814)]/55"> / g</span>
              </p>
              {selectedTier.discount_inr > 0 ? (
                <p className="mt-1 text-xs text-emerald-700">
                  Today {formatErpInr(selectedTier.retail_rate_per_gram)}/g − ₹
                  {selectedTier.discount_inr} discount
                </p>
              ) : null}
            </div>
          ) : null}

          <label className="block text-sm">
            <span className="font-medium text-[var(--color-jewelry-black,#1a1814)]/80">Amount (₹)</span>
            <input
              type="number"
              min={100}
              step={100}
              inputMode="numeric"
              className="kc-input mt-1 w-full text-lg tabular-nums"
              placeholder="e.g. 22900"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </label>

          {amountNum >= 100 && selectedTier ? (
            <p className="rounded-xl border border-[var(--kc-accent,#c41e3a)]/20 bg-[var(--kc-accent,#c41e3a)]/[0.06] px-3 py-2 text-center text-sm font-semibold text-[var(--kc-accent,#c41e3a)]">
              You will accumulate ≈ {previewGrams.toFixed(3)} g
            </p>
          ) : null}

          {!signedIn && !auth.isAuthenticated ? (
            <button
              type="button"
              className="kc-btn-theme flex min-h-[48px] w-full items-center justify-center gap-2"
              onClick={() => setSignInOpen(true)}
            >
              <ShieldCheck className="size-4" />
              Sign in to pay
            </button>
          ) : (
            <button
              type="button"
              className="kc-btn-theme flex min-h-[48px] w-full items-center justify-center gap-2"
              disabled={payBusy || !scriptReady || !config.payments_configured}
              onClick={() => void handlePay()}
            >
              {payBusy ? <Loader2 className="size-4 animate-spin" /> : null}
              Pay with Razorpay
            </button>
          )}

          {!config.payments_configured ? (
            <p className="text-center text-xs text-amber-800">Online payments coming soon at this store.</p>
          ) : null}
        </div>

        {payMsg ? (
          <p
            className={`mt-4 rounded-xl px-3 py-2 text-sm ${
              payMsg.startsWith('Success')
                ? 'border border-emerald-200 bg-emerald-50 text-emerald-900'
                : 'border border-rose-200 bg-rose-50 text-rose-800'
            }`}
          >
            {payMsg}
          </p>
        ) : null}
      </div>

      <SharedCatalogSignInModal
        open={signInOpen}
        onOpenChange={setSignInOpen}
        otpEnabled={config.otp_enabled}
        onVerified={(id) => {
          setIdentity(id)
          setSignedIn(true)
          void loadWallet()
        }}
        digiStore={storeBody}
      />
    </>
  )
}

export function DigiPurchaseClient({ metal }: { metal: 'gold' | 'silver' }) {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[50vh] items-center justify-center">
          <Loader2 className="size-8 animate-spin text-[var(--color-jewelry-black,#1a1814)]/40" />
        </div>
      }
    >
      <DigiPurchaseInner metal={metal} />
    </Suspense>
  )
}

'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Script from 'next/script'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import axios from '@/lib/axios'
import { useAuth } from '@/hooks/useAuth'
import { useResellerBranding } from '@/context/ResellerBrandingContext'
import SharedCatalogSignInModal, {
  type SharedCatalogCustomerIdentity,
} from '@/components/shared-catalog/SharedCatalogSignInModal'
import { formatErpInr } from '@/lib/reseller-erp-modules'
import { buildWhatsAppBusinessChatLink } from '@/lib/whatsapp'
import { toWhatsAppWaMeDigits } from '@/lib/cart-order-whatsapp'
import { DIGI_GOLD_PATH, DIGI_SILVER_PATH } from '@/lib/routes'
import {
  CalendarClock,
  Gem,
  History,
  Loader2,
  MessageCircle,
  ShieldCheck,
  Wallet,
} from 'lucide-react'

type RazorpayCtor = new (opts: Record<string, unknown>) => { open: () => void }
type MetalPage = 'gold' | 'silver' | 'all'

type DigiTier = {
  metal_key: string
  retail_rate_per_gram: number
  discount_inr: number
  effective_rate_per_gram: number
}

type DigiScheme = {
  id: number
  product_type: 'gold' | 'silver'
  scheme_name: string
  description?: string | null
  installment_inr?: number | null
  duration_months?: number | null
  bonus_months?: number | null
  bonus_description?: string | null
  metal_key?: string | null
  terms_and_conditions?: string | null
}

type DigiConfig = {
  business_name: string
  metal: string
  tiers: DigiTier[]
  all_tiers?: DigiTier[]
  payments_configured: boolean
  razorpay_key_id: string | null
  otp_enabled: boolean
  updated_at?: string | null
  support_whatsapp?: string | null
  gst_note?: string | null
  settings?: {
    standard_discount_per_gram: number
    exception_making_charge_pct: number
    exception_weight_under_grams: number
    raw_metal_wastage_pct: number
    shipping_charge_inr: number
    terms_and_conditions?: string | null
  }
  schemes?: DigiScheme[]
}

type Holding = { metal_key: string; balance_grams: number }
type Txn = {
  id: number
  metal_key: string
  amount_inr: number
  grams: number
  effective_rate_per_gram: number
  paid_at?: string | null
  created_at: string
  source?: string | null
}
type Enrollment = {
  id: number
  scheme_id: number
  scheme_name?: string | null
  product_type?: string | null
  metal_key: string
  installment_inr: number
  duration_months: number
  bonus_months: number
  months_paid: number
  months_remaining: number
  bonus_credited: boolean
  status: string
}
type Redemption = {
  id: number
  metal_key: string
  grams: number
  item_kind: string
  status: string
  doorstep?: boolean
  created_at: string
}

const GOLD_LABELS: Record<string, string> = {
  gold_24k: '24K (999)',
  gold_22k: '22K (916)',
  gold_18k: '18K (750)',
  silver: 'Silver (999)',
}

const REDEEM_KINDS = [
  { id: 'jewellery_standard', label: 'Standard jewellery (₹/g off + 0 making)' },
  { id: 'antique', label: 'Antique' },
  { id: 'purity_925', label: '92.5 purity' },
  { id: 'under_25g', label: 'Under 25 g' },
  { id: 'raw_bar', label: 'Raw bar' },
  { id: 'coin', label: 'Minted coin' },
] as const

function gramsPreview(amount: number, rate: number) {
  if (amount <= 0 || rate <= 0) return 0
  return Math.round((amount / rate) * 1_000_000) / 1_000_000
}

function amountPreview(grams: number, rate: number) {
  if (grams <= 0 || rate <= 0) return 0
  return Math.round(grams * rate * 100) / 100
}

function metalLabel(key: string) {
  return GOLD_LABELS[key] || key
}

function apiErr(e: unknown, fallback: string) {
  return (e as { response?: { data?: { error?: string } } })?.response?.data?.error || fallback
}

export function DigiStoreApp({ metal }: { metal: MetalPage }) {
  const auth = useAuth()
  const rb = useResellerBranding()
  const searchParams = useSearchParams()
  const inviteCode = searchParams.get('code') || searchParams.get('invite') || ''

  const [config, setConfig] = useState<DigiConfig | null>(null)
  const [loadErr, setLoadErr] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [signInOpen, setSignInOpen] = useState(false)
  const [nav, setNav] = useState<'buy' | 'plans' | 'wallet' | 'support'>('buy')
  const [buyMetal, setBuyMetal] = useState<'gold' | 'silver'>(metal === 'silver' ? 'silver' : 'gold')
  const [selectedMetalKey, setSelectedMetalKey] = useState('')
  const [amount, setAmount] = useState('')
  const [grams, setGrams] = useState('')
  const [lastEdited, setLastEdited] = useState<'amount' | 'grams'>('amount')
  const [payBusy, setPayBusy] = useState(false)
  const [payMsg, setPayMsg] = useState<string | null>(null)
  const [holdings, setHoldings] = useState<Holding[]>([])
  const [transactions, setTransactions] = useState<Txn[]>([])
  const [enrollments, setEnrollments] = useState<Enrollment[]>([])
  const [redemptions, setRedemptions] = useState<Redemption[]>([])
  const [profile, setProfile] = useState<{ name: string; mobile: string } | null>(null)
  const [scriptReady, setScriptReady] = useState(false)
  const [identity, setIdentity] = useState<SharedCatalogCustomerIdentity | null>(null)
  const [signedIn, setSignedIn] = useState(false)
  const [planTab, setPlanTab] = useState<'open' | 'active' | 'closed' | 'terms'>('open')
  const [walletTab, setWalletTab] = useState<'tx' | 'redeem'>('tx')
  const [redeemKind, setRedeemKind] = useState<string>('jewellery_standard')
  const [redeemGrams, setRedeemGrams] = useState('')
  const [redeemMetal, setRedeemMetal] = useState('')
  const [doorstep, setDoorstep] = useState(false)
  const [redeemNotes, setRedeemNotes] = useState('')
  const [redeemBusy, setRedeemBusy] = useState(false)
  const [schemePayId, setSchemePayId] = useState<number | null>(null)

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
      const res = await axios.get<DigiConfig>('/api/public/digi/config', { params: storeQuery })
      setConfig(res.data)
      const first =
        (metal === 'silver'
          ? res.data.tiers.find((t) => t.metal_key === 'silver')
          : res.data.tiers.find((t) => t.metal_key.startsWith('gold_'))) || res.data.tiers[0]
      if (first) setSelectedMetalKey(first.metal_key)
    } catch (e: unknown) {
      setLoadErr(apiErr(e, 'Could not load rates.'))
      setConfig(null)
    } finally {
      setLoading(false)
    }
  }, [storeQuery, metal])

  const loadWallet = useCallback(async () => {
    if (!signedIn && !auth.isAuthenticated) return
    try {
      const res = await axios.get<{
        holdings: Holding[]
        transactions?: Txn[]
        enrollments?: Enrollment[]
        redemptions?: Redemption[]
        profile?: { name: string; mobile: string }
      }>('/api/public/digi/wallet', { params: storeQuery, withCredentials: true })
      setHoldings(res.data.holdings || [])
      setTransactions(res.data.transactions || [])
      setEnrollments(res.data.enrollments || [])
      setRedemptions(res.data.redemptions || [])
      if (res.data.profile) setProfile(res.data.profile)
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

  const allTiers = config?.all_tiers?.length ? config.all_tiers : config?.tiers || []
  const buyTiers = useMemo(() => {
    const src = allTiers
    if (metal === 'gold' || buyMetal === 'gold') return src.filter((t) => t.metal_key.startsWith('gold_'))
    if (metal === 'silver' || buyMetal === 'silver') return src.filter((t) => t.metal_key === 'silver')
    return src
  }, [allTiers, metal, buyMetal])

  const selectedTier = buyTiers.find((t) => t.metal_key === selectedMetalKey) || buyTiers[0]
  const amountNum = Number(amount) || 0
  const gramsNum = Number(grams) || 0
  const previewGrams = selectedTier
    ? lastEdited === 'amount'
      ? gramsPreview(amountNum, selectedTier.effective_rate_per_gram)
      : gramsNum
    : 0
  const previewAmount = selectedTier
    ? lastEdited === 'grams'
      ? amountPreview(gramsNum, selectedTier.effective_rate_per_gram)
      : amountNum
    : 0

  const productTitle =
    metal === 'gold' ? 'DigiGold' : metal === 'silver' ? 'DigiSilver' : 'DigiGold & DigiSilver'
  const brandName = config?.business_name || rb.businessName || 'Jeweller'
  const isAuthed = signedIn || auth.isAuthenticated
  const gstNote = config?.gst_note || '+ 3% GST applicable'
  const schemes = (config?.schemes || []).filter((s) => {
    if (metal === 'gold') return s.product_type === 'gold'
    if (metal === 'silver') return s.product_type === 'silver'
    return true
  })
  const activeEnrollments = enrollments.filter((e) => e.status === 'active')
  const closedEnrollments = enrollments.filter((e) => e.status !== 'active')
  const supportDigits = config?.support_whatsapp || rb.contactPhoneDigits || ''
  const supportHref = supportDigits
    ? buildWhatsAppBusinessChatLink(
        `Hi ${brandName}! I need help with ${productTitle}. I'm sending a screenshot / voice note of a failed transaction.`,
        toWhatsAppWaMeDigits(supportDigits),
      )
    : null

  useEffect(() => {
    if (!selectedTier) return
    if (lastEdited === 'amount' && amountNum >= 0) {
      const g = gramsPreview(amountNum, selectedTier.effective_rate_per_gram)
      setGrams(g > 0 ? String(Number(g.toFixed(4))) : '')
    }
  }, [amountNum, selectedTier, lastEdited])

  useEffect(() => {
    if (!selectedTier) return
    if (lastEdited === 'grams' && gramsNum >= 0) {
      const a = amountPreview(gramsNum, selectedTier.effective_rate_per_gram)
      setAmount(a > 0 ? String(a) : '')
    }
  }, [gramsNum, selectedTier, lastEdited])

  useEffect(() => {
    if (selectedTier && !buyTiers.some((t) => t.metal_key === selectedMetalKey)) {
      setSelectedMetalKey(selectedTier.metal_key)
    }
  }, [buyTiers, selectedMetalKey, selectedTier])

  const openRazorpay = async (opts: { amountInr: number; metalKey: string; schemeId?: number }) => {
    if (!isAuthed) {
      setSignInOpen(true)
      return
    }
    if (!config?.payments_configured || !config.razorpay_key_id) {
      setPayMsg('Online payments are not set up yet. Please contact the store.')
      return
    }
    if (opts.amountInr < 100) {
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
          metal_key: opts.metalKey,
          amount_inr: opts.amountInr,
          scheme_id: opts.schemeId || undefined,
        },
        { withCredentials: true },
      )
      const { digi_order_id, razorpay_order_id, razorpay_key_id, grams: g } = orderRes.data
      if (!(window as Window & { Razorpay?: RazorpayCtor }).Razorpay) {
        setPayMsg('Payment gateway failed to load. Refresh and try again.')
        return
      }
      const Razorpay = (window as Window & { Razorpay: RazorpayCtor }).Razorpay
      const rzp = new Razorpay({
        key: razorpay_key_id,
        amount: Math.round(opts.amountInr * 100),
        currency: 'INR',
        name: brandName,
        description: `${productTitle} — ${g.toFixed(3)} g`,
        order_id: razorpay_order_id,
        handler: async (response: {
          razorpay_order_id: string
          razorpay_payment_id: string
          razorpay_signature: string
        }) => {
          try {
            const verify = await axios.post<{ ok: boolean; grams: number; bonus_grams?: number; holdings: Holding[] }>(
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
            const bonus = verify.data.bonus_grams || 0
            setPayMsg(
              bonus > 0
                ? `Success! ${verify.data.grams.toFixed(3)} g added, plus ${bonus.toFixed(3)} g maturity bonus.`
                : `Success! ${verify.data.grams.toFixed(3)} g added to your account.`,
            )
            setAmount('')
            setGrams('')
            void loadWallet()
          } catch (err: unknown) {
            setPayMsg(
              apiErr(
                err,
                'Payment received but verification failed. Contact the store with your payment ID.',
              ),
            )
          }
        },
        prefill: {
          contact:
            identity?.mobile ||
            profile?.mobile ||
            String((auth.user as { mobile_number?: string } | undefined)?.mobile_number || ''),
          name:
            identity?.name ||
            profile?.name ||
            String((auth.user as { name?: string } | undefined)?.name || ''),
        },
        theme: { color: '#c41e3a' },
      })
      rzp.open()
    } catch (e: unknown) {
      setPayMsg(apiErr(e, 'Could not start payment.'))
    } finally {
      setPayBusy(false)
      setSchemePayId(null)
    }
  }

  const handlePay = async () => {
    if (!selectedTier) return
    await openRazorpay({ amountInr: previewAmount, metalKey: selectedTier.metal_key })
  }

  const payScheme = async (scheme: DigiScheme) => {
    const inst = Number(scheme.installment_inr) || 0
    const mk =
      scheme.metal_key && GOLD_LABELS[scheme.metal_key]
        ? scheme.metal_key
        : scheme.product_type === 'silver'
          ? 'silver'
          : selectedTier?.metal_key || 'gold_22k'
    setSchemePayId(scheme.id)
    await openRazorpay({ amountInr: inst, metalKey: mk, schemeId: scheme.id })
  }

  const submitRedeem = async () => {
    if (!isAuthed) {
      setSignInOpen(true)
      return
    }
    const g = Number(redeemGrams) || 0
    const mk = redeemMetal || holdings[0]?.metal_key || selectedTier?.metal_key
    if (!mk || g <= 0) {
      setPayMsg('Enter grams to redeem')
      return
    }
    setRedeemBusy(true)
    setPayMsg(null)
    try {
      const res = await axios.post<{ holdings: Holding[] }>(
        '/api/public/digi/redeem',
        {
          ...storeBody,
          metal_key: mk,
          grams: g,
          item_kind: redeemKind,
          doorstep,
          notes: redeemNotes,
        },
        { withCredentials: true },
      )
      setHoldings(res.data.holdings || [])
      setRedeemGrams('')
      setPayMsg('Redemption requested. The store will confirm availability and dispatch.')
      void loadWallet()
    } catch (e: unknown) {
      setPayMsg(apiErr(e, 'Could not submit redemption.'))
    } finally {
      setRedeemBusy(false)
    }
  }

  const productShareHref = supportDigits
    ? buildWhatsAppBusinessChatLink(
        `Hi ${brandName}! I'd like to redeem my ${productTitle} balance. Sharing a product screenshot to confirm availability and dispatch.`,
        toWhatsAppWaMeDigits(supportDigits),
      )
    : null

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

  const liveGold24 = allTiers.find((t) => t.metal_key === 'gold_24k')
  const liveGold22 = allTiers.find((t) => t.metal_key === 'gold_22k')
  const liveSilver = allTiers.find((t) => t.metal_key === 'silver')

  return (
    <>
      <Script
        src="https://checkout.razorpay.com/v1/checkout.js"
        strategy="lazyOnload"
        onLoad={() => setScriptReady(true)}
      />

      <div className="mx-auto max-w-md px-4 pb-12 pt-5 sm:pt-8">
        <div className="mb-5 text-center">
          <div className="mx-auto mb-3 flex size-14 items-center justify-center rounded-2xl bg-[var(--kc-accent,#c41e3a)]/10 ring-1 ring-[var(--kc-accent,#c41e3a)]/20">
            <Gem className="size-7 text-[var(--kc-accent,#c41e3a)]" />
          </div>
          <h1 className="text-2xl font-bold text-[var(--color-jewelry-black,#1a1814)]">{productTitle}</h1>
          <p className="mt-1 text-sm text-[var(--color-jewelry-black,#1a1814)]/60">{brandName}</p>
          <p className="mt-2 text-xs text-[var(--color-jewelry-black,#1a1814)]/45">
            Buy online · weight saved in your account
          </p>
        </div>

        <div className="mb-4 overflow-hidden rounded-2xl border border-[var(--color-slate-700,#e8e4df)] bg-white">
          <div className="grid grid-cols-3 divide-x divide-[var(--color-slate-700,#e8e4df)]">
            {[
              { label: 'Gold 24K', tier: liveGold24 },
              { label: 'Gold 22K', tier: liveGold22 },
              { label: 'Silver', tier: liveSilver },
            ].map((cell) => (
              <div key={cell.label} className="px-2 py-3 text-center">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-jewelry-black,#1a1814)]/45">
                  {cell.label}
                </p>
                <p className="mt-1 text-sm font-bold tabular-nums text-[var(--color-jewelry-black,#1a1814)]">
                  {cell.tier?.effective_rate_per_gram
                    ? formatErpInr(cell.tier.effective_rate_per_gram)
                    : '—'}
                </p>
                <p className="text-[10px] text-[var(--color-jewelry-black,#1a1814)]/45">/g</p>
              </div>
            ))}
          </div>
          <p className="border-t border-[var(--color-slate-700,#e8e4df)] bg-[var(--color-slate-900,#faf8f4)] px-3 py-1.5 text-center text-[11px] font-medium text-[var(--color-jewelry-black,#1a1814)]/65">
            {gstNote}
          </p>
        </div>

        <div className="mb-4 grid grid-cols-4 gap-1 rounded-2xl border border-[var(--color-slate-700,#e8e4df)] bg-white p-1">
          {(
            [
              ['buy', 'Buy', Gem],
              ['plans', 'Plans', CalendarClock],
              ['wallet', 'Wallet', Wallet],
              ['support', 'Help', MessageCircle],
            ] as const
          ).map(([id, label, Icon]) => (
            <button
              key={id}
              type="button"
              className={`flex min-h-[48px] flex-col items-center justify-center gap-0.5 rounded-xl text-[11px] font-semibold ${
                nav === id
                  ? 'bg-emerald-50 !text-[#1a1814] ring-1 ring-emerald-300/60'
                  : 'text-[var(--color-jewelry-black,#1a1814)]/60'
              }`}
              onClick={() => setNav(id)}
            >
              <Icon className="size-4" />
              {label}
            </button>
          ))}
        </div>

        {metal === 'all' ? (
          <div className="mb-4 grid grid-cols-2 gap-2">
            <Link
              href={inviteCode ? `${DIGI_GOLD_PATH}?code=${encodeURIComponent(inviteCode)}` : DIGI_GOLD_PATH}
              className="rounded-xl border border-[var(--color-slate-700,#e8e4df)] bg-white px-3 py-3 text-center text-sm font-semibold text-[var(--color-jewelry-black,#1a1814)]"
            >
              DigiGold
            </Link>
            <Link
              href={inviteCode ? `${DIGI_SILVER_PATH}?code=${encodeURIComponent(inviteCode)}` : DIGI_SILVER_PATH}
              className="rounded-xl border border-[var(--color-slate-700,#e8e4df)] bg-white px-3 py-3 text-center text-sm font-semibold text-[var(--color-jewelry-black,#1a1814)]"
            >
              DigiSilver
            </Link>
          </div>
        ) : null}

        {isAuthed ? (
          <div className="mb-4 rounded-2xl border border-emerald-200 bg-emerald-50/80 p-4">
            <div className="mb-1 flex items-center gap-2 text-sm font-semibold text-[#14532d]">
              <Wallet className="size-4" />
              {profile?.name || identity?.name || 'Your account'}
            </div>
            {profile?.mobile || identity?.mobile ? (
              <p className="mb-2 text-xs tabular-nums text-[#14532d]/70">
                {profile?.mobile || identity?.mobile}
              </p>
            ) : null}
            {holdings.length > 0 ? (
              <ul className="space-y-1 text-sm text-[#14532d]">
                {holdings.map((h) => (
                  <li key={h.metal_key} className="flex justify-between tabular-nums">
                    <span>{metalLabel(h.metal_key)}</span>
                    <strong>{Number(h.balance_grams).toFixed(3)} g</strong>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-[#14532d]/70">No metal balance yet — buy or start a plan.</p>
            )}
          </div>
        ) : null}

        {nav === 'buy' ? (
          <div className="kc-profile-card space-y-4 rounded-2xl p-4 sm:p-5">
            <p className="text-sm font-semibold text-[var(--color-jewelry-black,#1a1814)]">
              Advance Digi {buyMetal === 'gold' ? 'Gold' : 'Silver'} — Quick buy
            </p>
            {metal === 'all' ? (
              <div className="flex gap-2">
                {(['gold', 'silver'] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    className={`min-h-[40px] flex-1 rounded-xl border px-3 text-sm font-semibold ${
                      buyMetal === m
                        ? 'border-emerald-600 bg-emerald-50 !text-[#1a1814] ring-1 ring-emerald-300/60'
                        : 'border-[var(--color-slate-700,#e8e4df)] bg-white text-[var(--color-jewelry-black,#1a1814)]'
                    }`}
                    onClick={() => {
                      setBuyMetal(m)
                      setSelectedMetalKey(m === 'silver' ? 'silver' : 'gold_22k')
                    }}
                  >
                    {m === 'gold' ? 'Gold' : 'Silver'}
                  </button>
                ))}
              </div>
            ) : null}

            {buyTiers.length > 1 ? (
              <label className="block text-sm">
                <span className="font-medium text-[var(--color-jewelry-black,#1a1814)]">Purity</span>
                <select
                  className="kc-input mt-1 w-full"
                  value={selectedMetalKey}
                  onChange={(e) => setSelectedMetalKey(e.target.value)}
                >
                  {buyTiers.map((t) => (
                    <option key={t.metal_key} value={t.metal_key}>
                      {metalLabel(t.metal_key)} — {formatErpInr(t.effective_rate_per_gram)}/g
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
                  <p className="mt-1 text-xs text-emerald-800">
                    Today {formatErpInr(selectedTier.retail_rate_per_gram)}/g − ₹
                    {selectedTier.discount_inr} discount
                  </p>
                ) : null}
              </div>
            ) : null}

            <div className="grid grid-cols-2 gap-3">
              <label className="block text-sm">
                <span className="font-medium text-[var(--color-jewelry-black,#1a1814)]">Amount (₹)</span>
                <input
                  type="number"
                  min={100}
                  step={100}
                  inputMode="decimal"
                  className="kc-input mt-1 w-full text-lg tabular-nums"
                  placeholder="e.g. 1000"
                  value={amount}
                  onChange={(e) => {
                    setLastEdited('amount')
                    setAmount(e.target.value)
                  }}
                />
              </label>
              <label className="block text-sm">
                <span className="font-medium text-[var(--color-jewelry-black,#1a1814)]">Grams</span>
                <input
                  type="number"
                  min={0}
                  step={0.001}
                  inputMode="decimal"
                  className="kc-input mt-1 w-full text-lg tabular-nums"
                  placeholder="g"
                  value={grams}
                  onChange={(e) => {
                    setLastEdited('grams')
                    setGrams(e.target.value)
                  }}
                />
              </label>
            </div>

            {previewAmount >= 100 && selectedTier ? (
              <p className="rounded-xl border border-[var(--kc-accent,#c41e3a)]/20 bg-[var(--kc-accent,#c41e3a)]/[0.06] px-3 py-2 text-center text-sm font-semibold text-[var(--kc-accent,#c41e3a)]">
                You will accumulate ≈ {previewGrams.toFixed(3)} g
              </p>
            ) : null}

            {!isAuthed ? (
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
                {payBusy && !schemePayId ? <Loader2 className="size-4 animate-spin" /> : null}
                Proceed to pay
              </button>
            )}
            <p className="text-center text-[11px] text-[var(--color-jewelry-black,#1a1814)]/45">
              UPI (GPay, Paytm), Cards &amp; Netbanking via Razorpay
            </p>
          </div>
        ) : null}

        {nav === 'plans' ? (
          <div className="space-y-3">
            <div className="flex gap-1 overflow-x-auto rounded-xl border border-[var(--color-slate-700,#e8e4df)] bg-white p-1">
              {(
                [
                  ['open', 'Plans'],
                  ['active', 'Active A/c'],
                  ['closed', 'Closed A/c'],
                  ['terms', 'T&C'],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  className={`min-h-[40px] flex-1 whitespace-nowrap rounded-lg px-2 text-xs font-semibold ${
                    planTab === id
                      ? 'bg-emerald-50 !text-[#1a1814] ring-1 ring-emerald-300/60'
                      : 'text-[var(--color-jewelry-black,#1a1814)]/70'
                  }`}
                  onClick={() => setPlanTab(id)}
                >
                  {label}
                </button>
              ))}
            </div>

            {planTab === 'open' ? (
              schemes.length === 0 ? (
                <p className="rounded-2xl border border-[var(--color-slate-700,#e8e4df)] bg-white px-4 py-8 text-center text-sm text-[var(--color-jewelry-black,#1a1814)]/55">
                  No monthly schemes yet. Ask the store to add a plan.
                </p>
              ) : (
                schemes.map((s) => (
                  <div key={s.id} className="kc-profile-card rounded-2xl p-4">
                    <p className="font-semibold text-[var(--color-jewelry-black,#1a1814)]">{s.scheme_name}</p>
                    {s.description ? (
                      <p className="mt-1 text-xs text-[var(--color-jewelry-black,#1a1814)]/60">{s.description}</p>
                    ) : null}
                    <p className="mt-2 text-sm text-[var(--color-jewelry-black,#1a1814)]">
                      {formatErpInr(Number(s.installment_inr) || 0)} / month
                      {s.duration_months ? ` · ${s.duration_months} months` : ''}
                      {s.bonus_months ? ` · +${s.bonus_months} bonus month` : ''}
                    </p>
                    <button
                      type="button"
                      className="kc-btn-theme mt-3 flex min-h-[44px] w-full items-center justify-center gap-2"
                      disabled={payBusy || !Number(s.installment_inr)}
                      onClick={() => void payScheme(s)}
                    >
                      {payBusy && schemePayId === s.id ? <Loader2 className="size-4 animate-spin" /> : null}
                      Pay this month
                    </button>
                  </div>
                ))
              )
            ) : null}

            {planTab === 'active' || planTab === 'closed' ? (
              !isAuthed ? (
                <button type="button" className="kc-btn-theme min-h-[48px] w-full" onClick={() => setSignInOpen(true)}>
                  Sign in to view accounts
                </button>
              ) : (
                <ul className="space-y-2">
                  {(planTab === 'active' ? activeEnrollments : closedEnrollments).length === 0 ? (
                    <li className="rounded-2xl border border-[var(--color-slate-700,#e8e4df)] bg-white px-4 py-8 text-center text-sm text-[var(--color-jewelry-black,#1a1814)]/55">
                      No {planTab === 'active' ? 'active' : 'closed'} accounts.
                    </li>
                  ) : (
                    (planTab === 'active' ? activeEnrollments : closedEnrollments).map((e) => (
                      <li key={e.id} className="kc-profile-card rounded-2xl p-4 text-sm">
                        <p className="font-semibold text-[var(--color-jewelry-black,#1a1814)]">
                          {e.scheme_name || 'Plan'}
                        </p>
                        <p className="mt-1 text-[var(--color-jewelry-black,#1a1814)]/70">
                          {e.months_paid}/{e.duration_months} months paid · {formatErpInr(e.installment_inr)}/mo
                        </p>
                        {e.bonus_credited ? (
                          <p className="mt-1 text-xs font-semibold text-emerald-800">Maturity bonus credited</p>
                        ) : null}
                        {planTab === 'active' ? (
                          <button
                            type="button"
                            className="kc-btn-theme mt-3 min-h-[44px] w-full"
                            disabled={payBusy}
                            onClick={() =>
                              void openRazorpay({
                                amountInr: e.installment_inr,
                                metalKey: e.metal_key,
                                schemeId: e.scheme_id,
                              })
                            }
                          >
                            Pay installment
                          </button>
                        ) : null}
                      </li>
                    ))
                  )}
                </ul>
              )
            ) : null}

            {planTab === 'terms' ? (
              <div className="kc-profile-card whitespace-pre-wrap rounded-2xl p-4 text-sm leading-relaxed text-[var(--color-jewelry-black,#1a1814)]">
                {config.settings?.terms_and_conditions ||
                  schemes.find((s) => s.terms_and_conditions)?.terms_and_conditions ||
                  'Pay the mentioned monthly amount. Grams are credited at the day’s effective rate. On completing all installments, a bonus equal to the extra month(s) is auto-credited. You may redeem accumulated grams at any time as per store making-charge rules. + 3% GST applicable as shown on rates.'}
              </div>
            ) : null}
          </div>
        ) : null}

        {nav === 'wallet' ? (
          <div className="space-y-3">
            <div className="flex gap-1 rounded-xl border border-[var(--color-slate-700,#e8e4df)] bg-white p-1">
              <button
                type="button"
                className={`flex min-h-[40px] flex-1 items-center justify-center gap-1 rounded-lg text-sm font-semibold ${
                  walletTab === 'tx' ? 'bg-emerald-50 !text-[#1a1814] ring-1 ring-emerald-300/60' : 'text-[var(--color-jewelry-black,#1a1814)]/70'
                }`}
                onClick={() => setWalletTab('tx')}
              >
                <History className="size-4" />
                Transactions
              </button>
              <button
                type="button"
                className={`flex min-h-[40px] flex-1 items-center justify-center gap-1 rounded-lg text-sm font-semibold ${
                  walletTab === 'redeem' ? 'bg-emerald-50 !text-[#1a1814] ring-1 ring-emerald-300/60' : 'text-[var(--color-jewelry-black,#1a1814)]/70'
                }`}
                onClick={() => setWalletTab('redeem')}
              >
                Redeem
              </button>
            </div>

            {!isAuthed ? (
              <button type="button" className="kc-btn-theme min-h-[48px] w-full" onClick={() => setSignInOpen(true)}>
                Sign in to view wallet
              </button>
            ) : walletTab === 'tx' ? (
              <ul className="overflow-hidden rounded-2xl border border-[var(--color-slate-700,#e8e4df)] bg-white">
                {transactions.length === 0 ? (
                  <li className="px-4 py-8 text-center text-sm text-[var(--color-jewelry-black,#1a1814)]/55">
                    No payments yet.
                  </li>
                ) : (
                  transactions.map((t) => (
                    <li
                      key={t.id}
                      className="flex items-start justify-between gap-3 border-t border-[var(--color-slate-700,#e8e4df)] px-3 py-3 first:border-t-0"
                    >
                      <div>
                        <p className="text-sm font-semibold text-[var(--color-jewelry-black,#1a1814)]">
                          {metalLabel(t.metal_key)}
                        </p>
                        <p className="text-[11px] text-[var(--color-jewelry-black,#1a1814)]/55">
                          {new Date(t.paid_at || t.created_at).toLocaleString('en-IN')}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-bold tabular-nums text-emerald-800">
                          +{Number(t.grams).toFixed(3)} g
                        </p>
                        <p className="text-[11px] tabular-nums text-[var(--color-jewelry-black,#1a1814)]/55">
                          {formatErpInr(Number(t.amount_inr))}
                        </p>
                      </div>
                    </li>
                  ))
                )}
              </ul>
            ) : (
              <div className="kc-profile-card space-y-3 rounded-2xl p-4">
                <p className="text-sm font-semibold text-[var(--color-jewelry-black,#1a1814)]">
                  Redeem accumulated grams
                </p>
                <p className="text-xs text-[var(--color-jewelry-black,#1a1814)]/60">
                  Partial or full, any time. Standard jewellery: ₹
                  {config.settings?.standard_discount_per_gram ?? 4}/g off retail, zero making. Antique / 92.5 / under{' '}
                  {config.settings?.exception_weight_under_grams ?? 25} g: {config.settings?.exception_making_charge_pct ?? 50}% making.
                </p>
                <label className="block text-sm">
                  <span className="font-medium text-[var(--color-jewelry-black,#1a1814)]">Metal</span>
                  <select
                    className="kc-input mt-1 w-full"
                    value={redeemMetal || holdings[0]?.metal_key || ''}
                    onChange={(e) => setRedeemMetal(e.target.value)}
                  >
                    {holdings.map((h) => (
                      <option key={h.metal_key} value={h.metal_key}>
                        {metalLabel(h.metal_key)} — {Number(h.balance_grams).toFixed(3)} g
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block text-sm">
                  <span className="font-medium text-[var(--color-jewelry-black,#1a1814)]">Grams</span>
                  <input
                    className="kc-input mt-1 w-full tabular-nums"
                    inputMode="decimal"
                    value={redeemGrams}
                    onChange={(e) => setRedeemGrams(e.target.value)}
                  />
                </label>
                <label className="block text-sm">
                  <span className="font-medium text-[var(--color-jewelry-black,#1a1814)]">Item type</span>
                  <select
                    className="kc-input mt-1 w-full"
                    value={redeemKind}
                    onChange={(e) => setRedeemKind(e.target.value)}
                  >
                    {REDEEM_KINDS.map((k) => (
                      <option key={k.id} value={k.id}>
                        {k.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex min-h-[44px] items-center gap-2 text-sm text-[var(--color-jewelry-black,#1a1814)]">
                  <input type="checkbox" checked={doorstep} onChange={(e) => setDoorstep(e.target.checked)} />
                  Insured doorstep shipping
                  {config.settings?.shipping_charge_inr
                    ? ` (+${formatErpInr(config.settings.shipping_charge_inr)})`
                    : ''}
                </label>
                <label className="block text-sm">
                  <span className="font-medium text-[var(--color-jewelry-black,#1a1814)]">Notes</span>
                  <textarea
                    className="kc-input mt-1 min-h-[72px] w-full py-2"
                    value={redeemNotes}
                    onChange={(e) => setRedeemNotes(e.target.value)}
                    placeholder="Design preference, size, city…"
                  />
                </label>
                <button
                  type="button"
                  className="kc-btn-theme flex min-h-[48px] w-full items-center justify-center gap-2"
                  disabled={redeemBusy}
                  onClick={() => void submitRedeem()}
                >
                  {redeemBusy ? <Loader2 className="size-4 animate-spin" /> : null}
                  Request redemption
                </button>
                {productShareHref ? (
                  <a
                    href={productShareHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 text-sm font-semibold text-[#14532d]"
                  >
                    <MessageCircle className="size-4" />
                    WhatsApp product screenshot
                  </a>
                ) : null}
                {redemptions.length ? (
                  <ul className="space-y-1 text-xs text-[var(--color-jewelry-black,#1a1814)]/70">
                    {redemptions.slice(0, 5).map((r) => (
                      <li key={r.id}>
                        {Number(r.grams).toFixed(3)} g {metalLabel(r.metal_key)} · {r.status}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            )}
          </div>
        ) : null}

        {nav === 'support' ? (
          <div className="kc-profile-card space-y-3 rounded-2xl p-4">
            <p className="font-semibold text-[var(--color-jewelry-black,#1a1814)]">Need help?</p>
            <p className="text-sm text-[var(--color-jewelry-black,#1a1814)]/70">
              Drop a voice note or screenshot of a failed payment. The store team will fix it.
            </p>
            {supportHref ? (
              <a
                href={supportHref}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl bg-[#25D366] text-sm font-semibold text-white"
              >
                <MessageCircle className="size-4" />
                Message on WhatsApp
              </a>
            ) : (
              <p className="text-sm text-[var(--color-jewelry-black,#1a1814)]/55">
                Support number is not set yet. Call the store directly.
              </p>
            )}
          </div>
        ) : null}

        {payMsg ? (
          <p
            className={`mt-4 rounded-xl px-3 py-2 text-sm ${
              payMsg.startsWith('Success') || payMsg.startsWith('Redemption')
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

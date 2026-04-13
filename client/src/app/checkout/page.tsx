'use client'

import { Suspense, useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ChevronLeft, Wallet, Sparkles, Info, Tag, X, CheckCircle2, Landmark, BookMarked } from 'lucide-react'
import { useCart } from '@/context/CartContext'
import { useAuth } from '@/hooks/useAuth'
import { isDiamondItem } from '@/lib/pricing'
import { useLoginModal } from '@/context/LoginModalContext'
import { useCustomerTier } from '@/context/CustomerTierContext'
import { CATALOG_PATH, CHECKOUT_PATH } from '@/lib/routes'
import axios from '@/lib/axios'
import { toPaise } from '@/lib/utils'
import { getItemWeight } from '@/lib/pricing'
import { normalizeCatalogImageSrc } from '@/lib/normalize-image-url'
import { productImageWellClass } from '@/lib/product-image-theme'

declare global {
  interface Window {
    Razorpay: any
  }
}

const RAZORPAY_KEY = process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID || ''

type RedeemableSip = {
  id: number
  plan_name: string
  metal_type?: string | null
  total_paid: number
  total_grams_accumulated: number
  jeweler_benefit_amount: number
  redemption_value: number
}

function CheckoutContent() {
  const router = useRouter()
  const { items, remove, ratesReady } = useCart()
  const auth = useAuth()
  const { hasWholesaleAccess, tierReady } = useCustomerTier()
  const { open: openLoginModal } = useLoginModal()
  const [loading, setLoading] = useState(false)
  const [scriptLoaded, setScriptLoaded] = useState(false)
  const [redeemableSips, setRedeemableSips] = useState<RedeemableSip[]>([])
  const [sipsLoading, setSipsLoading] = useState(true)
  const [applySipId, setApplySipId] = useState<number | null>(null)
  const [promoCode, setPromoCode] = useState('')
  const [promoLoading, setPromoLoading] = useState(false)
  const [promoError, setPromoError] = useState<string | null>(null)
  const [appliedPromo, setAppliedPromo] = useState<{
    promo_code_id: number
    code: string
    discount_amount: number
    description?: string | null
  } | null>(null)

  const grandTotal = items.reduce((sum, i) => sum + i.price * i.qty, 0)
  const isWholesaleCheckout = Boolean(auth.isAuthenticated && hasWholesaleAccess && tierReady)

  const loadRedeemableSips = useCallback(async () => {
    if (!auth.isAuthenticated) {
      setSipsLoading(false)
      return
    }
    setSipsLoading(true)
    try {
      const res = await axios.get('/api/user/sips/redeemable')
      setRedeemableSips(Array.isArray(res.data) ? res.data : [])
    } catch {
      setRedeemableSips([])
    } finally {
      setSipsLoading(false)
    }
  }, [auth.isAuthenticated])

  useEffect(() => {
    if (isWholesaleCheckout) {
      setSipsLoading(false)
      return
    }
    loadRedeemableSips()
  }, [loadRedeemableSips, isWholesaleCheckout])

  useEffect(() => {
    if (!auth.hasChecked) return
    if (!auth.isAuthenticated && items.length > 0) {
      openLoginModal(CHECKOUT_PATH)
      return
    }
    if (isWholesaleCheckout) {
      setScriptLoaded(false)
      return
    }
    const script = document.createElement('script')
    script.src = 'https://checkout.razorpay.com/v1/checkout.js'
    script.async = true
    script.onload = () => setScriptLoaded(true)
    document.body.appendChild(script)
    return () => {
      if (script.parentNode) document.body.removeChild(script)
    }
  }, [auth.isAuthenticated, auth.hasChecked, items.length, openLoginModal, isWholesaleCheckout])

  const hasMetalItems = items.some((ci) => !isDiamondItem(ci.item))
  const canProceedRates = !hasMetalItems || ratesReady
  const hasZeroMetalCost = hasMetalItems && items.some((ci) => {
    if (isDiamondItem(ci.item)) return false
    const b = (ci.breakdown || {}) as { metal?: number }
    return (b.metal || 0) <= 0
  })
  const payDisabledRates = !canProceedRates || hasZeroMetalCost

  const selectedSip = applySipId ? redeemableSips.find((s) => s.id === applySipId) : null
  const sipRedemptionValue = selectedSip ? selectedSip.redemption_value : 0
  const canApplySip = selectedSip && grandTotal >= selectedSip.redemption_value
  const promoDiscount = appliedPromo?.discount_amount ?? 0
  const afterSipTotal = Math.max(0, grandTotal - (canApplySip ? sipRedemptionValue : 0))
  const finalPayableAmount = Math.max(0, afterSipTotal - promoDiscount)
  const isFullSipRedemption = canApplySip && afterSipTotal === 0

  const handleApplyPromo = async () => {
    const code = promoCode.trim().toUpperCase()
    if (!code) {
      setPromoError('Enter a promo code')
      return
    }
    setPromoError(null)
    setPromoLoading(true)
    try {
      const res = await axios.post('/api/promos/validate', { code, cart_total: grandTotal })
      const data = res.data
      if (data.valid && data.discount_amount > 0) {
        setAppliedPromo({
          promo_code_id: data.promo_code_id,
          code: data.code,
          discount_amount: data.discount_amount,
          description: data.description,
        })
        setPromoCode('')
      } else {
        setPromoError('Discount could not be applied')
      }
    } catch (err: unknown) {
      const msg = err && typeof err === 'object' && 'response' in err
        ? (err as { response?: { data?: { error?: string } } }).response?.data?.error
        : 'Invalid promo code'
      setPromoError(msg || 'Invalid promo code')
    } finally {
      setPromoLoading(false)
    }
  }

  const handleRemovePromo = () => {
    setAppliedPromo(null)
    setPromoError(null)
  }

  const handleB2bPlace = async (checkoutType: 'NEFT' | 'LEDGER') => {
    if (items.length === 0) return
    if (payDisabledRates) return
    setLoading(true)
    try {
      const res = await axios.post<{ order_id: number }>('/api/checkout/b2b-create-order', {
        b2b_checkout_type: checkoutType,
        items: items.map((ci) => ({
          id: ci.id,
          item: ci.item,
          qty: ci.qty,
          price: ci.price,
          breakdown: ci.breakdown,
        })),
      })
      const id = res.data?.order_id
      items.forEach((ci) => remove(ci.id))
      router.push(id ? `/checkout/b2b-success?orderId=${id}` : '/checkout/b2b-success')
    } catch (err: unknown) {
      const msg =
        err && typeof err === 'object' && 'response' in err
          ? (err as { response?: { data?: { error?: string } } }).response?.data?.error
          : 'Could not place purchase order'
      alert(msg || 'Could not place purchase order')
    } finally {
      setLoading(false)
    }
  }

  const handlePay = async () => {
    if (items.length === 0) return
    if (payDisabledRates) return
    if (!canApplySip && applySipId) {
      return
    }
    if (finalPayableAmount > 0 && (!scriptLoaded || !RAZORPAY_KEY)) {
      alert('Payment is loading. Please try again in a moment.')
      return
    }
    setLoading(true)
    try {
      const payload: {
        items: unknown[]
        sip_user_sip_id?: number
        sip_redemption_amount?: number
        promo_code_id?: number
        promo_discount_amount?: number
      } = {
        items: items.map((ci) => ({
          id: ci.id,
          item: ci.item,
          qty: ci.qty,
          price: ci.price,
          breakdown: ci.breakdown,
        })),
      }
      if (canApplySip && selectedSip) {
        payload.sip_user_sip_id = selectedSip.id
        payload.sip_redemption_amount = selectedSip.redemption_value
      }
      if (appliedPromo && appliedPromo.discount_amount > 0) {
        payload.promo_code_id = appliedPromo.promo_code_id
        payload.promo_discount_amount = appliedPromo.discount_amount
      }
      const res = await axios.post('/api/checkout/create-order', payload)
      const { razorpay_order_id, amount, key_id } = res.data

      if (amount === 0 || isFullSipRedemption) {
        items.forEach((ci) => remove(ci.id))
        router.push('/checkout/success')
        return
      }

      const options = {
        key: key_id || RAZORPAY_KEY,
        amount: toPaise(amount),
        currency: 'INR',
        name: 'KC Jewellers',
        description: 'Jewellery Order',
        order_id: razorpay_order_id,
        handler: () => {
          items.forEach((ci) => remove(ci.id))
          router.push('/checkout/success')
        },
        modal: {
          ondismiss: () => setLoading(false),
        },
      }
      const rzp = new window.Razorpay(options)
      rzp.open()
    } catch (err: unknown) {
      const msg = err && typeof err === 'object' && 'response' in err
        ? (err as { response?: { data?: { error?: string } } }).response?.data?.error
        : 'Failed to create order'
      alert(msg || 'Failed to create order')
    } finally {
      setLoading(false)
    }
  }

  if (!auth.hasChecked) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="text-slate-400">Checking authentication…</div>
      </div>
    )
  }
  if (!auth.isAuthenticated && items.length > 0) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-6">
        <p className="text-slate-400 mb-6">Sign in to proceed to checkout</p>
        <button
          onClick={() => openLoginModal('/checkout')}
          className="px-6 py-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold"
        >
          Sign In
        </button>
      </div>
    )
  }
  if (!auth.isAuthenticated && items.length === 0) {
    return (
      <div className="min-h-screen bg-slate-950 p-4">
        <Link href={CATALOG_PATH} className="inline-flex items-center gap-2 text-slate-400 hover:text-amber-500 mb-6">
          <ChevronLeft className="size-4" />
          Back to Catalog
        </Link>
        <div className="max-w-md mx-auto text-center py-16">
          <p className="text-slate-300 text-lg">Your cart is empty</p>
          <Link href={CATALOG_PATH} className="mt-4 inline-block px-6 py-3 rounded-lg bg-amber-500 text-slate-950 font-semibold hover:bg-amber-400">
            Browse Catalog
          </Link>
        </div>
      </div>
    )
  }

  if (items.length === 0) {
    return (
      <div className="min-h-screen bg-slate-950 p-4">
        <Link href={CATALOG_PATH} className="inline-flex items-center gap-2 text-slate-400 hover:text-amber-500 mb-6">
          <ChevronLeft className="size-4" />
          Back to Catalog
        </Link>
        <div className="max-w-md mx-auto text-center py-16">
          <p className="text-slate-300 text-lg">Your cart is empty</p>
          <Link href={CATALOG_PATH} className="mt-4 inline-block px-6 py-3 rounded-lg bg-amber-500 text-slate-950 font-semibold hover:bg-amber-400">
            Browse Catalog
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="max-w-lg mx-auto px-4 py-6 pb-28 md:pb-32">
        <Link href={CATALOG_PATH} className="inline-flex items-center gap-2 text-slate-400 hover:text-amber-500 mb-6">
          <ChevronLeft className="size-4" />
          Back to Catalog
        </Link>

        <h1 className="text-xl font-semibold text-slate-200 mb-6">Checkout</h1>

        <div className="space-y-3 mb-6">
          {items.map((ci) => {
            const lineTotal = ci.price * ci.qty
            const name = ci.item.item_name || ci.item.short_name || 'Item'
            return (
              <div key={ci.id} className="flex gap-3 p-4 rounded-xl border border-white/10 bg-slate-800/30">
                {ci.item.image_url ? (
                  <div className={`w-16 h-16 shrink-0 rounded-lg overflow-hidden ${productImageWellClass}`}>
                    <img
                      src={normalizeCatalogImageSrc(ci.item.image_url) || ci.item.image_url}
                      alt={name}
                      className="w-full h-full object-contain"
                      loading="lazy"
                      decoding="async"
                    />
                  </div>
                ) : (
                  <div className="w-16 h-16 rounded-lg bg-slate-800 flex items-center justify-center shrink-0">
                    <span className="text-xl font-bold text-slate-500">{name.charAt(0)}</span>
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-white truncate">{name}</div>
                  {getItemWeight(ci.item) != null && (
                    <div className="text-sm text-slate-400 mt-0.5">
                      Weight: {Number(getItemWeight(ci.item)).toFixed(2)} gm
                    </div>
                  )}
                  <div className="text-sm text-amber-400 mt-0.5">₹{Math.round(lineTotal).toLocaleString('en-IN')} × {ci.qty}</div>
                </div>
              </div>
            )
          })}
        </div>

        {/* Redeem SIP Balance Card — retail only */}
        {auth.isAuthenticated && !isWholesaleCheckout && !sipsLoading && redeemableSips.length > 0 && (
          <div className="mb-6 rounded-xl border border-amber-500/20 bg-slate-900/60 overflow-hidden">
            <div className="p-4 border-b border-white/5">
              <div className="flex items-center gap-2 mb-2">
                <Wallet className="size-5 text-amber-500" />
                <h2 className="font-semibold text-slate-200">Redeem SIP Balance</h2>
              </div>
              <p className="text-xs text-slate-500">Apply your completed SIP to reduce the order total</p>
            </div>
            <div className="p-4 space-y-3">
              {redeemableSips.map((sip) => {
                const canApply = grandTotal >= sip.redemption_value
                const isSelected = applySipId === sip.id
                return (
                  <div
                    key={sip.id}
                    className={`rounded-lg border p-4 transition-colors ${
                      isSelected ? 'border-amber-500/50 bg-amber-500/10' : 'border-white/10 bg-slate-800/30'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="font-medium text-slate-200">{sip.plan_name}</div>
                        <div className="text-sm text-slate-500 mt-0.5 capitalize">{sip.metal_type || 'Gold'}</div>
                        <div className="text-lg font-semibold text-amber-400 mt-2 tabular-nums">
                          ₹{sip.redemption_value.toLocaleString('en-IN')}
                        </div>
                      </div>
                      <button
                        onClick={() => canApply ? setApplySipId(isSelected ? null : sip.id) : undefined}
                        disabled={!canApply}
                        className={`shrink-0 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                          canApply
                            ? isSelected
                              ? 'bg-amber-500 text-slate-950'
                              : 'bg-slate-700 text-slate-200 hover:bg-slate-600 border border-slate-600'
                            : 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700'
                        }`}
                      >
                        {canApply ? (isSelected ? 'Applied' : 'Apply to Order') : 'Add more items'}
                      </button>
                    </div>
                    {!canApply && (
                      <p className="mt-2 text-xs text-amber-500/90 flex items-center gap-1">
                        <Info className="size-3.5 shrink-0" />
                        Add more items to cart to redeem this SIP. (Cart must be ≥ ₹{sip.redemption_value.toLocaleString('en-IN')})
                      </p>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Promo Code Section — retail only */}
        {!isWholesaleCheckout && (
        <div className="mb-6 rounded-xl border border-white/10 bg-slate-900/50 p-4">
          <div className="flex items-center gap-2 mb-3">
            <Tag className="size-5 text-amber-500" />
            <h3 className="font-semibold text-slate-200">Promo Code</h3>
          </div>
          {appliedPromo ? (
            <div className="flex items-center justify-between gap-3 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30">
              <div className="flex items-center gap-2 min-w-0">
                <CheckCircle2 className="size-5 text-emerald-500 shrink-0" />
                <div className="min-w-0">
                  <p className="font-medium text-emerald-400 truncate">
                    {appliedPromo.description || `${appliedPromo.code} Applied`}
                  </p>
                  <p className="text-sm text-emerald-500/80">
                    -₹{Math.round(appliedPromo.discount_amount).toLocaleString('en-IN')} discount
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleRemovePromo}
                className="shrink-0 p-2 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
                aria-label="Remove promo"
              >
                <X className="size-4" />
              </button>
            </div>
          ) : (
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="text"
                value={promoCode}
                onChange={(e) => { setPromoCode(e.target.value.toUpperCase()); setPromoError(null); }}
                placeholder="Enter code (e.g. WELCOME500)"
                className="flex-1 px-4 py-3 rounded-xl bg-slate-800 border border-slate-600 text-slate-100 placeholder:text-slate-500 focus:ring-2 focus:ring-amber-500 focus:border-transparent outline-none text-sm sm:text-base"
                disabled={promoLoading}
              />
              <button
                type="button"
                onClick={handleApplyPromo}
                disabled={promoLoading || !promoCode.trim()}
                className="px-5 py-3 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-400 font-semibold border border-amber-500/40 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {promoLoading ? 'Applying…' : 'Apply'}
              </button>
            </div>
          )}
          {promoError && (
            <p className="mt-2 text-sm text-red-400 flex items-center gap-1">
              {promoError}
            </p>
          )}
        </div>
        )}

        {/* Payment Summary */}
        <div className="rounded-xl border border-white/10 bg-slate-900/50 p-4 mb-6">
          <div className="space-y-2">
            <div className="flex justify-between text-slate-400">
              <span>Grand Total</span>
              <span className="tabular-nums">₹{Math.round(grandTotal).toLocaleString('en-IN')}</span>
            </div>
            {!isWholesaleCheckout && canApplySip && selectedSip && (
              <div className="flex justify-between text-emerald-400">
                <span>SIP Redemption ({selectedSip.plan_name})</span>
                <span className="tabular-nums">-₹{sipRedemptionValue.toLocaleString('en-IN')}</span>
              </div>
            )}
            {!isWholesaleCheckout && appliedPromo && appliedPromo.discount_amount > 0 && (
              <div className="flex justify-between text-emerald-400">
                <span>Promo ({appliedPromo.code})</span>
                <span className="tabular-nums">-₹{Math.round(appliedPromo.discount_amount).toLocaleString('en-IN')}</span>
              </div>
            )}
            <div className="flex justify-between text-lg font-semibold pt-2 border-t border-white/10">
              <span>{isWholesaleCheckout ? 'Order total (est.)' : 'Final Payable'}</span>
              <span className="text-amber-400 tabular-nums">
                ₹{Math.round(isWholesaleCheckout ? grandTotal : finalPayableAmount).toLocaleString('en-IN')}
              </span>
            </div>
          </div>
        </div>

        {isWholesaleCheckout ? (
          <div className="space-y-3">
            <p className="text-xs text-slate-500 leading-relaxed rounded-lg border border-emerald-500/20 bg-emerald-950/20 px-3 py-2">
              B2B checkout: no online card payment. Your purchase order is sent for approval. You will receive a proforma summary on the next screen.
            </p>
            <button
              type="button"
              onClick={() => handleB2bPlace('NEFT')}
              disabled={loading || payDisabledRates}
              className="w-full py-3.5 rounded-xl border border-emerald-500/40 bg-emerald-600/15 hover:bg-emerald-600/25 text-emerald-100 font-semibold disabled:opacity-60 transition-all flex items-center justify-center gap-2"
            >
              <Landmark className="size-5 shrink-0" aria-hidden />
              {loading ? 'Submitting…' : 'Place purchase order (Pay via NEFT / RTGS)'}
            </button>
            <button
              type="button"
              onClick={() => handleB2bPlace('LEDGER')}
              disabled={loading || payDisabledRates}
              className="w-full py-3.5 rounded-xl border border-amber-500/35 bg-amber-500/10 hover:bg-amber-500/15 text-amber-100 font-semibold disabled:opacity-60 transition-all flex items-center justify-center gap-2"
            >
              <BookMarked className="size-5 shrink-0" aria-hidden />
              {loading ? 'Submitting…' : 'Deduct from ledger / Khata'}
            </button>
          </div>
        ) : (
          <button
            onClick={handlePay}
            disabled={loading || payDisabledRates || (applySipId !== null && !canApplySip)}
            className="w-full py-3.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold disabled:opacity-60 transition-all flex items-center justify-center gap-2"
          >
            {loading ? (
              <>Processing…</>
            ) : payDisabledRates && hasMetalItems ? (
              <>Loading prices…</>
            ) : isFullSipRedemption ? (
              <>
                <Sparkles className="size-5" />
                Complete with SIP
              </>
            ) : finalPayableAmount > 0 ? (
              <>Pay ₹{Math.round(finalPayableAmount).toLocaleString('en-IN')} with Razorpay</>
            ) : (
              <>Pay with Razorpay</>
            )}
          </button>
        )}
      </div>
    </div>
  )
}

export default function CheckoutPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="text-slate-400 animate-pulse">Loading…</div>
      </div>
    }>
      <CheckoutContent />
    </Suspense>
  )
}

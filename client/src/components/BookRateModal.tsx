'use client'

import { useState, useEffect, useRef } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'
import axios from 'axios'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { useBookRate } from '@/context/BookRateContext'
import { useAuth } from '@/hooks/useAuth'
import { useLoginModal } from '@/context/LoginModalContext'
import { subscribeLiveRates } from '@/lib/socket'
import { toPaise } from '@/lib/utils'
import { CATALOG_PATH } from '@/lib/routes'

declare global {
  interface Window {
    Razorpay: any
  }
}

type MetalOption = { key: string; label: string; metalType: string }

const METAL_OPTIONS: MetalOption[] = [
  { key: 'gold_24k', label: 'Gold 24K', metalType: 'gold_24k' },
  { key: 'gold_22k', label: 'Gold 22K', metalType: 'gold_22k' },
  { key: 'gold_18k', label: 'Gold 18K', metalType: 'gold_18k' },
  { key: 'silver', label: 'Silver (999)', metalType: 'silver' },
]

type Rates = { gold24k_10g: number; gold22k_10g: number; gold18k_10g: number; silver_1kg: number }

function getRateForMetal(rates: Rates, metalKey: string): number {
  switch (metalKey) {
    case 'gold_24k': return rates.gold24k_10g / 10
    case 'gold_22k': return rates.gold22k_10g / 10
    case 'gold_18k': return rates.gold18k_10g / 10
    case 'silver': return rates.silver_1kg / 1000
    default: return 0
  }
}

export default function BookRateModal() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const { isOpen, close } = useBookRate()
  const auth = useAuth()
  const { open: openLoginModal } = useLoginModal()
  const [mobile, setMobile] = useState('')
  const [selectedMetal, setSelectedMetal] = useState<string>('gold_24k')
  const [rates, setRates] = useState<Rates>({ gold24k_10g: 0, gold22k_10g: 0, gold18k_10g: 0, silver_1kg: 0 })
  const [advanceAmount, setAdvanceAmount] = useState(5000)
  const [bookingWeights, setBookingWeights] = useState<{ gold: number[]; silver: number[] }>({ gold: [1, 5, 10, 50], silver: [10, 100, 1000] })
  const [weightMode, setWeightMode] = useState<'preset' | 'custom'>('preset')
  const [selectedWeight, setSelectedWeight] = useState<number>(1)
  const [customWeightInput, setCustomWeightInput] = useState('')
  const [quantity, setQuantity] = useState(1)
  const [submitting, setSubmitting] = useState(false)
  const [toastMessage, setToastMessage] = useState<string | null>(null)
  const razorpayScriptLoaded = useRef(false)

  const url = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'
  const lockedRate = getRateForMetal(rates, selectedMetal)

  // Function to dynamically inject Razorpay script
  const loadRazorpayScript = (): Promise<void> => {
    return new Promise((resolve, reject) => {
      if (razorpayScriptLoaded.current || window.Razorpay) {
        resolve()
        return
      }

      const script = document.createElement('script')
      script.src = 'https://checkout.razorpay.com/v1/checkout.js'
      script.async = true
      script.onload = () => {
        razorpayScriptLoaded.current = true
        resolve()
      }
      script.onerror = () => {
        reject(new Error('Failed to load Razorpay script'))
      }
      document.body.appendChild(script)
    })
  }

  // Load Razorpay script when modal opens
  useEffect(() => {
    if (isOpen) {
      loadRazorpayScript().catch((error) => {
        console.error('Error loading Razorpay script:', error)
      })
    }
  }, [isOpen])

  // Show toast message
  const showToast = (message: string) => {
    setToastMessage(message)
    setTimeout(() => {
      setToastMessage(null)
    }, 3000)
  }

  useEffect(() => {
    if (!isOpen) return
    const fetchAdvance = async () => {
      try {
        const res = await axios.get(`${url}/api/settings/booking-advance`)
        setAdvanceAmount(Number(res.data?.advanceAmount) || 5000)
        const bw = res.data?.bookingWeights
        if (bw && typeof bw === 'object') {
          setBookingWeights({
            gold: Array.isArray(bw.gold) ? bw.gold.filter((n: unknown) => !isNaN(Number(n)) && Number(n) > 0).map((n: unknown) => Number(n)) : [1, 5, 10, 50],
            silver: Array.isArray(bw.silver) ? bw.silver.filter((n: unknown) => !isNaN(Number(n)) && Number(n) > 0).map((n: unknown) => Number(n)) : [10, 100, 1000],
          })
        }
      } catch {
        setAdvanceAmount(5000)
      }
    }
    fetchAdvance()
  }, [isOpen, url])

  const isGold = selectedMetal.startsWith('gold')
  const weightOptions = isGold ? bookingWeights.gold : bookingWeights.silver
  const effectiveWeight = weightMode === 'custom' ? parseCustomWeight(customWeightInput) : selectedWeight
  const totalValue = effectiveWeight > 0 && lockedRate > 0 ? (effectiveWeight * quantity) * lockedRate : 0
  const payableAdvance = totalValue > 0 ? Math.min(totalValue, advanceAmount) : advanceAmount

  useEffect(() => {
    const opts = selectedMetal.startsWith('gold') ? bookingWeights.gold : bookingWeights.silver
    if (opts.length && !opts.includes(selectedWeight)) {
      setSelectedWeight(opts[0])
    }
  }, [selectedMetal, bookingWeights])

  function parseCustomWeight(input: string): number {
    const s = input.trim().toLowerCase()
    if (!s) return 0
    const num = parseFloat(s.replace(/[^\d.]/g, ''))
    if (isNaN(num) || num <= 0) return 0
    if (s.includes('kg') || s.includes('kilo')) return num * 1000
    return num
  }

  useEffect(() => {
    const fetchRates = async () => {
      try {
        const res = await fetch(`${url}/api/rates/live`)
        const data = await res.json()
        if (data.success && data.rates) {
          const r = data.rates
          setRates({
            gold24k_10g: Number(r.gold24k_10g) || 0,
            gold22k_10g: Number(r.gold22k_10g) || 0,
            gold18k_10g: Number(r.gold18k_10g) || 0,
            silver_1kg: Number(r.silver_1kg) || 0,
          })
        }
      } catch {}
    }
    fetchRates()
    const off = subscribeLiveRates((p) => {
      const arr = Array.isArray(p?.rates) ? p.rates : []
      const gold = arr.find((x: { metal_type?: string }) => (x?.metal_type || '').toLowerCase() === 'gold')
      const gold22 = arr.find((x: { metal_type?: string }) => (x?.metal_type || '').toLowerCase() === 'gold_22k')
      const silver = arr.find((x: { metal_type?: string }) => (x?.metal_type || '').toLowerCase() === 'silver')
      const rate24 = Number(gold?.display_rate || gold?.sell_rate || 0)
      const rate22 = Number(gold22?.display_rate || gold22?.sell_rate || 0)
      const rateSilver = Number(silver?.display_rate || silver?.sell_rate || 0)
      const updates: Partial<Rates> = {}
      if (rate24 > 0 || rate22 > 0) {
        const g24 = rate24 || (rate22 ? Math.round(rate22 / 0.916) : 0)
        const g22 = rate22 || (g24 ? Math.round(g24 * 0.916) : 0)
        const g18 = g24 ? Math.round(g24 * 0.75) : 0
        Object.assign(updates, { gold24k_10g: g24, gold22k_10g: g22, gold18k_10g: g18 })
      }
      if (rateSilver > 0) updates.silver_1kg = rateSilver
      if (Object.keys(updates).length) setRates((prev) => ({ ...prev, ...updates }))
    })
    return () => off()
  }, [url])

  const handleSubmit = async () => {
    if (mobile.length !== 10 || payableAdvance <= 0 || effectiveWeight <= 0 || quantity < 1) return
    if (!lockedRate || lockedRate <= 0) {
      showToast('Please wait for rates to load')
      return
    }
    if (!auth.isAuthenticated) {
      const returnTo = pathname
        ? pathname + (searchParams?.toString() ? `?${searchParams.toString()}` : '')
        : CATALOG_PATH
      openLoginModal(returnTo)
      showToast('Please sign in to continue')
      return
    }

    setSubmitting(true)
    try {
      // Ensure Razorpay script is loaded
      await loadRazorpayScript()

      if (!window.Razorpay) {
        throw new Error('Razorpay script failed to load')
      }

      // Map metal type for API (convert gold_24k to gold, etc.)
      const metalOpt = METAL_OPTIONS.find((m) => m.key === selectedMetal)
      let apiMetalType = metalOpt?.metalType || selectedMetal
      
      // Map to API metal_type (live_rates has gold, gold_22k, silver; gold_18k falls back to gold)
      if (apiMetalType.startsWith('gold')) {
        apiMetalType = apiMetalType === 'gold_22k' ? 'gold_22k' : 'gold'
      }

      // quantity_kg = (effectiveWeight in grams * quantity) / 1000
      const quantityKg = (effectiveWeight * quantity) / 1000

      const user = auth.user as { id?: number } | undefined
      const userId = user?.id ?? null

      // Call /api/booking/lock with payable advance (min of total value, standard advance)
      const response = await axios.post(`${url}/api/booking/lock`, {
        metal_type: apiMetalType,
        quantity_kg: Math.max(quantityKg, 0.001),
        amount: Math.round(payableAdvance),
        user_id: userId,
        mobile_number: mobile,
      })

      const { razorpay_order_id, amount } = response.data
      const razorpayKeyId = process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID

      if (!razorpayKeyId) {
        throw new Error('Razorpay key not configured')
      }

      // Use the amount returned by API (must match Razorpay order)
      const paymentAmount = amount || payableAdvance

      // Open Razorpay checkout modal
      const options = {
        key: razorpayKeyId,
        amount: toPaise(paymentAmount),
        currency: 'INR',
        name: 'KC Jewellers',
        description: `Rate Lock - ${metalOpt?.label || selectedMetal}`,
        order_id: razorpay_order_id,
        prefill: {
          contact: mobile,
        },
        handler: async function (rzpResponse: { razorpay_payment_id: string; razorpay_order_id: string; razorpay_signature: string }) {
          try {
            showToast('Verifying payment…')
            const verifyRes = await axios.post(`${url}/api/bookings/verify`, {
              razorpay_order_id: rzpResponse.razorpay_order_id,
              razorpay_payment_id: rzpResponse.razorpay_payment_id,
              razorpay_signature: rzpResponse.razorpay_signature,
              user_id: (auth.user as { id?: number })?.id ?? null,
              mobile_number: mobile,
            })
            if (verifyRes.data?.success) {
              showToast('Payment successful! Your rate has been locked.')
              close()
              setMobile('')
              setCustomWeightInput('')
              setWeightMode('preset')
              setQuantity(1)
            } else {
              showToast('Verification failed. Please contact support.')
            }
          } catch (err) {
            showToast('Verification failed. Please contact support.')
          } finally {
            setSubmitting(false)
          }
        },
        modal: {
          ondismiss: function () {
            // User closed the modal without payment
            setSubmitting(false)
          },
        },
        theme: {
          color: '#eab308', // Yellow-500 color
        },
      }

      const rzp = new window.Razorpay(options)
      rzp.on('payment.failed', function (response: any) {
        showToast('Payment failed. Please try again.')
        setSubmitting(false)
      })
      rzp.open()
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string }; message?: string } })?.response?.data?.error || 
                  (err as { message?: string })?.message || 
                  'Failed to initiate payment'
      showToast(msg)
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && close()}>
      <DialogContent className="bg-slate-900/95 backdrop-blur-xl border border-white/10 text-slate-100 max-w-sm sm:max-w-md max-h-[90svh] overflow-hidden grid-rows-[auto_1fr_auto] w-[calc(100vw-2rem)] sm:w-auto">
        <DialogHeader className="px-1">
          <DialogTitle className="text-yellow-500 text-lg">Book Rate</DialogTitle>
          <DialogDescription className="text-slate-400 text-xs leading-snug">
            Freeze the current market rate for your selected metal. Pay the advance amount to lock your rate for 24 hours.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-1 overflow-y-auto min-h-0 px-1 scrollbar-thin scrollbar-track-transparent scrollbar-thumb-slate-700">
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">Select Metal</label>
            <div className="flex flex-wrap gap-1.5">
              {METAL_OPTIONS.map((m) => (
                <button
                  key={m.key}
                  type="button"
                  onClick={() => setSelectedMetal(m.key)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                    selectedMetal === m.key
                      ? 'bg-yellow-500 text-slate-950'
                      : 'bg-slate-800 text-slate-300 hover:bg-slate-700 border border-slate-600'
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">Quantity</label>
            <input
              type="number"
              min={1}
              value={quantity}
              onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value, 10) || 1))}
              className="bg-slate-800 text-white border border-slate-600 p-2.5 rounded-lg w-full focus:ring-2 focus:ring-yellow-500 outline-none text-sm"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">Select Weight</label>
            <div className="flex flex-wrap gap-1.5 mb-2">
              <button
                type="button"
                onClick={() => setWeightMode('preset')}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                  weightMode === 'preset'
                    ? 'bg-yellow-500 text-slate-950'
                    : 'bg-slate-800 text-slate-300 hover:bg-slate-700 border border-slate-600'
                }`}
              >
                Preset
              </button>
              <button
                type="button"
                onClick={() => setWeightMode('custom')}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                  weightMode === 'custom'
                    ? 'bg-yellow-500 text-slate-950'
                    : 'bg-slate-800 text-slate-300 hover:bg-slate-700 border border-slate-600'
                }`}
              >
                Custom
              </button>
            </div>
            {weightMode === 'preset' ? (
              <select
                value={selectedWeight}
                onChange={(e) => setSelectedWeight(Number(e.target.value))}
                className="bg-slate-800 text-white border border-slate-600 p-2.5 rounded-lg w-full focus:ring-2 focus:ring-yellow-500 outline-none text-sm"
              >
                {weightOptions.map((w) => (
                  <option key={w} value={w}>
                    {w >= 1000 ? `${w / 1000} kg` : `${w} g`}
                  </option>
                ))}
              </select>
            ) : (
              <input
                type="text"
                value={customWeightInput}
                onChange={(e) => setCustomWeightInput(e.target.value)}
                placeholder="e.g. 25 g, 1.5 kg"
                className="bg-slate-800 text-white placeholder-slate-400 border border-slate-600 p-2.5 rounded-lg w-full focus:ring-2 focus:ring-yellow-500 outline-none text-sm"
              />
            )}
            {weightMode === 'custom' && effectiveWeight > 0 && (
              <p className="text-xs text-slate-400 mt-1">{effectiveWeight} g</p>
            )}
          </div>

          <div className="rounded-lg bg-slate-800/80 border border-slate-600 p-2.5 flex items-center justify-between">
            <p className="text-xs text-slate-400">Current rate (per gram)</p>
            <p className="text-base font-semibold text-yellow-500 tabular-nums">
              ₹{Math.round(lockedRate).toLocaleString('en-IN')}
            </p>
          </div>

          {totalValue > 0 && (
            <div className="rounded-lg bg-slate-800/80 border border-slate-600 p-2.5 flex items-center justify-between">
              <p className="text-xs text-slate-400">Total value</p>
              <p className="text-base font-semibold text-slate-100 tabular-nums">
                ₹{Math.round(totalValue).toLocaleString('en-IN')}
              </p>
            </div>
          )}

          <div>
            <label htmlFor="mobile" className="block text-xs font-medium text-slate-400 mb-1.5">
              Mobile Number
            </label>
            <input
              id="mobile"
              type="tel"
              placeholder="10-digit mobile number"
              value={mobile}
              onChange={(e) => setMobile(e.target.value.replace(/\D/g, '').slice(0, 10))}
              className="bg-slate-800 text-white placeholder-slate-400 border border-slate-600 p-2.5 rounded-lg w-full focus:ring-2 focus:ring-yellow-500 outline-none text-sm"
            />
          </div>

          <div className="rounded-lg bg-yellow-500/10 border border-yellow-500/20 p-3">
            <p className="text-sm text-slate-300">
              Pay <span className="text-yellow-500 font-semibold">₹{Math.round(payableAdvance).toLocaleString('en-IN')}</span> advance to freeze your rate.
            </p>
            <p className="text-xs text-slate-400 mt-0.5">
              {totalValue > 0 && totalValue < advanceAmount
                ? 'Total value is less than standard advance — you pay only the total value.'
                : 'Advance will be adjusted against your final purchase.'}
            </p>
          </div>
        </div>

        <DialogFooter className="flex flex-col sm:flex-row gap-2 sm:gap-3 sm:justify-end pt-1">
          <Button
            variant="outline"
            onClick={close}
            className="w-full sm:w-auto order-2 sm:order-1 border-slate-500 text-slate-200 hover:bg-slate-800 hover:text-slate-100"
          >
            Cancel
          </Button>
          <Button
            className="w-full sm:w-auto order-1 sm:order-2 bg-yellow-500 hover:bg-yellow-400 text-slate-950 font-semibold"
            disabled={mobile.length !== 10 || submitting || effectiveWeight <= 0 || quantity < 1 || payableAdvance <= 0}
            onClick={handleSubmit}
          >
            {submitting ? 'Processing…' : `Pay ₹${Math.round(payableAdvance).toLocaleString('en-IN')} & Freeze`}
          </Button>
        </DialogFooter>
      </DialogContent>

      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[9999] transition-all duration-300 ease-out">
          <div className="bg-yellow-500 text-slate-950 px-6 py-3 rounded-lg shadow-xl font-medium text-sm flex items-center gap-2 border-2 border-yellow-400 min-w-[200px] max-w-[90vw]">
            <svg
              className="w-5 h-5 flex-shrink-0"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <span className="whitespace-nowrap">{toastMessage}</span>
          </div>
        </div>
      )}
    </Dialog>
  )
}

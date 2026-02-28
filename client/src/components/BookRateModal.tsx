'use client'

import { useState, useEffect } from 'react'
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
import { subscribeLiveRates } from '@/lib/socket'

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
  const { isOpen, close } = useBookRate()
  const [mobile, setMobile] = useState('')
  const [selectedMetal, setSelectedMetal] = useState<string>('gold_24k')
  const [rates, setRates] = useState<Rates>({ gold24k_10g: 0, gold22k_10g: 0, gold18k_10g: 0, silver_1kg: 0 })
  const [advanceAmount, setAdvanceAmount] = useState(5000)
  const [bookingWeights, setBookingWeights] = useState<{ gold: number[]; silver: number[] }>({ gold: [1, 5, 10, 50], silver: [10, 100, 1000] })
  const [weightMode, setWeightMode] = useState<'preset' | 'custom'>('preset')
  const [selectedWeight, setSelectedWeight] = useState<number>(1)
  const [customWeightInput, setCustomWeightInput] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const url = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000'
  const lockedRate = getRateForMetal(rates, selectedMetal)

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
    if (mobile.length !== 10 || advanceAmount <= 0 || effectiveWeight <= 0) return
    setSubmitting(true)
    try {
      const metalOpt = METAL_OPTIONS.find((m) => m.key === selectedMetal)
      const metalType = metalOpt?.metalType || selectedMetal
      await axios.post(`${url}/api/bookings/advance`, {
        metalType,
        weight: effectiveWeight,
        lockedRate: Math.round(lockedRate * 100) / 100,
        mobileNumber: mobile,
        advancePaid: advanceAmount,
      })
      close()
      setMobile('')
      setCustomWeightInput('')
      setWeightMode('preset')
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Failed to create booking'
      alert(msg)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && close()}>
      <DialogContent className="bg-slate-900/95 backdrop-blur-xl border border-white/10 text-slate-100 max-w-sm max-h-[90svh] overflow-hidden grid-rows-[auto_1fr_auto]">
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
              Pay <span className="text-yellow-500 font-semibold">₹{advanceAmount.toLocaleString('en-IN')}</span> advance to freeze your rate.
            </p>
            <p className="text-xs text-slate-400 mt-0.5">
              Advance will be adjusted against your final purchase.
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
            disabled={mobile.length !== 10 || submitting || effectiveWeight <= 0}
            onClick={handleSubmit}
          >
            {submitting ? 'Processing…' : `Pay ₹${advanceAmount.toLocaleString('en-IN')} & Freeze`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

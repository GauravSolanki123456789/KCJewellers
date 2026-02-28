'use client'

import { useState, useEffect } from 'react'
import axios from '@/lib/axios'
import AdminGuard from '@/components/AdminGuard'
import Link from 'next/link'
import { TrendingUp, ArrowLeft, BookMarked, Settings, Save } from 'lucide-react'

const INPUT_CLASS = 'bg-slate-800 text-white placeholder-slate-400 border border-slate-600 p-3 rounded-lg w-full focus:ring-2 focus:ring-yellow-500/50 outline-none'

export default function AdminRatesPage() {
  const [goldImportDutyPercent, setGoldImportDutyPercent] = useState(15)
  const [silverPremiumPercent, setSilverPremiumPercent] = useState(12)
  const [defaultMc22kPerGram, setDefaultMc22kPerGram] = useState(500)
  const [defaultMc18kPerGram, setDefaultMc18kPerGram] = useState(450)
  const [advanceAmount, setAdvanceAmount] = useState(5000)
  const [goldWeightsInput, setGoldWeightsInput] = useState('1, 5, 10, 50')
  const [silverWeightsInput, setSilverWeightsInput] = useState('10, 100, 1000')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [loading, setLoading] = useState(true)

  const url = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000'

  useEffect(() => {
    const load = async () => {
      try {
        const res = await axios.get(`${url}/api/admin/settings/margins`, { withCredentials: true })
        const d = res.data || {}
        setGoldImportDutyPercent(Number(d.goldImportDutyPercent) || 15)
        setSilverPremiumPercent(Number(d.silverPremiumPercent) || 12)
        setDefaultMc22kPerGram(Number(d.defaultMc22kPerGram) || 500)
        setDefaultMc18kPerGram(Number(d.defaultMc18kPerGram) || 450)
        setAdvanceAmount(Number(d.advanceAmount) || 5000)
        const bw = d.bookingWeights || {}
        setGoldWeightsInput(Array.isArray(bw.gold) ? bw.gold.join(', ') : '1, 5, 10, 50')
        setSilverWeightsInput(Array.isArray(bw.silver) ? bw.silver.join(', ') : '10, 100, 1000')
      } catch {
        // keep defaults
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [url])

  const handleSave = async () => {
    setSaving(true)
    setSaved(false)
    try {
      await axios.put(
        `${url}/api/admin/settings/margins`,
        {
          goldImportDutyPercent,
          silverPremiumPercent,
          defaultMc22kPerGram,
          defaultMc18kPerGram,
          advanceAmount,
          bookingWeights: {
            gold: goldWeightsInput.split(/[,\s]+/).map((s) => parseFloat(s.trim())).filter((n) => !isNaN(n) && n > 0),
            silver: silverWeightsInput.split(/[,\s]+/).map((s) => parseFloat(s.trim())).filter((n) => !isNaN(n) && n > 0),
          },
        },
        { withCredentials: true }
      )
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch {
      alert('Failed to save settings')
    } finally {
      setSaving(false)
    }
  }

  return (
    <AdminGuard>
      <div className="min-h-screen bg-slate-950 text-slate-100">
        <main className="max-w-4xl mx-auto px-4 py-8 pb-24">
          <Link href="/admin" className="inline-flex items-center gap-2 text-slate-400 hover:text-yellow-500 mb-6 transition-colors">
            <ArrowLeft className="size-4" /> Back to Dashboard
          </Link>

          <div className="bg-slate-900/50 backdrop-blur-xl border border-white/10 rounded-xl overflow-hidden">
            <div className="p-4 sm:p-6 border-b border-white/10">
              <div className="flex items-center gap-2">
                <TrendingUp className="size-6 text-yellow-500" />
                <h1 className="text-xl font-semibold text-slate-200">Live Rates & Margins</h1>
              </div>
              <p className="text-slate-500 text-sm mt-1">
                Set gold/silver premiums, making charges, and rate booking advance.
              </p>
            </div>

            {loading ? (
              <div className="p-12 text-center text-slate-400">Loading settings…</div>
            ) : (
              <div className="p-4 sm:p-6 space-y-8">
                {/* Section 1: Global Settings */}
                <section className="rounded-xl bg-slate-800/30 border border-white/10 p-5">
                  <div className="flex items-center gap-2 mb-4">
                    <Settings className="size-5 text-yellow-500" />
                    <h2 className="text-lg font-semibold text-slate-200">Global Settings</h2>
                  </div>
                  <div className="grid sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-400 mb-2">Gold Import Duty / Premium (%)</label>
                      <input
                        type="number"
                        min={0}
                        step={0.5}
                        value={goldImportDutyPercent}
                        onChange={(e) => setGoldImportDutyPercent(Math.max(0, parseFloat(e.target.value) || 0))}
                        className={INPUT_CLASS}
                        placeholder="e.g. 15"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-400 mb-2">Silver Premium (%)</label>
                      <input
                        type="number"
                        min={0}
                        step={0.5}
                        value={silverPremiumPercent}
                        onChange={(e) => setSilverPremiumPercent(Math.max(0, parseFloat(e.target.value) || 0))}
                        className={INPUT_CLASS}
                        placeholder="e.g. 12"
                      />
                    </div>
                  </div>
                </section>

                {/* Section 2: Default Making Charges */}
                <section className="rounded-xl bg-slate-800/30 border border-white/10 p-5">
                  <h2 className="text-lg font-semibold text-slate-200 mb-4">Default Making Charges</h2>
                  <p className="text-slate-500 text-sm mb-4">
                    Per-gram making charges applied when not overridden at product level.
                  </p>
                  <div className="grid sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-400 mb-2">Default MC for 22K (₹ per gram)</label>
                      <div className="flex items-center gap-2">
                        <span className="text-slate-500">₹</span>
                        <input
                          type="number"
                          min={0}
                          step={10}
                          value={defaultMc22kPerGram}
                          onChange={(e) => setDefaultMc22kPerGram(Math.max(0, parseFloat(e.target.value) || 0))}
                          className={INPUT_CLASS}
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-400 mb-2">Default MC for 18K (₹ per gram)</label>
                      <div className="flex items-center gap-2">
                        <span className="text-slate-500">₹</span>
                        <input
                          type="number"
                          min={0}
                          step={10}
                          value={defaultMc18kPerGram}
                          onChange={(e) => setDefaultMc18kPerGram(Math.max(0, parseFloat(e.target.value) || 0))}
                          className={INPUT_CLASS}
                        />
                      </div>
                    </div>
                  </div>
                </section>

                {/* Section 3: Allowed Booking Weights */}
                <section className="rounded-xl bg-slate-800/30 border border-white/10 p-5">
                  <h2 className="text-lg font-semibold text-slate-200 mb-4">Allowed Booking Weights (Grams)</h2>
                  <p className="text-slate-500 text-sm mb-4">
                    Comma-separated weights in grams. Customers can pick from these or enter a custom weight when booking/freezing a rate.
                  </p>
                  <div className="grid sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-400 mb-2">Gold (grams)</label>
                      <input
                        type="text"
                        value={goldWeightsInput}
                        onChange={(e) => setGoldWeightsInput(e.target.value)}
                        className={INPUT_CLASS}
                        placeholder="e.g. 1, 5, 10, 50"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-400 mb-2">Silver (grams)</label>
                      <input
                        type="text"
                        value={silverWeightsInput}
                        onChange={(e) => setSilverWeightsInput(e.target.value)}
                        className={INPUT_CLASS}
                        placeholder="e.g. 10, 100, 1000"
                      />
                    </div>
                  </div>
                </section>

                {/* Section 4: Rate Booking Advance */}
                <section className="rounded-xl bg-slate-800/30 border border-yellow-500/20 p-5">
                  <div className="flex items-center gap-2 mb-4">
                    <BookMarked className="size-5 text-yellow-500" />
                    <h2 className="text-lg font-semibold text-slate-200">Rate Booking Advance Amount</h2>
                  </div>
                  <p className="text-slate-500 text-sm mb-4">
                    This amount is shown when users freeze a rate in the Book Rate modal. The user must pay this advance to lock their rate.
                  </p>
                  <div className="flex items-center gap-2">
                    <span className="text-slate-400">₹</span>
                    <input
                      type="number"
                      min={0}
                      step={100}
                      value={advanceAmount}
                      onChange={(e) => setAdvanceAmount(Math.max(0, parseInt(e.target.value, 10) || 0))}
                      className={`${INPUT_CLASS} w-40`}
                    />
                  </div>
                </section>

                {/* Save Button */}
                <div className="pt-2">
                  <button
                    onClick={handleSave}
                    disabled={saving}
                    className="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-yellow-500 hover:bg-yellow-400 text-slate-950 font-semibold disabled:opacity-60 transition-colors"
                  >
                    <Save className="size-4" />
                    {saving ? 'Saving…' : saved ? 'Saved' : 'Save Settings'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </main>
      </div>
    </AdminGuard>
  )
}

'use client'

import { useEffect, useState, useCallback } from 'react'
import { subscribeLiveRates } from '@/lib/socket'
import { useBookRate } from '@/context/BookRateContext'
import { usePullToRefresh } from '@/hooks/usePullToRefresh'
import { Button } from '@/components/ui/button'
import { BookMarked, AlertTriangle } from 'lucide-react'

type Rates = {
  gold24k_10g: number
  gold22k_10g: number
  gold18k_10g: number
  silver_1kg: number
}

const GOLD_PURITIES = [
  { key: '24K', label: '24K (999)', get1g: (r: Rates) => r.gold24k_10g / 10, get10g: (r: Rates) => r.gold24k_10g },
  { key: '22K', label: '22K (916)', get1g: (r: Rates) => r.gold22k_10g / 10, get10g: (r: Rates) => r.gold22k_10g },
  { key: '18K', label: '18K (750)', get1g: (r: Rates) => r.gold18k_10g / 10, get10g: (r: Rates) => r.gold18k_10g },
] as const

const SILVER_ROW = { key: 'Ag', label: 'Silver (999)', get1g: (r: Rates) => r.silver_1kg / 1000, get1kg: (r: Rates) => r.silver_1kg }

const PULL_THRESHOLD = 80

function formatPrice(n: number) {
  return `₹${Math.round(n).toLocaleString('en-IN')}`
}

export default function Home() {
  const [rates, setRates] = useState<Rates>({ gold24k_10g: 0, gold22k_10g: 0, gold18k_10g: 0, silver_1kg: 0 })
  const [source, setSource] = useState<string>('live')
  const [loading, setLoading] = useState(true)
  const { open: openBookRate } = useBookRate()

  const fetchRates = useCallback(async () => {
    try {
      const url = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000'
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
        if (data.source) setSource(String(data.source))
      }
    } catch {
      // keep previous state
    } finally {
      setLoading(false)
    }
  }, [])

  const { pullY, isRefreshing, handleTouchStart, handleTouchMove, handleTouchEnd } = usePullToRefresh(fetchRates)

  useEffect(() => {
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
      if (Object.keys(updates).length) setRates(prev => ({ ...prev, ...updates }))
    })
    return () => off()
  }, [])

  const isEstimated = source === 'estimated'

  return (
    <div
      className="relative min-h-screen bg-slate-950 text-slate-100"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {pullY > 0 && (
        <div
          className="absolute top-0 left-0 right-0 w-full text-center text-slate-400 transition-all z-50 py-2 text-xs"
          style={{ opacity: Math.min(pullY / PULL_THRESHOLD, 1) * 0.9 }}
        >
          <span>{pullY >= PULL_THRESHOLD ? 'Release to refresh' : 'Refresh'}</span>
        </div>
      )}
      {isRefreshing && (
        <div className="absolute top-0 left-0 right-0 w-full text-center transition-all z-50 py-3 text-sm text-yellow-500 bg-slate-900/90 backdrop-blur">
          Refreshing…
        </div>
      )}
      <main className="max-w-4xl mx-auto px-4 pb-24 md:pb-12">
        {/* Hero: Live Rate Board */}
        <section className="pt-6 md:pt-10">
          <div className="bg-white/5 backdrop-blur-md border border-white/10 rounded-2xl overflow-hidden">
            <div className="px-6 py-5 border-b border-white/10">
              <div className="flex items-center justify-between">
                <h1 className="text-2xl font-bold text-yellow-500">Live Gold Rates</h1>
                {isEstimated && (
                  <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-yellow-500/20 border border-yellow-500/30 text-yellow-500 text-sm flex-wrap">
                    <AlertTriangle className="size-4 shrink-0" />
                    <span>Market Closed - Estimated Rates</span>
                  </div>
                )}
              </div>
            </div>

            {loading ? (
              <div className="p-12 text-center text-slate-400">Loading rates…</div>
            ) : (
              <div className="space-y-6">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-white/10">
                        <th className="text-left py-4 px-6 text-slate-400 font-medium">Purity</th>
                        <th className="text-right py-4 px-6 text-slate-400 font-medium">1 Gram</th>
                        <th className="text-right py-4 px-6 text-slate-400 font-medium">10 Grams</th>
                        <th className="w-32" />
                      </tr>
                    </thead>
                    <tbody>
                      {GOLD_PURITIES.map((p) => (
                        <tr key={p.key} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                          <td className="py-4 px-6">
                            <span className="text-slate-300 font-medium">{p.label}</span>
                          </td>
                          <td className="py-4 px-6 text-right">
                            <span className="text-yellow-500 font-semibold tabular-nums">
                              {formatPrice(p.get1g(rates))}
                            </span>
                          </td>
                          <td className="py-4 px-6 text-right">
                            <span className="text-slate-300 font-medium tabular-nums">
                              {formatPrice(p.get10g(rates))}
                            </span>
                          </td>
                          <td className="py-4 px-4">
                            <Button
                              size="sm"
                              onClick={openBookRate}
                              className="w-full bg-yellow-500 hover:bg-yellow-400 text-slate-950 font-semibold"
                            >
                              <BookMarked className="size-4 mr-1" />
                              Book Rate
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="border-t border-white/10 pt-4">
                  <div className="px-6 pb-2 text-slate-400 font-medium text-sm">Silver</div>
                  <div className="overflow-x-auto rounded-lg border border-white/10 bg-white/[0.02]">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-white/10">
                          <th className="text-left py-3 px-6 text-slate-400 font-medium">Purity</th>
                          <th className="text-right py-3 px-6 text-slate-400 font-medium">1 Gram</th>
                          <th className="text-right py-3 px-6 text-slate-400 font-medium">1 Kg</th>
                          <th className="w-32" />
                        </tr>
                      </thead>
                      <tbody>
                        <tr className="hover:bg-white/5 transition-colors">
                          <td className="py-3 px-6">
                            <span className="text-slate-300 font-medium">{SILVER_ROW.label}</span>
                          </td>
                          <td className="py-3 px-6 text-right">
                            <span className="text-cyan-400 font-semibold tabular-nums">
                              {formatPrice(SILVER_ROW.get1g(rates))}
                            </span>
                          </td>
                          <td className="py-3 px-6 text-right">
                            <span className="text-slate-300 font-medium tabular-nums">
                              {formatPrice(SILVER_ROW.get1kg(rates))}
                            </span>
                          </td>
                          <td className="py-3 px-4">
                            <Button
                              size="sm"
                              onClick={openBookRate}
                              className="w-full bg-cyan-500/80 hover:bg-cyan-500 text-slate-950 font-semibold"
                            >
                              <BookMarked className="size-4 mr-1" />
                              Book Rate
                            </Button>
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}
          </div>
        </section>
      </main>
    </div>
  )
}

'use client'

import axios from '@/lib/axios'
import { useEffect, useState, useCallback, Suspense } from 'react'
import AdminGuard from '@/components/AdminGuard'
import Link from 'next/link'
import { Scale, ArrowLeft, Filter, Gem, Coins, Sparkles } from 'lucide-react'

type LiabilityItem = {
  ref_id: number
  user_id: number | null
  mobile_number: string | null
  email: string | null
  plan_name: string | null
  metal_type: string
  grams: number
  amount_inr: number
  origin: 'SIP' | 'BOOKING'
  created_at: string
}

type Summary = {
  totalGoldGrams: number
  totalSilverGrams: number
  totalDiamondValue: number
}

export default function AdminLiabilitiesPage() {
  const [items, setItems] = useState<LiabilityItem[]>([])
  const [summary, setSummary] = useState<Summary>({ totalGoldGrams: 0, totalSilverGrams: 0, totalDiamondValue: 0 })
  const [loading, setLoading] = useState(true)
  const [metalFilter, setMetalFilter] = useState('')
  const [originFilter, setOriginFilter] = useState('')
  const url = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params: Record<string, string> = {}
      if (metalFilter) params.metal = metalFilter
      if (originFilter) params.origin = originFilter
      const res = await axios.get(`${url}/api/admin/liabilities`, {
        params,
        withCredentials: true,
      })
      setItems(Array.isArray(res.data?.items) ? res.data.items : [])
      setSummary(res.data?.summary || { totalGoldGrams: 0, totalSilverGrams: 0, totalDiamondValue: 0 })
    } catch {
      setItems([])
      setSummary({ totalGoldGrams: 0, totalSilverGrams: 0, totalDiamondValue: 0 })
    } finally {
      setLoading(false)
    }
  }, [metalFilter, originFilter, url])

  useEffect(() => {
    load()
  }, [load])

  const formatDate = (d: string) => {
    try {
      return new Date(d).toLocaleString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    } catch {
      return d || '—'
    }
  }

  const formatMetal = (m: string) => {
    const map: Record<string, string> = {
      gold: 'Gold',
      gold_22k: 'Gold 22K',
      gold_24k: 'Gold 24K',
      gold_18k: 'Gold 18K',
      silver: 'Silver',
      diamond: 'Diamond',
    }
    return map[m?.toLowerCase()] || m || '—'
  }

  const formatValue = (item: LiabilityItem) => {
    const metal = (item.metal_type || '').toLowerCase()
    if (metal === 'diamond') {
      return `₹${Number(item.amount_inr || 0).toLocaleString('en-IN')}`
    }
    return `${Number(item.grams || 0).toFixed(2)} g`
  }

  return (
    <Suspense fallback={<div className="min-h-screen bg-slate-950 flex items-center justify-center"><div className="text-slate-400">Loading...</div></div>}>
      <AdminGuard>
        <div className="min-h-screen bg-slate-950 text-slate-100">
          <main className="max-w-6xl mx-auto px-4 py-6 sm:py-8 pb-24">
            <Link
              href="/admin"
              className="inline-flex items-center gap-2 text-slate-400 hover:text-yellow-500 mb-6 transition-colors"
            >
              <ArrowLeft className="size-4" /> Back to Dashboard
            </Link>

            <div className="mb-6 sm:mb-8">
              <div className="flex items-center gap-2 mb-1">
                <Scale className="size-6 sm:size-7 text-yellow-500" />
                <h1 className="text-xl sm:text-2xl font-bold text-slate-200">Metal Liabilities Ledger</h1>
              </div>
              <p className="text-slate-400 text-sm">
                Total metal and cash value owed to customers across SIPs and Rate Bookings
              </p>
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 mb-6 sm:mb-8">
              <div className="rounded-xl bg-amber-500/10 border border-amber-500/20 p-4 sm:p-5">
                <div className="flex items-center gap-2 mb-1">
                  <Sparkles className="size-5 text-amber-400" />
                  <span className="text-amber-400/90 text-sm font-medium">Total Gold Owed</span>
                </div>
                <p className="text-xl sm:text-2xl font-bold text-amber-400 tabular-nums">
                  {Number(summary.totalGoldGrams || 0).toFixed(2)} g
                </p>
              </div>
              <div className="rounded-xl bg-slate-500/10 border border-slate-500/20 p-4 sm:p-5">
                <div className="flex items-center gap-2 mb-1">
                  <Coins className="size-5 text-slate-300" />
                  <span className="text-slate-300/90 text-sm font-medium">Total Silver Owed</span>
                </div>
                <p className="text-xl sm:text-2xl font-bold text-slate-300 tabular-nums">
                  {Number(summary.totalSilverGrams || 0).toFixed(2)} g
                </p>
              </div>
              <div className="rounded-xl bg-cyan-500/10 border border-cyan-500/20 p-4 sm:p-5">
                <div className="flex items-center gap-2 mb-1">
                  <Gem className="size-5 text-cyan-400" />
                  <span className="text-cyan-400/90 text-sm font-medium">Total Diamond Value Owed</span>
                </div>
                <p className="text-xl sm:text-2xl font-bold text-cyan-400 tabular-nums">
                  ₹{Number(summary.totalDiamondValue || 0).toLocaleString('en-IN')}
                </p>
              </div>
            </div>

            {/* Filters & Table */}
            <div className="bg-slate-900/50 backdrop-blur border border-white/10 rounded-xl overflow-hidden">
              <div className="p-4 sm:p-6 border-b border-white/10">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                  <div className="flex items-center gap-2">
                    <Filter className="size-5 text-slate-400" />
                    <span className="text-slate-400 text-sm font-medium">Filters</span>
                  </div>
                  <div className="flex flex-wrap gap-3">
                    <div>
                      <label className="block text-xs text-slate-500 mb-1">Metal</label>
                      <select
                        value={metalFilter}
                        onChange={(e) => setMetalFilter(e.target.value)}
                        className="px-3 py-2 rounded-lg bg-slate-800/80 border border-white/10 text-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-500/50 min-w-[120px]"
                      >
                        <option value="">All</option>
                        <option value="gold">Gold</option>
                        <option value="silver">Silver</option>
                        <option value="diamond">Diamond</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs text-slate-500 mb-1">Origin</label>
                      <select
                        value={originFilter}
                        onChange={(e) => setOriginFilter(e.target.value)}
                        className="px-3 py-2 rounded-lg bg-slate-800/80 border border-white/10 text-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-500/50 min-w-[120px]"
                      >
                        <option value="">All</option>
                        <option value="sips">SIPs</option>
                        <option value="bookings">Bookings</option>
                      </select>
                    </div>
                  </div>
                </div>
              </div>

              {loading ? (
                <div className="p-12 text-center text-slate-400">Loading liabilities…</div>
              ) : items.length === 0 ? (
                <div className="p-12 text-center">
                  <Scale className="size-12 text-slate-600 mx-auto mb-4" />
                  <p className="text-slate-400">No liabilities found</p>
                  <p className="text-slate-500 text-sm mt-1">
                    SIP and Rate Booking liabilities will appear here.
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[600px]">
                    <thead>
                      <tr className="border-b border-white/10 bg-slate-800/30">
                        <th className="text-left py-3 px-3 sm:px-4 text-slate-400 font-medium text-xs sm:text-sm">Ref</th>
                        <th className="text-left py-3 px-3 sm:px-4 text-slate-400 font-medium text-xs sm:text-sm">Metal</th>
                        <th className="text-left py-3 px-3 sm:px-4 text-slate-400 font-medium text-xs sm:text-sm">Origin</th>
                        <th className="text-left py-3 px-3 sm:px-4 text-slate-400 font-medium text-xs sm:text-sm">Customer</th>
                        <th className="text-right py-3 px-3 sm:px-4 text-slate-400 font-medium text-xs sm:text-sm">Value</th>
                        <th className="text-left py-3 px-3 sm:px-4 text-slate-400 font-medium text-xs sm:text-sm hidden sm:table-cell">Date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((item) => (
                        <tr
                          key={`${item.origin}-${item.ref_id}`}
                          className="border-b border-white/5 hover:bg-white/5 transition-colors"
                        >
                          <td className="py-3 px-3 sm:px-4 text-slate-300 font-medium text-sm">#{item.ref_id}</td>
                          <td className="py-3 px-3 sm:px-4 text-slate-300 text-sm">{formatMetal(item.metal_type)}</td>
                          <td className="py-3 px-3 sm:px-4">
                            <span
                              className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${
                                item.origin === 'SIP'
                                  ? 'bg-amber-500/20 text-amber-400'
                                  : 'bg-rose-500/20 text-rose-400'
                              }`}
                            >
                              {item.origin}
                            </span>
                          </td>
                          <td className="py-3 px-3 sm:px-4 text-slate-300 text-sm">
                            {item.mobile_number || item.email || `User #${item.user_id || '—'}`}
                          </td>
                          <td className="py-3 px-3 sm:px-4 text-right font-medium tabular-nums text-sm">
                            <span className={(item.metal_type || '').toLowerCase() === 'diamond' ? 'text-cyan-400' : 'text-yellow-500/90'}>
                              {formatValue(item)}
                            </span>
                          </td>
                          <td className="py-3 px-3 sm:px-4 text-slate-400 text-xs sm:text-sm hidden sm:table-cell">{formatDate(item.created_at)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </main>
        </div>
      </AdminGuard>
    </Suspense>
  )
}

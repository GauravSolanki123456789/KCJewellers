'use client'

import { useState, useEffect, useCallback } from 'react'
import axios from '@/lib/axios'
import AdminGuard from '@/components/AdminGuard'
import Link from 'next/link'
import { BookMarked, ArrowLeft } from 'lucide-react'

type Booking = {
  id: number
  mobile_number?: string
  metal_type?: string
  locked_gold_rate?: number
  advance_amount?: number
  status: string
  created_at: string
}

const METAL_OPTIONS = [
  { value: '', label: 'All Metals' },
  { value: 'gold_24k', label: 'Gold 24K' },
  { value: 'gold_22k', label: 'Gold 22K' },
  { value: 'gold_18k', label: 'Gold 18K' },
  { value: 'silver', label: 'Silver' },
]

export default function AdminBookingsPage() {
  const [bookings, setBookings] = useState<Booking[]>([])
  const [loading, setLoading] = useState(true)
  const [metalFilter, setMetalFilter] = useState('')

  const url = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000'

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params: Record<string, string> = {}
      if (metalFilter) params.metal = metalFilter
      const res = await axios.get(`${url}/api/admin/bookings`, {
        params,
        withCredentials: true,
      })
      setBookings(Array.isArray(res.data?.data) ? res.data.data : [])
    } catch {
      setBookings([])
    } finally {
      setLoading(false)
    }
  }, [metalFilter, url])

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

  const formatMetal = (m?: string) => {
    if (!m) return '—'
    const map: Record<string, string> = {
      gold_24k: 'Gold 24K',
      gold_22k: 'Gold 22K',
      gold_18k: 'Gold 18K',
      silver: 'Silver',
    }
    return map[m.toLowerCase()] || m
  }

  return (
    <AdminGuard>
      <div className="min-h-screen bg-slate-950 text-slate-100">
        <main className="max-w-6xl mx-auto px-4 py-8 pb-24">
          <Link
            href="/admin"
            className="inline-flex items-center gap-2 text-slate-400 hover:text-yellow-500 mb-6"
          >
            <ArrowLeft className="size-4" /> Back to Dashboard
          </Link>

          <div className="bg-slate-900/50 backdrop-blur border border-white/10 rounded-xl overflow-hidden">
            <div className="p-4 sm:p-6 border-b border-white/10 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div className="flex items-center gap-2">
                <BookMarked className="size-6 text-yellow-500" />
                <h1 className="text-xl font-semibold text-slate-200">Rate Bookings</h1>
              </div>
              <div className="flex items-center gap-2">
                <label className="text-sm text-slate-400">Filter by Metal</label>
                <select
                  value={metalFilter}
                  onChange={(e) => setMetalFilter(e.target.value)}
                  className="px-3 py-2 rounded-lg bg-slate-800/80 border border-white/10 text-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-500/50"
                >
                  {METAL_OPTIONS.map((o) => (
                    <option key={o.value || 'all'} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {loading ? (
              <div className="p-12 text-center text-slate-400">Loading…</div>
            ) : bookings.length === 0 ? (
              <div className="p-12 text-center">
                <BookMarked className="size-12 text-slate-600 mx-auto mb-4" />
                <p className="text-slate-400">No active bookings found</p>
                <p className="text-slate-500 text-sm mt-1">
                  Bookings will appear here when customers freeze rates.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-white/10 bg-slate-800/30">
                      <th className="text-left py-3 px-4 text-slate-400 font-medium text-sm">Booking ID</th>
                      <th className="text-left py-3 px-4 text-slate-400 font-medium text-sm">Mobile</th>
                      <th className="text-left py-3 px-4 text-slate-400 font-medium text-sm">Metal</th>
                      <th className="text-right py-3 px-4 text-slate-400 font-medium text-sm">Locked Rate</th>
                      <th className="text-right py-3 px-4 text-slate-400 font-medium text-sm">Advance</th>
                      <th className="text-left py-3 px-4 text-slate-400 font-medium text-sm">Status</th>
                      <th className="text-left py-3 px-4 text-slate-400 font-medium text-sm">Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bookings.map((b) => (
                      <tr
                        key={b.id}
                        className="border-b border-white/5 hover:bg-white/5 transition-colors"
                      >
                        <td className="py-3 px-4 text-slate-200 font-medium">#{b.id}</td>
                        <td className="py-3 px-4 text-slate-300">{b.mobile_number || '—'}</td>
                        <td className="py-3 px-4 text-slate-300">{formatMetal(b.metal_type)}</td>
                        <td className="py-3 px-4 text-right text-slate-300 tabular-nums">
                          {b.locked_gold_rate != null ? `₹${Number(b.locked_gold_rate).toLocaleString('en-IN')}/g` : '—'}
                        </td>
                        <td className="py-3 px-4 text-right text-yellow-500/90 font-medium tabular-nums">
                          {b.advance_amount != null ? `₹${Number(b.advance_amount).toLocaleString('en-IN')}` : '—'}
                        </td>
                        <td className="py-3 px-4">
                          <span
                            className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${
                              b.status === 'completed'
                                ? 'bg-emerald-500/20 text-emerald-400'
                                : b.status === 'booked'
                                  ? 'bg-yellow-500/20 text-yellow-400'
                                  : 'bg-slate-500/20 text-slate-400'
                            }`}
                          >
                            {b.status || 'pending'}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-slate-400 text-sm">{formatDate(b.created_at)}</td>
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
  )
}

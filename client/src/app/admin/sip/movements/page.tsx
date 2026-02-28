'use client'

import axios from '@/lib/axios'
import { useEffect, useState, useCallback } from 'react'
import AdminGuard from '@/components/AdminGuard'
import Link from 'next/link'
import { BarChart3, ArrowLeft, Download, Filter } from 'lucide-react'

type Movement = {
  id: number
  user_id: number
  direction: string
  grams: number
  reference?: string
  created_at: string
}

export default function AdminMovementsPage() {
  const [items, setItems] = useState<Movement[]>([])
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(false)
  const [userId, setUserId] = useState('')
  const [direction, setDirection] = useState('')
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const url = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000'

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params: Record<string, string | number> = { limit: 500 }
      if (userId) params.user_id = userId
      if (direction) params.direction = direction
      if (start) params.start = start
      if (end) params.end = end
      const res = await axios.get(`${url}/api/admin/gold-lot-movements`, { params, withCredentials: true })
      setItems(Array.isArray(res.data) ? res.data : [])
    } catch {
      setItems([])
    } finally {
      setLoading(false)
    }
  }, [userId, direction, start, end, url])

  useEffect(() => {
    load()
  }, [load])

  const exportCsv = async () => {
    setExporting(true)
    try {
      const params: Record<string, string | number> = { limit: 2000, format: 'csv' }
      if (userId) params.user_id = userId
      if (direction) params.direction = direction
      if (start) params.start = start
      if (end) params.end = end
      const res = await axios.get(`${url}/api/admin/gold-lot-movements`, {
        params,
        responseType: 'blob',
        withCredentials: true,
      })
      const blob = new Blob([res.data], { type: 'text/csv' })
      const downloadUrl = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = downloadUrl
      a.download = `gold-lot-movements-${new Date().toISOString().slice(0, 10)}.csv`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(downloadUrl)
    } catch {
      alert('Failed to export CSV')
    } finally {
      setExporting(false)
    }
  }

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

  return (
    <AdminGuard>
      <div className="min-h-screen bg-slate-950 text-slate-100">
        <main className="max-w-6xl mx-auto px-4 py-8 pb-24">
          <Link
            href="/admin"
            className="inline-flex items-center gap-2 text-slate-400 hover:text-yellow-500 mb-6 transition-colors"
          >
            <ArrowLeft className="size-4" /> Back to Dashboard
          </Link>

          <div className="bg-slate-900/50 backdrop-blur border border-white/10 rounded-xl overflow-hidden">
            <div className="p-4 sm:p-6 border-b border-white/10">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div className="flex items-center gap-2">
                  <BarChart3 className="size-6 text-cyan-500" />
                  <h1 className="text-xl font-semibold text-slate-200">Gold Lot Movements</h1>
                </div>
              </div>

              {/* Filters */}
              <div className="mt-4 flex flex-col sm:flex-row flex-wrap gap-3 items-stretch sm:items-end">
                <div className="flex flex-wrap gap-3 flex-1">
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">User ID</label>
                    <input
                      placeholder="User ID"
                      value={userId}
                      onChange={(e) => setUserId(e.target.value.replace(/[^0-9]/g, ''))}
                      className="bg-slate-800 text-white placeholder-slate-400 border border-slate-600 p-2.5 rounded-lg w-24 text-sm focus:ring-2 focus:ring-cyan-500/50 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">Direction</label>
                    <select
                      value={direction}
                      onChange={(e) => setDirection(e.target.value)}
                      className="bg-slate-800 text-white border border-slate-600 p-2.5 rounded-lg text-sm focus:ring-2 focus:ring-cyan-500/50 outline-none"
                    >
                      <option value="">All</option>
                      <option value="CREDIT">Credit</option>
                      <option value="DEBIT">Debit</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">From Date</label>
                    <input
                      type="date"
                      value={start}
                      onChange={(e) => setStart(e.target.value)}
                      className="bg-slate-800 text-white border border-slate-600 p-2.5 rounded-lg text-sm focus:ring-2 focus:ring-cyan-500/50 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">To Date</label>
                    <input
                      type="date"
                      value={end}
                      onChange={(e) => setEnd(e.target.value)}
                      className="bg-slate-800 text-white border border-slate-600 p-2.5 rounded-lg text-sm focus:ring-2 focus:ring-cyan-500/50 outline-none"
                    />
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={load}
                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-200 text-sm font-medium transition-colors"
                  >
                    <Filter className="size-4" /> Apply Filters
                  </button>
                  <button
                    onClick={exportCsv}
                    disabled={exporting}
                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-semibold text-sm transition-colors disabled:opacity-50"
                  >
                    <Download className="size-4" />
                    {exporting ? 'Exporting…' : 'Export CSV'}
                  </button>
                </div>
              </div>
            </div>

            {loading ? (
              <div className="p-12 text-center text-slate-400">Loading movements…</div>
            ) : items.length === 0 ? (
              <div className="p-12 text-center">
                <BarChart3 className="size-12 text-slate-600 mx-auto mb-4" />
                <p className="text-slate-400">No movements found</p>
                <p className="text-slate-500 text-sm mt-1">
                  Gold lot credits and debits will appear here.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-white/10 bg-slate-800/30">
                      <th className="text-left py-3 px-4 text-slate-400 font-medium text-sm">ID</th>
                      <th className="text-left py-3 px-4 text-slate-400 font-medium text-sm">User</th>
                      <th className="text-left py-3 px-4 text-slate-400 font-medium text-sm">Direction</th>
                      <th className="text-right py-3 px-4 text-slate-400 font-medium text-sm">Grams</th>
                      <th className="text-left py-3 px-4 text-slate-400 font-medium text-sm">Reference</th>
                      <th className="text-left py-3 px-4 text-slate-400 font-medium text-sm">Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((m) => (
                      <tr
                        key={m.id}
                        className="border-b border-white/5 hover:bg-white/5 transition-colors"
                      >
                        <td className="py-3 px-4 text-slate-300 font-medium">#{m.id}</td>
                        <td className="py-3 px-4 text-slate-300">User #{m.user_id}</td>
                        <td className="py-3 px-4">
                          <span
                            className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${
                              m.direction === 'CREDIT'
                                ? 'bg-emerald-500/20 text-emerald-400'
                                : 'bg-amber-500/20 text-amber-400'
                            }`}
                          >
                            {m.direction}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right text-cyan-400 font-medium tabular-nums">
                          {Number(m.grams).toFixed(4)} g
                        </td>
                        <td className="py-3 px-4 text-slate-400 text-sm">{m.reference || '—'}</td>
                        <td className="py-3 px-4 text-slate-400 text-sm">{formatDate(m.created_at)}</td>
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

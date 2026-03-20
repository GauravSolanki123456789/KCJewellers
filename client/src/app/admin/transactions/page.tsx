'use client'

import axios from '@/lib/axios'
import { useEffect, useState, useCallback, Suspense } from 'react'
import AdminGuard from '@/components/AdminGuard'
import Link from 'next/link'
import { ArrowLeft, Filter, Receipt, ShoppingCart, BookMarked, CircleDollarSign } from 'lucide-react'

type TransactionItem = {
  id: number
  ref_id: number
  user_id: number | null
  amount: number
  date: string
  type: string
  customer_name: string | null
  customer_mobile: string | null
  customer_email: string | null
}

export default function AdminTransactionsPage() {
  const [items, setItems] = useState<TransactionItem[]>([])
  const [totalRevenue, setTotalRevenue] = useState(0)
  const [loading, setLoading] = useState(true)
  const [typeFilter, setTypeFilter] = useState('')
  const url = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params: Record<string, string> = {}
      if (typeFilter) params.type = typeFilter
      const res = await axios.get(`${url}/api/admin/transactions`, {
        params,
        withCredentials: true,
      })
      setItems(Array.isArray(res.data?.data) ? res.data.data : [])
      setTotalRevenue(Number(res.data?.total_revenue || 0))
    } catch {
      setItems([])
      setTotalRevenue(0)
    } finally {
      setLoading(false)
    }
  }, [typeFilter, url])

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

  const formatCustomer = (item: TransactionItem) => {
    const name = item.customer_name || ''
    const mobile = item.customer_mobile || ''
    const email = item.customer_email || ''
    if (name && mobile) return `${name} / ${mobile}`
    if (name) return name
    if (mobile) return mobile
    if (email) return email
    return `User #${item.user_id || '—'}`
  }

  const getTypeIcon = (type: string) => {
    if (type === 'Catalog Order') return ShoppingCart
    if (type === 'Rate Booking') return BookMarked
    if (type === 'SIP Installment') return CircleDollarSign
    return Receipt
  }

  const getTypeBadgeClass = (type: string) => {
    if (type === 'Catalog Order') return 'bg-indigo-500/20 text-indigo-400'
    if (type === 'Rate Booking') return 'bg-rose-500/20 text-rose-400'
    if (type === 'SIP Installment') return 'bg-amber-500/20 text-amber-400'
    return 'bg-slate-500/20 text-slate-400'
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
                <Receipt className="size-6 sm:size-7 text-yellow-500" />
                <h1 className="text-xl sm:text-2xl font-bold text-slate-200">Master Transactions Ledger</h1>
              </div>
              <p className="text-slate-400 text-sm">
                Every payment received across Catalog Orders, Rate Bookings, and SIP Installments
              </p>
            </div>

            {/* Total Revenue Card */}
            <div className="rounded-xl bg-amber-500/10 border border-amber-500/20 p-4 sm:p-6 mb-6 sm:mb-8">
              <div className="flex items-center gap-2 mb-1">
                <CircleDollarSign className="size-5 text-amber-400" />
                <span className="text-amber-400/90 text-sm font-medium">Total Revenue (filtered)</span>
              </div>
              <p className="text-2xl sm:text-3xl font-bold text-amber-400 tabular-nums">
                ₹{totalRevenue.toLocaleString('en-IN')}
              </p>
            </div>

            {/* Filters & Table */}
            <div className="bg-slate-900/50 backdrop-blur border border-white/10 rounded-xl overflow-hidden">
              <div className="p-4 sm:p-6 border-b border-white/10">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                  <div className="flex items-center gap-2">
                    <Filter className="size-5 text-slate-400" />
                    <span className="text-slate-400 text-sm font-medium">Filter by type</span>
                  </div>
                  <select
                    value={typeFilter}
                    onChange={(e) => setTypeFilter(e.target.value)}
                    className="px-3 py-2 rounded-lg bg-slate-800/80 border border-white/10 text-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-500/50 min-w-[180px]"
                  >
                    <option value="">All transactions</option>
                    <option value="catalog_order">Catalog Order</option>
                    <option value="rate_booking">Rate Booking</option>
                    <option value="sip_installment">SIP Installment</option>
                  </select>
                </div>
              </div>

              {loading ? (
                <div className="p-12 text-center text-slate-400">Loading transactions…</div>
              ) : items.length === 0 ? (
                <div className="p-12 text-center">
                  <Receipt className="size-12 text-slate-600 mx-auto mb-4" />
                  <p className="text-slate-400">No transactions found</p>
                  <p className="text-slate-500 text-sm mt-1">
                    {typeFilter ? 'Try changing the filter.' : 'Transactions will appear here.'}
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[600px]">
                    <thead>
                      <tr className="border-b border-white/10 bg-slate-800/30">
                        <th className="text-left py-3 px-3 sm:px-4 text-slate-400 font-medium text-xs sm:text-sm">Date</th>
                        <th className="text-left py-3 px-3 sm:px-4 text-slate-400 font-medium text-xs sm:text-sm">Customer</th>
                        <th className="text-left py-3 px-3 sm:px-4 text-slate-400 font-medium text-xs sm:text-sm">Type</th>
                        <th className="text-right py-3 px-3 sm:px-4 text-slate-400 font-medium text-xs sm:text-sm">Amount (₹)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((item) => {
                        const TypeIcon = getTypeIcon(item.type)
                        return (
                          <tr
                            key={`${item.type}-${item.ref_id}`}
                            className="border-b border-white/5 hover:bg-white/5 transition-colors"
                          >
                            <td className="py-3 px-3 sm:px-4 text-slate-300 text-sm">{formatDate(item.date)}</td>
                            <td className="py-3 px-3 sm:px-4 text-slate-300 text-sm">
                              <span className="block truncate max-w-[200px] sm:max-w-[280px]" title={formatCustomer(item)}>
                                {formatCustomer(item)}
                              </span>
                            </td>
                            <td className="py-3 px-3 sm:px-4">
                              <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium ${getTypeBadgeClass(item.type)}`}>
                                <TypeIcon className="size-3.5" />
                                {item.type}
                              </span>
                            </td>
                            <td className="py-3 px-3 sm:px-4 text-right font-semibold tabular-nums text-amber-400">
                              ₹{Number(item.amount || 0).toLocaleString('en-IN')}
                            </td>
                          </tr>
                        )
                      })}
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

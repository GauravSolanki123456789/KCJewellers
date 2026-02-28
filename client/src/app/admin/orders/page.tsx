'use client'

import { useState, useEffect, useCallback } from 'react'
import axios from '@/lib/axios'
import AdminGuard from '@/components/AdminGuard'
import Link from 'next/link'
import { ShoppingCart, ArrowLeft } from 'lucide-react'

type Order = {
  id: number
  user_id?: number
  total_amount?: number
  payment_status?: string
  payment_method?: string
  delivery_status?: string
  items_snapshot_json?: unknown
  created_at: string
  customer_name?: string
  customer_email?: string
  customer_mobile?: string
}

export default function AdminOrdersPage() {
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)

  const url = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000'

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await axios.get(`${url}/api/admin/orders`, { withCredentials: true })
      setOrders(Array.isArray(res.data?.data) ? res.data.data : [])
    } catch {
      setOrders([])
    } finally {
      setLoading(false)
    }
  }, [url])

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

  const getItemsSummary = (items: unknown) => {
    if (!items) return '—'
    const arr = Array.isArray(items) ? items : []
    if (arr.length === 0) return '—'
    return `${arr.length} item${arr.length !== 1 ? 's' : ''}`
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
            <div className="p-4 sm:p-6 border-b border-white/10">
              <div className="flex items-center gap-2">
                <ShoppingCart className="size-6 text-yellow-500" />
                <h1 className="text-xl font-semibold text-slate-200">Orders</h1>
              </div>
              <p className="text-slate-500 text-sm mt-1">
                Who ordered what, when, rate, and delivery status
              </p>
            </div>

            {loading ? (
              <div className="p-12 text-center text-slate-400">Loading…</div>
            ) : orders.length === 0 ? (
              <div className="p-12 text-center">
                <ShoppingCart className="size-12 text-slate-600 mx-auto mb-4" />
                <p className="text-slate-400">No orders found</p>
                <p className="text-slate-500 text-sm mt-1">
                  Orders will appear here when customers complete purchases.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-white/10 bg-slate-800/30">
                      <th className="text-left py-3 px-4 text-slate-400 font-medium text-sm">Order ID</th>
                      <th className="text-left py-3 px-4 text-slate-400 font-medium text-sm">Customer</th>
                      <th className="text-left py-3 px-4 text-slate-400 font-medium text-sm">Items</th>
                      <th className="text-right py-3 px-4 text-slate-400 font-medium text-sm">Amount</th>
                      <th className="text-left py-3 px-4 text-slate-400 font-medium text-sm">Payment</th>
                      <th className="text-left py-3 px-4 text-slate-400 font-medium text-sm">Delivery</th>
                      <th className="text-left py-3 px-4 text-slate-400 font-medium text-sm">Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {orders.map((o) => (
                      <tr
                        key={o.id}
                        className="border-b border-white/5 hover:bg-white/5 transition-colors"
                      >
                        <td className="py-3 px-4 text-slate-200 font-medium">#{o.id}</td>
                        <td className="py-3 px-4">
                          <div className="text-slate-300">{o.customer_name || 'Guest'}</div>
                          <div className="text-xs text-slate-500">
                            {o.customer_mobile || o.customer_email || '—'}
                          </div>
                        </td>
                        <td className="py-3 px-4 text-slate-400 text-sm">
                          {getItemsSummary(o.items_snapshot_json)}
                        </td>
                        <td className="py-3 px-4 text-right text-yellow-500/90 font-medium tabular-nums">
                          ₹{Number(o.total_amount || 0).toLocaleString('en-IN')}
                        </td>
                        <td className="py-3 px-4">
                          <span
                            className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${
                              o.payment_status === 'PAID' || o.payment_status === 'captured'
                                ? 'bg-emerald-500/20 text-emerald-400'
                                : 'bg-slate-500/20 text-slate-400'
                            }`}
                          >
                            {o.payment_status || 'PENDING'}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          <span
                            className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${
                              o.delivery_status === 'DELIVERED'
                                ? 'bg-emerald-500/20 text-emerald-400'
                                : o.delivery_status === 'SHIPPED'
                                  ? 'bg-cyan-500/20 text-cyan-400'
                                  : 'bg-slate-500/20 text-slate-400'
                            }`}
                          >
                            {o.delivery_status || 'PENDING'}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-slate-400 text-sm">{formatDate(o.created_at)}</td>
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

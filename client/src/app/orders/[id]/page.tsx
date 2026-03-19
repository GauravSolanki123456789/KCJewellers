'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import axios from '@/lib/axios'
import { ChevronLeft, Package, CreditCard, Calendar } from 'lucide-react'

type OrderItem = { barcode?: string; item_name?: string; qty?: number; price?: number }
type Order = {
  id: number
  total_amount?: number
  payment_status?: string
  payment_method?: string
  delivery_status?: string
  items_snapshot_json?: OrderItem[]
  created_at: string
}

export default function OrderViewPage() {
  const params = useParams()
  const id = params?.id as string
  const [order, setOrder] = useState<Order | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!id) return
    const load = async () => {
      setLoading(true)
      setError(null)
      try {
        const res = await axios.get(`/api/orders/${id}`)
        setOrder(res.data)
      } catch (err: unknown) {
        const msg = (err as { response?: { status?: number; data?: { error?: string } } })?.response?.data?.error
          || (err as { response?: { status?: number } })?.response?.status === 404
          ? 'Order not found'
          : 'Failed to load order'
        setError(msg)
        setOrder(null)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [id])

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

  const items = Array.isArray(order?.items_snapshot_json) ? order.items_snapshot_json : []

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
        <div className="text-slate-400 animate-pulse">Loading order…</div>
      </div>
    )
  }

  if (error || !order) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
        <div className="text-center max-w-md">
          <p className="text-red-400 mb-4">{error || 'Order not found'}</p>
          <Link
            href="/profile"
            className="inline-flex items-center gap-2 text-amber-500 hover:text-amber-400"
          >
            <ChevronLeft className="size-4" /> Back to Profile
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <main className="max-w-2xl mx-auto px-4 py-8 pb-24">
        <Link
          href="/profile"
          className="inline-flex items-center gap-2 text-slate-400 hover:text-amber-500 mb-6 transition-colors"
        >
          <ChevronLeft className="size-4" /> Back to Profile
        </Link>

        <div className="rounded-xl border border-white/10 bg-slate-900/40 overflow-hidden">
          <div className="p-5 sm:p-6 border-b border-white/10">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <h1 className="text-xl font-bold text-slate-100">Order #{order.id}</h1>
              <span className="px-3 py-1 rounded-lg bg-amber-500/20 text-amber-400 text-sm font-medium border border-amber-500/30">
                {order.delivery_status || order.payment_status || 'PENDING'}
              </span>
            </div>
            <div className="flex items-center gap-4 mt-3 text-slate-400 text-sm">
              <span className="flex items-center gap-1.5">
                <Calendar className="size-4" />
                {formatDate(order.created_at)}
              </span>
              <span className="flex items-center gap-1.5">
                <CreditCard className="size-4" />
                {order.payment_method || order.payment_status || '—'}
              </span>
            </div>
          </div>

          <div className="p-5 sm:p-6 border-b border-white/5">
            <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-2">
              <Package className="size-4" /> Items
            </h2>
            <ul className="space-y-3">
              {items.map((item, i) => (
                <li
                  key={i}
                  className="flex justify-between items-center py-2 border-b border-white/5 last:border-0"
                >
                  <div>
                    <span className="text-slate-200">{item.item_name || 'Item'}</span>
                    {item.barcode && (
                      <span className="block text-xs text-slate-500 font-mono">{item.barcode}</span>
                    )}
                  </div>
                  <div className="text-right">
                    <span className="text-amber-400 font-medium">
                      ₹{Number(item.price || 0).toLocaleString('en-IN')} × {item.qty || 1}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          <div className="p-5 sm:p-6 flex justify-between items-center">
            <span className="text-slate-400">Total</span>
            <span className="text-xl font-bold text-amber-500 tabular-nums">
              ₹{Number(order.total_amount || 0).toLocaleString('en-IN')}
            </span>
          </div>
        </div>
      </main>
    </div>
  )
}

'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import axios from '@/lib/axios'
import AdminGuard from '@/components/AdminGuard'
import { OrderFulfillmentLines } from '@/components/orders/OrderFulfillmentLines'
import { ArrowLeft, Calendar, CreditCard, Package, User } from 'lucide-react'
import { snapshotItemsQtySum, parseOrderItemsSnapshot } from '@/lib/order-snapshot'

type OrderRow = {
  id: number
  user_id?: number
  total_amount?: number
  payment_status?: string
  payment_method?: string
  delivery_status?: string
  order_channel?: string
  items_snapshot_json?: unknown
  created_at: string
  customer_name?: string
  customer_email?: string
  customer_mobile?: string
}

const DISPLAY_STATUS: Record<string, string> = {
  PENDING: 'New',
  NEW: 'New',
  ACCEPTED: 'Accepted',
  READY: 'Ready',
  DISPATCHED: 'Dispatched',
  DELIVERED: 'Delivered',
  CANCELLED: 'Cancelled',
}

export default function AdminOrderDetailPage() {
  const params = useParams()
  const id = params?.id as string | undefined
  const [order, setOrder] = useState<OrderRow | null>(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!id) return
    const num = parseInt(id, 10)
    if (Number.isNaN(num)) {
      setErr('Invalid order')
      setLoading(false)
      return
    }
    setLoading(true)
    setErr(null)
    try {
      const res = await axios.get<{ success?: boolean; data: OrderRow }>(`/api/admin/orders/detail/${num}`)
      setOrder(res.data?.data || null)
      if (!res.data?.data) setErr('Order not found')
    } catch {
      setErr('Could not load order')
      setOrder(null)
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    load()
  }, [load])

  const fmt = (d: string) => {
    try {
      return new Date(d).toLocaleString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    } catch {
      return d
    }
  }

  const ds = order?.delivery_status || ''
  const badge = DISPLAY_STATUS[ds.toUpperCase()] || ds || '—'

  if (loading) {
    return (
      <AdminGuard>
        <div className="min-h-screen bg-slate-950 flex items-center justify-center text-slate-500 text-sm">
          Loading…
        </div>
      </AdminGuard>
    )
  }

  if (err || !order) {
    return (
      <AdminGuard>
        <div className="min-h-screen bg-slate-950 text-slate-100 px-4 py-10 text-center">
          <p className="text-red-400 mb-4">{err || 'Not found'}</p>
          <Link href="/admin/orders" className="text-amber-500 hover:text-amber-400 text-sm">
            Back to orders
          </Link>
        </div>
      </AdminGuard>
    )
  }

  const qtySum = snapshotItemsQtySum(parseOrderItemsSnapshot(order.items_snapshot_json))

  return (
    <AdminGuard>
      <div className="min-h-screen bg-slate-950 text-slate-100 pb-24">
        <main className="max-w-lg mx-auto px-4 py-6 sm:py-8">
          <div className="flex flex-wrap items-center gap-3 mb-6 text-sm">
            <Link
              href="/admin/orders"
              className="inline-flex items-center gap-2 text-slate-400 hover:text-amber-500 transition-colors"
            >
              <ArrowLeft className="size-4" />
              Orders
            </Link>
            <span className="text-slate-600">/</span>
            <Link href="/admin" className="text-slate-500 hover:text-amber-500">
              Dashboard
            </Link>
          </div>

          <div className="rounded-2xl border border-white/10 bg-slate-900/40 overflow-hidden">
            <div className="p-5 sm:p-6 border-b border-white/10">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div>
                  <h1 className="text-xl font-bold text-white font-mono">Order #{order.id}</h1>
                  <p className="text-xs text-slate-500 mt-1">
                    {order.order_channel === 'B2B_WHOLESALE' ? 'B2B wholesale' : 'Retail'} · {qtySum} pc{qtySum !== 1 ? 's' : ''}
                  </p>
                </div>
                <span className="px-3 py-1 rounded-lg bg-amber-500/15 text-amber-400 text-xs font-medium border border-amber-500/25">
                  {badge}
                </span>
              </div>
              <div className="mt-4 space-y-2 text-sm text-slate-400">
                <div className="flex items-center gap-2">
                  <Calendar className="size-4 shrink-0 opacity-70" />
                  {fmt(order.created_at)}
                </div>
                <div className="flex items-center gap-2">
                  <CreditCard className="size-4 shrink-0 opacity-70" />
                  {order.payment_method || order.payment_status || '—'}
                </div>
              </div>
            </div>

            <div className="p-5 sm:p-6 border-b border-white/10">
              <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3 flex items-center gap-2">
                <User className="size-4" />
                Customer
              </h2>
              <p className="text-slate-100 font-medium">{order.customer_name || '—'}</p>
              <p className="text-sm text-slate-500 mt-1">{order.customer_email || order.customer_mobile || '—'}</p>
            </div>

            <div className="p-5 sm:p-6">
              <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-4 flex items-center gap-2">
                <Package className="size-4" />
                Items to pack
              </h2>
              <OrderFulfillmentLines snapshot={order.items_snapshot_json} />
            </div>

            <div className="p-5 sm:p-6 flex justify-between items-center border-t border-white/10 bg-slate-950/30">
              <span className="text-slate-400">Total</span>
              <span className="text-xl font-bold text-amber-400 tabular-nums">
                ₹{Number(order.total_amount || 0).toLocaleString('en-IN')}
              </span>
            </div>
          </div>
        </main>
      </div>
    </AdminGuard>
  )
}

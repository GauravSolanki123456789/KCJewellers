'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import axios from '@/lib/axios'
import { ChevronLeft, CreditCard, Calendar, MessageCircle } from 'lucide-react'
import { OrderFulfillmentLines } from '@/components/orders/OrderFulfillmentLines'
import { describeOrderStatusForCustomer } from '@/lib/order-customer-status'
import { buildWhatsAppBusinessChatLink, orderConfirmationWhatsAppMessage } from '@/lib/whatsapp'

type Order = {
  id: number
  total_amount?: number
  payment_status?: string
  payment_method?: string
  delivery_status?: string
  order_channel?: string
  items_snapshot_json?: unknown
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

  const customerStatus = describeOrderStatusForCustomer(order)
  const orderWhatsAppHref = buildWhatsAppBusinessChatLink(
    orderConfirmationWhatsAppMessage({
      orderId: order.id,
      totalInr: Number(order.total_amount || 0),
      kind: order.order_channel === 'B2B_WHOLESALE' ? 'b2b' : 'retail',
    }),
  )

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
                {customerStatus.label}
              </span>
            </div>
            {customerStatus.hint ? (
              <p className="text-sm text-slate-500 mt-2">{customerStatus.hint}</p>
            ) : null}
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
            <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-4">Order items</h2>
            <OrderFulfillmentLines snapshot={order.items_snapshot_json} />
          </div>

          <div className="p-5 sm:p-6 flex justify-between items-center border-t border-white/5">
            <span className="text-slate-400">Total</span>
            <span className="text-xl font-bold text-amber-500 tabular-nums">
              ₹{Number(order.total_amount || 0).toLocaleString('en-IN')}
            </span>
          </div>

          {orderWhatsAppHref ? (
            <div className="px-5 sm:px-6 pb-6">
              <a
                href={orderWhatsAppHref}
                target="_blank"
                rel="noopener noreferrer"
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600/85 hover:bg-emerald-500 py-3.5 text-sm font-semibold text-white transition-colors"
              >
                <MessageCircle className="size-5 shrink-0" aria-hidden />
                WhatsApp KC about this order
              </a>
            </div>
          ) : null}
        </div>
      </main>
    </div>
  )
}

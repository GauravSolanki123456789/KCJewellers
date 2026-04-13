'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Calendar, History, Package, Scale, ChevronRight, MessageCircle } from 'lucide-react'
import axios from '@/lib/axios'
import { OrderItemsColumnPeek } from '@/components/orders/OrderFulfillmentLines'
import { describeOrderStatusForCustomer } from '@/lib/order-customer-status'
import { buildWhatsAppBusinessChatLink, orderConfirmationWhatsAppMessage } from '@/lib/whatsapp'

type OrderRow = {
  id: number
  total_amount?: number
  payment_status?: string
  delivery_status?: string
  order_channel?: string
  b2b_checkout_type?: string | null
  payment_method?: string
  items_snapshot_json?: unknown
  created_at: string
}

type BookingRow = {
  id: number
  status?: string
  locked_gold_rate?: number
  advance_amount?: number
  metal_type?: string
  weight_booked?: number
  created_at: string
}

type TimelineItem =
  | { kind: 'order'; at: string; order: OrderRow }
  | { kind: 'booking'; at: string; booking: BookingRow }

function mergeTimeline(orders: OrderRow[], bookings: BookingRow[]): TimelineItem[] {
  const a: TimelineItem[] = orders.map((order) => ({
    kind: 'order',
    at: order.created_at,
    order,
  }))
  const b: TimelineItem[] = bookings.map((booking) => ({
    kind: 'booking',
    at: booking.created_at,
    booking,
  }))
  return [...a, ...b].sort((x, y) => new Date(y.at).getTime() - new Date(x.at).getTime())
}

function fmtShort(d: string) {
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

export function ProfileOrderHistory() {
  const [orders, setOrders] = useState<OrderRow[]>([])
  const [bookings, setBookings] = useState<BookingRow[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      setErr(null)
      try {
        const [oRes, bRes] = await Promise.all([
          axios.get<OrderRow[]>('/api/orders'),
          axios.get<BookingRow[]>('/api/user/bookings'),
        ])
        if (!cancelled) {
          setOrders(Array.isArray(oRes.data) ? oRes.data : [])
          setBookings(Array.isArray(bRes.data) ? bRes.data : [])
        }
      } catch {
        if (!cancelled) {
          setErr('Could not load activity')
          setOrders([])
          setBookings([])
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const timeline = useMemo(() => mergeTimeline(orders, bookings), [orders, bookings])

  const waOrder = (o: OrderRow) => {
    const href = buildWhatsAppBusinessChatLink(
      orderConfirmationWhatsAppMessage({
        orderId: o.id,
        totalInr: Number(o.total_amount || 0),
        kind: o.order_channel === 'B2B_WHOLESALE' ? 'b2b' : 'retail',
      }),
    )
    if (!href) return null
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1.5 text-[11px] font-medium text-emerald-400/95 hover:text-emerald-300 mt-2"
      >
        <MessageCircle className="size-3.5 shrink-0" aria-hidden />
        WhatsApp KC
      </a>
    )
  }

  if (loading) {
    return (
      <div className="px-6 py-10 text-center">
        <div className="inline-block h-8 w-8 animate-spin rounded-full border-2 border-amber-500 border-t-transparent" />
        <p className="text-slate-500 text-sm mt-3">Loading orders & bookings…</p>
      </div>
    )
  }

  if (err) {
    return (
      <div className="px-6 py-8 text-center">
        <p className="text-slate-400 text-sm">{err}</p>
      </div>
    )
  }

  if (timeline.length === 0) {
    return (
      <div className="p-10 sm:p-12 text-center">
        <div className="inline-flex p-4 rounded-full bg-slate-800/50 border border-white/5 mb-4">
          <History className="size-10 text-slate-500" />
        </div>
        <p className="text-slate-400 font-medium">No orders or bookings yet</p>
        <p className="text-sm text-slate-500 mt-1 max-w-sm mx-auto">
          Your catalogue orders and rate-lock bookings will show here with status and line items.
        </p>
      </div>
    )
  }

  return (
    <ul className="divide-y divide-white/5">
      {timeline.map((item) => {
        if (item.kind === 'booking') {
          const b = item.booking
          const metal = (b.metal_type || 'Metal').toString()
          const wt = b.weight_booked != null ? Number(b.weight_booked) : null
          return (
            <li key={`b-${b.id}`} className="px-4 sm:px-6 py-4 hover:bg-white/[0.03] transition-colors">
              <div className="flex items-start gap-3">
                <div className="p-2 rounded-xl bg-cyan-500/15 border border-cyan-500/25 shrink-0">
                  <Scale className="size-5 text-cyan-400" aria-hidden />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[10px] uppercase tracking-wide font-semibold text-cyan-400/90">Rate booking</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/10 text-slate-400">
                      {b.status || '—'}
                    </span>
                  </div>
                  <p className="text-slate-200 font-medium mt-1">
                    {metal}
                    {wt != null ? ` · ${wt} g` : ''}
                  </p>
                  <p className="text-xs text-slate-500 flex items-center gap-1.5 mt-1">
                    <Calendar className="size-3.5 shrink-0 opacity-70" />
                    {fmtShort(b.created_at)}
                  </p>
                </div>
              </div>
            </li>
          )
        }

        const o = item.order
        const st = describeOrderStatusForCustomer(o)
        const b2b = o.order_channel === 'B2B_WHOLESALE'
        return (
          <li key={`o-${o.id}`} className="px-4 sm:px-6 py-4 hover:bg-white/[0.03] transition-colors">
            <Link
              href={`/orders/${o.id}`}
              className="flex items-start gap-3 group rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-amber-500/40"
            >
              <div
                className={`p-2 rounded-xl shrink-0 border ${
                  b2b ? 'bg-emerald-500/10 border-emerald-500/25' : 'bg-amber-500/10 border-amber-500/25'
                }`}
              >
                <Package className={`size-5 ${b2b ? 'text-emerald-400' : 'text-amber-400'}`} aria-hidden />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-slate-100 font-semibold">#{o.id}</span>
                  <span
                    className={`text-[10px] uppercase tracking-wide font-semibold px-1.5 py-0.5 rounded ${
                      b2b ? 'bg-emerald-500/15 text-emerald-400' : 'bg-slate-700/80 text-slate-300'
                    }`}
                  >
                    {b2b ? 'Wholesale PO' : 'Order'}
                  </span>
                </div>
                <p className="text-xs text-amber-400/90 font-medium mt-0.5">{st.label}</p>
                {st.hint ? <p className="text-[11px] text-slate-500 mt-0.5 line-clamp-2">{st.hint}</p> : null}
                <p className="text-xs text-slate-500 flex items-center gap-1.5 mt-1.5">
                  <Calendar className="size-3.5 shrink-0 opacity-70" />
                  {fmtShort(o.created_at)}
                  <span className="tabular-nums text-slate-400">
                    · ₹{Number(o.total_amount || 0).toLocaleString('en-IN')}
                  </span>
                </p>
                <div className="mt-2 max-w-[min(100%,320px)]">
                  <OrderItemsColumnPeek snapshot={o.items_snapshot_json} />
                </div>
                <span className="sr-only">View order #{o.id}</span>
              </div>
              <ChevronRight className="size-5 text-slate-600 group-hover:text-amber-500/80 shrink-0 mt-1 transition-colors" aria-hidden />
            </Link>
            <div className="pl-[52px] sm:pl-[60px] mt-2">{waOrder(o)}</div>
          </li>
        )
      })}
    </ul>
  )
}

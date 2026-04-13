'use client'

import { useState, useEffect, useCallback, Suspense } from 'react'
import axios from '@/lib/axios'
import AdminGuard from '@/components/AdminGuard'
import Link from 'next/link'
import { ShoppingCart, ArrowLeft, Package, Calendar, User, CreditCard, MoreVertical, ChevronRight, Phone, MessageCircle, Trash2 } from 'lucide-react'

const ORDER_TABS = ['New', 'Accepted', 'Ready', 'Dispatched', 'Delivered', 'Cancelled'] as const

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

const getBaseUrl = () => typeof window !== 'undefined' ? window.location.origin : (process.env.NEXT_PUBLIC_SITE_URL || 'https://kcjewellers.co.in')

function normalizeMobile(m: string | undefined): string {
  if (!m) return ''
  const digits = m.replace(/\D/g, '')
  if (digits.length === 10) return '91' + digits
  if (digits.length === 12 && digits.startsWith('91')) return digits
  return digits
}

export default function AdminOrdersPage() {
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<typeof ORDER_TABS[number]>('New')
  const [updatingId, setUpdatingId] = useState<number | null>(null)
  const [openDropdownId, setOpenDropdownId] = useState<number | null>(null)
  const [deleteModalOrderId, setDeleteModalOrderId] = useState<number | null>(null)
  const [deletingId, setDeletingId] = useState<number | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await axios.get('/api/admin/orders', { params: { status: activeTab } })
      setOrders(Array.isArray(res.data?.data) ? res.data.data : [])
    } catch {
      setOrders([])
    } finally {
      setLoading(false)
    }
  }, [activeTab])

  useEffect(() => {
    load()
  }, [load])

  const updateStatus = async (orderId: number, newStatus: string) => {
    setUpdatingId(orderId)
    try {
      await axios.patch(`/api/admin/orders/${orderId}/status`, { delivery_status: newStatus })
      setOrders(prev => prev.filter(o => o.id !== orderId))
    } catch (err: unknown) {
      const msg = err && typeof err === 'object' && 'response' in err
        ? (err as { response?: { data?: { error?: string } } }).response?.data?.error
        : 'Failed to update status'
      alert(msg || 'Failed to update status')
    } finally {
      setUpdatingId(null)
      setOpenDropdownId(null)
    }
  }

  const deleteOrder = async (orderId: number) => {
    setDeletingId(orderId)
    try {
      await axios.delete(`/api/admin/orders/${orderId}`)
      setOrders(prev => prev.filter(o => o.id !== orderId))
      setDeleteModalOrderId(null)
    } catch (err: unknown) {
      const msg = err && typeof err === 'object' && 'response' in err
        ? (err as { response?: { data?: { error?: string } } }).response?.data?.error
        : 'Failed to delete order'
      alert(msg || 'Failed to delete order')
    } finally {
      setDeletingId(null)
    }
  }

  const getWhatsAppUrl = (o: Order) => {
    const mobile = normalizeMobile(o.customer_mobile)
    if (!mobile) return null
    const name = o.customer_name || 'Customer'
    const amount = Number(o.total_amount || 0).toLocaleString('en-IN')
    const invoiceUrl = `${getBaseUrl()}/orders/${o.id}`
    const text = encodeURIComponent(
      `Hello ${name}, your order #${o.id} for ₹${amount} has been confirmed! View your invoice here: ${invoiceUrl}`
    )
    return `https://wa.me/${mobile}?text=${text}`
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

  const getItemsCount = (items: unknown) => {
    if (!items) return 0
    const arr = Array.isArray(items) ? items : []
    return arr.reduce((sum, i) => sum + (Number(i?.qty) || 1), 0)
  }

  const getDisplayStatus = (s: string | undefined) => {
    if (!s) return 'New'
    const map: Record<string, string> = { PENDING: 'New', NEW: 'New', ACCEPTED: 'Accepted', READY: 'Ready', DISPATCHED: 'Dispatched', DELIVERED: 'Delivered', SHIPPED: 'Dispatched', CANCELLED: 'Cancelled' }
    return map[s.toUpperCase()] || s
  }

  const getNextStatus = (current: string) => {
    const idx = ORDER_TABS.indexOf(getDisplayStatus(current) as typeof ORDER_TABS[number])
    if (idx < 0 || idx >= ORDER_TABS.length - 1) return null
    return ORDER_TABS[idx + 1]
  }

  const statusBadgeClass = (s: string) => {
    const status = getDisplayStatus(s)
    switch (status) {
      case 'New': return 'bg-slate-500/20 text-slate-300'
      case 'Accepted': return 'bg-blue-500/20 text-blue-400'
      case 'Ready': return 'bg-amber-500/20 text-amber-400'
      case 'Dispatched': return 'bg-cyan-500/20 text-cyan-400'
      case 'Delivered': return 'bg-emerald-500/20 text-emerald-400'
      case 'Cancelled': return 'bg-red-500/20 text-red-400'
      default: return 'bg-slate-500/20 text-slate-400'
    }
  }

  const OrderCard = ({ o }: { o: Order }) => {
    const nextStatus = getNextStatus(o.delivery_status || 'PENDING')
    const isUpdating = updatingId === o.id
    return (
      <div className="rounded-xl border border-white/10 bg-slate-800/40 p-4 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <span className="font-mono text-slate-200 font-semibold">#{o.id}</span>
            <span className={`ml-2 inline-flex px-2 py-0.5 rounded-lg text-xs font-medium ${statusBadgeClass(o.delivery_status || 'PENDING')}`}>
              {getDisplayStatus(o.delivery_status)}
            </span>
          </div>
          <span className="font-semibold text-amber-400 tabular-nums shrink-0">
            ₹{Number(o.total_amount || 0).toLocaleString('en-IN')}
          </span>
        </div>
        <div className="flex items-center gap-2 text-slate-400 text-sm">
          <Calendar className="size-4 shrink-0 opacity-60" />
          {formatDate(o.created_at)}
        </div>
        <div className="flex items-center gap-2">
          <User className="size-4 text-slate-500 shrink-0" />
          <div>
            <div className="text-slate-200 font-medium">{o.customer_name || 'Guest'}</div>
            <div className="text-xs text-slate-500">{o.customer_mobile || o.customer_email || '—'}</div>
          </div>
        </div>
        {/* Action buttons - mobile */}
        <div className="flex flex-wrap gap-2">
          {o.customer_mobile && (
            <>
              <a
                href={`tel:+${normalizeMobile(o.customer_mobile)}`}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-700/50 text-slate-200 hover:bg-slate-600/50 text-xs font-medium border border-white/5"
              >
                <Phone className="size-3.5" /> Contact
              </a>
              {getWhatsAppUrl(o) && (
                <a
                  href={getWhatsAppUrl(o)!}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-600/30 text-emerald-400 hover:bg-emerald-600/40 text-xs font-medium border border-emerald-500/20"
                >
                  <MessageCircle className="size-3.5" /> WhatsApp
                </a>
              )}
            </>
          )}
          <button
            onClick={() => setDeleteModalOrderId(o.id)}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-red-500/20 text-red-400 hover:bg-red-500/30 text-xs font-medium border border-red-500/20"
            aria-label="Delete order"
          >
            <Trash2 className="size-3.5" /> Delete
          </button>
        </div>
        <div className="flex items-center justify-between pt-2 border-t border-white/5">
          <div className="flex items-center gap-4 text-sm text-slate-400">
            <span className="flex items-center gap-1">
              <Package className="size-4 opacity-60" />
              {getItemsCount(o.items_snapshot_json)} item{getItemsCount(o.items_snapshot_json) !== 1 ? 's' : ''}
            </span>
            <span className="flex items-center gap-1">
              <CreditCard className="size-4 opacity-60" />
              {o.payment_method || o.payment_status || '—'}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <button
                onClick={() => setOpenDropdownId(openDropdownId === o.id ? null : o.id)}
                className="p-2 rounded-lg hover:bg-white/10 text-slate-400 hover:text-slate-200 transition-colors"
                aria-label="Change status"
              >
                <MoreVertical className="size-4" />
              </button>
              {openDropdownId === o.id && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setOpenDropdownId(null)} aria-hidden="true" />
                  <div className="absolute right-0 top-full mt-1 z-20 py-1 min-w-[140px] rounded-lg bg-slate-800 border border-white/10 shadow-xl">
                    {ORDER_TABS.filter(s => s !== getDisplayStatus(o.delivery_status)).map((s) => (
                      <button
                        key={s}
                        onClick={() => updateStatus(o.id, s)}
                        disabled={isUpdating}
                        className="w-full text-left px-3 py-2 text-sm text-slate-200 hover:bg-white/10 disabled:opacity-50 flex items-center gap-2"
                      >
                        <ChevronRight className="size-3" /> {s}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
            {nextStatus && (
              <button
                onClick={() => updateStatus(o.id, nextStatus)}
                disabled={isUpdating}
                className="inline-flex items-center gap-1 px-3 py-2 rounded-lg bg-amber-500/20 text-amber-400 hover:bg-amber-500/30 text-xs font-medium border border-amber-500/20 disabled:opacity-50 transition-colors"
              >
                {isUpdating ? '…' : `→ ${nextStatus}`}
              </button>
            )}
          </div>
        </div>
      </div>
    )
  }

  return (
    <Suspense fallback={<div className="min-h-screen bg-slate-950 flex items-center justify-center"><div className="text-slate-400">Loading...</div></div>}>
      <AdminGuard>
        <div className="min-h-screen bg-slate-950 text-slate-100">
          <main className="max-w-7xl mx-auto px-4 py-6 sm:py-8 pb-24 sm:pb-12">
            <div className="flex flex-wrap items-center gap-3 mb-6">
              <Link
                href="/admin"
                className="inline-flex items-center gap-2 text-slate-400 hover:text-amber-500 transition-colors"
              >
                <ArrowLeft className="size-4" /> Back to Dashboard
              </Link>
              <Link
                href="/admin/orders/b2b"
                className="text-sm font-medium text-emerald-400/90 hover:text-emerald-300 rounded-lg border border-emerald-500/25 bg-emerald-950/30 px-3 py-1.5"
              >
                B2B purchase orders
              </Link>
            </div>

            <div className="mb-6 sm:mb-8">
              <div className="flex items-center gap-3 mb-2">
                <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20">
                  <ShoppingCart className="size-6 text-amber-500" />
                </div>
                <div>
                  <h1 className="text-xl sm:text-2xl font-bold text-slate-100">Orders</h1>
                  <p className="text-slate-500 text-sm">Manage orders with status workflow</p>
                </div>
              </div>
            </div>

            {/* Horizontal tabs - scrollable on mobile */}
            <div className="mb-6 -mx-4 px-4 sm:mx-0 sm:px-0 overflow-x-auto">
              <div className="flex gap-1 rounded-xl bg-slate-800/50 p-1 border border-white/5 min-w-max sm:min-w-0 sm:inline-flex">
                {ORDER_TABS.map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={`px-3 sm:px-4 py-2.5 rounded-lg text-sm font-medium whitespace-nowrap transition-all ${
                      activeTab === tab
                        ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                        : 'text-slate-400 hover:text-slate-200 hover:bg-white/5 border border-transparent'
                    }`}
                  >
                    {tab}
                  </button>
                ))}
              </div>
            </div>

            {/* Content */}
            <div className="rounded-xl border border-white/10 bg-slate-900/30 overflow-hidden">
              {loading ? (
                <div className="p-12 sm:p-16 text-center">
                  <div className="inline-block h-8 w-8 animate-spin rounded-full border-2 border-amber-500 border-t-transparent" />
                  <p className="text-slate-500 mt-4">Loading orders…</p>
                </div>
              ) : orders.length === 0 ? (
                <div className="p-12 sm:p-16 text-center">
                  <div className="inline-flex p-4 rounded-full bg-slate-800/50 mb-4">
                    <Package className="size-12 text-slate-600" />
                  </div>
                  <p className="text-slate-400 text-lg">No orders in this status</p>
                  <p className="text-slate-500 text-sm mt-1">
                    Orders with status &quot;{activeTab}&quot; will appear here.
                  </p>
                </div>
              ) : (
                <>
                  {/* Mobile: Card layout */}
                  <div className="sm:hidden divide-y divide-white/5 p-4 space-y-4">
                    {orders.map((o) => (
                      <OrderCard key={o.id} o={o} />
                    ))}
                  </div>

                  {/* Desktop: Table layout */}
                  <div className="hidden sm:block overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-white/10 bg-slate-800/40">
                          <th className="text-left py-4 px-5 text-slate-400 font-medium text-sm">Order ID</th>
                          <th className="text-left py-4 px-5 text-slate-400 font-medium text-sm">Date</th>
                          <th className="text-left py-4 px-5 text-slate-400 font-medium text-sm">Customer</th>
                          <th className="text-left py-4 px-5 text-slate-400 font-medium text-sm">Items</th>
                          <th className="text-right py-4 px-5 text-slate-400 font-medium text-sm">Amount</th>
                          <th className="text-left py-4 px-5 text-slate-400 font-medium text-sm">Payment</th>
                          <th className="text-left py-4 px-5 text-slate-400 font-medium text-sm">Status</th>
                          <th className="text-right py-4 px-5 text-slate-400 font-medium text-sm">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {orders.map((o) => {
                          const nextStatus = getNextStatus(o.delivery_status || 'PENDING')
                          const isUpdating = updatingId === o.id
                          return (
                            <tr
                              key={o.id}
                              className="border-b border-white/5 hover:bg-white/[0.02] transition-colors"
                            >
                              <td className="py-4 px-5">
                                <span className="font-mono text-slate-200 font-medium">#{o.id}</span>
                              </td>
                              <td className="py-4 px-5">
                                <div className="flex items-center gap-2 text-slate-400 text-sm">
                                  <Calendar className="size-4 shrink-0 opacity-60" />
                                  {formatDate(o.created_at)}
                                </div>
                              </td>
                              <td className="py-4 px-5">
                                <div className="flex items-center gap-2">
                                  <User className="size-4 text-slate-500 shrink-0" />
                                  <div>
                                    <div className="text-slate-200 font-medium">{o.customer_name || 'Guest'}</div>
                                    <div className="text-xs text-slate-500">
                                      {o.customer_mobile || o.customer_email || '—'}
                                    </div>
                                  </div>
                                </div>
                              </td>
                              <td className="py-4 px-5">
                                <div className="flex items-center gap-2 text-slate-400">
                                  <Package className="size-4 shrink-0 opacity-60" />
                                  {getItemsCount(o.items_snapshot_json)} item{getItemsCount(o.items_snapshot_json) !== 1 ? 's' : ''}
                                </div>
                              </td>
                              <td className="py-4 px-5 text-right">
                                <span className="font-semibold text-amber-400 tabular-nums">
                                  ₹{Number(o.total_amount || 0).toLocaleString('en-IN')}
                                </span>
                              </td>
                              <td className="py-4 px-5">
                                <div className="flex items-center gap-2 text-slate-400 text-sm">
                                  <CreditCard className="size-4 shrink-0 opacity-60" />
                                  {o.payment_method || o.payment_status || '—'}
                                </div>
                              </td>
                              <td className="py-4 px-5">
                                <div className="flex items-center gap-2">
                                  <span className={`inline-flex px-2.5 py-1 rounded-lg text-xs font-medium ${statusBadgeClass(o.delivery_status || 'PENDING')}`}>
                                    {getDisplayStatus(o.delivery_status)}
                                  </span>
                                  <div className="relative">
                                    <button
                                      onClick={() => setOpenDropdownId(openDropdownId === o.id ? null : o.id)}
                                      className="p-1.5 rounded-lg hover:bg-white/10 text-slate-400 hover:text-slate-200 transition-colors"
                                      aria-label="Change status"
                                    >
                                      <MoreVertical className="size-4" />
                                    </button>
                                    {openDropdownId === o.id && (
                                      <>
                                        <div className="fixed inset-0 z-10" onClick={() => setOpenDropdownId(null)} aria-hidden="true" />
                                        <div className="absolute right-0 top-full mt-1 z-20 py-1 min-w-[140px] rounded-lg bg-slate-800 border border-white/10 shadow-xl">
                                          {ORDER_TABS.filter(s => s !== getDisplayStatus(o.delivery_status)).map((s) => (
                                            <button
                                              key={s}
                                              onClick={() => { updateStatus(o.id, s); setOpenDropdownId(null); }}
                                              disabled={isUpdating}
                                              className="w-full text-left px-3 py-2 text-sm text-slate-200 hover:bg-white/10 disabled:opacity-50"
                                            >
                                              → {s}
                                            </button>
                                          ))}
                                        </div>
                                      </>
                                    )}
                                  </div>
                                  {nextStatus && (
                                    <button
                                      onClick={() => updateStatus(o.id, nextStatus)}
                                      disabled={isUpdating}
                                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-500/20 text-amber-400 hover:bg-amber-500/30 text-xs font-medium border border-amber-500/20 disabled:opacity-50 transition-colors"
                                    >
                                      {isUpdating ? '…' : `→ ${nextStatus}`}
                                    </button>
                                  )}
                                </div>
                              </td>
                              <td className="py-4 px-5">
                                <div className="flex items-center justify-end gap-1.5">
                                  {o.customer_mobile && (
                                    <>
                                      <a
                                        href={`tel:+${normalizeMobile(o.customer_mobile)}`}
                                        className="p-2 rounded-lg hover:bg-white/10 text-slate-400 hover:text-slate-200 transition-colors"
                                        aria-label="Contact buyer"
                                        title="Contact buyer"
                                      >
                                        <Phone className="size-4" />
                                      </a>
                                      {getWhatsAppUrl(o) && (
                                        <a
                                          href={getWhatsAppUrl(o)!}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="p-2 rounded-lg hover:bg-emerald-500/20 text-slate-400 hover:text-emerald-400 transition-colors"
                                          aria-label="Send order via WhatsApp"
                                          title="Send order via WhatsApp"
                                        >
                                          <MessageCircle className="size-4" />
                                        </a>
                                      )}
                                    </>
                                  )}
                                  <button
                                    onClick={() => setDeleteModalOrderId(o.id)}
                                    className="p-2 rounded-lg hover:bg-red-500/20 text-slate-400 hover:text-red-400 transition-colors"
                                    aria-label="Delete order"
                                    title="Delete order"
                                  >
                                    <Trash2 className="size-4" />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>

            {/* Delete confirmation modal */}
            {deleteModalOrderId != null && (
              <>
                <div
                  className="fixed inset-0 z-10 bg-black/60 backdrop-blur-sm"
                  onClick={() => !deletingId && setDeleteModalOrderId(null)}
                  aria-hidden="true"
                />
                <div className="fixed inset-0 z-20 flex items-center justify-center p-4">
                  <div
                    className="rounded-xl border border-white/10 bg-slate-900 shadow-2xl max-w-sm w-full p-6"
                    role="dialog"
                    aria-labelledby="delete-modal-title"
                    aria-modal="true"
                  >
                    <h2 id="delete-modal-title" className="text-lg font-semibold text-slate-100 mb-2">
                      Delete Order #{deleteModalOrderId}?
                    </h2>
                    <p className="text-slate-400 text-sm mb-6">
                      This will permanently remove the order and cannot be undone.
                    </p>
                    <div className="flex gap-3 justify-end">
                      <button
                        onClick={() => !deletingId && setDeleteModalOrderId(null)}
                        disabled={!!deletingId}
                        className="px-4 py-2 rounded-lg border border-slate-600 text-slate-200 hover:bg-slate-800 disabled:opacity-50 transition-colors"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={() => deleteOrder(deleteModalOrderId)}
                        disabled={!!deletingId}
                        className="px-4 py-2 rounded-lg bg-red-500/20 text-red-400 hover:bg-red-500/30 border border-red-500/30 disabled:opacity-50 transition-colors font-medium"
                      >
                        {deletingId ? 'Deleting…' : 'Delete'}
                      </button>
                    </div>
                  </div>
                </div>
              </>
            )}
          </main>
        </div>
      </AdminGuard>
    </Suspense>
  )
}

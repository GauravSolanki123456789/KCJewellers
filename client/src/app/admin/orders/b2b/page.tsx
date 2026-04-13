'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import axios from '@/lib/axios'
import AdminGuard from '@/components/AdminGuard'
import { ArrowLeft, Building2, CheckCircle2, Package } from 'lucide-react'

type B2bOrder = {
  id: number
  user_id?: number
  total_amount?: number
  payment_status?: string
  payment_method?: string
  b2b_checkout_type?: string
  items_snapshot_json?: unknown
  created_at: string
  customer_name?: string
  customer_email?: string
  customer_mobile?: string
}

function parseItems(raw: unknown): Array<{ barcode?: string; item_name?: string; qty?: number; price?: number; net_wt_g?: unknown }> {
  let arr: unknown = raw
  if (typeof raw === 'string') {
    try {
      arr = JSON.parse(raw)
    } catch {
      return []
    }
  }
  return Array.isArray(arr) ? arr : []
}

export default function AdminB2bPurchaseOrdersPage() {
  const [orders, setOrders] = useState<B2bOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<B2bOrder | null>(null)
  const [actionLoading, setActionLoading] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await axios.get<{ data: B2bOrder[] }>('/api/admin/orders/b2b-pending')
      setOrders(Array.isArray(res.data?.data) ? res.data.data : [])
    } catch {
      setOrders([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const approve = async (o: B2bOrder, mode: 'confirm_neft' | 'post_ledger') => {
    setActionLoading(true)
    try {
      await axios.post(`/api/admin/orders/${o.id}/b2b-approve`, { mode })
      setOrders((prev) => prev.filter((x) => x.id !== o.id))
      setSelected((s) => (s?.id === o.id ? null : s))
    } catch (err: unknown) {
      const msg =
        err && typeof err === 'object' && 'response' in err
          ? (err as { response?: { data?: { error?: string } } }).response?.data?.error
          : 'Failed'
      alert(msg || 'Failed')
    } finally {
      setActionLoading(false)
    }
  }

  const fmt = (d: string) => {
    try {
      return new Date(d).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
    } catch {
      return d
    }
  }

  return (
    <AdminGuard>
      <div className="min-h-screen bg-slate-950 text-slate-100 pb-24">
        <main className="max-w-3xl mx-auto px-4 py-6">
          <div className="mb-6 flex flex-wrap items-center gap-3">
            <Link
              href="/admin/orders"
              className="inline-flex items-center gap-2 text-sm text-slate-400 hover:text-amber-500"
            >
              <ArrowLeft className="size-4" />
              Retail orders
            </Link>
            <Link href="/admin" className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-amber-500">
              Dashboard
            </Link>
          </div>

          <div className="flex items-center gap-2 mb-2">
            <Building2 className="size-7 text-emerald-400" aria-hidden />
            <h1 className="text-xl font-bold text-yellow-500">B2B purchase orders</h1>
          </div>
          <p className="text-sm text-slate-500 mb-6">Pending approval · wholesale POs (NEFT or ledger)</p>

          {loading ? (
            <p className="text-slate-500 text-sm">Loading…</p>
          ) : orders.length === 0 ? (
            <p className="text-slate-500 text-sm rounded-xl border border-white/10 bg-slate-900/40 px-4 py-8 text-center">
              No pending B2B orders.
            </p>
          ) : (
            <ul className="space-y-3">
              {orders.map((o) => {
                const items = parseItems(o.items_snapshot_json)
                const lines = items.reduce((s, it) => s + (Number(it.qty) || 1), 0)
                const type = String(o.b2b_checkout_type || '').toUpperCase()
                return (
                  <li key={o.id}>
                    <button
                      type="button"
                      onClick={() => setSelected(selected?.id === o.id ? null : o)}
                      className={`w-full text-left rounded-xl border px-4 py-3 transition-colors ${
                        selected?.id === o.id
                          ? 'border-emerald-500/50 bg-emerald-950/30'
                          : 'border-white/10 bg-slate-900/40 hover:border-white/20'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <span className="font-mono font-semibold text-white">#{o.id}</span>
                          <span
                            className={`ml-2 text-[10px] uppercase px-1.5 py-0.5 rounded ${
                              type === 'LEDGER' ? 'bg-amber-500/20 text-amber-300' : 'bg-sky-500/20 text-sky-300'
                            }`}
                          >
                            {type || '—'}
                          </span>
                        </div>
                        <span className="text-amber-400 font-semibold tabular-nums shrink-0">
                          ₹{Number(o.total_amount || 0).toLocaleString('en-IN')}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 mt-1">{fmt(o.created_at)}</p>
                      <p className="text-sm text-slate-300 mt-1 truncate">
                        {o.customer_name || '—'} · {lines} pcs
                      </p>
                    </button>

                    {selected?.id === o.id && (
                      <div className="mt-2 rounded-xl border border-white/10 bg-slate-900/60 p-4 space-y-4">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                          <div>
                            <span className="text-slate-500">Contact</span>
                            <p className="text-slate-200">{o.customer_mobile || o.customer_email || '—'}</p>
                          </div>
                          <div>
                            <span className="text-slate-500">Type</span>
                            <p className="text-slate-200">{type === 'LEDGER' ? 'Ledger (Khata)' : 'NEFT / RTGS'}</p>
                          </div>
                        </div>
                        <div className="border-t border-white/10 pt-3 space-y-2">
                          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Lines</p>
                          <ul className="space-y-2 max-h-48 overflow-y-auto text-xs">
                            {items.map((it, idx) => {
                              const qty = Number(it.qty) || 1
                              const price = Number(it.price) || 0
                              const wt = it.net_wt_g != null ? Number(it.net_wt_g) : null
                              return (
                                <li key={idx} className="flex justify-between gap-2 border-b border-white/5 pb-2">
                                  <div className="min-w-0">
                                    <p className="font-mono text-emerald-400/90">{String(it.barcode ?? '—')}</p>
                                    <p className="text-slate-400 truncate">{String(it.item_name ?? '')}</p>
                                    <p className="text-slate-600">{wt != null ? `${wt.toFixed(2)} g` : '—'} × {qty}</p>
                                  </div>
                                  <span className="tabular-nums text-slate-300 shrink-0">₹{Math.round(price * qty).toLocaleString('en-IN')}</span>
                                </li>
                              )
                            })}
                          </ul>
                        </div>
                        <div className="flex flex-col sm:flex-row gap-2 pt-1">
                          {type === 'NEFT' && (
                            <button
                              type="button"
                              disabled={actionLoading}
                              onClick={() => approve(o, 'confirm_neft')}
                              className="flex-1 min-h-[44px] rounded-lg bg-sky-600/30 hover:bg-sky-600/40 border border-sky-500/30 text-sm font-medium text-sky-200 py-2 px-3"
                            >
                              <CheckCircle2 className="inline size-4 mr-1 -mt-0.5" aria-hidden />
              Verify NEFT and accept
                            </button>
                          )}
                          {type === 'LEDGER' && (
                            <button
                              type="button"
                              disabled={actionLoading}
                              onClick={() => approve(o, 'post_ledger')}
                              className="flex-1 min-h-[44px] rounded-lg bg-emerald-600/30 hover:bg-emerald-600/40 border border-emerald-500/40 text-sm font-medium text-emerald-100 py-2 px-3"
                            >
                              <Package className="inline size-4 mr-1 -mt-0.5" aria-hidden />
              Approve and update ledger
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </main>
      </div>
    </AdminGuard>
  )
}

'use client'

import { useState, useEffect, useCallback, Suspense } from 'react'
import axios from '@/lib/axios'
import AdminGuard from '@/components/AdminGuard'
import Link from 'next/link'
import { Activity, ArrowLeft, User, Eye, LogIn, ShoppingCart } from 'lucide-react'

type ActivityLog = {
  id: number
  user_id: number | null
  session_id: string | null
  action_type: string
  target_id: string | null
  metadata: Record<string, unknown> | null
  created_at: string
  customer_name: string | null
  customer_mobile: string | null
  customer_email: string | null
}

function getActionLabel(actionType: string): string {
  switch (actionType) {
    case 'view_product': return 'Viewed Product'
    case 'login': return 'Logged In'
    case 'add_to_cart': return 'Added to Cart'
    default: return actionType
  }
}

function getActionIcon(actionType: string) {
  switch (actionType) {
    case 'view_product': return Eye
    case 'login': return LogIn
    case 'add_to_cart': return ShoppingCart
    default: return Activity
  }
}

export default function AdminInsightsPage() {
  const [logs, setLogs] = useState<ActivityLog[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await axios.get('/api/admin/insights', { params: { limit: 200 } })
      setLogs(Array.isArray(res.data?.data) ? res.data.data : [])
    } catch {
      setLogs([])
    } finally {
      setLoading(false)
    }
  }, [])

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

  const getCustomerDisplay = (log: ActivityLog) => {
    if (log.customer_name) return log.customer_name
    if (log.customer_mobile) return log.customer_mobile
    if (log.customer_email) return log.customer_email
    return 'Guest'
  }

  const getTargetDisplay = (log: ActivityLog): string => {
    if (log.action_type === 'view_product' || log.action_type === 'add_to_cart') {
      const t = log.target_id || (log.metadata && typeof log.metadata === 'object' && 'product_name' in log.metadata ? log.metadata.product_name : null)
      return t != null ? String(t) : '—'
    }
    return '—'
  }

  return (
    <Suspense fallback={<div className="min-h-screen bg-slate-950 flex items-center justify-center"><div className="text-slate-400">Loading...</div></div>}>
      <AdminGuard>
        <div className="min-h-screen bg-slate-950 text-slate-100">
          <main className="max-w-6xl mx-auto px-4 py-6 sm:py-8 pb-24 sm:pb-12">
            <Link
              href="/admin"
              className="inline-flex items-center gap-2 text-slate-400 hover:text-amber-500 mb-6 transition-colors"
            >
              <ArrowLeft className="size-4" /> Back to Dashboard
            </Link>

            <div className="mb-6 sm:mb-8">
              <div className="flex items-center gap-3 mb-2">
                <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20">
                  <Activity className="size-6 text-amber-500" />
                </div>
                <div>
                  <h1 className="text-xl sm:text-2xl font-bold text-slate-100">Customer Insights</h1>
                  <p className="text-slate-500 text-sm">Activity feed: product views, logins, cart actions</p>
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-white/10 bg-slate-900/30 overflow-hidden">
              {loading ? (
                <div className="p-12 sm:p-16 text-center">
                  <div className="inline-block h-8 w-8 animate-spin rounded-full border-2 border-amber-500 border-t-transparent" />
                  <p className="text-slate-500 mt-4">Loading activity…</p>
                </div>
              ) : logs.length === 0 ? (
                <div className="p-12 sm:p-16 text-center">
                  <div className="inline-flex p-4 rounded-full bg-slate-800/50 mb-4">
                    <Activity className="size-12 text-slate-600" />
                  </div>
                  <p className="text-slate-400 text-lg">No activity yet</p>
                  <p className="text-slate-500 text-sm mt-1">
                    Product views, logins, and add-to-cart events will appear here.
                  </p>
                </div>
              ) : (
                <>
                  {/* Mobile: Card layout */}
                  <div className="sm:hidden divide-y divide-white/5 p-4 space-y-3">
                    {logs.map((log) => {
                      const Icon = getActionIcon(log.action_type)
                      return (
                        <div
                          key={log.id}
                          className="rounded-xl border border-white/5 bg-slate-800/30 p-4 space-y-2"
                        >
                          <div className="flex items-center gap-2">
                            <div className="p-1.5 rounded-lg bg-amber-500/10">
                              <Icon className="size-4 text-amber-400" />
                            </div>
                            <span className="font-medium text-slate-200">{getActionLabel(log.action_type)}</span>
                          </div>
                          <div className="flex items-center gap-2 text-slate-400 text-sm">
                            <User className="size-4 shrink-0 opacity-60" />
                            {getCustomerDisplay(log)}
                          </div>
                          {getTargetDisplay(log) !== '—' && (
                            <div className="text-sm text-slate-500 font-mono truncate">
                              {getTargetDisplay(log)}
                            </div>
                          )}
                          <div className="text-xs text-slate-500 pt-1">
                            {formatDate(log.created_at)}
                          </div>
                        </div>
                      )
                    })}
                  </div>

                  {/* Desktop: Table layout */}
                  <div className="hidden sm:block overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-white/10 bg-slate-800/40">
                          <th className="text-left py-4 px-5 text-slate-400 font-medium text-sm">Timestamp</th>
                          <th className="text-left py-4 px-5 text-slate-400 font-medium text-sm">Customer</th>
                          <th className="text-left py-4 px-5 text-slate-400 font-medium text-sm">Action</th>
                          <th className="text-left py-4 px-5 text-slate-400 font-medium text-sm">Target</th>
                        </tr>
                      </thead>
                      <tbody>
                        {logs.map((log) => {
                          const Icon = getActionIcon(log.action_type)
                          return (
                            <tr
                              key={log.id}
                              className="border-b border-white/5 hover:bg-white/[0.02] transition-colors"
                            >
                              <td className="py-4 px-5 text-slate-400 text-sm whitespace-nowrap">
                                {formatDate(log.created_at)}
                              </td>
                              <td className="py-4 px-5">
                                <div className="flex items-center gap-2">
                                  <User className="size-4 text-slate-500 shrink-0 opacity-60" />
                                  <span className="text-slate-200">{getCustomerDisplay(log)}</span>
                                </div>
                              </td>
                              <td className="py-4 px-5">
                                <div className="flex items-center gap-2">
                                  <div className="p-1.5 rounded-lg bg-amber-500/10">
                                    <Icon className="size-4 text-amber-400" />
                                  </div>
                                  <span className="text-slate-200">{getActionLabel(log.action_type)}</span>
                                </div>
                              </td>
                              <td className="py-4 px-5">
                                <span className="text-slate-400 font-mono text-sm truncate max-w-[200px] block">
                                  {getTargetDisplay(log)}
                                </span>
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
          </main>
        </div>
      </AdminGuard>
    </Suspense>
  )
}

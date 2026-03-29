'use client'

import { useState, useEffect, useCallback, Suspense, useMemo } from 'react'
import axios from '@/lib/axios'
import AdminGuard from '@/components/AdminGuard'
import Link from 'next/link'
import { Activity, ArrowLeft, User, Eye, LogIn, ShoppingCart, ChevronDown, ChevronUp, Users } from 'lucide-react'

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

type GroupKey = string
type GroupedUser = {
  key: GroupKey
  customerDisplay: string
  customerEmail: string | null
  lastActive: string
  logs: ActivityLog[]
  counts: { view_product: number; add_to_cart: number; login: number }
  isGuestBucket?: boolean
  sessionCount?: number
}

function getActionLabel(actionType: string): string {
  switch (actionType) {
    case 'view_product':
      return 'Viewed Product'
    case 'login':
      return 'Logged In'
    case 'add_to_cart':
      return 'Added to Cart'
    default:
      return actionType
  }
}

function getActionIcon(actionType: string) {
  switch (actionType) {
    case 'view_product':
      return Eye
    case 'login':
      return LogIn
    case 'add_to_cart':
      return ShoppingCart
    default:
      return Activity
  }
}

function getTargetDisplay(log: ActivityLog): string {
  if (log.action_type !== 'view_product' && log.action_type !== 'add_to_cart') return '—'
  const barcode = log.target_id || ''
  const m = log.metadata
  const meta = m != null && typeof m === 'object' ? (m as Record<string, unknown>) : null
  const name = meta && 'product_name' in meta ? String(meta.product_name) : null
  const itemName = meta && 'item_name' in meta ? String(meta.item_name) : null
  const productName = name || itemName
  if (productName && barcode) return `${barcode} — ${productName}`
  if (productName) return productName
  return barcode || '—'
}

function groupLogsByUser(logs: ActivityLog[]): GroupedUser[] {
  const map = new Map<GroupKey, ActivityLog[]>()
  for (const log of logs) {
    const key: GroupKey =
      log.user_id != null ? `user_${log.user_id}` : log.session_id || `anon_${log.id}`
    if (!map.has(key)) map.set(key, [])
    map.get(key)!.push(log)
  }
  const groups: GroupedUser[] = []
  for (const [key, userLogs] of map) {
    const sorted = [...userLogs].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    )
    const lastActive = sorted[0]?.created_at || ''
    const firstLog = sorted[sorted.length - 1]
    const customerDisplay =
      firstLog?.customer_name ||
      firstLog?.customer_mobile ||
      firstLog?.customer_email ||
      'Guest'
    const customerEmail =
      sorted.find((l) => l.customer_email && String(l.customer_email).trim())?.customer_email?.trim() ||
      null
    const counts = { view_product: 0, add_to_cart: 0, login: 0 }
    for (const l of userLogs) {
      if (l.action_type === 'view_product') counts.view_product++
      else if (l.action_type === 'add_to_cart') counts.add_to_cart++
      else if (l.action_type === 'login') counts.login++
    }
    groups.push({
      key,
      customerDisplay,
      customerEmail,
      lastActive,
      logs: sorted,
      counts,
    })
  }
  groups.sort((a, b) => new Date(b.lastActive).getTime() - new Date(a.lastActive).getTime())
  return groups
}

/** Collapse many anonymous sessions into one row; keep registered users separate. */
function buildDisplayRows(groups: GroupedUser[]): GroupedUser[] {
  const registered = groups.filter((g) => g.key.startsWith('user_'))
  const guests = groups.filter((g) => !g.key.startsWith('user_'))

  if (guests.length === 0) return registered

  const allGuestLogs = guests.flatMap((g) => g.logs)
  const sortedGuestLogs = [...allGuestLogs].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  )
  const counts = { view_product: 0, add_to_cart: 0, login: 0 }
  for (const l of allGuestLogs) {
    if (l.action_type === 'view_product') counts.view_product++
    else if (l.action_type === 'add_to_cart') counts.add_to_cart++
    else if (l.action_type === 'login') counts.login++
  }
  const lastActive = sortedGuestLogs[0]?.created_at || ''

  const guestBucket: GroupedUser = {
    key: '_anonymous_sessions',
    customerDisplay: 'Anonymous visitors',
    customerEmail: null,
    lastActive,
    logs: sortedGuestLogs.slice(0, 200),
    counts,
    isGuestBucket: true,
    sessionCount: guests.length,
  }

  return [guestBucket, ...registered].sort(
    (a, b) => new Date(b.lastActive).getTime() - new Date(a.lastActive).getTime()
  )
}

function deduplicateTimeline(
  logs: ActivityLog[]
): Array<{ action_type: string; targetDisplay: string; count: number; latestAt: string }> {
  const keyed = new Map<string, { count: number; latestAt: string; targetDisplay: string }>()
  for (const log of logs) {
    const targetDisplay = getTargetDisplay(log)
    const k = `${log.action_type}::${log.target_id ?? ''}`
    const existing = keyed.get(k)
    if (existing) {
      existing.count++
      if (new Date(log.created_at) > new Date(existing.latestAt)) {
        existing.latestAt = log.created_at
        if (targetDisplay !== '—') existing.targetDisplay = targetDisplay
      }
    } else {
      keyed.set(k, { count: 1, latestAt: log.created_at, targetDisplay })
    }
  }
  return Array.from(keyed.entries())
    .map(([k, v]) => {
      const [action_type] = k.split('::')
      return { action_type, targetDisplay: v.targetDisplay, count: v.count, latestAt: v.latestAt }
    })
    .sort((a, b) => new Date(b.latestAt).getTime() - new Date(a.latestAt).getTime())
}

export default function AdminInsightsPage() {
  const [logs, setLogs] = useState<ActivityLog[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedKey, setExpandedKey] = useState<GroupKey | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await axios.get('/api/admin/insights', { params: { limit: 500 } })
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

  const formatTimeShort = (d: string) => {
    try {
      return new Date(d).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
    } catch {
      return '—'
    }
  }

  const groups = useMemo(() => buildDisplayRows(groupLogsByUser(logs)), [logs])

  const summary = useMemo(() => {
    let views = 0
    let carts = 0
    let logins = 0
    const userIds = new Set<number>()
    const sessions = new Set<string>()
    for (const log of logs) {
      if (log.action_type === 'view_product') views++
      else if (log.action_type === 'add_to_cart') carts++
      else if (log.action_type === 'login') logins++
      if (log.user_id != null) userIds.add(log.user_id)
      if (log.user_id == null && log.session_id) sessions.add(log.session_id)
    }
    return {
      views,
      carts,
      logins,
      guestSessions: sessions.size,
      registeredUsers: userIds.size,
    }
  }, [logs])

  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-slate-950 flex items-center justify-center">
          <div className="text-slate-400">Loading...</div>
        </div>
      }
    >
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
                  <p className="text-slate-500 text-sm">
                    Signed-in customers listed by name & email. Anonymous traffic is rolled into one
                    summary.
                  </p>
                </div>
              </div>
            </div>

            {!loading && logs.length > 0 && (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 sm:gap-3 mb-6">
                <div className="rounded-lg border border-white/10 bg-slate-900/50 px-3 py-3">
                  <div className="text-[10px] uppercase tracking-wide text-slate-500">Product views</div>
                  <div className="text-xl font-semibold text-amber-400 tabular-nums">{summary.views}</div>
                </div>
                <div className="rounded-lg border border-white/10 bg-slate-900/50 px-3 py-3">
                  <div className="text-[10px] uppercase tracking-wide text-slate-500">Cart adds</div>
                  <div className="text-xl font-semibold text-emerald-400 tabular-nums">{summary.carts}</div>
                </div>
                <div className="rounded-lg border border-white/10 bg-slate-900/50 px-3 py-3">
                  <div className="text-[10px] uppercase tracking-wide text-slate-500">Logins</div>
                  <div className="text-xl font-semibold text-cyan-400 tabular-nums">{summary.logins}</div>
                </div>
                <div className="rounded-lg border border-white/10 bg-slate-900/50 px-3 py-3">
                  <div className="text-[10px] uppercase tracking-wide text-slate-500">Guest sessions</div>
                  <div className="text-xl font-semibold text-slate-200 tabular-nums">
                    {summary.guestSessions}
                  </div>
                </div>
                <div className="rounded-lg border border-white/10 bg-slate-900/50 px-3 py-3 col-span-2 sm:col-span-1">
                  <div className="text-[10px] uppercase tracking-wide text-slate-500">Accounts (in feed)</div>
                  <div className="text-xl font-semibold text-slate-200 tabular-nums">
                    {summary.registeredUsers}
                  </div>
                </div>
              </div>
            )}

            <div className="rounded-xl border border-white/10 bg-slate-900/30 overflow-hidden">
              {loading ? (
                <div className="p-12 sm:p-16 text-center">
                  <div className="inline-block h-8 w-8 animate-spin rounded-full border-2 border-amber-500 border-t-transparent" />
                  <p className="text-slate-500 mt-4">Loading activity…</p>
                </div>
              ) : groups.length === 0 ? (
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
                <div className="divide-y divide-white/5">
                  {groups.map((group) => {
                    const isExpanded = expandedKey === group.key
                    const timeline = deduplicateTimeline(group.logs)
                    const isRegistered = group.key.startsWith('user_')
                    return (
                      <div key={group.key} className="transition-colors hover:bg-white/[0.02]">
                        <button
                          type="button"
                          onClick={() => setExpandedKey(isExpanded ? null : group.key)}
                          className="w-full text-left px-4 sm:px-5 py-3 sm:py-4 flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4"
                        >
                          <div className="flex items-start gap-3 min-w-0 flex-1">
                            <div className="p-2 rounded-xl bg-slate-800/50 border border-white/5 shrink-0 mt-0.5">
                              {group.isGuestBucket ? (
                                <Users className="size-5 text-slate-400" />
                              ) : (
                                <User className="size-5 text-amber-400" />
                              )}
                            </div>
                            <div className="min-w-0">
                              <div className="font-semibold text-slate-100 truncate">
                                {group.customerDisplay}
                                {group.isGuestBucket && group.sessionCount != null && (
                                  <span className="ml-2 font-normal text-slate-500 text-sm">
                                    ({group.sessionCount} sessions)
                                  </span>
                                )}
                              </div>
                              {isRegistered && group.customerEmail && (
                                <div className="text-xs text-slate-400 truncate mt-0.5">
                                  {group.customerEmail}
                                </div>
                              )}
                              {group.isGuestBucket && (
                                <div className="text-xs text-slate-500 mt-0.5">
                                  Combined anonymous traffic (not logged in)
                                </div>
                              )}
                              <div className="text-sm text-slate-500 mt-1">
                                Last activity: {formatDate(group.lastActive)}
                              </div>
                            </div>
                          </div>
                          <div className="flex flex-wrap gap-2 sm:justify-end">
                            {group.counts.login > 0 && (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-cyan-500/20 text-cyan-400 text-xs font-medium border border-cyan-500/20">
                                <LogIn className="size-3.5" /> {group.counts.login} Login
                                {group.counts.login !== 1 ? 's' : ''}
                              </span>
                            )}
                            {group.counts.view_product > 0 && (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-500/20 text-amber-400 text-xs font-medium border border-amber-500/20">
                                <Eye className="size-3.5" /> {group.counts.view_product} View
                                {group.counts.view_product !== 1 ? 's' : ''}
                              </span>
                            )}
                            {group.counts.add_to_cart > 0 && (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-500/20 text-emerald-400 text-xs font-medium border border-emerald-500/20">
                                <ShoppingCart className="size-3.5" /> {group.counts.add_to_cart} Cart
                                {group.counts.add_to_cart !== 1 ? 's' : ''}
                              </span>
                            )}
                          </div>
                          <div className="shrink-0 self-start sm:self-center">
                            {isExpanded ? (
                              <ChevronUp className="size-5 text-slate-400" />
                            ) : (
                              <ChevronDown className="size-5 text-slate-400" />
                            )}
                          </div>
                        </button>

                        <div
                          className={`grid transition-all duration-300 ease-in-out overflow-hidden ${
                            isExpanded ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
                          }`}
                        >
                          <div className="min-h-0">
                            <div className="border-t border-white/5 bg-slate-800/20 px-4 sm:px-5 py-4">
                              <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
                                {group.isGuestBucket ? 'Recent actions (combined)' : 'Activity timeline'}
                              </div>
                              <ul className="space-y-2 max-h-[min(60vh,28rem)] overflow-y-auto pr-1">
                                {timeline.slice(0, 40).map((item, idx) => {
                                  const Icon = getActionIcon(item.action_type)
                                  const label = getActionLabel(item.action_type)
                                  const targetPart =
                                    item.targetDisplay !== '—' ? `: ${item.targetDisplay}` : ''
                                  const countPart = item.count > 1 ? ` (×${item.count})` : ''
                                  return (
                                    <li
                                      key={idx}
                                      className="flex items-start gap-3 py-2 px-3 rounded-lg bg-slate-800/40 border border-white/5"
                                    >
                                      <div className="p-1.5 rounded-lg bg-amber-500/10 shrink-0 mt-0.5">
                                        <Icon className="size-4 text-amber-400" />
                                      </div>
                                      <div className="min-w-0 flex-1">
                                        <span className="text-slate-200 text-sm">
                                          {label}
                                          {targetPart}
                                          {countPart}
                                        </span>
                                        <div className="text-xs text-slate-500 mt-0.5">
                                          {formatTimeShort(item.latestAt)}
                                        </div>
                                      </div>
                                    </li>
                                  )
                                })}
                                {timeline.length > 40 && (
                                  <li className="text-xs text-slate-500 py-2 text-center">
                                    … and {timeline.length - 40} more grouped actions
                                  </li>
                                )}
                              </ul>
                            </div>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </main>
        </div>
      </AdminGuard>
    </Suspense>
  )
}

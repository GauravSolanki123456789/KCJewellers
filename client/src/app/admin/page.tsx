'use client'

import { Suspense } from 'react'
import AdminGuard from '@/components/AdminGuard'
import Link from 'next/link'
import {
  LayoutDashboard,
  TrendingUp,
  Package,
  ArrowRight,
  BarChart3,
  Wallet,
  BookMarked,
  ShoppingCart,
  Code2,
  CircleDollarSign,
  Activity,
  Receipt,
  Tag,
  Building2,
  ClipboardList,
  Bell,
  Palette,
} from 'lucide-react'
import { useAdminInboxSummary } from '@/hooks/useAdminInboxSummary'
import { formatAdminInboxBadge } from '@/lib/admin-inbox-summary'
import type { AdminInboxSummaryData } from '@/lib/admin-inbox-summary'

const ADMIN_SECTIONS = [
  {
    title: 'Colour themes',
    description: 'Global app palette + default for resellers & shared catalogues (kc_theme_id)',
    href: '/admin/theme',
    icon: Palette,
    color: 'rose',
  },
  {
    title: 'Live Rates & Margins',
    description: 'Set gold/silver rates, admin margins, making charges',
    href: '/admin/rates',
    icon: TrendingUp,
    color: 'yellow',
  },
  {
    title: 'SIP Plans Manager',
    description: 'Create and manage Gold, Silver & Diamond SIP plans',
    href: '/admin/sip/plans',
    icon: CircleDollarSign,
    color: 'amber',
  },
  {
    title: 'SIP Payout Requests',
    description: 'Process withdrawal requests from SIP cancellations',
    href: '/admin/sip/payouts',
    icon: Wallet,
    color: 'emerald',
  },
  {
    title: 'Metal Liabilities Ledger',
    description: 'Total Gold, Silver & Diamond owed across SIPs and Rate Bookings',
    href: '/admin/liabilities',
    icon: BarChart3,
    color: 'cyan',
  },
  {
    title: 'Master Transactions',
    description: 'Every payment from Orders, Rate Bookings, and SIP Installments',
    href: '/admin/transactions',
    icon: Receipt,
    color: 'amber',
  },
  {
    title: 'Products & Catalogue',
    description: 'Import from ERP, edit, remove products',
    href: '/admin/products',
    icon: Package,
    color: 'violet',
  },
  {
    title: 'Rate Bookings',
    description: 'Manage gold & silver rate bookings',
    href: '/admin/bookings',
    icon: BookMarked,
    color: 'rose',
  },
  {
    title: 'Orders',
    description: 'Who ordered what, when, rate, delivery',
    href: '/admin/orders',
    icon: ShoppingCart,
    color: 'indigo',
  },
  {
    title: 'B2B purchase orders',
    description: 'Approve wholesale POs: verify NEFT or post to Khata (ledger)',
    href: '/admin/orders/b2b',
    icon: ClipboardList,
    color: 'emerald',
  },
  {
    title: 'B2B wholesale clients',
    description: 'Enable B2B tier by email or mobile, set MC discount & markup, post ledger entries',
    href: '/admin/b2b-clients',
    icon: Building2,
    color: 'emerald',
  },
  {
    title: 'Promo Codes & Offers',
    description: 'Create marketing campaigns: fixed amount, percentage, free shipping',
    href: '/admin/promos',
    icon: Tag,
    color: 'rose',
  },
  {
    title: 'Customer Insights',
    description: 'Activity feed: product views, logins, cart actions',
    href: '/admin/insights',
    icon: Activity,
    color: 'amber',
  },
  {
    title: 'Developer API & Sync',
    description: 'Generate API key, link ERP, push products via REST',
    href: '/admin/developer',
    icon: Code2,
    color: 'violet',
  },
] as const

function InboxSummaryStrip({ inbox }: { inbox: AdminInboxSummaryData | null }) {
  if (!inbox) return null
  const c = inbox.counts
  const hasOperationalQueue =
    inbox.totalAttentionCount > 0 ||
    c.newCustomersLast7Days > 0 ||
    c.customerActivityEvents24h > 0
  if (!hasOperationalQueue && inbox.navAttentionCount <= 0) return null

  const parts: string[] = []
  const ord = c.retailOrdersPaymentPending + c.retailOrdersRecentFulfillment
  if (ord > 0) parts.push(`${ord} order${ord === 1 ? '' : 's'} in queue`)
  if (c.b2bOrdersPendingApproval > 0)
    parts.push(`${c.b2bOrdersPendingApproval} B2B PO${c.b2bOrdersPendingApproval === 1 ? '' : 's'}`)
  if (c.sipPayoutsPending > 0)
    parts.push(`${c.sipPayoutsPending} payout${c.sipPayoutsPending === 1 ? '' : 's'}`)
  if (c.rateBookingsRecentBooked > 0)
    parts.push(
      `${c.rateBookingsRecentBooked} booking${c.rateBookingsRecentBooked === 1 ? '' : 's'} (7d)`
    )
  if (c.newCustomersLast7Days > 0) {
    parts.push(
      `${c.newCustomersLast7Days} new customer${c.newCustomersLast7Days === 1 ? '' : 's'} (7d)`
    )
  } else if (c.customerActivityEvents24h > 0) {
    const ev = Math.min(c.customerActivityEvents24h, 99)
    parts.push(`${ev} insight event${ev === 1 ? '' : 's'} (24h)`)
  }

  const sub =
    parts.length > 0
      ? parts.join(' · ')
      : inbox.navAttentionCount > 0
        ? 'New updates in some sections since you last opened them'
        : ''
  return (
    <div className="mb-5 rounded-xl border border-amber-500/25 bg-amber-500/[0.07] px-3 py-2.5 sm:px-4 sm:py-3">
      <div className="flex items-start gap-2.5 sm:items-center">
        <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-amber-500/20 sm:mt-0">
          <Bell className="size-4 text-amber-400" aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold text-amber-200/95 sm:text-sm">Operations queue</p>
          <p className="mt-0.5 text-[11px] leading-snug text-slate-400 sm:text-xs">{sub}</p>
        </div>
        {inbox.navAttentionCount > 0 ? (
          <span className="shrink-0 rounded-full bg-rose-500/90 px-2 py-0.5 text-[10px] font-bold tabular-nums text-white sm:text-xs">
            {formatAdminInboxBadge(inbox.navAttentionCount)}
          </span>
        ) : null}
      </div>
    </div>
  )
}

function AdminDashboardInner() {
  const { data: inbox } = useAdminInboxSummary(true)

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <main className="mx-auto max-w-4xl px-4 py-8 pb-24">
        <div className="mb-8">
          <h1 className="flex items-center gap-2 text-2xl font-bold text-yellow-500">
            <LayoutDashboard className="size-7" />
            Admin Dashboard
          </h1>
          <p className="mt-2 text-sm text-slate-400">
            Manage rates, margins, products, SIP plans, and all app settings.
          </p>
        </div>

        <InboxSummaryStrip inbox={inbox} />

        {ADMIN_SECTIONS && ADMIN_SECTIONS.length > 0 ? (
          <div className="grid gap-4 sm:grid-cols-2">
            {ADMIN_SECTIONS.map((section) => {
              const Icon = section.icon
              const n = inbox?.badgesByHref[section.href] ?? 0
              const label = formatAdminInboxBadge(n)

              return (
                <Link
                  key={section.href}
                  href={section.href}
                  className="group relative block rounded-xl border border-white/10 p-5 transition-all glass-card hover:border-white/20"
                >
                  {n > 0 && (
                    <span
                      className="absolute right-10 top-3 z-10 flex min-h-5 min-w-5 items-center justify-center rounded-full bg-rose-500/95 px-1.5 text-[10px] font-bold tabular-nums text-white shadow-md shadow-black/40 sm:right-11 sm:top-4"
                      aria-label={`${label} updates for ${section.title}`}
                    >
                      {label}
                    </span>
                  )}
                  <div className="flex items-start justify-between gap-2 pr-7 sm:pr-8">
                    <div className="flex min-w-0 items-start gap-3 sm:gap-4">
                      <div className="relative shrink-0 rounded-lg border border-white/10 bg-white/5 p-2.5 transition-colors group-hover:border-yellow-500/20 group-hover:bg-yellow-500/10">
                        <Icon className="size-5 shrink-0 text-yellow-500" />
                      </div>
                      <div className="min-w-0">
                        <h2 className="font-semibold text-slate-200 transition-colors group-hover:text-yellow-400">
                          {section.title}
                        </h2>
                        <p className="mt-0.5 text-sm text-slate-500">{section.description}</p>
                      </div>
                    </div>
                    <ArrowRight className="mt-1 size-4 shrink-0 text-slate-500 transition-all group-hover:translate-x-1 group-hover:text-yellow-500" />
                  </div>
                </Link>
              )
            })}
          </div>
        ) : (
          <div className="glass-card p-8 text-center">
            <p className="text-slate-400">No admin sections available.</p>
          </div>
        )}
      </main>
    </div>
  )
}

export default function AdminDashboardPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-slate-950">
          <div className="text-slate-400">Loading...</div>
        </div>
      }
    >
      <AdminGuard>
        <AdminDashboardInner />
      </AdminGuard>
    </Suspense>
  )
}

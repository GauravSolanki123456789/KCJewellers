'use client'

import { Suspense, type ComponentType } from 'react'
import AdminGuard from '@/components/AdminGuard'
import Link from 'next/link'
import {
  LayoutDashboard,
  TrendingUp,
  Package,
  ChevronRight,
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

type AdminLink = {
  title: string
  description: string
  href: string
  icon: ComponentType<{ className?: string }>
}

const ADMIN_GROUPS: { heading: string; items: AdminLink[] }[] = [
  {
    heading: 'Needs attention',
    items: [
      {
        title: 'Orders',
        description: 'Retail checkout — payment, fulfilment & delivery',
        href: '/admin/orders',
        icon: ShoppingCart,
      },
      {
        title: 'B2B purchase orders',
        description: 'Approve wholesale POs — NEFT or Khata (ledger)',
        href: '/admin/orders/b2b',
        icon: ClipboardList,
      },
      {
        title: 'Products & reseller uploads',
        description: 'ERP catalogue + approve reseller Excel & photo batches',
        href: '/admin/products',
        icon: Package,
      },
      {
        title: 'B2B wholesale clients',
        description: 'Reseller tiers, invite codes, applications, disc %, ledger',
        href: '/admin/b2b-clients',
        icon: Building2,
      },
      {
        title: 'Reseller catalogue analytics',
        description: 'Shared links, WhatsApp/PDF inquiries, quoted pieces & value',
        href: '/admin/reseller-catalog-analytics',
        icon: BarChart3,
      },
      {
        title: 'Rate bookings',
        description: 'Gold & silver rate-lock bookings',
        href: '/admin/bookings',
        icon: BookMarked,
      },
      {
        title: 'SIP payout requests',
        description: 'Withdrawals from SIP cancellations',
        href: '/admin/sip/payouts',
        icon: Wallet,
      },
    ],
  },
  {
    heading: 'Pricing & catalogue',
    items: [
      {
        title: 'Live rates & margins',
        description: 'Gold/silver rates, admin margins, making charges',
        href: '/admin/rates',
        icon: TrendingUp,
      },
      {
        title: 'Promo codes & offers',
        description: 'Fixed amount, percentage, or free-shipping campaigns',
        href: '/admin/promos',
        icon: Tag,
      },
      {
        title: 'Developer API & ERP sync',
        description: 'API keys, link ERP, push products via REST',
        href: '/admin/developer',
        icon: Code2,
      },
    ],
  },
  {
    heading: 'SIP & finance',
    items: [
      {
        title: 'SIP plans',
        description: 'Gold, Silver & Diamond investment plans',
        href: '/admin/sip/plans',
        icon: CircleDollarSign,
      },
      {
        title: 'Metal liabilities',
        description: 'Gold, Silver & Diamond owed — SIPs & bookings',
        href: '/admin/liabilities',
        icon: BarChart3,
      },
      {
        title: 'Master transactions',
        description: 'All payments — orders, bookings & SIP instalments',
        href: '/admin/transactions',
        icon: Receipt,
      },
    ],
  },
  {
    heading: 'Brand & insights',
    items: [
      {
        title: 'Colour themes',
        description: 'Global palette & default for resellers (kc_theme_id)',
        href: '/admin/theme',
        icon: Palette,
      },
      {
        title: 'Customer insights',
        description: 'Views, logins, cart actions & sign-ups',
        href: '/admin/insights',
        icon: Activity,
      },
    ],
  },
]

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mb-2 px-0.5 text-[11px] font-semibold uppercase tracking-wider text-[var(--color-jewelry-black,#94a3b8)]/55">
      {children}
    </h2>
  )
}

function AdminActionCard({
  href,
  icon: Icon,
  title,
  description,
  badge,
}: AdminLink & { badge?: string }) {
  return (
    <Link
      href={href}
      className="kc-admin-card group flex min-h-[4.25rem] items-center gap-3 rounded-2xl px-4 py-3.5 transition hover:border-[var(--kc-accent,#d4af37)]/35 hover:bg-[var(--color-slate-900,#faf8f4)] active:scale-[0.99]"
    >
      <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[var(--kc-accent,#d4af37)]/12 ring-1 ring-[var(--kc-accent,#d4af37)]/20">
        <Icon className="size-5 text-[var(--kc-accent,#d4af37)]" aria-hidden />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold leading-snug text-[var(--color-jewelry-black,#1a1814)] group-hover:text-[var(--kc-accent,#b8860b)]">
          {title}
        </p>
        <p className="mt-0.5 text-xs leading-snug text-[var(--color-jewelry-black,#1a1814)]/55">{description}</p>
      </div>
      {badge ? (
        <span className="flex h-6 min-w-6 shrink-0 items-center justify-center rounded-full bg-rose-500 px-2 text-[10px] font-bold text-white">
          {badge}
        </span>
      ) : null}
      <ChevronRight
        className="size-4 shrink-0 text-[var(--color-jewelry-black,#1a1814)]/30 group-hover:text-[var(--kc-accent,#d4af37)]"
        aria-hidden
      />
    </Link>
  )
}

function InboxSummaryStrip({ inbox }: { inbox: AdminInboxSummaryData | null }) {
  if (!inbox) return null
  const c = inbox.counts
  const hasOperationalQueue =
    inbox.totalAttentionCount > 0 ||
    c.newCustomersLast7Days > 0 ||
    c.customerActivityEvents24h > 0 ||
    c.resellerApplicationsPending > 0 ||
    c.resellerProductSubmissionsPending > 0
  if (!hasOperationalQueue && inbox.navAttentionCount <= 0) return null

  const parts: string[] = []
  const ord = c.retailOrdersPaymentPending + c.retailOrdersRecentFulfillment
  if (ord > 0) parts.push(`${ord} order${ord === 1 ? '' : 's'} in queue`)
  if (c.b2bOrdersPendingApproval > 0)
    parts.push(`${c.b2bOrdersPendingApproval} B2B PO${c.b2bOrdersPendingApproval === 1 ? '' : 's'}`)
  if (c.resellerProductSubmissionsPending > 0)
    parts.push(
      `${c.resellerProductSubmissionsPending} reseller upload${c.resellerProductSubmissionsPending === 1 ? '' : 's'}`,
    )
  if (c.sipPayoutsPending > 0)
    parts.push(`${c.sipPayoutsPending} payout${c.sipPayoutsPending === 1 ? '' : 's'}`)
  if (c.rateBookingsRecentBooked > 0)
    parts.push(`${c.rateBookingsRecentBooked} booking${c.rateBookingsRecentBooked === 1 ? '' : 's'} (7d)`)
  if (c.resellerCatalogInquiriesPending > 0)
    parts.push(
      `${c.resellerCatalogInquiriesPending} catalogue inquir${c.resellerCatalogInquiriesPending === 1 ? 'y' : 'ies'}`,
    )
  if (c.resellerApplicationsPending > 0)
    parts.push(
      `${c.resellerApplicationsPending} reseller application${c.resellerApplicationsPending === 1 ? '' : 's'}`,
    )
  if (c.newCustomersLast7Days > 0) {
    parts.push(`${c.newCustomersLast7Days} new customer${c.newCustomersLast7Days === 1 ? '' : 's'} (7d)`)
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
    <div className="mb-6 rounded-2xl border border-[var(--kc-accent,#d4af37)]/30 bg-[var(--kc-accent,#d4af37)]/[0.08] px-4 py-3">
      <div className="flex items-start gap-3">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-[var(--kc-accent,#d4af37)]/15">
          <Bell className="size-4 text-[var(--kc-accent,#d4af37)]" aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-[var(--color-jewelry-black,#1a1814)]">Operations queue</p>
          <p className="mt-0.5 text-xs leading-snug text-[var(--color-jewelry-black,#1a1814)]/60">{sub}</p>
        </div>
        {inbox.navAttentionCount > 0 ? (
          <span className="shrink-0 rounded-full bg-rose-500 px-2.5 py-0.5 text-xs font-bold tabular-nums text-white">
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
    <div className="kc-admin-dashboard min-h-screen bg-[var(--color-slate-950,#0f172a)] text-[var(--color-jewelry-black,#f1f5f9)]">
      <main className="mx-auto max-w-lg px-4 py-6 pb-24 md:max-w-xl md:py-8">
        <header className="mb-6">
          <h1 className="flex items-center gap-2 text-xl font-semibold text-[var(--color-jewelry-black,#1a1814)]">
            <LayoutDashboard className="size-6 text-[var(--kc-accent,#d4af37)]" aria-hidden />
            Admin dashboard
          </h1>
          <p className="mt-1.5 text-sm text-[var(--color-jewelry-black,#1a1814)]/55">
            Orders, reseller uploads, rates, SIP & app settings
          </p>
        </header>

        <InboxSummaryStrip inbox={inbox} />

        <div className="space-y-6">
          {ADMIN_GROUPS.map((group) => (
            <section key={group.heading}>
              <SectionHeading>{group.heading}</SectionHeading>
              <div className="space-y-2">
                {group.items.map((item) => {
                  const n = inbox?.badgesByHref[item.href] ?? 0
                  const badge = formatAdminInboxBadge(n)
                  return (
                    <AdminActionCard
                      key={item.href}
                      {...item}
                      badge={badge || undefined}
                    />
                  )
                })}
              </div>
            </section>
          ))}
        </div>
      </main>
    </div>
  )
}

export default function AdminDashboardPage() {
  return (
    <Suspense
      fallback={
        <div className="kc-admin-dashboard flex min-h-screen items-center justify-center text-[var(--color-jewelry-black,#1a1814)]/50">
          Loading…
        </div>
      }
    >
      <AdminGuard>
        <AdminDashboardInner />
      </AdminGuard>
    </Suspense>
  )
}

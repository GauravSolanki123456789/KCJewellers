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
} from 'lucide-react'

const ADMIN_SECTIONS = [
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
]

export default function AdminDashboardPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-slate-950 flex items-center justify-center"><div className="text-slate-400">Loading...</div></div>}>
      <AdminGuard>
        <div className="min-h-screen bg-slate-950 text-slate-100">
        <main className="max-w-4xl mx-auto px-4 py-8 pb-24">
          <div className="mb-8">
            <h1 className="text-2xl font-bold text-yellow-500 flex items-center gap-2">
              <LayoutDashboard className="size-7" />
              Admin Dashboard
            </h1>
            <p className="mt-2 text-slate-400 text-sm">
              Manage rates, margins, products, SIP plans, and all app settings.
            </p>
          </div>

          {ADMIN_SECTIONS && ADMIN_SECTIONS.length > 0 ? (
            <>
              <div className="grid gap-4 sm:grid-cols-2">
                {ADMIN_SECTIONS.map((section) => {
                  const Icon = section.icon
                  return (
                    <Link
                      key={section.href}
                      href={section.href}
                      className="group block glass-card rounded-xl border border-white/10 hover:border-white/20 transition-all p-5"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex items-start gap-4">
                          <div className="p-2.5 rounded-lg bg-white/5 border border-white/10 group-hover:bg-yellow-500/10 group-hover:border-yellow-500/20 transition-colors">
                            <Icon className="size-5 text-yellow-500" />
                          </div>
                          <div>
                            <h2 className="font-semibold text-slate-200 group-hover:text-yellow-400 transition-colors">
                              {section.title}
                            </h2>
                            <p className="text-sm text-slate-500 mt-0.5">{section.description}</p>
                          </div>
                        </div>
                        <ArrowRight className="size-4 text-slate-500 group-hover:text-yellow-500 group-hover:translate-x-1 transition-all shrink-0 mt-1" />
                      </div>
                    </Link>
                  )
                })}
              </div>
            </>
          ) : (
            <div className="glass-card p-8 text-center">
              <p className="text-slate-400">No admin sections available.</p>
            </div>
          )}
        </main>
      </div>
      </AdminGuard>
    </Suspense>
  )
}

'use client'

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
    title: 'Gold Lot Movements',
    description: 'View credits, debits, and gold balance movements',
    href: '/admin/sip/movements',
    icon: BarChart3,
    color: 'cyan',
  },
  {
    title: 'SIP Payout Requests',
    description: 'Approve or reject withdrawal requests',
    href: '/admin/sip/payouts',
    icon: Wallet,
    color: 'emerald',
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
    title: 'Developer API & Sync',
    description: 'Generate API key, link ERP, push products via REST',
    href: '/admin/developer',
    icon: Code2,
    color: 'violet',
  },
]

export default function AdminDashboardPage() {
  return (
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

          <div className="mt-8 p-4 rounded-xl bg-amber-500/10 border border-amber-500/20">
            <p className="text-sm text-amber-200/90">
              <strong>Note:</strong> Some sections may link to legacy admin panels. Full backend features (margins, MC, ERP import, catalogue management) will be built out in subsequent updates.
            </p>
          </div>
        </main>
      </div>
    </AdminGuard>
  )
}

'use client'

import { Suspense } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { useLoginModal } from '@/context/LoginModalContext'
import {
  HOME_PATH,
  POLICY_PRIVACY_PATH,
  POLICY_REFUNDS_PATH,
  POLICY_SHIPPING_PATH,
  POLICY_TERMS_PATH,
  PROFILE_PATH,
  PROFILE_LEDGER_PATH,
  WHOLESALE_ORDER_PATH,
} from '@/lib/routes'
import { useCustomerTier } from '@/context/CustomerTierContext'
import Link from 'next/link'
import { Wallet, History, LayoutDashboard, User, Sparkles, LogOut, TrendingUp, FileText, ChevronRight, Package, BookMarked } from 'lucide-react'
import axios from 'axios'

const SUPER_ADMIN_EMAIL = 'jaigaurav56789@gmail.com'

const LEGAL_SUPPORT_LINKS = [
  { href: POLICY_TERMS_PATH, label: 'Terms & Conditions' },
  { href: POLICY_PRIVACY_PATH, label: 'Privacy Policy' },
  { href: POLICY_REFUNDS_PATH, label: 'Refunds & cancellations' },
  { href: POLICY_SHIPPING_PATH, label: 'Shipping & delivery' },
] as const

type UserType = { role?: string; email?: string; name?: string; mobile_number?: string }

export default function ProfilePage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-slate-950 flex items-center justify-center"><div className="text-slate-400">Loading profile...</div></div>}>
      <ProfilePageContent />
    </Suspense>
  )
}

function ProfilePageContent() {
  const auth = useAuth()
  const { hasWholesaleAccess } = useCustomerTier()
  const { open: openLoginModal } = useLoginModal()
  const user = auth.user as UserType | undefined
  const email = (user?.email || '').toLowerCase().trim()
  const isAdmin = email === SUPER_ADMIN_EMAIL

  const handleLogout = async () => {
    const url = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'
    try {
      await axios.get(`${url}/api/auth/logout`, { withCredentials: true })
      window.location.href = HOME_PATH
    } catch (error) {
      console.error('Logout error:', error)
      window.location.href = HOME_PATH
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <main className="max-w-4xl mx-auto px-4 py-8 kc-pb-mobile-nav md:pb-12">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold bg-gradient-to-r from-yellow-400 via-amber-400 to-yellow-500 bg-clip-text text-transparent flex items-center gap-2">
            <Sparkles className="size-6 text-yellow-500" />
            Profile
          </h1>
          {auth.isAuthenticated && user && (
            <div className="mt-2">
              <p className="text-slate-300 font-medium">{user.name || user.email || (user.mobile_number ? `+91 ${user.mobile_number}` : 'User')}</p>
              {(user.email || user.mobile_number) && (
                <p className="text-slate-500 text-sm">{user.email || (user.mobile_number ? `+91 ${user.mobile_number}` : '')}</p>
              )}
              {user.role === 'super_admin' && (
                <span className="inline-block mt-1 px-2 py-0.5 text-xs font-medium bg-amber-500/20 text-amber-400 border border-amber-500/30 rounded">
                  Admin
                </span>
              )}
            </div>
          )}
        </div>

        {/* Legal & policies — grid on tablet+; large tap targets on mobile */}
        <section className="mb-6">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500 mb-1">
            Legal & support
          </h2>
          <p className="text-xs text-slate-600 mb-3">
            Policies and help — use &quot;Back to profile&quot; on each page to return here.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3">
            {LEGAL_SUPPORT_LINKS.map(({ href, label }) => (
              <Link
                key={href}
                href={href}
                className="glass-card flex min-h-[52px] items-center justify-between gap-3 rounded-xl border border-white/10 px-4 py-3 text-slate-200 transition-colors hover:border-amber-500/25 hover:bg-white/5 active:bg-white/[0.07]"
              >
                <span className="flex min-w-0 items-center gap-3">
                  <FileText className="size-5 shrink-0 text-amber-500/80" aria-hidden />
                  <span className="text-sm font-medium leading-snug">{label}</span>
                </span>
                <ChevronRight className="size-4 shrink-0 text-slate-500" aria-hidden />
              </Link>
            ))}
          </div>
        </section>

        {/* Wallet Balance - Glassmorphism */}
        <section className="mb-6">
          <div className="glass-card rounded-2xl overflow-hidden border border-white/10 bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-xl">
            <div className="p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2 rounded-xl bg-yellow-500/20 border border-yellow-500/30">
                  <Wallet className="size-6 text-yellow-500" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-slate-200">Wallet Balance</h2>
                  <p className="text-xs text-slate-500">Available for purchases & bookings</p>
                </div>
              </div>
              <div className="text-3xl font-bold text-yellow-500 tabular-nums">
                ₹0
              </div>
              <p className="text-xs text-slate-500 mt-1">Add funds to get started</p>
            </div>
          </div>
        </section>

        {/* B2B wholesale — only approved wholesale accounts */}
        {auth.isAuthenticated && hasWholesaleAccess && (
          <section className="mb-6 grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Link
              href={WHOLESALE_ORDER_PATH}
              className="group block glass-card rounded-2xl overflow-hidden border border-emerald-500/30 bg-gradient-to-br from-emerald-500/[0.12] to-emerald-950/25 shadow-lg shadow-black/20 transition hover:border-emerald-500/50 hover:from-emerald-500/20 active:scale-[0.99]"
            >
              <div className="flex min-h-[5.5rem] items-center gap-4 p-5">
                <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-emerald-500/15 ring-1 ring-emerald-500/25 transition group-hover:bg-emerald-500/25">
                  <Package className="size-6 text-emerald-400" aria-hidden />
                </div>
                <div className="min-w-0 flex-1">
                  <h2 className="text-base font-semibold text-emerald-300">Wholesale quick order</h2>
                  <p className="text-xs text-slate-500 mt-0.5 leading-snug">SKU matrix & bulk add to cart</p>
                </div>
                <ChevronRight className="size-5 shrink-0 text-emerald-500/80 transition group-hover:translate-x-0.5" aria-hidden />
              </div>
            </Link>
            <Link
              href={PROFILE_LEDGER_PATH}
              className="group block glass-card rounded-2xl overflow-hidden border border-emerald-500/30 bg-gradient-to-br from-emerald-500/[0.12] to-emerald-950/25 shadow-lg shadow-black/20 transition hover:border-emerald-500/50 hover:from-emerald-500/20 active:scale-[0.99]"
            >
              <div className="flex min-h-[5.5rem] items-center gap-4 p-5">
                <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-emerald-500/15 ring-1 ring-emerald-500/25 transition group-hover:bg-emerald-500/25">
                  <BookMarked className="size-6 text-emerald-400" aria-hidden />
                </div>
                <div className="min-w-0 flex-1">
                  <h2 className="text-base font-semibold text-emerald-300">Ledger (Khata)</h2>
                  <p className="text-xs text-slate-500 mt-0.5 leading-snug">Rupee & fine metal balances</p>
                </div>
                <ChevronRight className="size-5 shrink-0 text-emerald-500/80 transition group-hover:translate-x-0.5" aria-hidden />
              </div>
            </Link>
          </section>
        )}

        {/* My SIP Investments - For all authenticated customers */}
        {auth.isAuthenticated && (
          <section className="mb-6">
            <Link
              href="/profile/sips"
              className="block glass-card rounded-2xl overflow-hidden border border-amber-500/30 bg-gradient-to-br from-amber-500/10 to-amber-500/5 hover:from-amber-500/20 hover:to-amber-500/10 transition-all group"
            >
              <div className="p-6 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="p-3 rounded-xl bg-amber-500/20 border border-amber-500/30 group-hover:bg-amber-500/30 transition-colors">
                    <TrendingUp className="size-8 text-amber-500" />
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold text-amber-400">My SIPs</h2>
                    <p className="text-sm text-slate-500">Track your Gold, Silver & Diamond investments</p>
                  </div>
                </div>
                <span className="text-amber-500 group-hover:translate-x-1 transition-transform">→</span>
              </div>
            </Link>
          </section>
        )}

        {/* Order History / Active Bookings */}
        <section className="mb-6">
          <div className="glass-card rounded-2xl overflow-hidden border border-white/10">
            <div className="px-6 py-4 border-b border-white/10 flex items-center gap-3">
              <History className="size-5 text-slate-400" />
              <h2 className="text-lg font-semibold text-slate-200">Order History / Active Bookings</h2>
            </div>
            <div className="p-12 text-center">
              <div className="inline-flex p-4 rounded-full bg-slate-800/50 border border-white/5 mb-4">
                <History className="size-10 text-slate-500" />
              </div>
              <p className="text-slate-400 font-medium">No active bookings</p>
              <p className="text-sm text-slate-500 mt-1">Your rate bookings and orders will appear here</p>
            </div>
          </div>
        </section>

        {/* Admin Dashboard - Only for admin */}
        {isAdmin && (
          <section className="mb-6">
            <Link
              href="/admin"
              className="block glass-card rounded-2xl overflow-hidden border border-amber-500/30 bg-gradient-to-br from-amber-500/10 to-amber-500/5 hover:from-amber-500/20 hover:to-amber-500/10 transition-all group"
            >
              <div className="p-6 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="p-3 rounded-xl bg-amber-500/20 border border-amber-500/30 group-hover:bg-amber-500/30 transition-colors">
                    <LayoutDashboard className="size-8 text-amber-500" />
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold text-amber-400">Admin Dashboard</h2>
                    <p className="text-sm text-slate-500">Manage rates, margins, products, SIP plans & more</p>
                  </div>
                </div>
                <span className="text-amber-500 group-hover:translate-x-1 transition-transform">→</span>
              </div>
            </Link>
          </section>
        )}

        {/* Logout Button - Only when authenticated */}
        {auth.isAuthenticated && (
          <section className="mb-6">
            <button
              onClick={handleLogout}
              className="w-full glass-card rounded-2xl overflow-hidden border border-red-500/30 bg-gradient-to-br from-red-500/10 to-red-500/5 hover:from-red-500/20 hover:to-red-500/10 transition-all group"
            >
              <div className="p-6 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="p-3 rounded-xl bg-red-500/20 border border-red-500/30 group-hover:bg-red-500/30 transition-colors">
                    <LogOut className="size-8 text-red-500" />
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold text-red-400">Logout</h2>
                    <p className="text-sm text-slate-500">Sign out of your account</p>
                  </div>
                </div>
                <span className="text-red-500 group-hover:translate-x-1 transition-transform">→</span>
              </div>
            </button>
          </section>
        )}

        {/* Sign in prompt when not authenticated */}
        {!auth.isAuthenticated && (
          <div className="glass-card rounded-2xl p-8 text-center border border-white/10">
            <User className="size-12 text-slate-500 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-slate-300">Sign in to view your profile</h3>
            <p className="text-slate-500 mt-2 text-sm">Access wallet, bookings, and order history</p>
            <div className="mt-6 flex flex-col sm:flex-row gap-3 justify-center">
              <button
                onClick={() => openLoginModal('/profile')}
                className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-yellow-500 hover:bg-yellow-400 text-slate-950 font-semibold rounded-lg transition-colors"
              >
                Sign In
              </button>
              <a
                href={`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'}/auth/google?returnTo=${encodeURIComponent(PROFILE_PATH)}`}
                className="inline-flex items-center justify-center gap-2 px-6 py-3 border border-slate-600 hover:border-slate-500 bg-slate-800/50 text-slate-200 font-medium rounded-lg transition-colors"
              >
                Sign In with Google
              </a>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}

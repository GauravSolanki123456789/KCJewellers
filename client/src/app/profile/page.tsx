'use client'

import { useAuth } from '@/hooks/useAuth'
import Link from 'next/link'
import { Wallet, History, LayoutDashboard, User, Sparkles } from 'lucide-react'

const SUPER_ADMIN_EMAIL = 'jaigaurav56789@gmail.com'

type UserType = { role?: string; email?: string; name?: string }

export default function ProfilePage() {
  const auth = useAuth()
  const user = auth.user as UserType | undefined
  const email = (user?.email || '').toLowerCase().trim()
  const isAdmin = email === SUPER_ADMIN_EMAIL

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <main className="max-w-4xl mx-auto px-4 py-8 pb-24 md:pb-12">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold bg-gradient-to-r from-yellow-400 via-amber-400 to-yellow-500 bg-clip-text text-transparent flex items-center gap-2">
            <Sparkles className="size-6 text-yellow-500" />
            Profile
          </h1>
          {auth.isAuthenticated && user?.name && (
            <p className="mt-2 text-slate-400">{user.name}</p>
          )}
        </div>

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

        {/* Sign in prompt when not authenticated */}
        {!auth.isAuthenticated && (
          <div className="glass-card rounded-2xl p-8 text-center border border-white/10">
            <User className="size-12 text-slate-500 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-slate-300">Sign in to view your profile</h3>
            <p className="text-slate-500 mt-2 text-sm">Access wallet, bookings, and order history</p>
            <a
              href={`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000'}/auth/google`}
              className="mt-6 inline-flex items-center gap-2 px-6 py-3 bg-yellow-500 hover:bg-yellow-400 text-slate-950 font-semibold rounded-lg transition-colors"
            >
              Sign In with Google
            </a>
          </div>
        )}
      </main>
    </div>
  )
}

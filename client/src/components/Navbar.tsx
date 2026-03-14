'use client'

import Link from 'next/link'
import { useCart } from '@/context/CartContext'
import { useBookRate } from '@/context/BookRateContext'
import { useAuth } from '@/hooks/useAuth'
import { Home, BookMarked, ShoppingCart, User, LayoutGrid, LogOut } from 'lucide-react'
import axios from 'axios'

type UserType = { email?: string; name?: string; role?: string }

export default function Navbar() {
  const { items } = useCart()
  const { open: openBookRate } = useBookRate()
  const auth = useAuth()
  const user = auth.user as UserType | undefined
  const count = items.reduce((sum, i) => sum + i.qty, 0)

  const { openCart } = useCart()
  
  const handleLogout = async () => {
    const url = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'
    try {
      await axios.get(`${url}/api/auth/logout`, { withCredentials: true })
      window.location.href = '/'
    } catch (err) {
      console.error('Logout error:', err)
      window.location.href = '/'
    }
  }
  const navItems: Array<
    | { href: string; icon: typeof Home; label: string; badge?: number }
    | { action: 'book-rate'; icon: typeof Home; label: string }
    | { action: 'cart'; icon: typeof ShoppingCart; label: string; badge: number }
  > = [
    { href: '/', icon: Home, label: 'Home' },
    { action: 'book-rate', icon: BookMarked, label: 'Book Rate' },
    { href: '/catalog', icon: LayoutGrid, label: 'Catalog' },
    { action: 'cart', icon: ShoppingCart, label: 'Cart', badge: count },
    { href: '/profile', icon: User, label: 'Profile' },
  ]

  return (
    <>
      {/* Desktop: Sticky top */}
      <nav className="hidden md:flex fixed top-0 left-0 right-0 z-50 bg-slate-950/80 backdrop-blur-md border-b border-white/10">
        <div className="flex items-center justify-between w-full max-w-6xl mx-auto px-6 py-4">
          <Link href="/" className="text-xl font-bold text-yellow-500 tracking-tight">
            KC Jewellers
          </Link>
          <div className="flex items-center gap-6">
            {auth.isAuthenticated && user && (
              <div className="flex items-center gap-3 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10">
                <div className="flex flex-col items-end">
                  <span className="text-xs text-yellow-500 font-medium">{user.name || user.email}</span>
                  {user.role === 'super_admin' && (
                    <span className="text-[10px] text-amber-400">Admin</span>
                  )}
                </div>
                <button
                  onClick={handleLogout}
                  className="p-1.5 rounded hover:bg-white/10 transition-colors"
                  title="Logout"
                >
                  <LogOut className="size-4 text-slate-400 hover:text-red-400" />
                </button>
              </div>
            )}
            {navItems.map((item) => {
              if ('action' in item && item.action === 'book-rate') {
                const { icon: Icon, label } = item
                return (
                  <button
                    key="book-rate"
                    type="button"
                    onClick={openBookRate}
                    className="flex items-center gap-2 text-slate-300 hover:text-yellow-500 transition-colors"
                  >
                    <Icon className="size-4" />
                    <span>{label}</span>
                  </button>
                )
              }
              if ('action' in item && item.action === 'cart') {
                const { icon: Icon, label, badge } = item
                return (
                  <button
                    key="cart"
                    type="button"
                    onClick={openCart}
                    className="flex items-center gap-2 text-slate-300 hover:text-yellow-500 transition-colors"
                  >
                    <Icon className="size-4" />
                    <span>{label}</span>
                    {badge > 0 && (
                      <span className="ml-1 min-w-5 h-5 flex items-center justify-center rounded-full bg-yellow-500/20 text-yellow-500 text-xs font-medium px-1.5">
                        {badge}
                      </span>
                    )}
                  </button>
                )
              }
              const { href, icon: Icon, label, badge } = item
              return (
                <Link
                  key={href}
                  href={href}
                  className="flex items-center gap-2 text-slate-300 hover:text-yellow-500 transition-colors"
                >
                  <Icon className="size-4" />
                  <span>{label}</span>
                  {badge !== undefined && badge > 0 && (
                    <span className="ml-1 min-w-5 h-5 flex items-center justify-center rounded-full bg-yellow-500/20 text-yellow-500 text-xs font-medium px-1.5">
                      {badge}
                    </span>
                  )}
                </Link>
              )
            })}
          </div>
        </div>
      </nav>

      {/* Mobile: Sticky bottom */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-slate-950/90 backdrop-blur-md border-t border-white/10 safe-area-pb">
        {auth.isAuthenticated && user && (
          <div className="px-4 py-2 border-b border-white/10 flex items-center justify-between">
            <div className="flex flex-col">
              <span className="text-xs text-yellow-500 font-medium">{user.name || user.email}</span>
              {user.role === 'super_admin' && (
                <span className="text-[10px] text-amber-400">Admin</span>
              )}
            </div>
            <button
              onClick={handleLogout}
              className="p-1.5 rounded hover:bg-white/10 transition-colors"
              title="Logout"
            >
              <LogOut className="size-4 text-red-400" />
            </button>
          </div>
        )}
        <div className="flex items-center justify-around py-3 px-2">
          {navItems.map((item) => {
            if ('action' in item && item.action === 'book-rate') {
              const { icon: Icon, label } = item
              return (
                <button
                  key="book-rate"
                  type="button"
                  onClick={openBookRate}
                  className="flex flex-col items-center gap-1 text-slate-300 hover:text-yellow-500 transition-colors min-w-0 flex-1"
                >
                  <Icon className="size-5" />
                  <span className="text-[10px] truncate max-w-full">{label}</span>
                </button>
              )
            }
            if ('action' in item && item.action === 'cart') {
              const { icon: Icon, label, badge } = item
              return (
                <button
                  key="cart"
                  type="button"
                  onClick={openCart}
                  className="flex flex-col items-center gap-1 text-slate-300 hover:text-yellow-500 transition-colors min-w-0 flex-1"
                >
                  <span className="relative">
                    <Icon className="size-5" />
                    {badge > 0 && (
                      <span className="absolute -top-2 -right-2 min-w-4 h-4 flex items-center justify-center rounded-full bg-yellow-500 text-slate-950 text-[10px] font-bold">
                        {badge}
                      </span>
                    )}
                  </span>
                  <span className="text-[10px] truncate max-w-full">{label}</span>
                </button>
              )
            }
            const { href, icon: Icon, label, badge } = item
            return (
              <Link
                key={href}
                href={href}
                className="flex flex-col items-center gap-1 text-slate-300 hover:text-yellow-500 transition-colors min-w-0 flex-1"
              >
                <span className="relative">
                  <Icon className="size-5" />
                  {badge !== undefined && badge > 0 && (
                    <span className="absolute -top-2 -right-2 min-w-4 h-4 flex items-center justify-center rounded-full bg-yellow-500 text-slate-950 text-[10px] font-bold">
                      {badge}
                    </span>
                  )}
                </span>
                <span className="text-[10px] truncate max-w-full">{label}</span>
              </Link>
            )
          })}
        </div>
      </nav>

      {/* Spacer: desktop needs top padding for fixed nav; mobile nav is at bottom so minimal top */}
      <div className="h-0 md:h-14" />
    </>
  )
}

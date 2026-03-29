'use client'

import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { useCart } from '@/context/CartContext'
import { useBookRate } from '@/context/BookRateContext'
import { useAuth } from '@/hooks/useAuth'
import { useLoginModal } from '@/context/LoginModalContext'
import {
  BookMarked,
  ShoppingCart,
  User,
  LayoutGrid,
  LogOut,
  TrendingUp,
  LineChart,
} from 'lucide-react'
import axios from 'axios'
import { CATALOG_PATH, HOME_PATH, RATES_PATH } from '@/lib/routes'

type UserType = { email?: string; name?: string; role?: string; mobile_number?: string }

function navIsActive(pathname: string | null, href: string): boolean {
  if (!pathname) return false
  if (href === CATALOG_PATH) {
    return (
      pathname === CATALOG_PATH ||
      pathname.startsWith(`${CATALOG_PATH}/`) ||
      pathname.startsWith('/products/')
    )
  }
  return pathname === href || pathname.startsWith(`${href}/`)
}

export default function Navbar() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const { items } = useCart()
  const { open: openBookRate } = useBookRate()
  const auth = useAuth()
  const { open: openLoginModal } = useLoginModal()
  const user = auth.user as UserType | undefined
  const count = items.reduce((sum, i) => sum + i.qty, 0)
  const returnTo = pathname
    ? pathname + (searchParams?.toString() ? `?${searchParams.toString()}` : '')
    : HOME_PATH

  const { openCart } = useCart()

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

  const navItems: Array<
    | { href: string; icon: typeof LayoutGrid; label: string; shortLabel?: string; badge?: number }
    | { action: 'book-rate'; icon: typeof BookMarked; label: string; shortLabel?: string }
    | { action: 'cart'; icon: typeof ShoppingCart; label: string; shortLabel?: string; badge: number }
  > = [
    { href: CATALOG_PATH, icon: LayoutGrid, label: 'Catalog' },
    { href: RATES_PATH, icon: LineChart, label: 'Rates' },
    { action: 'book-rate', icon: BookMarked, label: 'Book Rate', shortLabel: 'Book' },
    { href: '/sip', icon: TrendingUp, label: 'Investment Plans', shortLabel: 'Invest' },
    { action: 'cart', icon: ShoppingCart, label: 'Cart', badge: count },
    { href: '/profile', icon: User, label: 'Profile' },
  ]

  const linkClass = (href: string) =>
    navIsActive(pathname, href)
      ? 'text-yellow-500'
      : 'text-slate-300 hover:text-yellow-500'

  return (
    <>
      <nav className="hidden md:flex fixed top-0 left-0 right-0 z-50 bg-slate-950/80 backdrop-blur-md border-b border-white/10">
        <div className="flex items-center justify-between w-full max-w-6xl mx-auto px-6 py-4 gap-4">
          <Link href={CATALOG_PATH} className="text-xl font-bold text-yellow-500 tracking-tight shrink-0">
            KC Jewellers
          </Link>
          <div className="flex items-center gap-4 lg:gap-6 flex-wrap justify-end">
            {!auth.isAuthenticated && (
              <button
                type="button"
                onClick={() => openLoginModal(returnTo)}
                className="text-sm text-slate-400 hover:text-yellow-400 transition-colors px-2 py-1 rounded-md border border-transparent hover:border-white/10"
              >
                Sign in
              </button>
            )}
            {auth.isAuthenticated && user && (
              <div className="flex items-center gap-3 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10">
                <div className="flex flex-col items-end">
                  <span className="text-xs text-yellow-500 font-medium">
                    {user.name || user.email || (user.mobile_number ? `+91 ${user.mobile_number}` : 'User')}
                  </span>
                  {user.role === 'super_admin' && (
                    <span className="text-[10px] text-amber-400">Admin</span>
                  )}
                </div>
                <button
                  onClick={handleLogout}
                  className="p-1.5 rounded hover:bg-white/10 transition-colors"
                  title="Logout"
                  type="button"
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
                  className={`flex items-center gap-2 transition-colors ${linkClass(href)}`}
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

      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-slate-950/90 backdrop-blur-md border-t border-white/10 safe-area-pb">
        {auth.isAuthenticated && user && (
          <div className="px-4 py-2 border-b border-white/10 flex items-center justify-between">
            <div className="flex flex-col min-w-0">
              <span className="text-xs text-yellow-500 font-medium truncate">
                {user.name || user.email || (user.mobile_number ? `+91 ${user.mobile_number}` : 'User')}
              </span>
              {user.role === 'super_admin' && (
                <span className="text-[10px] text-amber-400">Admin</span>
              )}
            </div>
            <button
              onClick={handleLogout}
              className="p-1.5 rounded hover:bg-white/10 transition-colors shrink-0"
              title="Logout"
              type="button"
            >
              <LogOut className="size-4 text-red-400" />
            </button>
          </div>
        )}
        <div className="flex items-center justify-around py-2 px-1 gap-0.5">
          {navItems.map((item) => {
            if ('action' in item && item.action === 'book-rate') {
              const { icon: Icon, label, shortLabel } = item
              return (
                <button
                  key="book-rate"
                  type="button"
                  onClick={openBookRate}
                  className="flex flex-col items-center gap-0.5 text-slate-300 hover:text-yellow-500 transition-colors min-w-0 flex-1 py-1"
                >
                  <Icon className="size-[1.15rem] sm:size-5" />
                  <span className="text-[9px] leading-tight text-center truncate max-w-full px-0.5">
                    {shortLabel ?? label}
                  </span>
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
                  className="flex flex-col items-center gap-0.5 text-slate-300 hover:text-yellow-500 transition-colors min-w-0 flex-1 py-1"
                >
                  <span className="relative">
                    <Icon className="size-[1.15rem] sm:size-5" />
                    {badge > 0 && (
                      <span className="absolute -top-2 -right-2 min-w-4 h-4 flex items-center justify-center rounded-full bg-yellow-500 text-slate-950 text-[10px] font-bold">
                        {badge}
                      </span>
                    )}
                  </span>
                  <span className="text-[9px] leading-tight truncate max-w-full">{label}</span>
                </button>
              )
            }
            const { href, icon: Icon, label, shortLabel, badge } = item
            const active = navIsActive(pathname, href)
            return (
              <Link
                key={href}
                href={href}
                className={`flex flex-col items-center gap-0.5 min-w-0 flex-1 py-1 rounded-lg transition-colors ${
                  active ? 'text-yellow-500' : 'text-slate-300 hover:text-yellow-500'
                }`}
              >
                <span className="relative">
                  <Icon className="size-[1.15rem] sm:size-5" />
                  {badge !== undefined && badge > 0 && (
                    <span className="absolute -top-2 -right-2 min-w-4 h-4 flex items-center justify-center rounded-full bg-yellow-500 text-slate-950 text-[10px] font-bold">
                      {badge}
                    </span>
                  )}
                </span>
                <span className="text-[9px] leading-tight text-center truncate max-w-full px-0.5">
                  {shortLabel ?? label}
                </span>
              </Link>
            )
          })}
        </div>
      </nav>

      <div className="h-0 md:h-14" />
    </>
  )
}

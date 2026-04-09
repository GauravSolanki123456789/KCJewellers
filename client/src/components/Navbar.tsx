'use client'

import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { useCart } from '@/context/CartContext'
import { useAuth } from '@/hooks/useAuth'
import { useLoginModal } from '@/context/LoginModalContext'
import {
  Home,
  ShoppingCart,
  User,
  LogOut,
  TrendingUp,
  LineChart,
} from 'lucide-react'
import axios from 'axios'
import {
  CATALOG_PATH,
  HOME_PATH,
  PROFILE_PATH,
  RATES_PATH,
  SIP_PATH,
} from '@/lib/routes'

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
  if (href === PROFILE_PATH) {
    return pathname === PROFILE_PATH || pathname.startsWith(`${PROFILE_PATH}/`)
  }
  return pathname === href || pathname.startsWith(`${href}/`)
}

const BOTTOM_NAV: Array<{
  href: string
  icon: typeof Home
  label: string
  shortLabel?: string
}> = [
  { href: CATALOG_PATH, icon: Home, label: 'Home' },
  { href: RATES_PATH, icon: LineChart, label: 'Live Rates', shortLabel: 'Rates' },
  { href: SIP_PATH, icon: TrendingUp, label: 'Invest' },
  { href: PROFILE_PATH, icon: User, label: 'Profile' },
]

export default function Navbar() {
  const pathname = usePathname()
  const isSharedBrochure = pathname?.startsWith('/shared/')
  const searchParams = useSearchParams()
  const { items, openCart } = useCart()
  const auth = useAuth()
  const { open: openLoginModal } = useLoginModal()
  const user = auth.user as UserType | undefined
  const count = items.reduce((sum, i) => sum + i.qty, 0)
  const returnTo = pathname
    ? pathname + (searchParams?.toString() ? `?${searchParams.toString()}` : '')
    : HOME_PATH

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

  const linkClass = (href: string) =>
    navIsActive(pathname, href)
      ? 'text-yellow-500'
      : 'text-slate-300 hover:text-yellow-500'

  if (isSharedBrochure) {
    return null
  }

  const CartButton = ({ className = '' }: { className?: string }) => (
    <button
      type="button"
      onClick={openCart}
      className={`relative flex items-center justify-center rounded-lg p-2 text-slate-300 transition-colors hover:bg-white/10 hover:text-yellow-500 ${className}`}
      aria-label={`Cart${count > 0 ? `, ${count} items` : ''}`}
      title="Cart"
    >
      <ShoppingCart className="size-5 md:size-5" />
      {count > 0 && (
        <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-yellow-500 px-1 text-[10px] font-bold text-slate-950">
          {count > 99 ? '99+' : count}
        </span>
      )}
    </button>
  )

  return (
    <>
      {/* Mobile: top bar — brand + cart (cart not in bottom nav) */}
      <header className="safe-area-pt fixed left-0 right-0 top-0 z-50 border-b border-white/10 bg-slate-950/90 backdrop-blur-md md:hidden">
        <div className="flex h-12 items-center justify-between px-3">
          <Link
            href={CATALOG_PATH}
            className="text-base font-bold tracking-tight text-yellow-500"
          >
            KC Jewellers
          </Link>
          <CartButton />
        </div>
      </header>

      {/* Desktop: full top nav */}
      <nav className="fixed left-0 right-0 top-0 z-50 hidden border-b border-white/10 bg-slate-950/80 backdrop-blur-md md:flex">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-6 py-4">
          <Link
            href={CATALOG_PATH}
            className="shrink-0 text-xl font-bold tracking-tight text-yellow-500"
          >
            KC Jewellers
          </Link>
          <div className="flex flex-1 flex-wrap items-center justify-center gap-4 lg:gap-6">
            {BOTTOM_NAV.map(({ href, icon: Icon, label }) => (
              <Link
                key={href}
                href={href}
                className={`flex items-center gap-2 transition-colors ${linkClass(href)}`}
              >
                <Icon className="size-4 shrink-0" />
                <span className="text-sm">{label}</span>
              </Link>
            ))}
          </div>
          <div className="flex shrink-0 items-center gap-2 lg:gap-3">
            {!auth.isAuthenticated && (
              <button
                type="button"
                onClick={() => openLoginModal(returnTo)}
                className="rounded-md border border-transparent px-2 py-1 text-sm text-slate-400 transition-colors hover:border-white/10 hover:text-yellow-400"
              >
                Sign in
              </button>
            )}
            {auth.isAuthenticated && user && (
              <div className="flex max-w-[10rem] items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-2 py-1">
                <div className="min-w-0 flex-1 text-right">
                  <span className="block truncate text-xs font-medium text-yellow-500">
                    {user.name ||
                      user.email ||
                      (user.mobile_number ? `+91 ${user.mobile_number}` : 'User')}
                  </span>
                  {user.role === 'super_admin' && (
                    <span className="text-[10px] text-amber-400">Admin</span>
                  )}
                </div>
                <button
                  onClick={handleLogout}
                  className="shrink-0 rounded p-1 hover:bg-white/10"
                  title="Logout"
                  type="button"
                >
                  <LogOut className="size-4 text-slate-400 hover:text-red-400" />
                </button>
              </div>
            )}
            <CartButton className="shrink-0" />
          </div>
        </div>
      </nav>

      {/* Mobile bottom: 4 tabs only */}
      <nav className="safe-area-pb fixed bottom-0 left-0 right-0 z-50 border-t border-white/10 bg-slate-950/90 backdrop-blur-md md:hidden">
        {auth.isAuthenticated && user && (
          <div className="flex items-center justify-between border-b border-white/10 px-4 py-2">
            <div className="min-w-0 flex-1">
              <span className="block truncate text-xs font-medium text-yellow-500">
                {user.name ||
                  user.email ||
                  (user.mobile_number ? `+91 ${user.mobile_number}` : 'User')}
              </span>
              {user.role === 'super_admin' && (
                <span className="text-[10px] text-amber-400">Admin</span>
              )}
            </div>
            <button
              onClick={handleLogout}
              className="shrink-0 rounded p-1.5 hover:bg-white/10"
              title="Logout"
              type="button"
            >
              <LogOut className="size-4 text-red-400" />
            </button>
          </div>
        )}
        <div className="flex items-center justify-around gap-1 px-1 py-2">
          {BOTTOM_NAV.map(({ href, icon: Icon, label, shortLabel }) => {
            const active = navIsActive(pathname, href)
            return (
              <Link
                key={href}
                href={href}
                className={`flex min-w-0 flex-1 flex-col items-center gap-0.5 rounded-lg py-1 transition-colors ${
                  active ? 'text-yellow-500' : 'text-slate-300 hover:text-yellow-500'
                }`}
              >
                <Icon className="size-[1.15rem] shrink-0 sm:size-5" />
                <span className="max-w-full truncate px-0.5 text-center text-[9px] leading-tight">
                  {shortLabel ?? label}
                </span>
              </Link>
            )
          })}
        </div>
      </nav>

      {/* Offset fixed headers: mobile top bar + desktop nav */}
      <div className="h-12 md:h-14" />
    </>
  )
}

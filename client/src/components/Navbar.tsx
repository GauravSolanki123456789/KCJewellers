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
  Package,
  BookMarked,
} from 'lucide-react'
import axios from 'axios'
import {
  CATALOG_PATH,
  HOME_PATH,
  PROFILE_PATH,
  PROFILE_LEDGER_PATH,
  RATES_PATH,
  SIP_PATH,
  WHOLESALE_ORDER_PATH,
} from '@/lib/routes'
import { useCustomerTier } from '@/context/CustomerTierContext'

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
  if (href === WHOLESALE_ORDER_PATH) {
    return pathname === WHOLESALE_ORDER_PATH || pathname.startsWith(`${WHOLESALE_ORDER_PATH}/`)
  }
  if (href === PROFILE_LEDGER_PATH) {
    return pathname === PROFILE_LEDGER_PATH || pathname.startsWith(`${PROFILE_LEDGER_PATH}/`)
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
  const { hasWholesaleAccess } = useCustomerTier()
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
            {auth.isAuthenticated && hasWholesaleAccess && (
              <>
                <Link
                  href={WHOLESALE_ORDER_PATH}
                  className={`flex items-center gap-2 rounded-lg px-1.5 py-1 transition-colors ${linkClass(WHOLESALE_ORDER_PATH)}`}
                >
                  <Package className="size-4 text-emerald-500/90" aria-hidden />
                  <span className="text-sm font-medium text-emerald-400/95">Wholesale</span>
                </Link>
                <Link
                  href={PROFILE_LEDGER_PATH}
                  className={`flex items-center gap-2 rounded-lg px-1.5 py-1 transition-colors ${linkClass(PROFILE_LEDGER_PATH)}`}
                >
                  <BookMarked className="size-4 text-emerald-500/85" aria-hidden />
                  <span className="text-sm font-medium text-emerald-400/90">Ledger</span>
                </Link>
              </>
            )}
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
      <nav className="safe-area-pb fixed bottom-0 left-0 right-0 z-50 border-t border-white/10 bg-slate-950/95 backdrop-blur-xl shadow-[0_-10px_40px_rgba(0,0,0,0.42)] md:hidden">
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
        {auth.isAuthenticated && hasWholesaleAccess && (
          <div className="flex gap-2 border-b border-emerald-500/15 bg-gradient-to-r from-emerald-950/40 to-slate-950 px-3 py-2">
            <Link
              href={WHOLESALE_ORDER_PATH}
              className={`flex min-h-[44px] flex-1 touch-manipulation items-center justify-center gap-2 rounded-xl border px-2 py-2 text-xs font-semibold transition-colors ${
                navIsActive(pathname, WHOLESALE_ORDER_PATH)
                  ? 'border-emerald-500/60 bg-emerald-500/20 text-emerald-300'
                  : 'border-white/10 bg-white/5 text-emerald-400/95 active:bg-white/10'
              }`}
            >
              <Package className="size-4 shrink-0 opacity-90" aria-hidden />
              <span className="truncate">Wholesale</span>
            </Link>
            <Link
              href={PROFILE_LEDGER_PATH}
              className={`flex min-h-[44px] flex-1 touch-manipulation items-center justify-center gap-2 rounded-xl border px-2 py-2 text-xs font-semibold transition-colors ${
                navIsActive(pathname, PROFILE_LEDGER_PATH)
                  ? 'border-emerald-500/60 bg-emerald-500/20 text-emerald-300'
                  : 'border-white/10 bg-white/5 text-emerald-400/95 active:bg-white/10'
              }`}
            >
              <BookMarked className="size-4 shrink-0 opacity-90" aria-hidden />
              <span className="truncate">Ledger</span>
            </Link>
          </div>
        )}
        <div className="flex min-h-[52px] items-stretch justify-around gap-0.5 px-1.5 pb-2 pt-1">
          {BOTTOM_NAV.map(({ href, icon: Icon, label, shortLabel }) => {
            const active = navIsActive(pathname, href)
            return (
              <Link
                key={href}
                href={href}
                className={`flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-xl py-1.5 transition-colors active:scale-[0.97] ${
                  active
                    ? 'bg-amber-500/12 text-amber-400 ring-1 ring-amber-500/25'
                    : 'text-slate-400 hover:bg-white/[0.04] hover:text-amber-200/90'
                }`}
              >
                <Icon className="size-5 shrink-0 opacity-90" aria-hidden />
                <span className="max-w-full truncate px-0.5 text-center text-[10px] font-medium leading-tight tracking-tight">
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

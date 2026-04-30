'use client'

import Link from 'next/link'
import Image from 'next/image'
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
import { useResellerBranding } from '@/context/ResellerBrandingContext'
import SmartSearch from '@/components/SmartSearch'
import { useMediaQuery } from '@/hooks/useMediaQuery'

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
  const isDesktopNav = useMediaQuery('(min-width: 768px)', false)
  const isSharedBrochure = pathname?.startsWith('/shared/')
  const searchParams = useSearchParams()
  const { items, openCart } = useCart()
  const auth = useAuth()
  const { hasWholesaleAccess } = useCustomerTier()
  const { businessName, logoUrl, active: resellerBrandingActive } = useResellerBranding()
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
      {/* Single top bar + one SmartSearch (avoids duplicate inputs / double navigation). */}
      <header className="safe-area-pt fixed left-0 right-0 top-0 z-50 border-b border-white/10 bg-slate-950/90 backdrop-blur-md md:bg-slate-950/80">
        <div className="mx-auto flex h-12 max-w-6xl items-center gap-2 px-2 sm:px-3 md:h-auto md:min-h-[3.5rem] md:gap-4 md:px-6 md:py-3">
          <Link
            href={CATALOG_PATH}
            className="flex min-w-0 shrink-0 items-center gap-2 text-base font-bold tracking-tight text-yellow-500 md:text-xl"
          >
            {resellerBrandingActive && logoUrl ? (
              <span className="relative block size-8 shrink-0 overflow-hidden rounded-lg bg-white/5 md:size-9">
                <Image
                  src={logoUrl}
                  alt={businessName}
                  fill
                  className="object-contain p-0.5"
                  sizes="36px"
                  unoptimized
                />
              </span>
            ) : null}
            <span className="truncate">{resellerBrandingActive ? businessName : 'KC Jewellers'}</span>
          </Link>
          <div className="hidden flex-1 flex-wrap items-center justify-center gap-4 lg:gap-6 md:flex">
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
          <div className="min-w-0 flex-1 md:max-w-md md:flex-none lg:max-w-lg">
            <SmartSearch compact={!isDesktopNav} />
          </div>
          <div className="hidden shrink-0 items-center gap-2 md:flex lg:gap-3">
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
          </div>
          <CartButton className="shrink-0" />
        </div>
      </header>

      {/* Mobile bottom: 4 tabs only */}
      <nav className="safe-area-pb fixed bottom-0 left-0 right-0 z-50 border-t border-white/10 bg-slate-950/95 backdrop-blur-xl shadow-[0_-10px_40px_rgba(0,0,0,0.42)] md:hidden">
        {auth.isAuthenticated && user && (
          <div className="flex items-center gap-2 border-b border-white/10 px-2.5 py-1">
            <div className="min-w-0 flex-1">
              <span className="block truncate text-[10px] font-medium leading-tight text-yellow-500/95">
                {user.name ||
                  user.email ||
                  (user.mobile_number ? `+91 ${user.mobile_number}` : 'User')}
                {user.role === 'super_admin' ? (
                  <span className="ml-1 text-[9px] text-amber-400/90">· Admin</span>
                ) : null}
              </span>
            </div>
            <button
              onClick={handleLogout}
              className="shrink-0 rounded-md p-1 hover:bg-white/10"
              title="Logout"
              type="button"
            >
              <LogOut className="size-3.5 text-red-400" />
            </button>
          </div>
        )}
        {auth.isAuthenticated && hasWholesaleAccess && (
          <div className="flex gap-1.5 border-b border-emerald-500/15 bg-gradient-to-r from-emerald-950/40 to-slate-950 px-2 py-1.5">
            <Link
              href={WHOLESALE_ORDER_PATH}
              className={`flex min-h-[40px] flex-1 touch-manipulation items-center justify-center gap-1.5 rounded-lg border px-2 py-1.5 text-[11px] font-semibold transition-colors ${
                navIsActive(pathname, WHOLESALE_ORDER_PATH)
                  ? 'border-emerald-500/60 bg-emerald-500/20 text-emerald-300'
                  : 'border-white/10 bg-white/5 text-emerald-400/95 active:bg-white/10'
              }`}
            >
              <Package className="size-3.5 shrink-0 opacity-90" aria-hidden />
              <span className="truncate">Wholesale</span>
            </Link>
            <Link
              href={PROFILE_LEDGER_PATH}
              className={`flex min-h-[40px] flex-1 touch-manipulation items-center justify-center gap-1.5 rounded-lg border px-2 py-1.5 text-[11px] font-semibold transition-colors ${
                navIsActive(pathname, PROFILE_LEDGER_PATH)
                  ? 'border-emerald-500/60 bg-emerald-500/20 text-emerald-300'
                  : 'border-white/10 bg-white/5 text-emerald-400/95 active:bg-white/10'
              }`}
            >
              <BookMarked className="size-3.5 shrink-0 opacity-90" aria-hidden />
              <span className="truncate">Ledger</span>
            </Link>
          </div>
        )}
        <div className="flex min-h-[50px] items-stretch justify-around gap-0.5 px-1.5 pb-1.5 pt-1">
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

      {/* Offset fixed header */}
      <div className="h-12 md:h-[3.75rem]" />
    </>
  )
}

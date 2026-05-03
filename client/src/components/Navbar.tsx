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
import { useAdminInboxSummary } from '@/hooks/useAdminInboxSummary'
import { userCanCallStrictAdminApi } from '@/lib/admin-access'
import { formatAdminInboxBadge } from '@/lib/admin-inbox-summary'

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
  const isMdUp = useMediaQuery('(min-width: 768px)', false)
  const isSharedBrochure = pathname?.startsWith('/shared/')
  const searchParams = useSearchParams()
  const { items, openCart } = useCart()
  const auth = useAuth()
  const { hasB2bPortalAccess } = useCustomerTier()
  const { businessName, logoUrl, active: resellerBrandingActive } = useResellerBranding()
  const { open: openLoginModal } = useLoginModal()
  const user = auth.user as UserType | undefined
  const count = items.reduce((sum, i) => sum + i.qty, 0)
  const returnTo = pathname
    ? pathname + (searchParams?.toString() ? `?${searchParams.toString()}` : '')
    : HOME_PATH

  const strictAdminInbox = userCanCallStrictAdminApi(user)
  const { data: adminInbox } = useAdminInboxSummary(
    !!auth.isAuthenticated && strictAdminInbox
  )
  const adminAttention =
    adminInbox && adminInbox.navAttentionCount > 0
      ? formatAdminInboxBadge(adminInbox.navAttentionCount)
      : ''

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

  if (isSharedBrochure) {
    return null
  }

  const CartButton = ({ className = '' }: { className?: string }) => (
    <button
      type="button"
      onClick={openCart}
      className={`relative inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-slate-300 transition-colors hover:bg-slate-300/15 hover:text-yellow-500 sm:h-10 sm:w-10 ${className}`}
      aria-label={`Cart${count > 0 ? `, ${count} items` : ''}`}
      title="Cart"
    >
      <ShoppingCart className="size-5" />
      {count > 0 && (
        <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-yellow-500 px-1 text-[10px] font-bold text-slate-950">
          {count > 99 ? '99+' : count}
        </span>
      )}
    </button>
  )

  return (
    <>
      <header className="safe-area-pt fixed left-0 right-0 top-0 z-50 border-b border-slate-300/20 bg-slate-950/95 backdrop-blur-md">
        <div className="mx-auto max-w-6xl px-3 sm:px-4 md:px-5">
          {/* Primary row: grid keeps logo, search, and actions on one optical baseline */}
          <div className="grid h-12 grid-cols-[minmax(0,auto)_minmax(0,1fr)_auto] items-center gap-2 sm:gap-3 md:h-[3.375rem] md:gap-4">
            <div className="min-w-0 max-w-[42vw] sm:max-w-none">
              <Link
                href={CATALOG_PATH}
                className="flex min-w-0 items-center gap-1.5 text-sm font-bold leading-none tracking-tight text-yellow-500 sm:text-base md:gap-2 md:text-lg"
              >
                {resellerBrandingActive && logoUrl ? (
                  <span className="relative block size-8 shrink-0 overflow-hidden rounded-lg bg-slate-800/40 md:size-9">
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
                <span className="truncate py-0.5">{resellerBrandingActive ? businessName : 'KC Jewellers'}</span>
              </Link>
            </div>

            <div className="min-w-0 justify-self-stretch md:max-w-xl md:justify-self-center lg:max-w-2xl">
              <SmartSearch compact={!isMdUp} className="flex items-center" />
            </div>

            <div className="flex shrink-0 items-center justify-end gap-0.5 sm:gap-1 md:gap-2">
              {!auth.isAuthenticated && (
                <button
                  type="button"
                  onClick={() => openLoginModal(returnTo)}
                  className="inline-flex h-9 shrink-0 items-center justify-center rounded-xl border border-slate-300/25 bg-slate-800/35 px-2.5 text-[11px] font-medium text-slate-200 transition-colors hover:border-amber-500/30 hover:bg-slate-800/50 sm:h-10 sm:px-3 sm:text-xs md:text-sm"
                >
                  Sign in
                </button>
              )}
              {auth.isAuthenticated && user && (
                <>
                  <Link
                    href={PROFILE_PATH}
                    className={`relative flex size-9 items-center justify-center rounded-xl sm:size-10 md:hidden ${navIsActive(pathname, PROFILE_PATH) ? 'bg-amber-500/15 text-amber-400' : 'text-slate-400 hover:bg-slate-300/15 hover:text-amber-300'}`}
                    aria-label={
                      adminAttention
                        ? `Profile, ${adminAttention} admin updates`
                        : 'Profile'
                    }
                    title="Profile"
                  >
                    <User className="size-5" />
                    {strictAdminInbox && adminAttention && (
                      <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-0.5 text-[9px] font-bold leading-none text-white">
                        {adminAttention}
                      </span>
                    )}
                  </Link>
                  <div className="relative hidden h-10 items-center gap-2 rounded-xl border border-slate-300/25 bg-slate-800/35 pl-2.5 pr-1 md:flex">
                    {strictAdminInbox && adminAttention && (
                      <span
                        className="absolute -right-1 -top-1 z-10 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold leading-none text-white shadow-md shadow-black/40"
                        title="Admin inbox"
                        aria-hidden
                      >
                        {adminAttention}
                      </span>
                    )}
                    <div className="min-w-0 max-w-[7.5rem] lg:max-w-[11rem]">
                      <span className="block truncate text-xs font-medium text-yellow-500">
                        {user.name ||
                          user.email ||
                          (user.mobile_number ? `+91 ${user.mobile_number}` : 'User')}
                      </span>
                      {user.role === 'super_admin' && (
                        <span className="text-[10px] text-amber-400/90">Admin</span>
                      )}
                    </div>
                    <button
                      onClick={handleLogout}
                      className="shrink-0 rounded-md p-1.5 text-slate-400 hover:bg-slate-300/15 hover:text-red-400"
                      title="Logout"
                      type="button"
                    >
                      <LogOut className="size-4" />
                    </button>
                  </div>
                </>
              )}
              <CartButton />
            </div>
          </div>

          {/* Secondary row (tablet+): fixed-height pills + icon box kills SVG/text baseline drift */}
          <nav
            className="hidden border-t border-slate-300/15 md:block md:py-2"
            aria-label="Primary navigation"
          >
            <div className="flex flex-wrap items-center gap-x-1 gap-y-1.5">
              {BOTTOM_NAV.map(({ href, icon: Icon, label }) => {
                const active = navIsActive(pathname, href)
                return (
                  <Link
                    key={href}
                    href={href}
                    className={`inline-flex h-9 shrink-0 items-center gap-2 rounded-lg px-3 text-[13px] font-medium tracking-tight transition-colors ${
                      active
                        ? 'bg-amber-500/12 text-yellow-500 ring-1 ring-amber-500/25'
                        : 'text-slate-400 hover:bg-slate-300/12 hover:text-slate-200'
                    }`}
                  >
                    <span
                      className="flex size-4 shrink-0 items-center justify-center text-current [&_svg]:block [&_svg]:size-[15px]"
                      aria-hidden
                    >
                      <Icon strokeWidth={2} />
                    </span>
                    <span className="leading-none">{label}</span>
                  </Link>
                )
              })}
              {auth.isAuthenticated && hasB2bPortalAccess && (
                <>
                  <span className="mx-1 h-5 w-px shrink-0 bg-slate-300/35" aria-hidden />
                  <Link
                    href={WHOLESALE_ORDER_PATH}
                    className={`inline-flex h-9 shrink-0 items-center gap-2 rounded-lg px-3 text-[13px] font-semibold tracking-tight transition-colors ${
                      navIsActive(pathname, WHOLESALE_ORDER_PATH)
                        ? 'bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/30'
                        : 'text-emerald-400/90 hover:bg-emerald-500/10 hover:text-emerald-300'
                    }`}
                  >
                    <span
                      className="flex size-4 shrink-0 items-center justify-center text-current [&_svg]:block [&_svg]:size-[15px]"
                      aria-hidden
                    >
                      <Package strokeWidth={2} />
                    </span>
                    <span className="leading-none">Wholesale</span>
                  </Link>
                  <Link
                    href={PROFILE_LEDGER_PATH}
                    className={`inline-flex h-9 shrink-0 items-center gap-2 rounded-lg px-3 text-[13px] font-semibold tracking-tight transition-colors ${
                      navIsActive(pathname, PROFILE_LEDGER_PATH)
                        ? 'bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/30'
                        : 'text-emerald-400/90 hover:bg-emerald-500/10 hover:text-emerald-300'
                    }`}
                  >
                    <span
                      className="flex size-4 shrink-0 items-center justify-center text-current [&_svg]:block [&_svg]:size-[15px]"
                      aria-hidden
                    >
                      <BookMarked strokeWidth={2} />
                    </span>
                    <span className="leading-none">Ledger</span>
                  </Link>
                </>
              )}
            </div>
          </nav>
        </div>
      </header>

      {/* Mobile bottom navigation */}
      <nav
        className="kc-mobile-nav-dock safe-area-pb fixed bottom-0 left-0 right-0 z-50 border-t border-slate-300/20 bg-slate-950/95 backdrop-blur-xl shadow-[0_-10px_40px_rgba(0,0,0,0.42)] md:hidden"
        aria-label="Mobile navigation"
      >
        {auth.isAuthenticated && hasB2bPortalAccess && (
          <div className="flex gap-1.5 border-b border-emerald-500/15 bg-emerald-950/25 px-2 py-1.5">
            <Link
              href={WHOLESALE_ORDER_PATH}
              className={`flex min-h-[38px] flex-1 touch-manipulation items-center justify-center gap-1.5 rounded-lg border px-2 py-1 text-[11px] font-semibold transition-colors ${
                navIsActive(pathname, WHOLESALE_ORDER_PATH)
                  ? 'border-emerald-500/60 bg-emerald-500/20 text-emerald-300'
                  : 'border-slate-300/25 bg-slate-800/40 text-emerald-400/95 active:bg-slate-300/15'
              }`}
            >
              <Package className="size-3.5 shrink-0 opacity-90" aria-hidden />
              <span className="truncate">Wholesale</span>
            </Link>
            <Link
              href={PROFILE_LEDGER_PATH}
              className={`flex min-h-[38px] flex-1 touch-manipulation items-center justify-center gap-1.5 rounded-lg border px-2 py-1 text-[11px] font-semibold transition-colors ${
                navIsActive(pathname, PROFILE_LEDGER_PATH)
                  ? 'border-emerald-500/60 bg-emerald-500/20 text-emerald-300'
                  : 'border-slate-300/25 bg-slate-800/40 text-emerald-400/95 active:bg-slate-300/15'
              }`}
            >
              <BookMarked className="size-3.5 shrink-0 opacity-90" aria-hidden />
              <span className="truncate">Ledger</span>
            </Link>
          </div>
        )}
        <div className="flex min-h-[52px] items-stretch justify-around gap-0.5 px-1 pb-[max(0.35rem,env(safe-area-inset-bottom))] pt-1">
          {BOTTOM_NAV.map(({ href, icon: Icon, label, shortLabel }) => {
            const active = navIsActive(pathname, href)
            const profileAdminDot = href === PROFILE_PATH && strictAdminInbox && adminAttention
            return (
              <Link
                key={href}
                href={href}
                aria-label={
                  profileAdminDot ? `${label}, ${adminAttention} admin updates` : label
                }
                className={`relative flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-xl py-1.5 transition-colors active:scale-[0.98] ${
                  active
                    ? 'bg-amber-500/12 text-amber-400 ring-1 ring-amber-500/20'
                    : 'text-slate-400 hover:bg-slate-300/12 hover:text-amber-200/90'
                }`}
              >
                <span className="relative flex size-5 shrink-0 items-center justify-center [&_svg]:block [&_svg]:size-5">
                  <Icon strokeWidth={2} className="opacity-90" aria-hidden />
                  {profileAdminDot ? (
                    <span className="absolute -right-1.5 -top-1 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-rose-500 px-0.5 text-[8px] font-bold leading-none text-white">
                      {adminAttention}
                    </span>
                  ) : null}
                </span>
                <span className="max-w-full truncate px-0.5 text-center text-[10px] font-medium leading-tight tracking-tight">
                  {shortLabel ?? label}
                </span>
              </Link>
            )
          })}
        </div>
      </nav>

      {/* Offset fixed header (bottom nav spacing is handled by .kc-pb-mobile-nav) */}
      {/* md: primary row (3.375rem) + nav border + py-2 + h-9 pill row */}
      <div className="h-12 shrink-0 md:h-[6.6875rem]" aria-hidden />
    </>
  )
}

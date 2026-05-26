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
import { getOgImagePath } from '@/lib/og-image'

const KC_LOGO_PATH = getOgImagePath()

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
    !!auth.isAuthenticated && strictAdminInbox,
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
      className={`kc-icon-btn relative size-9 shrink-0 sm:size-10 ${className}`}
      aria-label={`Cart${count > 0 ? `, ${count} items` : ''}`}
      title="Cart"
    >
      <ShoppingCart className="size-[1.125rem]" strokeWidth={1.5} />
      {count > 0 && (
        <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-amber-500 px-1 text-[10px] font-bold text-white">
          {count > 99 ? '99+' : count}
        </span>
      )}
    </button>
  )

  return (
    <>
      <header className="kc-header-bar safe-area-pt fixed left-0 right-0 top-0 z-50">
        <div className="mx-auto max-w-6xl px-3 sm:px-4 md:px-5">
          <div className="grid h-12 grid-cols-[minmax(0,auto)_minmax(0,1fr)_auto] items-center gap-1.5 sm:gap-3 md:h-14 md:gap-4">
            <div className="min-w-0 max-w-[42vw] sm:max-w-none">
              <Link href={CATALOG_PATH} className="flex min-w-0 items-center gap-1.5 sm:gap-2">
                {resellerBrandingActive && logoUrl ? (
                  <span className="relative block size-7 shrink-0 overflow-hidden rounded-md bg-white ring-1 ring-slate-700/30 md:size-8">
                    <Image
                      src={logoUrl}
                      alt={businessName}
                      fill
                      className="object-contain p-0.5"
                      sizes="32px"
                      unoptimized
                    />
                  </span>
                ) : (
                  <span className="relative block size-7 shrink-0 overflow-hidden rounded-full bg-white ring-1 ring-slate-700/25 md:size-8">
                    <Image
                      src={KC_LOGO_PATH}
                      alt="KC Jewellers"
                      fill
                      className="object-contain p-0.5"
                      sizes="32px"
                      priority
                    />
                  </span>
                )}
                <span className="kc-brand-text truncate text-[0.8125rem] sm:text-[0.9375rem] md:text-lg">
                  {resellerBrandingActive ? businessName : 'KC Jewellers'}
                </span>
              </Link>
            </div>

            <div className="min-w-0 justify-self-stretch md:max-w-xl md:justify-self-center lg:max-w-2xl">
              <SmartSearch compact={!isMdUp} className="flex items-center" />
            </div>

            <div className="flex shrink-0 items-center justify-end gap-0 sm:gap-0.5">
              {auth.isAuthenticated && hasB2bPortalAccess && (
                <div className="flex items-center gap-0 md:hidden">
                  <Link
                    href={WHOLESALE_ORDER_PATH}
                    className={`kc-icon-btn size-9 ${navIsActive(pathname, WHOLESALE_ORDER_PATH) ? 'text-emerald-600' : ''}`}
                    aria-label="Wholesale"
                    title="Wholesale"
                  >
                    <Package className="size-[1.125rem]" strokeWidth={1.5} />
                  </Link>
                  <Link
                    href={PROFILE_LEDGER_PATH}
                    className={`kc-icon-btn size-9 ${navIsActive(pathname, PROFILE_LEDGER_PATH) ? 'text-emerald-600' : ''}`}
                    aria-label="Ledger"
                    title="Ledger"
                  >
                    <BookMarked className="size-[1.125rem]" strokeWidth={1.5} />
                  </Link>
                </div>
              )}

              {!auth.isAuthenticated && (
                <button
                  type="button"
                  onClick={() => openLoginModal(returnTo)}
                  className="inline-flex h-8 shrink-0 items-center justify-center rounded-full border border-slate-700/40 bg-white/90 px-2.5 text-[10px] font-medium tracking-wide text-slate-600 transition-colors hover:border-amber-500/35 hover:text-amber-600 sm:h-9 sm:px-3.5 sm:text-xs"
                >
                  Sign in
                </button>
              )}

              {auth.isAuthenticated && user && (
                <>
                  <Link
                    href={PROFILE_PATH}
                    className={`kc-icon-btn relative size-9 md:hidden ${navIsActive(pathname, PROFILE_PATH) ? 'text-slate-100' : ''}`}
                    aria-label={
                      adminAttention ? `Profile, ${adminAttention} admin updates` : 'Profile'
                    }
                    title="Profile"
                  >
                    <User className="size-[1.125rem]" strokeWidth={1.5} />
                    {strictAdminInbox && adminAttention && (
                      <span className="absolute -right-0.5 -top-0.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-rose-500 px-0.5 text-[8px] font-bold leading-none text-white">
                        {adminAttention}
                      </span>
                    )}
                  </Link>

                  <div className="relative hidden h-9 items-center gap-2 rounded-full border border-slate-700/40 bg-white/70 pl-3 pr-1 md:flex">
                    {strictAdminInbox && adminAttention && (
                      <span
                        className="absolute -right-1 -top-1 z-10 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold leading-none text-white shadow-sm"
                        title="Admin inbox"
                        aria-hidden
                      >
                        {adminAttention}
                      </span>
                    )}
                    <div className="min-w-0 max-w-[7rem] lg:max-w-[10rem]">
                      <span className="block truncate text-xs font-medium text-slate-100">
                        {user.name ||
                          user.email ||
                          (user.mobile_number ? `+91 ${user.mobile_number}` : 'User')}
                      </span>
                      {user.role === 'super_admin' && (
                        <span className="text-[10px] text-slate-500">Admin</span>
                      )}
                    </div>
                    <button
                      onClick={handleLogout}
                      className="shrink-0 rounded-full p-1.5 text-slate-500 hover:bg-slate-800/30 hover:text-red-500"
                      title="Logout"
                      type="button"
                    >
                      <LogOut className="size-3.5" strokeWidth={1.75} />
                    </button>
                  </div>
                </>
              )}

              <CartButton />
            </div>
          </div>

          <nav
            className="hidden border-t border-slate-700/25 md:block md:py-2"
            aria-label="Primary navigation"
          >
            <div className="flex flex-wrap items-center gap-x-1 gap-y-1">
              {BOTTOM_NAV.map(({ href, label }) => {
                const active = navIsActive(pathname, href)
                return (
                  <Link
                    key={href}
                    href={href}
                    className={`inline-flex h-8 shrink-0 items-center rounded-full px-3.5 text-[12px] font-medium tracking-[0.06em] uppercase transition-colors ${
                      active
                        ? 'text-amber-600 ring-1 ring-amber-500/25 bg-amber-500/8'
                        : 'text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    {label}
                  </Link>
                )
              })}

              {auth.isAuthenticated && hasB2bPortalAccess && (
                <>
                  <span className="mx-1.5 h-3.5 w-px shrink-0 bg-slate-700/40" aria-hidden />
                  <Link
                    href={WHOLESALE_ORDER_PATH}
                    className={`inline-flex h-8 shrink-0 items-center rounded-full px-3.5 text-[12px] font-medium tracking-[0.06em] uppercase transition-colors ${
                      navIsActive(pathname, WHOLESALE_ORDER_PATH)
                        ? 'text-emerald-600 ring-1 ring-emerald-500/20 bg-emerald-500/5'
                        : 'text-slate-500 hover:text-emerald-600'
                    }`}
                  >
                    Wholesale
                  </Link>
                  <Link
                    href={PROFILE_LEDGER_PATH}
                    className={`inline-flex h-8 shrink-0 items-center rounded-full px-3.5 text-[12px] font-medium tracking-[0.06em] uppercase transition-colors ${
                      navIsActive(pathname, PROFILE_LEDGER_PATH)
                        ? 'text-emerald-600 ring-1 ring-emerald-500/20 bg-emerald-500/5'
                        : 'text-slate-500 hover:text-emerald-600'
                    }`}
                  >
                    Ledger
                  </Link>
                </>
              )}
            </div>
          </nav>
        </div>
      </header>

      <nav
        className="kc-mobile-nav-dock safe-area-pb fixed bottom-0 left-0 right-0 z-50 md:hidden"
        aria-label="Mobile navigation"
      >
        <div className="flex min-h-[48px] items-stretch justify-around px-1 pb-[max(0.25rem,env(safe-area-inset-bottom))] pt-1">
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
                className={`kc-mobile-nav-link active:scale-[0.97] ${
                  active ? 'kc-mobile-nav-link--active' : ''
                }`}
              >
                <span className="relative flex size-[1.25rem] shrink-0 items-center justify-center">
                  <Icon strokeWidth={1.5} className="opacity-90" aria-hidden />
                  {profileAdminDot ? (
                    <span className="absolute -right-1.5 -top-1 flex h-3 min-w-3 items-center justify-center rounded-full bg-rose-500 px-0.5 text-[7px] font-bold leading-none text-white">
                      {adminAttention}
                    </span>
                  ) : null}
                </span>
                <span className="max-w-full truncate px-0.5 text-center text-[9px] font-medium leading-tight tracking-wide">
                  {shortLabel ?? label}
                </span>
              </Link>
            )
          })}
        </div>
      </nav>

      <div className="h-12 shrink-0 md:h-[5.75rem]" data-kc-nav-spacer aria-hidden />
    </>
  )
}

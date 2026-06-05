'use client'

import { Suspense, type ComponentType } from 'react'
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
  PROFILE_SIPS_PATH,
  RESELLER_PRODUCTS_PATH,
  RESELLER_RATES_PATH,
  WHOLESALE_ORDER_PATH,
} from '@/lib/routes'
import { useCustomerTier } from '@/context/CustomerTierContext'
import { CUSTOMER_TIER } from '@/lib/customer-tier'
import Link from 'next/link'
import {
  Wallet,
  History,
  LayoutDashboard,
  User,
  LogOut,
  TrendingUp,
  ChevronRight,
  Package,
  LineChart,
  BookMarked,
  ScrollText,
  LockKeyhole,
  ReceiptIndianRupee,
  Truck,
  Upload,
} from 'lucide-react'
import axios from 'axios'
import { ProfileOrderHistory } from '@/components/profile/ProfileOrderHistory'
import {
  ResellerApplicationStatusPanel,
  ResellerInvitePanel,
} from '@/components/profile/ResellerInvitePanel'
import { useAdminInboxSummary } from '@/hooks/useAdminInboxSummary'
import { userHasAdminDashboardAccess, userCanCallStrictAdminApi } from '@/lib/admin-access'
import { formatAdminInboxBadge } from '@/lib/admin-inbox-summary'

const LEGAL_SUPPORT_LINKS = [
  { href: POLICY_TERMS_PATH, label: 'Terms', icon: ScrollText },
  { href: POLICY_PRIVACY_PATH, label: 'Privacy', icon: LockKeyhole },
  { href: POLICY_REFUNDS_PATH, label: 'Refunds', icon: ReceiptIndianRupee },
  { href: POLICY_SHIPPING_PATH, label: 'Shipping', icon: Truck },
] as const

type UserType = { role?: string; email?: string; name?: string; mobile_number?: string }

function ProfileSectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mb-2 px-0.5 text-[11px] font-semibold uppercase tracking-wider text-[var(--color-jewelry-black,#94a3b8)]/55">
      {children}
    </h2>
  )
}

function ProfileActionCard({
  href,
  onClick,
  icon: Icon,
  title,
  subtitle,
  badge,
  primary,
}: {
  href?: string
  onClick?: () => void
  icon: ComponentType<{ className?: string }>
  title: string
  subtitle?: string
  badge?: string
  primary?: boolean
}) {
  const inner = (
    <>
      <div
        className={`flex size-11 shrink-0 items-center justify-center rounded-xl ring-1 ${
          primary
            ? 'bg-[var(--kc-accent,#c41e3a)]/12 ring-[var(--kc-accent,#c41e3a)]/25'
            : 'bg-[var(--color-slate-900,#f7f4ef)] ring-[var(--color-slate-700,#e8e4df)]'
        }`}
      >
        <Icon
          className={`size-5 ${primary ? 'text-[var(--kc-accent,#c41e3a)]' : 'text-[var(--color-jewelry-black,#1a1814)]/70'}`}
          aria-hidden
        />
      </div>
      <div className="min-w-0 flex-1">
        <p
          className={`text-sm font-semibold leading-snug ${
            primary ? 'text-[var(--kc-accent,#c41e3a)]' : 'text-[var(--color-jewelry-black,#1a1814)]'
          }`}
        >
          {title}
        </p>
        {subtitle ? (
          <p className="mt-0.5 text-xs leading-snug text-[var(--color-jewelry-black,#1a1814)]/55">{subtitle}</p>
        ) : null}
      </div>
      {badge ? (
        <span className="flex h-6 min-w-6 shrink-0 items-center justify-center rounded-full bg-rose-500 px-2 text-[10px] font-bold text-white">
          {badge}
        </span>
      ) : null}
      <ChevronRight
        className={`size-4 shrink-0 ${primary ? 'text-[var(--kc-accent,#c41e3a)]/70' : 'text-[var(--color-jewelry-black,#1a1814)]/35'}`}
        aria-hidden
      />
    </>
  )

  const cls = `kc-profile-card group flex min-h-[4.25rem] w-full items-center gap-3 rounded-2xl px-4 py-3.5 text-left transition active:scale-[0.99] ${
    primary
      ? 'border-[var(--kc-accent,#c41e3a)]/30 bg-[var(--kc-accent,#c41e3a)]/[0.06] hover:border-[var(--kc-accent,#c41e3a)]/45 hover:bg-[var(--kc-accent,#c41e3a)]/10'
      : 'hover:border-[var(--color-slate-700,#d6d3d1)] hover:bg-[var(--color-slate-900,#faf8f4)]'
  }`

  if (href) {
    return (
      <Link href={href} className={cls}>
        {inner}
      </Link>
    )
  }

  return (
    <button type="button" onClick={onClick} className={cls}>
      {inner}
    </button>
  )
}

export default function ProfilePage() {
  return (
    <Suspense
      fallback={
        <div className="kc-profile-page flex min-h-screen items-center justify-center text-[var(--color-jewelry-black,#1a1814)]/50">
          Loading profile…
        </div>
      }
    >
      <ProfilePageContent />
    </Suspense>
  )
}

function ProfilePageContent() {
  const auth = useAuth()
  const { hasB2bPortalAccess, customerTier } = useCustomerTier()
  const { open: openLoginModal } = useLoginModal()
  const user = auth.user as UserType | undefined
  const isAdmin = userHasAdminDashboardAccess(user)
  const strictInbox = userCanCallStrictAdminApi(user)
  const { data: adminInbox } = useAdminInboxSummary(!!auth.isAuthenticated && strictInbox)
  const adminNavBadge =
    adminInbox && adminInbox.navAttentionCount > 0
      ? formatAdminInboxBadge(adminInbox.navAttentionCount)
      : ''

  const isReseller = customerTier === CUSTOMER_TIER.RESELLER
  const resellerUploadsEnabled = Boolean(
    auth.isAuthenticated &&
      isReseller &&
      auth.user &&
      (auth.user as { reseller_product_uploads_enabled?: boolean }).reseller_product_uploads_enabled,
  )
  const resellerRatesEnabled = Boolean(
    auth.isAuthenticated &&
      isReseller &&
      auth.user &&
      (auth.user as { reseller_rates_update_enabled?: boolean }).reseller_rates_update_enabled,
  )

  const handleLogout = async () => {
    const url = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'
    try {
      await axios.get(`${url}/api/auth/logout`, { withCredentials: true })
      window.location.href = HOME_PATH
    } catch {
      window.location.href = HOME_PATH
    }
  }

  const displayName =
    user?.name || user?.email || (user?.mobile_number ? `+91 ${user.mobile_number}` : 'User')
  const displaySub = user?.email || (user?.mobile_number ? `+91 ${user.mobile_number}` : '')

  return (
    <div className="kc-profile-page min-h-screen bg-[var(--color-slate-950,#0f172a)] text-[var(--color-jewelry-black,#f1f5f9)]">
      <main className="mx-auto max-w-lg px-4 py-6 kc-pb-mobile-nav md:max-w-xl md:py-8 md:pb-12">
        {/* User header */}
        <header className="mb-6">
          <h1 className="text-xl font-semibold text-[var(--color-jewelry-black,#1a1814)]">Profile</h1>
          {auth.isAuthenticated && user ? (
            <div className="mt-2">
              <p className="font-medium text-[var(--color-jewelry-black,#1a1814)]">{displayName}</p>
              {displaySub ? (
                <p className="text-sm text-[var(--color-jewelry-black,#1a1814)]/55">{displaySub}</p>
              ) : null}
              {user.role === 'super_admin' ? (
                <span className="mt-2 inline-block rounded-full border border-[var(--kc-accent,#c41e3a)]/30 bg-[var(--kc-accent,#c41e3a)]/10 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--kc-accent,#c41e3a)]">
                  Admin
                </span>
              ) : null}
            </div>
          ) : null}
        </header>

        {!auth.isAuthenticated ? (
          <div className="kc-profile-card rounded-2xl px-6 py-10 text-center">
            <User className="mx-auto mb-4 size-12 text-[var(--color-jewelry-black,#1a1814)]/25" />
            <h3 className="text-lg font-semibold text-[var(--color-jewelry-black,#1a1814)]">
              Sign in to view your profile
            </h3>
            <p className="mt-2 text-sm text-[var(--color-jewelry-black,#1a1814)]/55">
              Access wallet, bookings, and order history
            </p>
            <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
              <button
                type="button"
                onClick={() => openLoginModal(PROFILE_PATH)}
                className="kc-btn-theme min-h-[44px]"
              >
                Sign in
              </button>
              <a
                href={`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'}/auth/google?returnTo=${encodeURIComponent(PROFILE_PATH)}`}
                className="inline-flex min-h-[44px] items-center justify-center rounded-xl border border-[var(--color-slate-700,#e8e4df)] px-6 py-2.5 text-sm font-medium text-[var(--color-jewelry-black,#1a1814)]"
              >
                Sign in with Google
              </a>
            </div>
          </div>
        ) : (
          <>
            {/* ——— Reseller quick actions (most important first) ——— */}
            {(resellerUploadsEnabled || resellerRatesEnabled || isReseller) && (
              <section className="mb-6 space-y-2">
                <ProfileSectionHeading>Reseller</ProfileSectionHeading>
                {resellerRatesEnabled ? (
                  <ProfileActionCard
                    href={RESELLER_RATES_PATH}
                    icon={LineChart}
                    title="Update live rates"
                    subtitle="Silver & gold 18K / 22K / 24K — updates prices for all KC visitors"
                    primary={!resellerUploadsEnabled}
                  />
                ) : null}
                {resellerUploadsEnabled ? (
                  <ProfileActionCard
                    href={RESELLER_PRODUCTS_PATH}
                    icon={Upload}
                    title="Upload products"
                    subtitle="Add items, photos & Excel — send batches for KC review"
                    primary
                  />
                ) : null}
                {isReseller ? <ResellerInvitePanel embedded /> : null}
              </section>
            )}

            {/* Pending reseller application (non-resellers only) */}
            <ResellerApplicationStatusPanel />

            {/* Admin */}
            {isAdmin ? (
              <section className="mb-6 space-y-2">
                <ProfileSectionHeading>Administration</ProfileSectionHeading>
                <ProfileActionCard
                  href="/admin"
                  icon={LayoutDashboard}
                  title="Admin dashboard"
                  subtitle={
                    adminInbox && adminInbox.totalAttentionCount > 0
                      ? `${adminInbox.totalAttentionCount} item${adminInbox.totalAttentionCount === 1 ? '' : 's'} need attention`
                      : 'Rates, products, orders & more'
                  }
                  badge={adminNavBadge || undefined}
                />
              </section>
            ) : null}

            {/* B2B wholesale */}
            {hasB2bPortalAccess ? (
              <section className="mb-6 space-y-2">
                <ProfileSectionHeading>Wholesale</ProfileSectionHeading>
                <div className="space-y-2">
                  <ProfileActionCard
                    href={WHOLESALE_ORDER_PATH}
                    icon={Package}
                    title="Wholesale quick order"
                    subtitle="SKU matrix & bulk add to cart"
                  />
                  <ProfileActionCard
                    href={PROFILE_LEDGER_PATH}
                    icon={BookMarked}
                    title="Ledger (Khata)"
                    subtitle="Rupee & fine metal balances"
                  />
                </div>
              </section>
            ) : null}

            {/* Account */}
            <section className="mb-6 space-y-2">
              <ProfileSectionHeading>Account</ProfileSectionHeading>
              <div className="kc-profile-card rounded-2xl px-4 py-4">
                <div className="flex items-center gap-3">
                  <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-[var(--kc-accent,#c41e3a)]/12 ring-1 ring-[var(--kc-accent,#c41e3a)]/20">
                    <Wallet className="size-5 text-[var(--kc-accent,#c41e3a)]" aria-hidden />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-[var(--color-jewelry-black,#1a1814)]">Wallet balance</p>
                    <p className="text-xs text-[var(--color-jewelry-black,#1a1814)]/55">For purchases & bookings</p>
                  </div>
                  <p className="text-xl font-bold tabular-nums text-[var(--kc-accent,#c41e3a)]">₹0</p>
                </div>
              </div>
              <ProfileActionCard
                href={PROFILE_SIPS_PATH}
                icon={TrendingUp}
                title="My SIPs"
                subtitle="Gold, Silver & Diamond investments"
              />
            </section>

            {/* Orders */}
            <section className="mb-6">
              <ProfileSectionHeading>Orders</ProfileSectionHeading>
              <div className="kc-profile-card overflow-hidden rounded-2xl">
                <div className="flex items-center gap-3 border-b border-[var(--color-slate-700,#e8e4df)] px-4 py-3.5">
                  <History className="size-5 shrink-0 text-[var(--color-jewelry-black,#1a1814)]/45" aria-hidden />
                  <div>
                    <p className="text-sm font-semibold text-[var(--color-jewelry-black,#1a1814)]">
                      Orders & rate bookings
                    </p>
                    <p className="text-xs text-[var(--color-jewelry-black,#1a1814)]/55">
                      Status, items & WhatsApp to KC
                    </p>
                  </div>
                </div>
                <ProfileOrderHistory />
              </div>
            </section>

            {/* Legal — last before logout */}
            <section className="mb-6">
              <ProfileSectionHeading>Legal & support</ProfileSectionHeading>
              <div className="grid grid-cols-2 gap-2">
                {LEGAL_SUPPORT_LINKS.map(({ href, label, icon: Icon }) => (
                  <Link
                    key={href}
                    href={href}
                    className="kc-profile-card flex min-h-[44px] items-center gap-2 rounded-xl px-3 py-2.5 text-xs font-medium text-[var(--color-jewelry-black,#1a1814)]/80 transition hover:bg-[var(--color-slate-900,#f7f4ef)]"
                  >
                    <Icon className="size-3.5 shrink-0 text-[var(--color-jewelry-black,#1a1814)]/45" aria-hidden />
                    <span className="truncate">{label}</span>
                  </Link>
                ))}
              </div>
            </section>

            {/* Logout */}
            <section className="mb-2">
              <ProfileActionCard
                onClick={() => void handleLogout()}
                icon={LogOut}
                title="Logout"
                subtitle="Sign out of your account"
              />
            </section>
          </>
        )}
      </main>
    </div>
  )
}

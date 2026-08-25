'use client'

import Link from 'next/link'
import { ArrowLeft, LayoutGrid } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { useCustomerTier } from '@/context/CustomerTierContext'
import { CUSTOMER_TIER, type WholesaleUserFields } from '@/lib/customer-tier'
import { CATALOG_PATH, PROFILE_PATH, RESELLER_ERP_PATH } from '@/lib/routes'
import type { ReactNode } from 'react'
import { ErpOperatorBar } from '@/components/reseller/erp/ErpOperatorLogin'
import { ErpQuickNav } from '@/components/reseller/erp/ErpQuickNav'

export function useResellerErpAccess() {
  const auth = useAuth()
  const { customerTier, tierReady } = useCustomerTier()
  const authReady = auth.hasChecked === true
  const enabled = Boolean(
    auth.isAuthenticated &&
      auth.user &&
      customerTier === CUSTOMER_TIER.RESELLER &&
      (auth.user as WholesaleUserFields).reseller_erp_enabled,
  )
  return { auth, customerTier, tierReady, authReady, enabled }
}

export function ResellerErpShell({
  title,
  subtitle,
  backHref = RESELLER_ERP_PATH,
  backLabel = 'ERP home',
  children,
  actions,
}: {
  title: string
  subtitle?: string
  backHref?: string
  backLabel?: string
  children: ReactNode
  actions?: ReactNode
}) {
  return (
    <div className="min-h-screen bg-[var(--color-slate-950,#faf8f4)] pb-[var(--kc-mobile-nav-stack,5rem)] md:pb-12">
      <div className="border-b border-[var(--color-slate-700,#e8e4df)] bg-white/95 backdrop-blur-sm">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <Link
              href={backHref}
              className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-xl border border-[var(--color-slate-700,#e8e4df)] text-[var(--color-jewelry-black,#1a1814)] transition hover:bg-[var(--color-slate-900,#f7f4ef)]"
              aria-label={backLabel}
            >
              <ArrowLeft className="size-4" />
            </Link>
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--kc-accent,#c41e3a)]/80">
                Jewellery ERP
              </p>
              <h1 className="truncate text-lg font-semibold text-[var(--color-jewelry-black,#1a1814)] sm:text-xl">
                {title}
              </h1>
              {subtitle ? (
                <p className="mt-0.5 text-xs leading-snug text-[var(--color-jewelry-black,#1a1814)]/55 sm:text-sm">
                  {subtitle}
                </p>
              ) : null}
            </div>
          </div>
          {actions ? <div className="flex shrink-0 flex-wrap gap-2">{actions}</div> : null}
        </div>
      </div>
      <div className="mx-auto max-w-6xl px-4 py-5 sm:py-6">
        <div className="mb-4">
          <ErpOperatorBar />
        </div>
        <ErpQuickNav />
        {children}
      </div>
    </div>
  )
}

export function ResellerErpAccessGate({ children }: { children: ReactNode }) {
  const { auth, customerTier, tierReady, authReady, enabled } = useResellerErpAccess()

  if (!authReady || !tierReady) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center text-[var(--color-jewelry-black,#1a1814)]/60">
        Loading…
      </div>
    )
  }

  if (!auth.isAuthenticated) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <p className="text-[var(--color-jewelry-black,#1a1814)]">Sign in to open ERP.</p>
        <Link
          href={PROFILE_PATH}
          className="mt-4 inline-block rounded-xl bg-[var(--kc-accent,#c41e3a)] px-6 py-2.5 text-sm font-semibold text-white"
        >
          Go to profile
        </Link>
      </div>
    )
  }

  if (customerTier !== CUSTOMER_TIER.RESELLER) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <p className="text-[var(--color-jewelry-black,#1a1814)]">ERP is for RESELLER accounts only.</p>
        <Link href={CATALOG_PATH} className="mt-4 inline-block text-sm font-medium text-[var(--kc-accent,#c41e3a)]">
          Back to catalogue
        </Link>
      </div>
    )
  }

  if (!enabled) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <LayoutGrid className="mx-auto size-12 text-[var(--color-jewelry-black,#1a1814)]/30" />
        <h1 className="mt-4 text-xl font-semibold text-[var(--color-jewelry-black,#1a1814)]">ERP software</h1>
        <p className="mt-2 text-sm text-[var(--color-jewelry-black,#1a1814)]/65">
          Ask KC admin to enable ERP software for your account in B2B Clients → Reseller profile.
        </p>
        <Link href={PROFILE_PATH} className="mt-6 inline-block text-sm font-medium text-[var(--kc-accent,#c41e3a)]">
          Go to profile
        </Link>
      </div>
    )
  }

  return <>{children}</>
}

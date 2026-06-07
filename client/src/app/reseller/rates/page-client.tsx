'use client'

import { Suspense } from 'react'
import Link from 'next/link'
import { ArrowLeft, LineChart } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { useLoginModal } from '@/context/LoginModalContext'
import { useCustomerTier } from '@/context/CustomerTierContext'
import { CUSTOMER_TIER } from '@/lib/customer-tier'
import { CATALOG_PATH, PROFILE_PATH } from '@/lib/routes'
import { ResellerRatesPanel } from '@/components/reseller/ResellerRatesPanel'
import { useEffect } from 'react'

function ResellerRatesContent() {
  const auth = useAuth()
  const { close: closeLoginModal } = useLoginModal()
  const { customerTier, tierReady } = useCustomerTier()

  useEffect(() => {
    if (auth.hasChecked && auth.isAuthenticated) closeLoginModal()
  }, [auth.hasChecked, auth.isAuthenticated, closeLoginModal])

  const authReady = auth.hasChecked === true
  const ratesEnabled = Boolean(
    auth.isAuthenticated &&
      auth.user &&
      customerTier === CUSTOMER_TIER.RESELLER &&
      (auth.user as { reseller_rates_update_enabled?: boolean }).reseller_rates_update_enabled,
  )

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
        <p className="text-[var(--color-jewelry-black,#1a1814)]">Sign in to update rates.</p>
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
        <p className="text-[var(--color-jewelry-black,#1a1814)]">Rate updates are for RESELLER accounts only.</p>
        <Link href={CATALOG_PATH} className="mt-4 inline-block text-sm font-medium text-[var(--kc-accent,#c41e3a)]">
          Back to catalogue
        </Link>
      </div>
    )
  }

  return (
    <div className="kc-reseller-rates-page min-h-screen bg-[var(--color-slate-950,#faf8f4)] pb-[var(--kc-mobile-nav-stack,5rem)] md:pb-12">
      <div className="border-b border-[var(--color-slate-700,#e8e4df)] bg-white/95 backdrop-blur-sm">
        <div className="mx-auto flex max-w-2xl items-center gap-3 px-4 py-4">
          <Link
            href={PROFILE_PATH}
            className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-[var(--color-slate-700,#e8e4df)] text-[var(--color-jewelry-black,#1a1814)] transition hover:bg-[var(--color-slate-900,#f7f4ef)]"
            aria-label="Back to profile"
          >
            <ArrowLeft className="size-5" />
          </Link>
          <div className="min-w-0 flex-1">
            <h1 className="flex items-center gap-2 truncate text-lg font-semibold text-[var(--color-jewelry-black,#1a1814)]">
              <LineChart className="size-5 shrink-0 text-[var(--kc-accent,#c41e3a)]" />
              Update today rates
            </h1>
            {ratesEnabled ? (
              <p className="truncate text-xs text-[var(--color-jewelry-black,#1a1814)]/55">
                Silver + gold 18K / 22K / 24K per gram
              </p>
            ) : null}
          </div>
        </div>
      </div>
      <main className="mx-auto px-4 py-6">
        <ResellerRatesPanel />
      </main>
    </div>
  )
}

export default function ResellerRatesPageClient() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[50vh] items-center justify-center text-[var(--color-jewelry-black,#1a1814)]/60">
          Loading…
        </div>
      }
    >
      <ResellerRatesContent />
    </Suspense>
  )
}

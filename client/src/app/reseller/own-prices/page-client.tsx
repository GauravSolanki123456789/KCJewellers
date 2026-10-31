'use client'

import { Suspense, useEffect } from 'react'
import Link from 'next/link'
import { ArrowLeft, ReceiptIndianRupee } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { useLoginModal } from '@/context/LoginModalContext'
import { useCustomerTier } from '@/context/CustomerTierContext'
import { CUSTOMER_TIER } from '@/lib/customer-tier'
import { CATALOG_PATH, PROFILE_PATH } from '@/lib/routes'
import { ResellerOwnPricesPanel } from '@/components/reseller/ResellerOwnPricesPanel'

function ResellerOwnPricesContent() {
  const auth = useAuth()
  const { close: closeLoginModal } = useLoginModal()
  const { customerTier, tierReady } = useCustomerTier()

  useEffect(() => {
    if (auth.hasChecked && auth.isAuthenticated) closeLoginModal()
  }, [auth.hasChecked, auth.isAuthenticated, closeLoginModal])

  const authReady = auth.hasChecked === true
  const pricesEnabled = Boolean(
    auth.isAuthenticated &&
      auth.user &&
      customerTier === CUSTOMER_TIER.RESELLER &&
      (auth.user as { reseller_own_prices_enabled?: boolean }).reseller_own_prices_enabled,
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
        <p className="text-[var(--color-jewelry-black,#1a1814)]">Sign in to set your prices.</p>
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
        <p className="text-[var(--color-jewelry-black,#1a1814)]">Your prices are for RESELLER accounts only.</p>
        <Link href={CATALOG_PATH} className="mt-4 inline-block text-sm font-medium text-[var(--kc-accent,#c41e3a)]">
          Back to catalogue
        </Link>
      </div>
    )
  }

  return (
    <div className="kc-reseller-upload-panel min-h-screen bg-[var(--color-slate-950,#faf8f4)] pb-[var(--kc-mobile-nav-stack,5rem)] md:pb-12">
      <div className="border-b border-[var(--color-slate-700,#e8e4df)] bg-white/95 backdrop-blur-sm">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-4">
          <Link
            href={PROFILE_PATH}
            className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-[var(--color-slate-700,#e8e4df)] text-[var(--color-jewelry-black,#1a1814)] transition hover:bg-[var(--color-slate-900,#f7f4ef)]"
            aria-label="Back to profile"
          >
            <ArrowLeft className="size-5" />
          </Link>
          <div className="min-w-0 flex-1">
            <h1 className="flex items-center gap-2 truncate text-lg font-semibold text-[var(--color-jewelry-black,#1a1814)]">
              <ReceiptIndianRupee className="size-5 shrink-0 text-[var(--kc-accent,#c41e3a)]" />
              Your prices
            </h1>
            {pricesEnabled ? (
              <p className="truncate text-xs text-[var(--color-jewelry-black,#1a1814)]/55">
                Gift items and silver — MRP on your website and catalogues
              </p>
            ) : null}
          </div>
        </div>
      </div>
      <main className="mx-auto px-4 py-6">
        <ResellerOwnPricesPanel />
      </main>
    </div>
  )
}

export default function ResellerOwnPricesPageClient() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[50vh] items-center justify-center text-[var(--color-jewelry-black,#1a1814)]/60">
          Loading…
        </div>
      }
    >
      <ResellerOwnPricesContent />
    </Suspense>
  )
}

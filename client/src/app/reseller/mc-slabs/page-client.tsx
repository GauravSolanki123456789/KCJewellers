'use client'

import { Suspense } from 'react'
import Link from 'next/link'
import { ArrowLeft, Layers } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { useCustomerTier } from '@/context/CustomerTierContext'
import { CUSTOMER_TIER } from '@/lib/customer-tier'
import { CATALOG_PATH, PROFILE_PATH } from '@/lib/routes'
import { ResellerMcSlabsPanel } from '@/components/reseller/ResellerMcSlabsPanel'

function ResellerMcSlabsContent() {
  const auth = useAuth()
  const { customerTier, tierReady } = useCustomerTier()

  const authReady = auth.hasChecked === true
  const uploadSlabsEnabled = Boolean(
    auth.isAuthenticated &&
      auth.user &&
      customerTier === CUSTOMER_TIER.RESELLER &&
      (auth.user as { reseller_upload_slabs_enabled?: boolean }).reseller_upload_slabs_enabled,
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
        <p className="text-[var(--color-jewelry-black,#1a1814)]">Sign in to upload MC slabs.</p>
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
        <p className="text-[var(--color-jewelry-black,#1a1814)]">MC slab uploads are for RESELLER accounts only.</p>
        <Link href={CATALOG_PATH} className="mt-4 inline-block text-sm font-medium text-[var(--kc-accent,#c41e3a)]">
          Back to catalogue
        </Link>
      </div>
    )
  }

  if (!uploadSlabsEnabled) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <Layers className="mx-auto size-12 text-[var(--color-jewelry-black,#1a1814)]/30" />
        <h1 className="mt-4 text-xl font-semibold text-[var(--color-jewelry-black,#1a1814)]">Upload slabs</h1>
        <p className="mt-2 text-sm text-[var(--color-jewelry-black,#1a1814)]/65">
          Ask KC admin to enable MC slab uploads for your account.
        </p>
        <Link href={PROFILE_PATH} className="mt-6 inline-block text-sm font-medium text-[var(--kc-accent,#c41e3a)]">
          Go to profile
        </Link>
      </div>
    )
  }

  return (
    <div className="kc-reseller-upload-panel min-h-screen bg-[var(--color-slate-950,#faf8f4)] pb-[var(--kc-mobile-nav-stack,5rem)] md:pb-12">
      <div className="border-b border-[var(--color-slate-700,#e8e4df)] bg-white/95 backdrop-blur-sm">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-4">
          <Link
            href={PROFILE_PATH}
            className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-[var(--color-slate-700,#e8e4df)] text-[var(--color-jewelry-black,#1a1814)] transition hover:bg-[var(--color-slate-900,#f7f4ef)]"
            aria-label="Back to profile"
          >
            <ArrowLeft className="size-5" />
          </Link>
          <div className="min-w-0">
            <h1 className="truncate text-lg font-semibold text-[var(--color-jewelry-black,#1a1814)]">Upload slabs</h1>
            <p className="truncate text-xs text-[var(--color-jewelry-black,#1a1814)]/55">
              Weight-range MC rates for WhatsApp catalogues
            </p>
          </div>
        </div>
      </div>
      <main className="px-4 py-6">
        <ResellerMcSlabsPanel />
      </main>
    </div>
  )
}

export default function ResellerMcSlabsPageClient() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[50vh] items-center justify-center text-[var(--color-jewelry-black,#1a1814)]/60">
          Loading…
        </div>
      }
    >
      <ResellerMcSlabsContent />
    </Suspense>
  )
}

'use client'

import { Suspense, useEffect } from 'react'
import Link from 'next/link'
import { ArrowLeft, Package } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { useLoginModal } from '@/context/LoginModalContext'
import { useCustomerTier } from '@/context/CustomerTierContext'
import { CUSTOMER_TIER } from '@/lib/customer-tier'
import { CATALOG_PATH, PROFILE_PATH } from '@/lib/routes'
import { ResellerProductsPanel } from '@/components/reseller/ResellerProductsPanel'

function ResellerProductsContent() {
  const auth = useAuth()
  const { close: closeLoginModal } = useLoginModal()
  const { customerTier, tierReady } = useCustomerTier()

  // Close login modal if auth resolves while on this page (avoids stale modal after navigation)
  useEffect(() => {
    if (auth.hasChecked && auth.isAuthenticated) closeLoginModal()
  }, [auth.hasChecked, auth.isAuthenticated, closeLoginModal])

  const authReady = auth.hasChecked === true
  const uploadsEnabled = Boolean(
    auth.isAuthenticated &&
      auth.user &&
      customerTier === CUSTOMER_TIER.RESELLER &&
      (auth.user as { reseller_product_uploads_enabled?: boolean }).reseller_product_uploads_enabled,
  )
  const editsEnabled = Boolean(
    auth.isAuthenticated &&
      auth.user &&
      customerTier === CUSTOMER_TIER.RESELLER &&
      (auth.user as { reseller_product_edits_enabled?: boolean }).reseller_product_edits_enabled,
  )
  const portalEnabled = uploadsEnabled || editsEnabled

  if (!authReady || !tierReady) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center text-[var(--color-jewelry-black,#1a1814)]/60">
        Loading…
      </div>
    )
  }

  if (!auth.isAuthenticated) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center kc-reseller-upload-panel">
        <p className="text-[var(--color-jewelry-black,#1a1814)]">Sign in to upload products.</p>
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
      <div className="mx-auto max-w-lg px-4 py-16 text-center kc-reseller-upload-panel">
        <p className="text-[var(--color-jewelry-black,#1a1814)]">Product uploads are for RESELLER accounts only.</p>
        <Link href={CATALOG_PATH} className="mt-4 inline-block text-sm font-medium text-[var(--kc-accent,#c41e3a)]">
          Back to catalogue
        </Link>
      </div>
    )
  }

  if (!portalEnabled) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center kc-reseller-upload-panel">
        <Package className="mx-auto size-12 text-[var(--color-jewelry-black,#1a1814)]/30" />
        <h1 className="mt-4 text-xl font-semibold text-[var(--color-jewelry-black,#1a1814)]">Products not enabled yet</h1>
        <p className="mt-2 text-sm text-[var(--color-jewelry-black,#1a1814)]/65">
          Ask KC admin to enable product uploads or live edits (B2B clients → Edit reseller).
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
            <h1 className="truncate text-lg font-semibold text-[var(--color-jewelry-black,#1a1814)]">
              {uploadsEnabled ? 'Upload products' : 'Manage products'}
            </h1>
          </div>
        </div>
      </div>
      <main className="mx-auto px-4 py-6">
        <ResellerProductsPanel uploadsEnabled={uploadsEnabled} editsEnabled={editsEnabled} />
      </main>
    </div>
  )
}

export default function ResellerProductsPageClient() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[50vh] items-center justify-center text-[var(--color-jewelry-black,#1a1814)]/60">
          Loading…
        </div>
      }
    >
      <ResellerProductsContent />
    </Suspense>
  )
}

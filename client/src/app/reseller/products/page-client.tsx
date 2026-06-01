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
  const { open: openLoginModal } = useLoginModal()
  const { customerTier, tierReady } = useCustomerTier()

  const uploadsEnabled = Boolean(
    auth.isAuthenticated &&
      auth.user &&
      customerTier === CUSTOMER_TIER.RESELLER &&
      (auth.user as { reseller_product_uploads_enabled?: boolean }).reseller_product_uploads_enabled,
  )

  useEffect(() => {
    if (tierReady && !auth.isAuthenticated) openLoginModal()
  }, [tierReady, auth.isAuthenticated, openLoginModal])

  if (!tierReady) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center text-slate-500">
        Loading…
      </div>
    )
  }

  if (!auth.isAuthenticated) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <p className="text-slate-600">Sign in to upload products for your reseller catalogue.</p>
        <button
          type="button"
          onClick={() => openLoginModal()}
          className="mt-4 rounded-xl bg-[var(--kc-accent,#c41e3a)] px-6 py-2.5 text-sm font-semibold text-white"
        >
          Sign in
        </button>
      </div>
    )
  }

  if (customerTier !== CUSTOMER_TIER.RESELLER) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <p className="text-slate-600">Product uploads are for RESELLER accounts only.</p>
        <Link href={CATALOG_PATH} className="mt-4 inline-block text-sm font-medium text-[var(--kc-accent,#c41e3a)]">
          Back to catalogue
        </Link>
      </div>
    )
  }

  if (!uploadsEnabled) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <Package className="mx-auto size-12 text-slate-300" />
        <h1 className="mt-4 text-xl font-semibold text-slate-900">Uploads not enabled yet</h1>
        <p className="mt-2 text-sm text-slate-500">
          Ask KC admin to enable product uploads on your reseller profile (B2B clients → Edit reseller).
        </p>
        <Link href={PROFILE_PATH} className="mt-6 inline-block text-sm font-medium text-[var(--kc-accent,#c41e3a)]">
          Go to profile
        </Link>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white pb-[var(--kc-mobile-nav-stack,5rem)] md:pb-12">
      <div className="border-b border-slate-200/80 bg-white/90 backdrop-blur-sm">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-4">
          <Link
            href={PROFILE_PATH}
            className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 text-slate-600 transition hover:bg-slate-50"
            aria-label="Back to profile"
          >
            <ArrowLeft className="size-5" />
          </Link>
          <div className="min-w-0">
            <h1 className="truncate text-lg font-semibold text-slate-900">Upload products</h1>
            <p className="text-xs text-slate-500">Staff can add items and photos · admin approves before live</p>
          </div>
        </div>
      </div>
      <main className="mx-auto px-4 py-6">
        <ResellerProductsPanel />
      </main>
    </div>
  )
}

export default function ResellerProductsPageClient() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[50vh] items-center justify-center text-slate-500">Loading…</div>
      }
    >
      <ResellerProductsContent />
    </Suspense>
  )
}

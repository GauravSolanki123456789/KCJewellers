'use client'

import { Suspense, useMemo, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Gem, Loader2, Wallet } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { useCustomerTier } from '@/context/CustomerTierContext'
import { CUSTOMER_TIER, type WholesaleUserFields } from '@/lib/customer-tier'
import { CATALOG_PATH, PROFILE_PATH } from '@/lib/routes'
import { ErpDigiWorkspace } from '@/components/reseller/erp/ErpDigiWorkspace'

export default function ProfileDigiPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[50vh] items-center justify-center text-[var(--color-jewelry-black,#1a1814)]/55">
          <Loader2 className="size-6 animate-spin" />
        </div>
      }
    >
      <ProfileDigiContent />
    </Suspense>
  )
}

function ProfileDigiContent() {
  const auth = useAuth()
  const { customerTier, tierReady } = useCustomerTier()
  const user = auth.user as WholesaleUserFields | null
  const goldEnabled = !!user?.reseller_digigold_enabled
  const silverEnabled = !!user?.reseller_digisilver_enabled
  const defaultTab = goldEnabled ? 'gold' : 'silver'
  const [tab, setTab] = useState<'gold' | 'silver'>(defaultTab)

  const enabled = goldEnabled || silverEnabled
  const ready = auth.hasChecked && tierReady

  const tabs = useMemo(() => {
    const out: { id: 'gold' | 'silver'; label: string; icon: typeof Gem }[] = []
    if (goldEnabled) out.push({ id: 'gold', label: 'DigiGold', icon: Gem })
    if (silverEnabled) out.push({ id: 'silver', label: 'DigiSilver', icon: Wallet })
    return out
  }, [goldEnabled, silverEnabled])

  if (!ready) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center text-[var(--color-jewelry-black,#1a1814)]/55">
        Loading…
      </div>
    )
  }

  if (!auth.isAuthenticated) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <p className="text-[var(--color-jewelry-black,#1a1814)]">Sign in to open DigiGold / DigiSilver.</p>
        <Link href={PROFILE_PATH} className="mt-4 inline-block text-sm font-medium text-[var(--kc-accent,#c41e3a)]">
          Go to profile
        </Link>
      </div>
    )
  }

  if (customerTier !== CUSTOMER_TIER.RESELLER) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <p className="text-[var(--color-jewelry-black,#1a1814)]">This section is for reseller staff only.</p>
        <Link href={CATALOG_PATH} className="mt-4 inline-block text-sm font-medium text-[var(--kc-accent,#c41e3a)]">
          Back to catalogue
        </Link>
      </div>
    )
  }

  if (!enabled) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <Gem className="mx-auto size-12 text-[var(--color-jewelry-black,#1a1814)]/25" />
        <h1 className="mt-4 text-xl font-semibold text-[var(--color-jewelry-black,#1a1814)]">
          DigiGold &amp; DigiSilver
        </h1>
        <p className="mt-2 text-sm text-[var(--color-jewelry-black,#1a1814)]/65">
          Ask KC admin to enable DigiGold and/or DigiSilver for your account in B2B Clients → Reseller profile.
        </p>
        <Link href={PROFILE_PATH} className="mt-6 inline-block text-sm font-medium text-[var(--kc-accent,#c41e3a)]">
          Back to profile
        </Link>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[var(--color-slate-950,#faf8f4)] pb-[var(--kc-mobile-nav-stack,5rem)] md:pb-12">
      <div className="border-b border-[var(--color-slate-700,#e8e4df)] bg-white/95 backdrop-blur-sm">
        <div className="mx-auto max-w-3xl px-4 py-4">
          <div className="flex items-start gap-3">
            <Link
              href={PROFILE_PATH}
              className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-xl border border-[var(--color-slate-700,#e8e4df)] text-[var(--color-jewelry-black,#1a1814)]"
              aria-label="Back to profile"
            >
              <ArrowLeft className="size-4" />
            </Link>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--kc-accent,#c41e3a)]/80">
                Profile
              </p>
              <h1 className="text-lg font-semibold text-[var(--color-jewelry-black,#1a1814)] sm:text-xl">
                DigiGold &amp; DigiSilver
              </h1>
              <p className="mt-0.5 text-xs text-[var(--color-jewelry-black,#1a1814)]/55">
                Chit schemes, customer balances, offline &amp; online payments
              </p>
            </div>
          </div>
          {tabs.length > 1 ? (
            <div className="mt-4 flex gap-2">
              {tabs.map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  type="button"
                  className={`inline-flex min-h-[40px] flex-1 items-center justify-center gap-1.5 rounded-xl border px-3 text-sm font-semibold ${
                    tab === id
                      ? 'border-emerald-600 bg-emerald-50 !text-[#1a1814] ring-1 ring-emerald-300/60'
                      : 'border-[var(--color-slate-700,#e8e4df)] bg-white text-[var(--color-jewelry-black,#1a1814)]'
                  }`}
                  onClick={() => setTab(id)}
                >
                  <Icon className="size-4" />
                  {label}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </div>
      <div className="mx-auto max-w-3xl px-4 py-5 sm:py-6">
        <ErpDigiWorkspace metal={tab} />
      </div>
    </div>
  )
}

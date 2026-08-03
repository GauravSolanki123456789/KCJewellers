'use client'

import { Suspense, useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import axios from '@/lib/axios'
import { ArrowLeft, Loader2, Percent } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { useLoginModal } from '@/context/LoginModalContext'
import { useCustomerTier } from '@/context/CustomerTierContext'
import { CUSTOMER_TIER } from '@/lib/customer-tier'
import { PROFILE_PATH } from '@/lib/routes'
import {
  emptyResellerSlabForm,
  resellerSlabFormFromSettings,
  resellerSlabSettingsFromForm,
  type ResellerSlabFormState,
} from '@/lib/reseller-catalog-slab-form'
import type { ResellerSlabSettings } from '@/lib/catalog-slab-pricing'
import {
  RESELLER_CATALOG_SLAB_HELP,
  ResellerCatalogSlabSettingsPanel,
} from '@/components/reseller/ResellerCatalogSlabSettingsPanel'
import SaveFeedbackButton from '@/components/ui/SaveFeedbackButton'
import { useSaveFeedback } from '@/hooks/useSaveFeedback'

function CatalogSlabSettingsContent() {
  const auth = useAuth()
  const { open: openLoginModal } = useLoginModal()
  const { customerTier, tierReady } = useCustomerTier()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [form, setForm] = useState<ResellerSlabFormState>(() => emptyResellerSlabForm())
  const [showMrpBehindBox, setShowMrpBehindBox] = useState(false)
  const slabSave = useSaveFeedback()

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await axios.get<{ slab_settings: ResellerSlabSettings; show_mrp_behind_box?: boolean }>(
        '/api/reseller/catalog-slab-settings',
        { withCredentials: true },
      )
      setForm(resellerSlabFormFromSettings(res.data.slab_settings))
      setShowMrpBehindBox(!!res.data.show_mrp_behind_box)
    } catch {
      setError('Could not load catalogue slab settings.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!auth.hasChecked) return
    if (!auth.isAuthenticated) {
      setLoading(false)
      return
    }
    void load()
  }, [auth.hasChecked, auth.isAuthenticated, load])

  const handleSave = () =>
    slabSave.runSave(async () => {
      setError(null)
      setSuccess(null)
      try {
        await axios.patch(
          '/api/reseller/catalog-slab-settings',
          {
            slab_settings: resellerSlabSettingsFromForm(form),
            show_mrp_behind_box: showMrpBehindBox,
          },
          { withCredentials: true },
        )
        setSuccess('Catalogue slab settings saved. WhatsApp links and your storefront prices will use these values.')
        await load()
      } catch (e: unknown) {
        const msg =
          (e as { response?: { data?: { error?: string } } })?.response?.data?.error ||
          'Failed to save settings.'
        setError(msg)
        throw e
      }
    })

  if (!auth.hasChecked || !tierReady || loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-[var(--color-jewelry-black,#1a1814)]/55">
        <Loader2 className="size-6 animate-spin" aria-hidden />
      </div>
    )
  }

  if (!auth.isAuthenticated) {
    return (
      <div className="kc-profile-card rounded-2xl px-6 py-10 text-center">
        <Percent className="mx-auto mb-4 size-12 text-[var(--color-jewelry-black,#1a1814)]/25" />
        <p className="text-sm text-[var(--color-jewelry-black,#1a1814)]/70">Sign in to manage catalogue slabs.</p>
        <button
          type="button"
          onClick={() => openLoginModal('/reseller/catalog-slab-settings')}
          className="kc-btn-theme mt-4 min-h-[44px]"
        >
          Sign in
        </button>
      </div>
    )
  }

  if (customerTier !== CUSTOMER_TIER.RESELLER) {
    return (
      <div className="kc-profile-card rounded-2xl px-6 py-10 text-center">
        <p className="text-sm text-[var(--color-jewelry-black,#1a1814)]/70">
          Catalogue slab settings are for RESELLER accounts only.
        </p>
        <Link href={PROFILE_PATH} className="mt-4 inline-block text-sm font-medium text-[var(--kc-accent,#c41e3a)]">
          Back to profile
        </Link>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {error ? (
        <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}</p>
      ) : null}
      {success ? (
        <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
          {success}
        </p>
      ) : null}

      <div className="kc-profile-card rounded-2xl p-4 sm:p-5">
        <p className="text-sm font-semibold text-[var(--color-jewelry-black,#1a1814)]">Shared catalogue slabs</p>
        <p className="mt-1 text-xs leading-relaxed text-[var(--color-jewelry-black,#1a1814)]/60">
          {RESELLER_CATALOG_SLAB_HELP}
        </p>
        <div className="mt-4">
          <ResellerCatalogSlabSettingsPanel form={form} onChange={setForm} disabled={slabSave.saving} />
        </div>
        <SaveFeedbackButton
          type="button"
          disabled={slabSave.saving}
          saving={slabSave.saving}
          saved={slabSave.saved}
          onClick={() => void handleSave()}
          className="kc-btn-theme mt-5 min-h-[48px] w-full touch-manipulation disabled:opacity-60 sm:w-auto sm:min-w-[200px]"
        >
          Save slab settings
        </SaveFeedbackButton>
      </div>

      <div className="kc-profile-card rounded-2xl p-4 sm:p-5">
        <p className="text-sm font-semibold text-[var(--color-jewelry-black,#1a1814)]">
          Storefront product display
        </p>
        <p className="mt-1 text-xs leading-relaxed text-[var(--color-jewelry-black,#1a1814)]/60">
          For products imported with an MRP RATE (BEHIND BOX) column — e.g. emerald idols with box
          pricing only.
        </p>
        <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-xl border border-[var(--color-slate-700,#e8e4df)] bg-white px-3 py-3">
          <input
            type="checkbox"
            checked={showMrpBehindBox}
            onChange={(e) => setShowMrpBehindBox(e.target.checked)}
            disabled={slabSave.saving}
            className="mt-1 size-4 shrink-0"
          />
          <span>
            <span className="block text-sm font-semibold text-[var(--color-jewelry-black,#1a1814)]">
              Show MRP (behind box) on product cards
            </span>
            <span className="mt-0.5 block text-xs text-[var(--color-jewelry-black,#1a1814)]/55">
              Informational only for your customers on your website and shared catalogues.
            </span>
          </span>
        </label>
      </div>
    </div>
  )
}

export default function ResellerCatalogSlabSettingsPageClient() {
  return (
    <div className="min-h-screen bg-[var(--color-slate-950,#faf8f4)] pb-[var(--kc-mobile-nav-stack,5rem)] md:pb-12">
      <div className="border-b border-[var(--color-slate-700,#e8e4df)] bg-white/95 backdrop-blur-sm">
        <div className="mx-auto flex max-w-2xl items-center gap-3 px-4 py-4">
          <Link
            href={PROFILE_PATH}
            className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-[var(--color-slate-700,#e8e4df)] text-[var(--color-jewelry-black,#1a1814)] transition hover:bg-[var(--color-slate-900,#f7f4ef)]"
            aria-label="Back to profile"
          >
            <ArrowLeft className="size-5" />
          </Link>
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-jewelry-black,#1a1814)]/45">
              Reseller
            </p>
            <h1 className="truncate text-lg font-bold text-[var(--color-jewelry-black,#1a1814)]">
              Catalogue slab settings
            </h1>
          </div>
        </div>
      </div>
      <div className="mx-auto max-w-2xl px-4 py-6">
        <Suspense fallback={<Loader2 className="mx-auto size-6 animate-spin" />}>
          <CatalogSlabSettingsContent />
        </Suspense>
      </div>
    </div>
  )
}

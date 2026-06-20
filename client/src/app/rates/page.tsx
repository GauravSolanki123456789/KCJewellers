'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { subscribeLiveRates } from '@/lib/socket'
import { ratesApiQueryForStorefront, shouldSubscribeGlobalLiveRates } from '@/lib/storefront-domain'
import { KC_RATES_UPDATED_EVENT } from '@/lib/reseller-rates-events'
import { useBookRate } from '@/context/BookRateContext'
import { useAuth } from '@/hooks/useAuth'
import { useCustomerTier } from '@/context/CustomerTierContext'
import { useResellerBranding } from '@/context/ResellerBrandingContext'
import { CUSTOMER_TIER } from '@/lib/customer-tier'
import { CATALOG_PATH, RESELLER_RATES_PATH } from '@/lib/routes'
import { PencilLine, BookMarked, AlertTriangle, ArrowRight } from 'lucide-react'
import { usePullToRefresh } from '@/hooks/usePullToRefresh'
import { Button } from '@/components/ui/button'
import WhatsAppShareButton from '@/components/WhatsAppShareButton'
import { buildRatesShareMessage } from '@/lib/rates-share'
import { isResellerStorefrontGuest } from '@/lib/reseller-storefront'

type Rates = {
  gold24k_10g: number
  gold22k_10g: number
  gold18k_10g: number
  silver_1kg: number
}

const GOLD_PURITIES = [
  { key: '24K', label: '24K (999)', get1g: (r: Rates) => r.gold24k_10g / 10, get10g: (r: Rates) => r.gold24k_10g },
  { key: '22K', label: '22K (916)', get1g: (r: Rates) => r.gold22k_10g / 10, get10g: (r: Rates) => r.gold22k_10g },
  { key: '18K', label: '18K (750)', get1g: (r: Rates) => r.gold18k_10g / 10, get10g: (r: Rates) => r.gold18k_10g },
] as const

const SILVER_ROW = { key: 'Ag', label: 'Silver (999)', get1g: (r: Rates) => r.silver_1kg / 1000, get1kg: (r: Rates) => r.silver_1kg }

const PULL_THRESHOLD = 80
const PAGE_TITLE = 'Today Rates'

function formatPrice(n: number) {
  return `₹${Math.round(n).toLocaleString('en-IN')}`
}

export default function RatesPage() {
  const [rates, setRates] = useState<Rates>({ gold24k_10g: 0, gold22k_10g: 0, gold18k_10g: 0, silver_1kg: 0 })
  const [source, setSource] = useState<string>('live')
  const [loading, setLoading] = useState(true)
  const { open: openBookRate } = useBookRate()
  const auth = useAuth()
  const { customerTier } = useCustomerTier()
  const {
    businessName,
    logoUrl,
    active: resellerBrandingActive,
    customDomainHost,
  } = useResellerBranding()
  const isStorefrontGuest = isResellerStorefrontGuest(customDomainHost, auth.isAuthenticated)
  const user = auth.user as {
    reseller_rates_update_enabled?: boolean
    custom_domain?: string | null
    business_name?: string | null
  } | undefined

  const canEditResellerRates =
    auth.isAuthenticated &&
    customerTier === CUSTOMER_TIER.RESELLER &&
    !!user?.reseller_rates_update_enabled

  const isResellerStorefront = resellerBrandingActive && customDomainHost
  const displayBrand = isResellerStorefront ? businessName : 'KC Jewellers'

  const fetchRates = useCallback(async () => {
    try {
      const url = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'
      const liveRes = await fetch(`${url}/api/rates/live${ratesApiQueryForStorefront()}`)
      const data = await liveRes.json()
      if (data.success && data.rates) {
        const r = data.rates
        setRates({
          gold24k_10g: Number(r.gold24k_10g) || 0,
          gold22k_10g: Number(r.gold22k_10g) || 0,
          gold18k_10g: Number(r.gold18k_10g) || 0,
          silver_1kg: Number(r.silver_1kg) || 0,
        })
        if (data.source) setSource(String(data.source))
      }
    } catch {
      // keep previous state
    } finally {
      setLoading(false)
    }
  }, [])

  const { pullY, isRefreshing, handleTouchStart, handleTouchMove, handleTouchEnd } = usePullToRefresh(fetchRates)

  useEffect(() => {
    fetchRates()
    const onRatesUpdated = () => void fetchRates()
    window.addEventListener(KC_RATES_UPDATED_EVENT, onRatesUpdated)
    return () => window.removeEventListener(KC_RATES_UPDATED_EVENT, onRatesUpdated)
  }, [fetchRates])

  useEffect(() => {
    if (!shouldSubscribeGlobalLiveRates(source)) return
    const off = subscribeLiveRates((p) => {
      const arr = Array.isArray(p?.rates) ? p.rates : []
      const gold = arr.find((x: { metal_type?: string }) => (x?.metal_type || '').toLowerCase() === 'gold')
      const gold22 = arr.find((x: { metal_type?: string }) => (x?.metal_type || '').toLowerCase() === 'gold_22k')
      const silver = arr.find((x: { metal_type?: string }) => (x?.metal_type || '').toLowerCase() === 'silver')
      const rate24 = Number(gold?.display_rate || gold?.sell_rate || 0)
      const rate22 = Number(gold22?.display_rate || gold22?.sell_rate || 0)
      const rateSilver = Number(silver?.display_rate || silver?.sell_rate || 0)
      const updates: Partial<Rates> = {}
      if (rate24 > 0 || rate22 > 0) {
        const g24 = rate24 || (rate22 ? Math.round(rate22 / 0.916) : 0)
        const g22 = rate22 || (g24 ? Math.round(g24 * 0.916) : 0)
        const g18 = g24 ? Math.round(g24 * 0.75) : 0
        Object.assign(updates, { gold24k_10g: g24, gold22k_10g: g22, gold18k_10g: g18 })
      }
      if (rateSilver > 0) updates.silver_1kg = rateSilver
      if (Object.keys(updates).length) setRates(prev => ({ ...prev, ...updates }))
    })
    return () => off()
  }, [source])

  const shareCtx = useMemo(
    () => ({
      browserHostname: typeof window !== 'undefined' ? window.location.hostname : null,
      customerTier,
      resellerCustomDomain: user?.custom_domain ?? null,
      userBusinessName: user?.business_name ?? null,
      brandingActive: resellerBrandingActive,
      brandingBusinessName: businessName,
    }),
    [customerTier, user?.custom_domain, user?.business_name, resellerBrandingActive, businessName],
  )

  const shareMessage = useMemo(() => {
    if (loading) return ''
    return buildRatesShareMessage(shareCtx, {
      gold24_1g: rates.gold24k_10g / 10,
      gold22_1g: rates.gold22k_10g / 10,
      gold18_1g: rates.gold18k_10g / 10,
      silver1g: rates.silver_1kg / 1000,
    })
  }, [loading, shareCtx, rates])

  const canShareRates =
    canEditResellerRates &&
    !!shareMessage &&
    !!(user?.custom_domain?.trim() || isResellerStorefront)

  const isEstimated = source === 'estimated'

  return (
    <div
      className="relative min-h-screen bg-slate-950 text-slate-100"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {pullY > 0 && (
        <div
          className="absolute top-0 left-0 right-0 w-full text-center text-slate-400 transition-all z-50 py-2 text-xs"
          style={{ opacity: Math.min(pullY / PULL_THRESHOLD, 1) * 0.9 }}
        >
          <span>{pullY >= PULL_THRESHOLD ? 'Release to refresh' : 'Refresh'}</span>
        </div>
      )}
      {isRefreshing && (
        <div className="absolute top-0 left-0 right-0 w-full text-center transition-all z-50 py-3 text-sm text-amber-600 bg-slate-900/90 backdrop-blur">
          Refreshing…
        </div>
      )}
      <main className="max-w-4xl mx-auto px-3 sm:px-4 pb-24 md:pb-12">
        <section className="pt-4 sm:pt-6 md:pt-10">
          <div className="bg-white/5 backdrop-blur-md border border-white/10 rounded-2xl overflow-hidden">
            <div className="px-3 sm:px-6 py-4 sm:py-5 border-b border-white/10">
              {isResellerStorefront && (
                <div className="mb-4 flex flex-col items-center gap-2 text-center sm:mb-5">
                  {logoUrl ? (
                    <span className="relative block size-12 overflow-hidden rounded-xl border border-white/10 bg-white shadow-sm sm:size-14">
                      <Image
                        src={logoUrl}
                        alt={displayBrand}
                        fill
                        className="object-contain p-1.5"
                        sizes="56px"
                        unoptimized
                      />
                    </span>
                  ) : null}
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-600">
                    {displayBrand}
                  </p>
                </div>
              )}
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <h1 className="text-xl sm:text-2xl font-bold text-amber-600">
                    {PAGE_TITLE}
                  </h1>
                  <p className="mt-1 text-xs text-slate-500 sm:text-sm">
                    {isResellerStorefront
                      ? isStorefrontGuest
                        ? `${displayBrand} — gold & silver prices today. Browse our catalogue below.`
                        : `${displayBrand} — gold & silver prices today. Share with customers or browse the catalogue.`
                      : 'Gold & silver prices — book your rate below or from any row'}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  {isEstimated && (
                    <div className="flex items-center gap-2 px-2.5 py-1 sm:px-3 sm:py-1.5 rounded-lg bg-amber-500/20 border border-amber-500/30 text-amber-600 text-xs sm:text-sm">
                      <AlertTriangle className="size-3.5 sm:size-4 shrink-0" />
                      <span>Market closed — estimated</span>
                    </div>
                  )}
                  {canShareRates && (
                    <WhatsAppShareButton
                      message={shareMessage}
                      label="Share on WhatsApp"
                      compact
                      className="border-[var(--kc-accent,#c41e3a)]/35 bg-[var(--kc-accent,#c41e3a)]/10 text-amber-500 hover:bg-[var(--kc-accent,#c41e3a)]/20"
                    />
                  )}
                  {canEditResellerRates && (
                    <Link
                      href={RESELLER_RATES_PATH}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--kc-accent,#c41e3a)]/40 bg-[var(--kc-accent,#c41e3a)]/10 px-3 py-1.5 text-xs font-semibold text-amber-500 transition hover:bg-[var(--kc-accent,#c41e3a)]/20 sm:text-sm"
                    >
                      <PencilLine className="size-3.5" />
                      Update rates
                    </Link>
                  )}
                </div>
              </div>
            </div>

            {loading ? (
              <div className="p-12 text-center text-slate-400">Loading rates…</div>
            ) : (
              <div className="space-y-4 sm:space-y-6">
                <div className="overflow-x-auto -mx-px">
                  <table className="w-full min-w-[320px] text-sm sm:text-base">
                    <thead>
                      <tr className="border-b border-white/10">
                        <th className="text-left py-2.5 sm:py-4 pl-3 sm:pl-6 pr-2 text-slate-400 font-medium text-xs sm:text-sm">Purity</th>
                        <th className="text-right py-2.5 sm:py-4 px-2 sm:px-6 text-slate-400 font-medium text-xs sm:text-sm whitespace-nowrap">1 g</th>
                        <th className="text-right py-2.5 sm:py-4 px-2 sm:px-6 text-slate-400 font-medium text-xs sm:text-sm whitespace-nowrap">10 g</th>
                        {!isStorefrontGuest ? <th className="w-[4.25rem] sm:w-32 pr-2 sm:pr-4" /> : null}
                      </tr>
                    </thead>
                    <tbody>
                      {GOLD_PURITIES.map((p) => (
                        <tr key={p.key} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                          <td className="py-2.5 sm:py-4 pl-3 sm:pl-6 pr-2">
                            <span className="text-slate-300 font-medium text-xs sm:text-base">{p.label}</span>
                          </td>
                          <td className="py-2.5 sm:py-4 px-2 sm:px-6 text-right">
                            <span className="text-amber-600 font-semibold tabular-nums text-xs sm:text-base">
                              {formatPrice(p.get1g(rates))}
                            </span>
                          </td>
                          <td className="py-2.5 sm:py-4 px-2 sm:px-6 text-right">
                            <span className="text-slate-300 font-medium tabular-nums text-xs sm:text-base">
                              {formatPrice(p.get10g(rates))}
                            </span>
                          </td>
                          {!isStorefrontGuest ? (
                            <td className="py-2 sm:py-4 pl-1 pr-2 sm:pr-4">
                              <Button
                                size="sm"
                                onClick={openBookRate}
                                className="w-full bg-amber-600 hover:bg-amber-500 text-white font-semibold h-8 sm:h-9 px-1.5 sm:px-3 text-[10px] sm:text-sm"
                              >
                                <BookMarked className="size-3.5 sm:size-4 sm:mr-1 shrink-0" />
                                <span className="hidden sm:inline">Book</span>
                              </Button>
                            </td>
                          ) : (
                            <td className="py-2 sm:py-4 pl-1 pr-2 sm:pr-4" />
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="border-t border-white/10 pt-3 sm:pt-4">
                  <div className="px-3 sm:px-6 pb-2 text-slate-400 font-medium text-xs sm:text-sm">Silver</div>
                  <div className="overflow-x-auto rounded-lg border border-white/10 bg-white/[0.02] -mx-px">
                    <table className="w-full min-w-[320px] text-sm sm:text-base">
                      <thead>
                        <tr className="border-b border-white/10">
                          <th className="text-left py-2 sm:py-3 pl-3 sm:pl-6 pr-2 text-slate-400 font-medium text-xs sm:text-sm">Purity</th>
                          <th className="text-right py-2 sm:py-3 px-2 sm:px-6 text-slate-400 font-medium text-xs sm:text-sm whitespace-nowrap">1 g</th>
                          <th className="text-right py-2 sm:py-3 px-2 sm:px-6 text-slate-400 font-medium text-xs sm:text-sm whitespace-nowrap">1 kg</th>
                          {!isStorefrontGuest ? <th className="w-[4.25rem] sm:w-32 pr-2 sm:pr-4" /> : null}
                        </tr>
                      </thead>
                      <tbody>
                        <tr className="hover:bg-white/5 transition-colors">
                          <td className="py-2 sm:py-3 pl-3 sm:pl-6 pr-2">
                            <span className="text-slate-300 font-medium text-xs sm:text-base">{SILVER_ROW.label}</span>
                          </td>
                          <td className="py-2 sm:py-3 px-2 sm:px-6 text-right">
                            <span className="text-cyan-400 font-semibold tabular-nums text-xs sm:text-base">
                              {formatPrice(SILVER_ROW.get1g(rates))}
                            </span>
                          </td>
                          <td className="py-2 sm:py-3 px-2 sm:px-6 text-right">
                            <span className="text-slate-300 font-medium tabular-nums text-xs sm:text-base">
                              {formatPrice(SILVER_ROW.get1kg(rates))}
                            </span>
                          </td>
                          {!isStorefrontGuest ? (
                            <td className="py-2 sm:py-3 pl-1 pr-2 sm:pr-4">
                              <Button
                                size="sm"
                                onClick={openBookRate}
                                className="w-full bg-cyan-500/80 hover:bg-cyan-500 text-white font-semibold h-8 sm:h-9 px-1.5 sm:px-3 text-[10px] sm:text-sm"
                              >
                                <BookMarked className="size-3.5 sm:size-4 sm:mr-1 shrink-0" />
                                <span className="hidden sm:inline">Book</span>
                              </Button>
                            </td>
                          ) : null}
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>

              </div>
            )}

            {!loading && (
              <div className="border-t border-white/10 bg-gradient-to-b from-amber-500/10 to-transparent px-3 py-5 sm:px-6 sm:py-6 space-y-4">
                <div className="rounded-xl border border-white/10 bg-slate-900/50 p-4 sm:p-5">
                  <h2 className="text-base font-semibold text-slate-200 sm:text-lg">
                    Browse {isResellerStorefront ? displayBrand : 'our'} catalogue
                  </h2>
                  <p className="mt-1 text-xs text-slate-400 sm:text-sm">
                    View jewellery priced with today&apos;s rates — gift items, silver, gold and more.
                  </p>
                  <Link
                    href={CATALOG_PATH}
                    className="mt-4 inline-flex w-full sm:w-auto items-center justify-center gap-2 rounded-xl border border-amber-500/35 bg-amber-500/15 px-5 py-3 text-sm font-semibold text-amber-500 transition hover:bg-amber-500/25"
                  >
                    View products
                    <ArrowRight className="size-4" />
                  </Link>
                </div>

                {!isStorefrontGuest ? (
                  <div className="rounded-xl border border-amber-500/25 bg-slate-900/60 p-4 sm:p-5">
                    <h2 className="text-base font-semibold text-amber-500 sm:text-lg">
                      Book your rate
                    </h2>
                    <p className="mt-1 text-xs text-slate-400 sm:text-sm">
                      Freeze the current market rate with a small advance — same flow as tapping Book on a
                      row above.
                    </p>
                    <Button
                      type="button"
                      onClick={openBookRate}
                      className="mt-4 w-full bg-amber-500 font-semibold text-white hover:bg-amber-400 sm:w-auto sm:px-8"
                    >
                      <BookMarked className="mr-2 size-4" />
                      Open book rate form
                    </Button>
                  </div>
                ) : null}
              </div>
            )}
          </div>
        </section>
      </main>
    </div>
  )
}

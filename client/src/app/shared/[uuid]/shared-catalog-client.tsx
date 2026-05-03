'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Image from 'next/image'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { Check, Clock, MessageCircle } from 'lucide-react'
import {
  GoldJewelleryRingIcon,
  SilverMoonMetalIcon,
  DiamondJewelleryIcon,
} from '@/components/icons/metal-tab-icons'
import {
  fetchSharedCatalogByUuid,
  type SharedCatalogCreatorWholesale,
  type SharedCatalogPublicProduct,
  type SharedCatalogPublicResponse,
} from '@/lib/shared-catalog-api'
import {
  calculateBreakdown,
  getItemWeightWithGrossFallback,
  type Item,
  type WholesalePricingInput,
} from '@/lib/pricing'
import { normalizeCatalogImageSrc } from '@/lib/normalize-image-url'
import { getSiteUrl } from '@/lib/site'
import { CATALOG_PATH } from '@/lib/routes'
import { cn } from '@/lib/utils'
import { catalogProductImageClass } from '@/lib/product-image-classes'
import { productImageViewportWrapperClass } from '@/lib/flat-product-image'
import { productImageWellClass } from '@/lib/product-image-theme'
import type { PublicResellerBranding } from '@/lib/reseller-branding-server'
import {
  buildSharedCatalogSelectionWhatsAppMessage,
  getDefaultStoreWhatsAppDigits,
  normalizeIndianMobileDigits,
  openWhatsAppOrder,
  toWhatsAppWaMeDigits,
  type SharedCatalogPickLineForWhatsApp,
} from '@/lib/cart-order-whatsapp'

function toItem(p: SharedCatalogPublicProduct): Item {
  return {
    ...p,
    item_name: (p.name as string) || undefined,
    gst_rate: 3,
  }
}

function stableProductKey(p: SharedCatalogPublicProduct, index: number): string {
  const b = String(p.barcode ?? '').trim()
  if (b) return `b:${b}`
  const s = String(p.sku ?? '').trim()
  if (s) return `s:${s}`
  if (p.id != null && String(p.id).trim()) return `id:${String(p.id)}`
  return `i:${index}`
}

function wholesaleInputFromBrochure(
  cp: SharedCatalogCreatorWholesale | null | undefined,
): WholesalePricingInput | null {
  if (!cp) return null
  const w: WholesalePricingInput = {
    wholesale_making_charge_discount_percent:
      Number(cp.wholesale_making_charge_discount_percent) || 0,
    wholesale_markup_percent: Number(cp.wholesale_markup_percent) || 0,
  }
  if (
    Math.abs(w.wholesale_making_charge_discount_percent) <= 1e-9 &&
    Math.abs(w.wholesale_markup_percent) <= 1e-9
  ) {
    return null
  }
  return w
}

function markedUpTotal(
  item: Item,
  rates: unknown,
  markupPct: number,
  wholesale: WholesalePricingInput | null,
) {
  const b = calculateBreakdown(
    item,
    rates,
    (item as { gst_rate?: number }).gst_rate ?? 3,
    wholesale ?? undefined,
  )
  return b.total * (1 + Math.max(0, markupPct) / 100)
}

function metalIcon(metal: string) {
  const m = (metal || '').toLowerCase()
  if (m.includes('diamond')) return DiamondJewelleryIcon
  if (m.includes('silver')) return SilverMoonMetalIcon
  return GoldJewelleryRingIcon
}

function isLoadedBrochure(
  p: SharedCatalogPublicResponse | null,
): p is Extract<SharedCatalogPublicResponse, { expired: false }> {
  return (
    p != null &&
    typeof p === 'object' &&
    'expired' in p &&
    p.expired === false &&
    'rates' in p
  )
}

export default function SharedCatalogClient({
  initialBranding,
}: {
  initialBranding: PublicResellerBranding | null
}) {
  const params = useParams()
  const uuid = typeof params?.uuid === 'string' ? params.uuid : ''
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [payload, setPayload] = useState<SharedCatalogPublicResponse | null>(null)
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(() => new Set())

  useEffect(() => {
    setSelectedKeys(new Set())
  }, [uuid])

  useEffect(() => {
    if (!uuid) {
      setLoading(false)
      setError('Invalid link')
      return
    }
    let cancelled = false
    ;(async () => {
      setLoading(true)
      setError(null)
      try {
        const data = await fetchSharedCatalogByUuid(uuid)
        if (cancelled) return
        setPayload(data)
      } catch (e: unknown) {
        if (cancelled) return
        let msg: string | null = null
        if (e && typeof e === 'object' && 'response' in e) {
          const err = (e as { response?: { data?: { error?: unknown } } }).response?.data?.error
          msg = typeof err === 'string' ? err : null
        }
        setError(msg || 'Could not load this catalogue.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [uuid])

  const site = getSiteUrl()
  const brandLabel = initialBranding?.businessName?.trim() || 'KC Jewellers'
  const brandLogo = initialBranding?.logoUrl?.trim() || null

  const rows = useMemo(() => {
    if (!isLoadedBrochure(payload)) return []
    const rawMk = payload.markupPercentage
    const markup =
      typeof rawMk === 'number' && Number.isFinite(rawMk)
        ? rawMk
        : Number.parseFloat(String(rawMk ?? '').replace(/,/g, '').trim()) || 0
    const rates = payload.rates ?? []
    const products = payload.products ?? []
    const cw = payload.creatorWholesalePricing
    const wholesale = wholesaleInputFromBrochure(cw ?? null)
    return products.map((p) => {
      const item = toItem(p)
      const total = markedUpTotal(item, rates, markup, wholesale)
      return { item, product: p, total, markup }
    })
  }, [payload])

  const rowKeys = useMemo(() => rows.map((r, i) => stableProductKey(r.product, i)), [rows])

  const toggleKey = useCallback((key: string) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }, [])

  const selectAll = useCallback(() => {
    setSelectedKeys(new Set(rowKeys))
  }, [rowKeys])

  const clearSelection = useCallback(() => {
    setSelectedKeys(new Set())
  }, [])

  const handleSharePicks = useCallback(() => {
    if (!isLoadedBrochure(payload)) return
    if (selectedKeys.size === 0) return

    const fromApi = normalizeIndianMobileDigits(payload.selectionWhatsAppDigits ?? undefined)
    const fromBranding = normalizeIndianMobileDigits(initialBranding?.contactPhoneDigits ?? undefined)
    const digits10 = fromApi ?? fromBranding ?? getDefaultStoreWhatsAppDigits()
    const wa = digits10 ? toWhatsAppWaMeDigits(digits10) : ''

    if (!wa) {
      const tier = String(payload.creatorCustomerTier || '').toUpperCase()
      if (tier === 'RESELLER') {
        alert(
          'This catalogue was shared by a partner who has not added a WhatsApp number yet. Ask them to save their mobile in Admin → B2B Clients, or contact them directly.',
        )
      } else {
        alert(
          'Configure NEXT_PUBLIC_WHATSAPP_BUSINESS_NUMBER so customers can reach KC Jewellers on WhatsApp.',
        )
      }
      return
    }

    const lines: SharedCatalogPickLineForWhatsApp[] = []
    rows.forEach((row, i) => {
      const key = rowKeys[i]
      if (!selectedKeys.has(key)) return
      const name =
        (row.product.name as string) ||
        row.item.item_name ||
        String(row.product.barcode || row.product.sku || '')
      const code = String(row.product.barcode || row.product.sku || '')
      const wt = getItemWeightWithGrossFallback(toItem(row.product))
      const weightLabel =
        wt != null && !Number.isNaN(Number(wt)) ? `Weight ${Number(wt).toFixed(2)} gm` : null
      lines.push({
        name,
        skuOrBarcode: code || key,
        priceInr: row.total,
        weightLabel,
      })
    })

    const msg = buildSharedCatalogSelectionWhatsAppMessage({
      brandLabel,
      lines,
      catalogueUrl: typeof window !== 'undefined' ? window.location.href : undefined,
    })
    openWhatsAppOrder(wa, msg)
  }, [payload, selectedKeys, rows, rowKeys, brandLabel, initialBranding?.contactPhoneDigits])

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center px-6">
        <div className="h-12 w-12 rounded-full border-2 border-amber-500/30 border-t-amber-500 animate-spin" />
        <p className="mt-6 text-sm text-slate-400">Opening catalogue…</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center px-6 text-center">
        <p className="text-lg font-medium text-slate-200">{error}</p>
        <Link
          href={CATALOG_PATH}
          className="mt-6 rounded-xl bg-amber-500 px-5 py-2.5 text-sm font-semibold text-slate-950"
        >
          Browse full catalogue
        </Link>
      </div>
    )
  }

  if (payload && 'expired' in payload && payload.expired) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 text-slate-100 flex flex-col items-center justify-center px-6 text-center">
        <div className="max-w-md rounded-2xl border border-slate-800 bg-slate-900/70 p-8 shadow-2xl backdrop-blur-sm">
          <Clock className="mx-auto size-12 text-amber-600" aria-hidden />
          <h1 className="mt-4 text-xl font-semibold text-slate-100">This catalogue link has expired</h1>
          <p className="mt-2 text-sm text-slate-400 leading-relaxed">
            Ask {brandLabel} for a fresh link, or explore the live catalogue on our website.
          </p>
          <Link
            href={CATALOG_PATH}
            className="mt-8 inline-flex rounded-xl bg-amber-500 px-5 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-amber-400"
          >
            View catalogue
          </Link>
          <p className="mt-6 text-xs text-slate-500">{site}</p>
        </div>
      </div>
    )
  }

  if (!isLoadedBrochure(payload)) {
    return null
  }

  const expiresAt = payload.expiresAt
  const expDate = expiresAt ? new Date(expiresAt) : null
  const selectedCount = selectedKeys.size
  const showPickerChrome = rows.length > 0

  return (
    <div
      className={cn(
        'min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 text-slate-100 pt-10 md:pt-14',
        showPickerChrome ? 'pb-32 sm:pb-28' : 'pb-16',
      )}
    >
      <header className="mx-auto max-w-6xl px-4 text-center md:px-8">
        <div className="flex flex-col items-center gap-2">
          {brandLogo ? (
            <span className="relative block size-14 overflow-hidden rounded-xl bg-white/5 md:size-16">
              <Image
                src={brandLogo}
                alt={brandLabel}
                fill
                className="object-contain p-1"
                sizes="64px"
                unoptimized
              />
            </span>
          ) : null}
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-amber-600">{brandLabel}</p>
        </div>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-50 md:text-3xl">
          Shared catalogue
        </h1>
        {showPickerChrome ? (
          <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-slate-400">
            Tap items to shortlist what you like, then send your picks to {brandLabel} on WhatsApp in one tap.
          </p>
        ) : null}
        {expDate && !Number.isNaN(expDate.getTime()) && (
          <p className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-slate-700/80 bg-slate-900/50 px-3 py-1 text-xs text-slate-500">
            <Clock className="size-3.5 shrink-0" aria-hidden />
            Valid until {expDate.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}
          </p>
        )}
        {showPickerChrome ? (
          <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
            <button
              type="button"
              onClick={selectAll}
              className="rounded-full border border-slate-600/80 bg-slate-900/60 px-4 py-1.5 text-xs font-medium text-slate-200 transition hover:border-amber-500/40 hover:bg-slate-800/80"
            >
              Select all
            </button>
            <button
              type="button"
              disabled={selectedCount === 0}
              onClick={clearSelection}
              className={cn(
                'rounded-full border px-4 py-1.5 text-xs font-medium transition',
                selectedCount === 0
                  ? 'cursor-not-allowed border-slate-800 text-slate-600'
                  : 'border-slate-600/80 bg-slate-900/60 text-slate-200 hover:border-slate-500',
              )}
            >
              Clear
            </button>
          </div>
        ) : null}
      </header>

      <main className="mx-auto mt-10 max-w-6xl px-4 md:px-8">
        {rows.length === 0 ? (
          <p className="text-center text-slate-500">No products in this share.</p>
        ) : (
          <ul className="grid grid-cols-2 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 md:gap-6">
            {rows.map(({ item, product, total }, i) => {
              const key = rowKeys[i]
              const selected = selectedKeys.has(key)
              const name =
                (product.name as string) ||
                item.item_name ||
                String(product.barcode || product.sku || '')
              const img = normalizeCatalogImageSrc(product.image_url)
              const MetalIc = metalIcon(String(product.metal_type || ''))
              const code = String(product.barcode || product.sku || '')
              const wt = getItemWeightWithGrossFallback(toItem(product))
              const wtLabel =
                wt != null && !Number.isNaN(Number(wt)) ? `${Number(wt).toFixed(2)} gm` : null
              return (
                <li key={key}>
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => toggleKey(key)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        toggleKey(key)
                      }
                    }}
                    className={cn(
                      'flex cursor-pointer flex-col overflow-hidden rounded-2xl border bg-slate-900/90 shadow-lg shadow-black/10 outline-none transition',
                      selected
                        ? 'border-amber-500/70 ring-2 ring-amber-400/30'
                        : 'border-slate-800 hover:border-slate-700',
                    )}
                  >
                    <div
                      className={cn(
                        'relative isolate aspect-[4/5] overflow-hidden',
                        productImageWellClass,
                      )}
                    >
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          toggleKey(key)
                        }}
                        aria-pressed={selected}
                        aria-label={selected ? 'Remove from shortlist' : 'Add to shortlist'}
                        className={cn(
                          'absolute left-2 top-2 z-10 flex size-11 shrink-0 items-center justify-center rounded-full border-2 shadow-lg transition md:size-10',
                          selected
                            ? 'border-emerald-300 bg-emerald-600 text-white'
                            : 'border-slate-500/70 bg-white/92 text-slate-700 backdrop-blur-sm hover:bg-white',
                        )}
                      >
                        {selected ? <Check className="size-5 shrink-0 stroke-[2.5]" aria-hidden /> : null}
                      </button>
                      {img ? (
                        <div className={productImageViewportWrapperClass()}>
                          <Image
                            src={img}
                            alt={name}
                            fill
                            sizes="(max-width: 640px) 50vw, 25vw"
                            className={cn(catalogProductImageClass(null), 'object-cover')}
                            unoptimized
                          />
                        </div>
                      ) : (
                        <div className="flex h-full items-center justify-center bg-slate-800/50">
                          <MetalIc className="size-14 text-slate-500" aria-hidden />
                        </div>
                      )}
                    </div>
                    <div className="flex flex-1 flex-col gap-1 p-3">
                      {product.style_name && (
                        <span className="text-[10px] font-medium uppercase tracking-wider text-slate-500">
                          {String(product.style_name)}
                        </span>
                      )}
                      <span className="line-clamp-2 text-sm font-semibold leading-snug text-slate-100">
                        {name}
                      </span>
                      <span className="font-mono text-xs text-slate-500">{code}</span>
                      {wtLabel ? (
                        <span className="text-xs text-slate-400">Weight · {wtLabel}</span>
                      ) : null}
                      <div className="mt-auto pt-2">
                        <div className="text-lg font-semibold tabular-nums text-amber-400">
                          ₹{Math.round(total).toLocaleString('en-IN')}
                          <span className="text-[11px] font-normal text-slate-500"> incl. GST</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </main>

      {showPickerChrome ? (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-800 bg-slate-900/98 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom,0px))] shadow-[0_-12px_40px_rgba(15,23,42,0.08)] backdrop-blur-md">
          <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 sm:flex-row sm:items-center sm:justify-between md:px-8">
            <p className="text-center text-sm text-slate-400 sm:text-left">
              {selectedCount === 0 ? (
                <>Tap checkmarks or cards to shortlist — then share your picks.</>
              ) : (
                <span className="font-medium text-slate-100">
                  {selectedCount} {selectedCount === 1 ? 'piece' : 'pieces'} picked
                </span>
              )}
            </p>
            <button
              type="button"
              disabled={selectedCount === 0}
              onClick={handleSharePicks}
              className={cn(
                'inline-flex min-h-[48px] items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-semibold transition sm:min-h-0 sm:shrink-0',
                selectedCount === 0
                  ? 'cursor-not-allowed bg-slate-800 text-slate-500'
                  : 'bg-emerald-600 text-white hover:bg-emerald-500 active:scale-[0.99]',
              )}
            >
              <MessageCircle className="size-5 shrink-0" aria-hidden />
              Share picks on WhatsApp
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}

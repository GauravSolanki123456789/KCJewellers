'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Image from 'next/image'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { pdf } from '@react-pdf/renderer'
import { Check, Clock, FileText, Gem, Loader2, MessageCircle, Minus, Plus, Sparkles } from 'lucide-react'
import {
  fetchSharedCatalogByUuid,
  sharedCatalogGiftingGstEnabled,
  type SharedCatalogPublicProduct,
  type SharedCatalogPublicResponse,
} from '@/lib/shared-catalog-api'
import {
  buildSharedCatalogPricingRows,
  groupSharedCatalogPricingRows,
  parseMarkupPercentage,
  parseDiscountPercentage,
  sharedCatalogProductToItem,
  wholesaleInputFromBrochure,
  type SharedCatalogGroupedRow,
  type SharedCatalogPricingRow,
} from '@/lib/shared-catalog-pricing'
import {
  getCustomerDisplayWeightWithGrossFallback,
  productPriceShowsInclGst,
  type CatalogPricingOptions,
} from '@/lib/pricing'
import { normalizeCatalogImageSrc } from '@/lib/normalize-image-url'
import { getSiteUrl } from '@/lib/site'
import { CATALOG_PATH } from '@/lib/routes'
import { cn } from '@/lib/utils'
import { CatalogPdfDocument } from '@/lib/catalog-pdf-document'
import {
  buildSharedCatalogSubcategoryTabs,
  filterSharedCatalogGroupsBySubcategory,
  SHARED_CATALOG_ALL_TAB,
} from '@/lib/shared-catalog-categories'
import { normalizeKcThemeId } from '@/lib/kc-theme-ids'
import DualJewelleryProductImage from '@/components/catalog/DualJewelleryProductImage'
import GiftingSizeVariantPicker from '@/components/catalog/GiftingSizeVariantPicker'
import { productImageWellClass } from '@/lib/product-image-theme'
import type { PublicResellerBranding } from '@/lib/reseller-branding-server'
import {
  buildSharedCatalogSelectionWhatsAppMessage,
  buildWhatsAppOrderUrl,
  getDefaultStoreWhatsAppDigits,
  normalizeIndianMobileDigits,
  openWhatsAppOrder,
  toWhatsAppWaMeDigits,
  type SharedCatalogPickLineForWhatsApp,
} from '@/lib/cart-order-whatsapp'
import { resolveItemsForPdf } from '@/lib/pdf-embed-images'
import {
  sharePdfBlob,
  shouldPresentPdfShareSheet,
  type PdfShareSheetPayload,
} from '@/lib/pdf-share'
import PdfShareSheet from '@/components/shared-catalog/PdfShareSheet'
import SharedCatalogImageLightbox, {
  SharedCatalogZoomHint,
  type SharedCatalogLightboxSlide,
} from '@/components/shared-catalog/SharedCatalogImageLightbox'

const MAX_PIECE_QTY = 99

function stableProductKey(p: SharedCatalogPublicProduct, index: number): string {
  const b = String(p.barcode ?? '').trim()
  if (b) return `b:${b}`
  const s = String(p.sku ?? '').trim()
  if (s) return `s:${s}`
  if (p.id != null && String(p.id).trim()) return `id:${String(p.id)}`
  return `i:${index}`
}

function metalIcon(metal: string) {
  const m = (metal || '').toLowerCase()
  if (m.includes('diamond')) return Gem
  if (m.includes('gold')) return Sparkles
  return Sparkles
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

function totalSelectedPieces(selections: Map<string, number>): number {
  let n = 0
  for (const q of selections.values()) n += q
  return n
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
  /** key → quantity (only keys present are shortlisted) */
  const [selections, setSelections] = useState<Map<string, number>>(() => new Map())
  const [pdfBusy, setPdfBusy] = useState(false)
  const [pdfShareOpen, setPdfShareOpen] = useState(false)
  const [pdfSharePayload, setPdfSharePayload] = useState<PdfShareSheetPayload | null>(null)
  const [lightboxOpen, setLightboxOpen] = useState(false)
  const [lightboxIndex, setLightboxIndex] = useState(0)
  const [activeSubcategory, setActiveSubcategory] = useState<string>(SHARED_CATALOG_ALL_TAB)

  useEffect(() => {
    setSelections(new Map())
    setActiveSubcategory(SHARED_CATALOG_ALL_TAB)
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

  const giftingGstEnabled = sharedCatalogGiftingGstEnabled(payload)

  const sharedPricingOptions = useMemo(
    (): CatalogPricingOptions => ({ giftingGstEnabled }),
    [giftingGstEnabled],
  )

  const rows = useMemo(() => {
    if (!isLoadedBrochure(payload)) return []
    return buildSharedCatalogPricingRows(
      payload.products ?? [],
      payload.rates ?? [],
      parseMarkupPercentage(payload.markupPercentage),
      payload.creatorWholesalePricing ?? null,
      giftingGstEnabled,
      parseDiscountPercentage(payload.discountPercentage),
    )
  }, [payload, giftingGstEnabled])

  const groupedRows = useMemo(() => groupSharedCatalogPricingRows(rows), [rows])

  const subcategoryTabs = useMemo(
    () => buildSharedCatalogSubcategoryTabs(rows),
    [rows],
  )

  const showSubcategoryTabs = subcategoryTabs.length > 1

  const visibleGroupedRows = useMemo(
    () =>
      showSubcategoryTabs
        ? filterSharedCatalogGroupsBySubcategory(groupedRows, activeSubcategory)
        : groupedRows,
    [groupedRows, activeSubcategory, showSubcategoryTabs],
  )

  const rowKeys = useMemo(() => rows.map((r, i) => stableProductKey(r.product, i)), [rows])

  const rowKeyByRow = useMemo(() => {
    const m = new Map<SharedCatalogPricingRow, string>()
    rows.forEach((row, i) => m.set(row, rowKeys[i]))
    return m
  }, [rows, rowKeys])

  const [activeVariantByGroup, setActiveVariantByGroup] = useState<Map<string, string>>(
    () => new Map(),
  )

  useEffect(() => {
    setActiveVariantByGroup((prev) => {
      const next = new Map<string, string>()
      for (const g of groupedRows) {
        const keys = g.variants.map((v) => rowKeyByRow.get(v) ?? '').filter(Boolean)
        const kept = prev.get(g.groupKey)
        next.set(g.groupKey, kept && keys.includes(kept) ? kept : keys[0] ?? g.groupKey)
      }
      return next
    })
  }, [groupedRows, rowKeyByRow])

  const resolveActiveVariant = useCallback(
    (group: SharedCatalogGroupedRow): SharedCatalogPricingRow => {
      const activeKey = activeVariantByGroup.get(group.groupKey)
      return (
        group.variants.find((v) => rowKeyByRow.get(v) === activeKey) ?? group.variants[0]
      )
    },
    [activeVariantByGroup, rowKeyByRow],
  )

  const lightboxSlides = useMemo((): SharedCatalogLightboxSlide[] => {
    return rows
      .map((row) => {
        const primary = normalizeCatalogImageSrc(row.product.image_url)
        if (!primary) return null
        const name =
          (row.product.name as string) ||
          row.item.item_name ||
          String(row.product.barcode || row.product.sku || '')
        const code = String(row.product.barcode || row.product.sku || '')
        return {
          primarySrc: primary,
          secondarySrc: row.product.secondary_image_url,
          title: name,
          subtitle: code || null,
        }
      })
      .filter(Boolean) as SharedCatalogLightboxSlide[]
  }, [rows])

  const openLightboxForKey = useCallback(
    (key: string) => {
      const rowIdx = rowKeys.indexOf(key)
      if (rowIdx < 0) return
      const productIdx = rows
        .slice(0, rowIdx + 1)
        .filter((r) => normalizeCatalogImageSrc(r.product.image_url)).length - 1
      if (productIdx < 0) return
      setLightboxIndex(productIdx)
      setLightboxOpen(true)
    },
    [rowKeys, rows],
  )

  const toggleKey = useCallback((key: string) => {
    setSelections((prev) => {
      const next = new Map(prev)
      if (next.has(key)) next.delete(key)
      else next.set(key, 1)
      return next
    })
  }, [])

  const setQty = useCallback((key: string, qty: number) => {
    const q = Math.max(1, Math.min(MAX_PIECE_QTY, Math.floor(qty)))
    setSelections((prev) => {
      if (!prev.has(key)) return prev
      const next = new Map(prev)
      next.set(key, q)
      return next
    })
  }, [])

  const selectAll = useCallback(() => {
    setSelections((prev) => {
      const next = new Map(prev)
      for (const group of visibleGroupedRows) {
        const active = resolveActiveVariant(group)
        const key = rowKeyByRow.get(active)
        if (key) next.set(key, next.get(key) ?? 1)
      }
      return next
    })
  }, [visibleGroupedRows, resolveActiveVariant, rowKeyByRow])

  const clearSelection = useCallback(() => {
    setSelections(new Map())
  }, [])

  const selectedCount = selections.size
  const totalPieces = totalSelectedPieces(selections)

  const handleSharePicksPdf = useCallback(async () => {
    if (!isLoadedBrochure(payload)) return
    if (selectedCount === 0) return

    const fromApi = normalizeIndianMobileDigits(payload.selectionWhatsAppDigits ?? undefined)
    const fromBranding = normalizeIndianMobileDigits(initialBranding?.contactPhoneDigits ?? undefined)
    const digits10 = fromApi ?? fromBranding ?? getDefaultStoreWhatsAppDigits()
    const wa = digits10 ? toWhatsAppWaMeDigits(digits10) : ''

    const pickedItems: Array<ReturnType<typeof sharedCatalogProductToItem> & { shareCatalogQty?: number }> =
      []
    rows.forEach((row, i) => {
      const key = rowKeys[i]
      const qty = selections.get(key)
      if (!qty) return
      pickedItems.push({
        ...sharedCatalogProductToItem(row.product),
        shareCatalogQty: qty,
      })
    })
    if (pickedItems.length === 0) return

    const markup = parseMarkupPercentage(payload.markupPercentage)
    const discount = parseDiscountPercentage(payload.discountPercentage)
    const wholesale = wholesaleInputFromBrochure(payload.creatorWholesalePricing ?? null)
    const hidePricesPdf = !!payload.hidePrices
    const catalogueUrl = typeof window !== 'undefined' ? window.location.href : ''
    const kcThemeId = normalizeKcThemeId(
      payload.kc_theme_id ?? initialBranding?.kcThemeId ?? null,
    )

    setPdfBusy(true)
    try {
      const itemsForPdf = await resolveItemsForPdf(pickedItems)
      const blob = await pdf(
        <CatalogPdfDocument
          products={itemsForPdf}
          brandName={brandLabel}
          kcThemeId={kcThemeId}
          itemsLabel={hidePricesPdf ? 'Weight catalogue shortlist' : 'Shared catalogue shortlist'}
          hidePrices={hidePricesPdf}
          resellerPdfPricing={
            hidePricesPdf
              ? null
              : {
                  rates: payload.rates,
                  markupPercentage: markup,
                  discountPercentage: discount,
                  wholesale,
                  giftingGstEnabled,
                }
          }
        />,
      ).toBlob()

      const slug =
        brandLabel
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-+|-+$/g, '')
          .slice(0, 40) || 'catalogue'
      const filename = `${slug}-shortlist-${new Date().toISOString().slice(0, 10)}.pdf`

      const fallbackText = `Hi ${brandLabel},\nI'm sharing my shortlist from your shared catalogue as PDF (${filename}). Please see the attachment.\n\nCatalogue link:\n${catalogueUrl}`
      const fallbackHref = wa ? buildWhatsAppOrderUrl(wa, fallbackText) : null

      const sheetPayload: PdfShareSheetPayload = {
        blob,
        filename,
        title: `${brandLabel} — shortlist PDF`,
        text: fallbackText,
        fallbackWhatsAppText: fallbackText,
        fallbackWhatsAppHref: fallbackHref,
        brandLabel,
      }

      if (shouldPresentPdfShareSheet()) {
        setPdfSharePayload(sheetPayload)
        setPdfShareOpen(true)
      } else {
        await sharePdfBlob(blob, filename, {
          title: sheetPayload.title,
          text: sheetPayload.text,
          fallbackWhatsAppText: sheetPayload.fallbackWhatsAppText,
          fallbackWhatsAppHref: sheetPayload.fallbackWhatsAppHref,
        })
      }
    } catch (e) {
      console.error(e)
      alert('Could not create the PDF. Check your connection and try again.')
    } finally {
      setPdfBusy(false)
    }
  }, [
    payload,
    selections,
    selectedCount,
    rows,
    rowKeys,
    brandLabel,
    initialBranding?.contactPhoneDigits,
    initialBranding?.kcThemeId,
  ])

  const handleSharePicks = useCallback(() => {
    if (!isLoadedBrochure(payload)) return
    if (selectedCount === 0) return

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
      const qty = selections.get(key)
      if (!qty) return
      const name =
        (row.product.name as string) ||
        row.item.item_name ||
        String(row.product.barcode || row.product.sku || '')
      const code = String(row.product.barcode || row.product.sku || '')
      const wt = getCustomerDisplayWeightWithGrossFallback(sharedCatalogProductToItem(row.product))
      const weightLabel =
        wt != null && !Number.isNaN(Number(wt)) ? `Weight ${Number(wt).toFixed(2)} gm` : null
      lines.push({
        name,
        skuOrBarcode: code || key,
        priceInr: row.unitTotalInr,
        qty,
        weightLabel,
        showInclGst: productPriceShowsInclGst(row.item, sharedPricingOptions),
      })
    })

    const msg = buildSharedCatalogSelectionWhatsAppMessage({
      brandLabel,
      lines,
      catalogueUrl: typeof window !== 'undefined' ? window.location.href : undefined,
      hidePrices: !!payload.hidePrices,
    })
    openWhatsAppOrder(wa, msg)
  }, [
    payload,
    selections,
    selectedCount,
    rows,
    rowKeys,
    brandLabel,
    initialBranding?.contactPhoneDigits,
    sharedPricingOptions,
  ])

  if (loading) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-slate-950 px-6 text-slate-100">
        <div className="h-12 w-12 animate-spin rounded-full border-2 border-amber-500/30 border-t-amber-500" />
        <p className="mt-6 text-sm text-slate-400">Opening catalogue…</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-slate-950 px-6 text-center text-slate-100">
        <p className="text-lg font-medium text-slate-200">{error}</p>
        <Link
          href={CATALOG_PATH}
          className="mt-6 rounded-xl bg-amber-500 px-5 py-2.5 text-sm font-semibold text-white"
        >
          Browse full catalogue
        </Link>
      </div>
    )
  }

  if (payload && 'expired' in payload && payload.expired) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 px-6 text-center text-slate-100">
        <div className="max-w-md rounded-2xl border border-slate-800 bg-slate-900/70 p-8 shadow-2xl backdrop-blur-sm">
          <Clock className="mx-auto size-12 text-amber-600" aria-hidden />
          <h1 className="mt-4 text-xl font-semibold text-slate-100">This catalogue link has expired</h1>
          <p className="mt-2 text-sm leading-relaxed text-slate-400">
            Ask {brandLabel} for a fresh link, or explore the live catalogue on our website.
          </p>
          <Link
            href={CATALOG_PATH}
            className="mt-8 inline-flex rounded-xl bg-amber-500 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-amber-400"
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
  const hidePrices = !!payload.hidePrices
  const showPickerChrome = groupedRows.length > 0

  return (
    <div
      className={cn(
        'min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 text-slate-100',
        showPickerChrome ? 'pb-[calc(4.75rem+env(safe-area-inset-bottom,0px))] sm:pb-20' : 'pb-16',
      )}
    >
      <header className="mx-auto max-w-6xl px-4 pt-8 text-center sm:px-6 md:pt-12">
        <div className="flex flex-col items-center gap-2">
          {brandLogo ? (
            <span className="relative block size-14 overflow-hidden rounded-xl border border-slate-700/60 bg-white shadow-sm md:size-16">
              <Image
                src={brandLogo}
                alt={brandLabel}
                fill
                className="object-contain p-1.5"
                sizes="64px"
                unoptimized
              />
            </span>
          ) : null}
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-amber-600">
            {brandLabel}
          </p>
        </div>
        <h1 className="mt-2 font-serif text-2xl font-semibold tracking-tight text-slate-100 sm:text-3xl">
          Shared catalogue
        </h1>
        {showPickerChrome ? (
          <p className="mx-auto mt-3 max-w-lg text-sm leading-relaxed text-slate-500">
            Tap to shortlist · adjust quantities · zoom photos · then share on WhatsApp or PDF.
          </p>
        ) : null}
        {expDate && !Number.isNaN(expDate.getTime()) && (
          <p className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-slate-700/80 bg-slate-900/40 px-3 py-1 text-xs text-slate-500">
            <Clock className="size-3.5 shrink-0" aria-hidden />
            Valid until {expDate.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}
          </p>
        )}
        {showPickerChrome ? (
          <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
            <button
              type="button"
              onClick={selectAll}
              className="min-h-[40px] rounded-full border border-slate-600/80 bg-slate-900/50 px-4 py-2 text-xs font-semibold text-slate-200 transition hover:border-amber-500/45 hover:bg-slate-800/80"
            >
              Select all
            </button>
            <button
              type="button"
              disabled={selectedCount === 0}
              onClick={clearSelection}
              className={cn(
                'min-h-[40px] rounded-full border px-4 py-2 text-xs font-semibold transition',
                selectedCount === 0
                  ? 'cursor-not-allowed border-slate-800 text-slate-600'
                  : 'border-slate-600/80 bg-slate-900/50 text-slate-200 hover:border-slate-500',
              )}
            >
              Clear
            </button>
          </div>
        ) : null}
      </header>

      {showSubcategoryTabs ? (
        <nav
          aria-label="Catalogue categories"
          className="mx-auto mt-6 max-w-6xl px-4 sm:px-6"
        >
          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide snap-x snap-mandatory">
            <button
              type="button"
              onClick={() => setActiveSubcategory(SHARED_CATALOG_ALL_TAB)}
              className={cn(
                'kc-size-chip shrink-0 snap-start touch-manipulation rounded-full border px-4 py-2.5 text-xs font-semibold transition sm:text-sm',
                activeSubcategory === SHARED_CATALOG_ALL_TAB
                  ? 'kc-size-chip-active'
                  : 'kc-size-chip-idle',
              )}
            >
              All
              <span className="ml-1.5 tabular-nums opacity-75">{rows.length}</span>
            </button>
            {subcategoryTabs.map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveSubcategory(tab.key)}
                className={cn(
                  'kc-size-chip shrink-0 snap-start touch-manipulation rounded-full border px-4 py-2.5 text-xs font-semibold transition sm:text-sm',
                  activeSubcategory === tab.key ? 'kc-size-chip-active' : 'kc-size-chip-idle',
                )}
              >
                {tab.label}
                <span className="ml-1.5 tabular-nums opacity-75">{tab.count}</span>
              </button>
            ))}
          </div>
        </nav>
      ) : null}

      <main className="mx-auto mt-8 max-w-6xl px-4 sm:mt-10 sm:px-6">
        {visibleGroupedRows.length === 0 ? (
          <p className="text-center text-slate-500">
            {groupedRows.length === 0 ? 'No products in this share.' : 'No items in this category.'}
          </p>
        ) : (
          <ul className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-4 lg:gap-5">
            {visibleGroupedRows.map((group) => {
              const activeRow = resolveActiveVariant(group)
              const key = rowKeyByRow.get(activeRow) ?? group.groupKey
              const qty = selections.get(key) ?? 0
              const selected = qty > 0
              const hasVariants = group.variants.length > 1
              const { item, product, unitTotalInr } = activeRow
              const name = group.displayTitle
              const img = normalizeCatalogImageSrc(
                product.image_url || group.variants[0]?.product.image_url,
              )
              const MetalIc = metalIcon(String(product.metal_type || ''))
              const code = String(product.barcode || product.sku || '')
              const wt = getCustomerDisplayWeightWithGrossFallback(sharedCatalogProductToItem(product))
              const wtLabel =
                wt != null && !Number.isNaN(Number(wt)) ? `${Number(wt).toFixed(2)} gm` : null
              return (
                <li key={group.groupKey}>
                  <article
                    className={cn(
                      'flex h-full flex-col overflow-hidden rounded-2xl border bg-slate-900/80 shadow-md transition',
                      selected
                        ? 'border-amber-500/70 ring-2 ring-amber-500/25'
                        : 'border-slate-700/80 hover:border-slate-600',
                    )}
                  >
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
                        'group relative isolate aspect-[4/5] cursor-pointer overflow-hidden outline-none',
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
                          'absolute left-2 top-2 z-40 flex size-10 shrink-0 items-center justify-center rounded-full border-2 shadow-lg transition',
                          selected
                            ? 'border-emerald-300 bg-emerald-600 text-white'
                            : 'border-slate-400/80 bg-white text-slate-800 hover:bg-slate-50',
                        )}
                      >
                        {selected ? <Check className="size-4 shrink-0 stroke-[2.5]" aria-hidden /> : null}
                      </button>
                      {img ? (
                        <>
                          <DualJewelleryProductImage
                            primarySrc={img}
                            secondary_image_url={
                              product.secondary_image_url ||
                              group.variants[0]?.product.secondary_image_url
                            }
                            alt={name}
                            sizes="(max-width: 640px) 50vw, 25vw"
                            imageClassName="object-cover"
                            unoptimized
                          />
                          <SharedCatalogZoomHint onZoom={() => openLightboxForKey(key)} />
                        </>
                      ) : (
                        <div className="flex h-full items-center justify-center bg-slate-800/50">
                          <MetalIc className="size-14 text-slate-500" aria-hidden />
                        </div>
                      )}
                    </div>

                    <div className="flex flex-1 flex-col gap-1 p-2.5 sm:p-3">
                      {product.style_name ? (
                        <span className="text-[10px] font-medium uppercase tracking-wider text-slate-500">
                          {String(product.style_name)}
                        </span>
                      ) : null}
                      <h2 className="line-clamp-2 text-sm font-semibold leading-snug text-slate-100">
                        {name}
                      </h2>
                      {!hasVariants && code ? (
                        <p className="truncate font-mono text-[11px] text-slate-500">{code}</p>
                      ) : null}
                      {hasVariants ? (
                        <div
                          onClick={(e) => e.stopPropagation()}
                          onKeyDown={(e) => e.stopPropagation()}
                        >
                          <GiftingSizeVariantPicker
                            variants={group.variants.map((v) => v.item)}
                            selected={item}
                            onSelect={(v) => {
                              const match = group.variants.find(
                                (row) =>
                                  String(row.item.barcode ?? '') === String(v.barcode ?? '') ||
                                  String(row.item.sku ?? '') === String(v.sku ?? ''),
                              )
                              const variantKey = match ? rowKeyByRow.get(match) : undefined
                              if (variantKey) {
                                setActiveVariantByGroup((prev) => {
                                  const next = new Map(prev)
                                  next.set(group.groupKey, variantKey)
                                  return next
                                })
                              }
                            }}
                            density="card"
                            className="mt-0.5"
                          />
                        </div>
                      ) : null}
                      {wtLabel ? (
                        <p
                          className={cn(
                            'tabular-nums',
                            hidePrices
                              ? 'text-sm font-semibold text-amber-500/95 sm:text-[15px]'
                              : 'text-[11px] text-slate-500 sm:text-xs',
                          )}
                        >
                          {hidePrices ? wtLabel : `Weight · ${wtLabel}`}
                        </p>
                      ) : null}
                      <div className="mt-auto space-y-2 pt-1.5">
                        {!hidePrices ? (
                          <p className="text-base font-bold tabular-nums text-amber-600 sm:text-lg">
                            ₹{unitTotalInr.toLocaleString('en-IN')}
                            {productPriceShowsInclGst(item, sharedPricingOptions) ? (
                              <span className="ml-1 text-[10px] font-normal text-slate-500 sm:text-[11px]">
                                incl. GST
                              </span>
                            ) : null}
                          </p>
                        ) : null}
                        {selected ? (
                          <div
                            className="flex items-center justify-between gap-2 rounded-xl border border-slate-700/80 bg-slate-950/60 px-2 py-1.5"
                            onClick={(e) => e.stopPropagation()}
                            onKeyDown={(e) => e.stopPropagation()}
                          >
                            <span className="text-[10px] font-medium uppercase tracking-wide text-slate-500">
                              Qty
                            </span>
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                aria-label="Decrease quantity"
                                disabled={qty <= 1}
                                onClick={() => setQty(key, qty - 1)}
                                className="flex size-8 items-center justify-center rounded-lg border border-slate-600 bg-slate-900 text-slate-200 transition hover:bg-slate-800 disabled:opacity-40"
                              >
                                <Minus className="size-3.5" aria-hidden />
                              </button>
                              <span className="min-w-[1.75rem] text-center text-sm font-semibold tabular-nums text-slate-100">
                                {qty}
                              </span>
                              <button
                                type="button"
                                aria-label="Increase quantity"
                                disabled={qty >= MAX_PIECE_QTY}
                                onClick={() => setQty(key, qty + 1)}
                                className="flex size-8 items-center justify-center rounded-lg border border-slate-600 bg-slate-900 text-slate-200 transition hover:bg-slate-800 disabled:opacity-40"
                              >
                                <Plus className="size-3.5" aria-hidden />
                              </button>
                            </div>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </article>
                </li>
              )
            })}
          </ul>
        )}
      </main>

      {showPickerChrome ? (
        <footer className="fixed inset-x-0 bottom-0 z-40 border-t border-neutral-300/90 bg-white/98 shadow-[0_-4px_20px_rgba(15,23,42,0.08)] backdrop-blur-md">
          <div className="mx-auto flex max-w-6xl items-center gap-2 px-3 py-2 sm:gap-3 sm:px-4 sm:py-2.5 pb-[max(0.5rem,env(safe-area-inset-bottom,0px))]">
            <p className="min-w-0 flex-1 truncate text-xs text-neutral-600 sm:text-sm">
              {selectedCount === 0 ? (
                <>Shortlist items to share</>
              ) : (
                <span className="font-semibold text-neutral-900">
                  {totalPieces} {totalPieces === 1 ? 'pc' : 'pcs'} · {selectedCount}{' '}
                  {selectedCount === 1 ? 'design' : 'designs'}
                </span>
              )}
            </p>
            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                disabled={selectedCount === 0 || pdfBusy}
                onClick={handleSharePicksPdf}
                className={cn(
                  'inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-bold transition active:scale-[0.99] sm:min-h-[46px] sm:gap-2 sm:px-4 sm:text-sm',
                  selectedCount === 0 || pdfBusy
                    ? 'cursor-not-allowed border-neutral-200 bg-neutral-100 text-neutral-400'
                    : 'border-neutral-800 bg-neutral-900 text-white hover:bg-neutral-800',
                )}
              >
                {pdfBusy ? (
                  <Loader2 className="size-4 shrink-0 animate-spin sm:size-[18px]" aria-hidden />
                ) : (
                  <FileText className="size-4 shrink-0 sm:size-[18px]" aria-hidden />
                )}
                <span className="max-w-[5.5rem] truncate sm:max-w-none">
                  {pdfBusy ? 'PDF…' : 'PDF with photos'}
                </span>
              </button>
              <button
                type="button"
                disabled={selectedCount === 0}
                onClick={handleSharePicks}
                className={cn(
                  'inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold shadow-sm transition active:scale-[0.99] sm:min-h-[46px] sm:gap-2 sm:px-4 sm:text-sm',
                  selectedCount === 0
                    ? 'cursor-not-allowed bg-neutral-200 text-neutral-400'
                    : 'bg-emerald-600 text-white hover:bg-emerald-500',
                )}
              >
                <MessageCircle className="size-4 shrink-0 sm:size-[18px]" aria-hidden />
                <span className="max-w-[4.5rem] truncate sm:max-w-none">WhatsApp (text)</span>
              </button>
            </div>
          </div>
        </footer>
      ) : null}

      <SharedCatalogImageLightbox
        open={lightboxOpen}
        onOpenChange={setLightboxOpen}
        slides={lightboxSlides}
        initialIndex={lightboxIndex}
      />

      <PdfShareSheet
        open={pdfShareOpen}
        onOpenChange={setPdfShareOpen}
        payload={pdfSharePayload}
      />
    </div>
  )
}

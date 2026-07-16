'use client'

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import Image from 'next/image'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { pdf } from '@react-pdf/renderer'
import { Check, ChevronLeft, ChevronRight, Clock, FileText, Gem, Loader2, MessageCircle, Minus, Plus, Sparkles } from 'lucide-react'
import {
  fetchSharedCatalogByUuid,
  sharedCatalogGiftingGstEnabled,
  sharedCatalogSlabPayloadFromResponse,
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
import { getCustomerDisplaySize, getCustomerDisplayWeightLabel } from '@/lib/pricing'
import { ProductMetalSpecExtras } from '@/components/catalog/ProductMetalSpecExtras'
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
import BoxOptionToggle from '@/components/catalog/BoxOptionToggle'
import GiftingSizeVariantPicker from '@/components/catalog/GiftingSizeVariantPicker'
import {
  boxImageSlideIndex,
  getProductBoxCharges,
  productHasBoxOption,
} from '@/lib/product-box-pricing'
import { getProductSelectionKey } from '@/lib/catalog-product-filters'
import { productImageWellClass } from '@/lib/product-image-theme'
import type { PublicResellerBranding } from '@/lib/reseller-branding-server'
import {
  buildSharedCatalogSelectionWhatsAppMessage,
  buildWhatsAppOrderUrl,
  getDefaultStoreWhatsAppDigits,
  normalizeIndianMobileDigits,
  openWhatsAppOrder,
  toWhatsAppWaMeDigits,
} from '@/lib/cart-order-whatsapp'
import {
  buildSharedCatalogSelectionPicks,
  picksToPdfItems,
  sharedCatalogPickToWhatsAppLine,
  summarizeSharedCatalogPicks,
} from '@/lib/shared-catalog-picks'
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
import { logSharedCatalogInquiry } from '@/lib/shared-catalog-inquiries'
import { useAuth } from '@/hooks/useAuth'
import SharedCatalogSignInModal, {
  type SharedCatalogCustomerIdentity,
} from '@/components/shared-catalog/SharedCatalogSignInModal'

const MAX_PIECE_QTY = 99

function scrollChipWithinStrip(
  container: HTMLElement,
  target: HTMLElement,
  inline: 'center' | 'nearest' = 'center',
) {
  const cRect = container.getBoundingClientRect()
  const tRect = target.getBoundingClientRect()
  if (inline === 'center') {
    container.scrollLeft += tRect.left + tRect.width / 2 - (cRect.left + cRect.width / 2)
    return
  }
  if (tRect.left < cRect.left) {
    container.scrollLeft += tRect.left - cRect.left
  } else if (tRect.right > cRect.right) {
    container.scrollLeft += tRect.right - cRect.right
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

function patchIncludeBoxByKey(
  prev: Map<string, boolean>,
  key: string,
  value: boolean,
): Map<string, boolean> {
  if ((prev.get(key) ?? false) === value) return prev
  const next = new Map(prev)
  next.set(key, value)
  return next
}

function patchGalleryScrollByKey(
  prev: Map<string, number | null>,
  key: string,
  value: number | null,
): Map<string, number | null> {
  if ((prev.get(key) ?? null) === value) return prev
  const next = new Map(prev)
  next.set(key, value)
  return next
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
  const [includeBoxByKey, setIncludeBoxByKey] = useState<Map<string, boolean>>(() => new Map())
  const [galleryScrollByKey, setGalleryScrollByKey] = useState<Map<string, number | null>>(
    () => new Map(),
  )
  const auth = useAuth()
  const [customer, setCustomer] = useState<SharedCatalogCustomerIdentity | null>(null)
  const [signInOpen, setSignInOpen] = useState(false)
  const [pendingSelectKey, setPendingSelectKey] = useState<string | null>(null)
  const [pendingSelectAll, setPendingSelectAll] = useState(false)

  useEffect(() => {
    if (!auth.hasChecked || !auth.isAuthenticated) return
    const u = auth.user as Record<string, unknown> | undefined
    const mobile = String(u?.mobile_number ?? '').replace(/\D/g, '').slice(-10)
    if (mobile.length !== 10) return
    const userId = Number(u?.id)
    if (!Number.isFinite(userId)) return
    setCustomer({
      userId,
      mobile,
      name: String(u?.name ?? `Customer ${mobile.slice(-4)}`),
    })
  }, [auth])

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

  const sharedCatalogOtpEnabled = useMemo(() => {
    if (!payload || typeof payload !== 'object') return true
    if ('shared_catalog_otp_enabled' in payload) {
      return (payload as { shared_catalog_otp_enabled?: boolean }).shared_catalog_otp_enabled !== false
    }
    return true
  }, [payload])

  const slabPayload = useMemo(
    () => sharedCatalogSlabPayloadFromResponse(payload),
    [payload],
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
      slabPayload,
    )
  }, [payload, giftingGstEnabled, slabPayload])

  const groupedRows = useMemo(() => groupSharedCatalogPricingRows(rows), [rows])

  const subcategoryTabs = useMemo(
    () => buildSharedCatalogSubcategoryTabs(rows),
    [rows],
  )

  const showSubcategoryTabs = subcategoryTabs.length > 1

  const categoryStripRef = useRef<HTMLDivElement>(null)
  const categoryChipRefs = useRef<Map<string, HTMLButtonElement>>(new Map())
  const [categoryStripScroll, setCategoryStripScroll] = useState({ left: false, right: false })

  const registerCategoryChipRef = useCallback((key: string, el: HTMLButtonElement | null) => {
    if (el) categoryChipRefs.current.set(key, el)
    else categoryChipRefs.current.delete(key)
  }, [])

  const refreshCategoryStripScroll = useCallback(() => {
    const el = categoryStripRef.current
    if (!el) return
    const { scrollLeft, scrollWidth, clientWidth } = el
    setCategoryStripScroll({
      left: scrollLeft > 4,
      right: scrollLeft + clientWidth < scrollWidth - 4,
    })
  }, [])

  const scrollCategoryStrip = useCallback((dir: -1 | 1) => {
    const el = categoryStripRef.current
    if (!el) return
    const delta = Math.max(160, el.clientWidth * 0.75) * dir
    el.scrollBy({ left: delta, behavior: 'smooth' })
  }, [])

  useEffect(() => {
    refreshCategoryStripScroll()
    const el = categoryStripRef.current
    if (!el) return
    el.addEventListener('scroll', refreshCategoryStripScroll, { passive: true })
    window.addEventListener('resize', refreshCategoryStripScroll)
    return () => {
      el.removeEventListener('scroll', refreshCategoryStripScroll)
      window.removeEventListener('resize', refreshCategoryStripScroll)
    }
  }, [subcategoryTabs, refreshCategoryStripScroll])

  useLayoutEffect(() => {
    if (!showSubcategoryTabs) return
    const key = activeSubcategory
    const chip = categoryChipRefs.current.get(key)
    const strip = categoryStripRef.current
    if (chip && strip) {
      scrollChipWithinStrip(strip, chip, 'center')
    }
    refreshCategoryStripScroll()
  }, [activeSubcategory, showSubcategoryTabs, subcategoryTabs, refreshCategoryStripScroll])

  const canShortlist = !!customer

  const goToSubcategory = useCallback((key: string) => {
    setActiveSubcategory(key)
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'smooth' })
    }
  }, [])

  const requireSignIn = useCallback(
    (after?: { key?: string; selectAll?: boolean }) => {
      if (canShortlist) return true
      if (after?.key) setPendingSelectKey(after.key)
      if (after?.selectAll) setPendingSelectAll(true)
      setSignInOpen(true)
      return false
    },
    [canShortlist],
  )

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

  const selectedBarcodeSet = useMemo(() => {
    if (!isLoadedBrochure(payload)) return new Set<string>()
    const ids = payload.selectedProductIds
    if (!Array.isArray(ids)) return new Set<string>()
    return new Set(ids.map((id) => String(id).trim()).filter(Boolean))
  }, [payload])

  const [activeVariantByGroup, setActiveVariantByGroup] = useState<Map<string, string>>(
    () => new Map(),
  )

  useEffect(() => {
    setActiveVariantByGroup((prev) => {
      const next = new Map<string, string>()
      for (const g of groupedRows) {
        const keys = g.variants.map((v) => rowKeyByRow.get(v) ?? '').filter(Boolean)
        const kept = prev.get(g.groupKey)
        if (kept && keys.includes(kept)) {
          next.set(g.groupKey, kept)
          continue
        }
        const preferred = g.variants.find((v) => {
          const bc = String(v.product.barcode ?? '').trim()
          return bc && selectedBarcodeSet.has(bc)
        })
        const preferredKey = preferred ? rowKeyByRow.get(preferred) : undefined
        next.set(g.groupKey, preferredKey ?? keys[0] ?? g.groupKey)
      }
      if (prev.size === next.size) {
        let unchanged = true
        for (const [k, v] of next) {
          if (prev.get(k) !== v) {
            unchanged = false
            break
          }
        }
        if (unchanged) return prev
      }
      return next
    })
  }, [groupedRows, rowKeyByRow, selectedBarcodeSet])

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

  const guardedToggleKey = useCallback(
    (key: string) => {
      if (!requireSignIn({ key })) return
      toggleKey(key)
    },
    [requireSignIn, toggleKey],
  )

  useEffect(() => {
    if (!canShortlist) return
    if (pendingSelectKey) {
      toggleKey(pendingSelectKey)
      setPendingSelectKey(null)
    }
    if (pendingSelectAll) {
      setSelections((prev) => {
        const next = new Map(prev)
        for (const group of visibleGroupedRows) {
          const active = resolveActiveVariant(group)
          const key = rowKeyByRow.get(active)
          if (key) next.set(key, next.get(key) ?? 1)
        }
        return next
      })
      setPendingSelectAll(false)
    }
  }, [
    canShortlist,
    pendingSelectKey,
    pendingSelectAll,
    toggleKey,
    visibleGroupedRows,
    resolveActiveVariant,
    rowKeyByRow,
  ])

  const setQty = useCallback((key: string, qty: number) => {
    if (!canShortlist) {
      requireSignIn({ key })
      return
    }
    const q = Math.max(1, Math.min(MAX_PIECE_QTY, Math.floor(qty)))
    setSelections((prev) => {
      if (!prev.has(key)) return prev
      const next = new Map(prev)
      next.set(key, q)
      return next
    })
  }, [canShortlist, requireSignIn])

  const selectAll = useCallback(() => {
    if (!requireSignIn({ selectAll: true })) return
    setSelections((prev) => {
      const next = new Map(prev)
      for (const group of visibleGroupedRows) {
        const active = resolveActiveVariant(group)
        const key = rowKeyByRow.get(active)
        if (key) next.set(key, next.get(key) ?? 1)
      }
      return next
    })
  }, [visibleGroupedRows, resolveActiveVariant, rowKeyByRow, requireSignIn])

  const clearSelection = useCallback(() => {
    setSelections(new Map())
  }, [])

  const selectedCount = selections.size
  const totalPieces = totalSelectedPieces(selections)

  const selectionPicks = useMemo(
    () =>
      buildSharedCatalogSelectionPicks(
        groupedRows,
        rowKeyByRow,
        selections,
        includeBoxByKey,
      ),
    [groupedRows, rowKeyByRow, selections, includeBoxByKey],
  )

  const logInquiry = useCallback(
    (source: 'whatsapp' | 'pdf') => {
      if (!uuid || selectionPicks.length === 0) return
      const summary = summarizeSharedCatalogPicks(selectionPicks)
      void logSharedCatalogInquiry(uuid, {
        source,
        lineCount: selectionPicks.length,
        totalPieces: summary.totalPieces,
        totalInr: hidePricesForLog(payload) ? null : summary.orderTotalInr,
        lines: selectionPicks.map((pick) => {
          const waLine = sharedCatalogPickToWhatsAppLine(
            pick,
            payload && typeof payload === 'object' && 'rates' in payload ? payload.rates ?? [] : [],
          )
          return {
            name: waLine.name,
            code: waLine.skuOrBarcode,
            qty: waLine.qty,
            unitInr: waLine.priceInr,
            lineTotalInr: pick.lineTotalInr,
            compareAtInr: waLine.compareAtInr ?? null,
            sizeLabel: waLine.sizeLabel ?? null,
            weightLabel: waLine.weightLabel ?? null,
            metalSpecSummary: waLine.metalSpecSummary ?? null,
            showInclGst: waLine.showInclGst,
            withBoxPriceInr: waLine.withBoxPriceInr ?? null,
            slabDiscountLines: waLine.slabDiscountLines,
            savingsInr: waLine.savingsInr ?? null,
          }
        }),
        catalogUrl: typeof window !== 'undefined' ? window.location.href : undefined,
      })
    },
    [uuid, selectionPicks, payload],
  )

  function hidePricesForLog(p: SharedCatalogPublicResponse | null): boolean {
    return !!(p && typeof p === 'object' && 'hidePrices' in p && p.hidePrices)
  }

  const handleSharePicksPdf = useCallback(async () => {
    if (!isLoadedBrochure(payload)) return
    if (selectedCount === 0) return
    if (!requireSignIn()) return

    const fromApi = normalizeIndianMobileDigits(payload.selectionWhatsAppDigits ?? undefined)
    const fromBranding = normalizeIndianMobileDigits(initialBranding?.contactPhoneDigits ?? undefined)
    const digits10 = fromApi ?? fromBranding ?? getDefaultStoreWhatsAppDigits()
    const wa = digits10 ? toWhatsAppWaMeDigits(digits10) : ''

    if (selectionPicks.length === 0) return
    const orderSummary = summarizeSharedCatalogPicks(selectionPicks)

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
      const itemsForPdf = await resolveItemsForPdf(picksToPdfItems(selectionPicks))
      const blob = await pdf(
        <CatalogPdfDocument
          products={itemsForPdf}
          brandName={brandLabel}
          kcThemeId={kcThemeId}
          itemsLabel={hidePricesPdf ? 'Weight catalogue shortlist' : 'Shared catalogue shortlist'}
          hidePrices={hidePricesPdf}
          orderSummary={{
            totalPieces: orderSummary.totalPieces,
            designCount: orderSummary.designCount,
            orderTotalInr: hidePricesPdf ? null : orderSummary.orderTotalInr,
          }}
          resellerPdfPricing={
            hidePricesPdf
              ? null
              : {
                  rates: payload.rates,
                  markupPercentage: markup,
                  discountPercentage: discount,
                  wholesale: slabPayload ? null : wholesale,
                  giftingGstEnabled,
                  slabPayload,
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
      logInquiry('pdf')
    } catch (e) {
      console.error(e)
      alert('Could not create the PDF. Check your connection and try again.')
    } finally {
      setPdfBusy(false)
    }
  }, [
    payload,
    selectionPicks,
    selectedCount,
    brandLabel,
    initialBranding?.contactPhoneDigits,
    initialBranding?.kcThemeId,
    giftingGstEnabled,
    slabPayload,
    logInquiry,
    requireSignIn,
  ])

  const handleSharePicks = useCallback(() => {
    if (!isLoadedBrochure(payload)) return
    if (selectedCount === 0) return
    if (!requireSignIn()) return

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

    const lines = selectionPicks.map((pick) =>
      sharedCatalogPickToWhatsAppLine(pick, payload.rates ?? []),
    )

    const msg = buildSharedCatalogSelectionWhatsAppMessage({
      brandLabel,
      lines,
      catalogueUrl: typeof window !== 'undefined' ? window.location.href : undefined,
      hidePrices: !!payload.hidePrices,
    })
    openWhatsAppOrder(wa, msg)
    logInquiry('whatsapp')
  }, [payload, selectionPicks, selectedCount, brandLabel, initialBranding?.contactPhoneDigits, logInquiry, requireSignIn])

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
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-slate-950 px-6 text-center text-slate-100">
        <p className="text-lg font-medium text-slate-200">Could not open this catalogue.</p>
        <p className="mt-2 max-w-md text-sm text-slate-400">
          The link may be invalid or temporarily unavailable. Ask {brandLabel} for a fresh link.
        </p>
        <Link
          href={CATALOG_PATH}
          className="mt-6 rounded-xl bg-amber-500 px-5 py-2.5 text-sm font-semibold text-white"
        >
          Browse full catalogue
        </Link>
      </div>
    )
  }

  const expiresAt = payload.expiresAt
  const expDate = expiresAt ? new Date(expiresAt) : null
  const hidePrices = !!payload.hidePrices
  const hidePdf = !!payload.hidePdf
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
            Tap any card to shortlist · pick a size · set quantities per size · then share on WhatsApp
            {hidePdf ? '' : ' or PDF'}.
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
          <div className="flex items-stretch gap-1.5 sm:gap-2">
            <button
              type="button"
              aria-label="Scroll categories left"
              disabled={!categoryStripScroll.left}
              onClick={() => scrollCategoryStrip(-1)}
              className={cn(
                'kc-size-chip flex size-10 shrink-0 items-center justify-center self-center rounded-full border touch-manipulation transition sm:size-11',
                categoryStripScroll.left ? 'kc-size-chip-idle' : 'cursor-not-allowed opacity-35',
              )}
            >
              <ChevronLeft className="size-5" aria-hidden />
            </button>
            <div
              ref={categoryStripRef}
              className="flex min-w-0 flex-1 gap-2 overflow-x-auto pb-1 scrollbar-hide kc-scroll-contain snap-x snap-mandatory"
            >
              <button
                ref={(el) => registerCategoryChipRef(SHARED_CATALOG_ALL_TAB, el)}
                type="button"
                onClick={() => goToSubcategory(SHARED_CATALOG_ALL_TAB)}
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
                  ref={(el) => registerCategoryChipRef(tab.key, el)}
                  type="button"
                  onClick={() => goToSubcategory(tab.key)}
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
            <button
              type="button"
              aria-label="Scroll categories right"
              disabled={!categoryStripScroll.right}
              onClick={() => scrollCategoryStrip(1)}
              className={cn(
                'kc-size-chip flex size-10 shrink-0 items-center justify-center self-center rounded-full border touch-manipulation transition sm:size-11',
                categoryStripScroll.right ? 'kc-size-chip-idle' : 'cursor-not-allowed opacity-35',
              )}
            >
              <ChevronRight className="size-5" aria-hidden />
            </button>
          </div>
          {subcategoryTabs.length > 2 ? (
            <p className="mt-2 text-center text-[10px] text-slate-500 sm:hidden">
              Swipe the category row to see more
            </p>
          ) : null}
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
              if (!activeRow) return null
              const key = rowKeyByRow.get(activeRow) ?? group.groupKey
              const qty = selections.get(key) ?? 0
              const selected = qty > 0
              const anySelected = group.variants.some((v) => {
                const k = rowKeyByRow.get(v)
                return k ? selections.has(k) : false
              })
              const shortlistedKeys = (() => {
                const set = new Set<string>()
                for (const v of group.variants) {
                  const k = rowKeyByRow.get(v)
                  if (!k || !selections.has(k)) continue
                  const itemKey = getProductSelectionKey(v.item)
                  if (itemKey) set.add(itemKey)
                }
                return set
              })()
              const hasVariants = group.variants.length > 1
              const { item, product, unitTotalInr, unitCompareAtInr, discountBadge, showInclGst, slabDiscountLines, savingsInr } =
                activeRow
              const name = group.displayTitle
              const img = normalizeCatalogImageSrc(
                product.image_url || group.variants[0]?.product.image_url,
              )
              const MetalIc = metalIcon(String(product.metal_type || ''))
              const code = String(product.barcode || product.sku || '')
              const sizeLabel = getCustomerDisplaySize(item)
              const wtLabel = getCustomerDisplayWeightLabel(sharedCatalogProductToItem(product))
              const hasBox = productHasBoxOption(item)
              const includeBox = includeBoxByKey.get(key) ?? false
              const boxSlideIdx = boxImageSlideIndex(item)
              const displayUnitInr = unitTotalInr + (includeBox ? getProductBoxCharges(item) : 0)
              const displayCompareAtInr =
                unitCompareAtInr != null
                  ? unitCompareAtInr + (includeBox ? getProductBoxCharges(item) : 0)
                  : null
              const galleryScroll = galleryScrollByKey.get(key) ?? null
              return (
                <li key={group.groupKey}>
                  <article
                    className={cn(
                      'flex h-full cursor-pointer flex-col overflow-hidden rounded-2xl border bg-slate-900/80 shadow-md transition select-none',
                      anySelected
                        ? 'border-amber-500/70 ring-2 ring-amber-500/25'
                        : 'border-slate-700/80 hover:border-slate-600',
                    )}
                    onClick={(e) => {
                      const t = e.target as HTMLElement
                      if (t.closest('[data-no-card-toggle]')) return
                      guardedToggleKey(key)
                    }}
                    onKeyDown={(e) => {
                      if (e.key !== 'Enter' && e.key !== ' ') return
                      const t = e.target as HTMLElement
                      if (t.closest('[data-no-card-toggle]')) return
                      e.preventDefault()
                      guardedToggleKey(key)
                    }}
                  >
                    <div
                      className={cn(
                        'group relative isolate aspect-[4/5] overflow-hidden outline-none',
                        productImageWellClass,
                      )}
                    >
                      <button
                        type="button"
                        data-no-card-toggle
                        onClick={(e) => {
                          e.stopPropagation()
                          guardedToggleKey(key)
                        }}
                        aria-pressed={selected}
                        aria-label={selected ? 'Remove from shortlist' : 'Add to shortlist'}
                        className={cn(
                          'absolute left-2 top-2 z-40 flex size-10 shrink-0 items-center justify-center rounded-full border-2 shadow-lg transition',
                          selected
                            ? 'border-emerald-300 bg-emerald-600 text-white'
                            : anySelected
                              ? 'border-amber-400/80 bg-amber-500/90 text-white'
                              : 'border-slate-400/80 bg-white text-slate-800 hover:bg-slate-50',
                        )}
                      >
                        {selected || anySelected ? (
                          <Check className="size-4 shrink-0 stroke-[2.5]" aria-hidden />
                        ) : null}
                      </button>
                      {discountBadge ? (
                        <span className="kc-discount-badge right-2 left-auto">{discountBadge}</span>
                      ) : null}
                      {img ? (
                        <>
                          <DualJewelleryProductImage
                            primarySrc={img}
                            secondary_image_url={
                              product.secondary_image_url ||
                              group.variants[0]?.product.secondary_image_url
                            }
                            box_image_url={
                              product.box_image_url ||
                              group.variants[0]?.product.box_image_url
                            }
                            video_url={
                              product.video_url || group.variants[0]?.product.video_url
                            }
                            alt={name}
                            sizes="(max-width: 640px) 50vw, 25vw"
                            imageClassName="object-cover"
                            unoptimized
                            scrollToIndex={galleryScroll}
                            onActiveIndexChange={(idx) => {
                              if (boxSlideIdx != null && idx === boxSlideIdx) {
                                setIncludeBoxByKey((prev) => patchIncludeBoxByKey(prev, key, true))
                              } else if (hasBox) {
                                setIncludeBoxByKey((prev) => patchIncludeBoxByKey(prev, key, false))
                              }
                            }}
                          />
                          <SharedCatalogZoomHint onZoom={() => openLightboxForKey(key)} />
                        </>
                      ) : (
                        <div className="flex h-full items-center justify-center bg-slate-800/50">
                          <MetalIc className="size-14 text-slate-500" aria-hidden />
                        </div>
                      )}
                    </div>

                    <div className="flex flex-col gap-1 p-2.5 sm:p-3">
                      {product.style_name ? (
                        <span className="text-[10px] font-medium uppercase tracking-wider text-slate-500">
                          {String(product.style_name)}
                        </span>
                      ) : null}
                      <h2 className="line-clamp-2 text-sm font-semibold leading-snug text-slate-100">
                        {name}
                      </h2>
                      {!hasVariants && sizeLabel ? (
                        <span className="kc-size-chip-single mt-0.5 w-fit">{sizeLabel}</span>
                      ) : !hasVariants && code ? (
                        <p className="truncate font-mono text-[11px] text-slate-500">{code}</p>
                      ) : null}
                      {hasVariants ? (
                        <div data-no-card-toggle onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
                          <GiftingSizeVariantPicker
                            variants={group.variants.map((v) => v.item)}
                            selected={item}
                            shortlistedKeys={shortlistedKeys}
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
                              ? 'text-sm font-bold text-amber-600 sm:text-[15px]'
                              : 'kc-product-card-weight',
                          )}
                        >
                          {wtLabel}
                        </p>
                      ) : null}
                      <ProductMetalSpecExtras
                        item={item}
                        rates={payload.rates ?? []}
                        density="shared"
                      />
                      {hasBox && !hidePrices ? (
                        <div
                          data-no-card-toggle
                          onClick={(e) => e.stopPropagation()}
                          onKeyDown={(e) => e.stopPropagation()}
                        >
                          <BoxOptionToggle
                            item={item}
                            includeBox={includeBox}
                            showChipPrices={false}
                            onChange={(withBox) => {
                              setIncludeBoxByKey((prev) => patchIncludeBoxByKey(prev, key, withBox))
                              if (withBox && boxSlideIdx != null) {
                                setGalleryScrollByKey((prev) =>
                                  patchGalleryScrollByKey(prev, key, boxSlideIdx),
                                )
                              } else {
                                setGalleryScrollByKey((prev) =>
                                  patchGalleryScrollByKey(prev, key, 0),
                                )
                              }
                            }}
                            density="card"
                            className="mt-1"
                          />
                        </div>
                      ) : null}
                      <div className="mt-1.5 space-y-2">
                        {!hidePrices ? (
                          <div className="flex min-w-0 flex-col gap-0.5">
                            {displayCompareAtInr != null && displayCompareAtInr > displayUnitInr ? (
                              <span className="kc-price-compare">
                                ₹{displayCompareAtInr.toLocaleString('en-IN')}
                              </span>
                            ) : null}
                            <div className="flex flex-wrap items-baseline gap-x-1 gap-y-0">
                              <span className="kc-price-current">
                                ₹{displayUnitInr.toLocaleString('en-IN')}
                              </span>
                              {includeBox && hasBox ? (
                                <span className="shrink-0 text-[9px] font-medium uppercase tracking-wide text-[var(--kc-accent,var(--color-emerald-600))] sm:text-[10px]">
                                  with box
                                </span>
                              ) : null}
                              {showInclGst ? (
                                <span className="shrink-0 text-[10px] font-normal text-slate-500 sm:text-[11px]">
                                  incl. GST
                                </span>
                              ) : null}
                            </div>
                            {slabDiscountLines.length > 0 ? (
                              <ul className="mt-1 space-y-0.5">
                                {slabDiscountLines.map((line) => (
                                  <li key={line} className="kc-slab-savings">
                                    ✓ {line}
                                  </li>
                                ))}
                              </ul>
                            ) : null}
                            {savingsInr != null && savingsInr > 0 ? (
                              <p className="kc-slab-savings font-semibold">
                                You save ₹{savingsInr.toLocaleString('en-IN')}
                              </p>
                            ) : null}
                          </div>
                        ) : null}
                        {selected ? (
                          <div
                            className="kc-qty-stepper"
                            data-no-card-toggle
                            onClick={(e) => e.stopPropagation()}
                            onKeyDown={(e) => e.stopPropagation()}
                          >
                            <span className="kc-qty-stepper-label">Qty</span>
                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                className="kc-qty-stepper-btn"
                                aria-label="Decrease quantity"
                                disabled={qty <= 1}
                                onClick={() => setQty(key, qty - 1)}
                              >
                                <Minus className="size-4 stroke-[2.5]" aria-hidden />
                              </button>
                              <span className="kc-qty-stepper-value">{qty}</span>
                              <button
                                type="button"
                                className="kc-qty-stepper-btn"
                                aria-label="Increase quantity"
                                disabled={qty >= MAX_PIECE_QTY}
                                onClick={() => setQty(key, qty + 1)}
                              >
                                <Plus className="size-4 stroke-[2.5]" aria-hidden />
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
            <p className="min-w-0 flex-1 truncate text-sm sm:text-base">
              {selectedCount === 0 ? (
                <span className="text-neutral-600">Shortlist items to share</span>
              ) : (
                <span className="font-bold text-amber-900">
                  {totalPieces} {totalPieces === 1 ? 'pc' : 'pcs'} · {selectionPicks.length}{' '}
                  {selectionPicks.length === 1 ? 'line' : 'lines'}
                </span>
              )}
            </p>
            <div className="flex shrink-0 items-center gap-2">
              {!hidePdf ? (
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
              ) : null}
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

      <SharedCatalogSignInModal
        open={signInOpen}
        onOpenChange={setSignInOpen}
        onVerified={setCustomer}
        otpEnabled={sharedCatalogOtpEnabled}
      />
    </div>
  )
}

'use client'

import { useEffect, useState, useMemo, useCallback, useRef } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import ProductCard from '@/components/ProductCard'
import WhatsAppShareButton from '@/components/WhatsAppShareButton'
import WhatsAppContactLink from '@/components/WhatsAppContactLink'
import { LayoutGrid, ChevronRight, ChevronDown, Gem, Sparkles } from 'lucide-react'
import DualRangeSlider from '@/components/DualRangeSlider'
import { calculateBreakdown, type DiscountTier, type Item } from '@/lib/pricing'
import { usePullToRefresh } from '@/hooks/usePullToRefresh'
import {
  CATALOG_PATH,
  CATALOG_SCROLL_TO_KEY,
  CATALOG_STATE_KEY,
  CATALOG_FROM_PRODUCT_KEY,
} from '@/lib/routes'
import {
  buildCatalogSegmentPath,
  parseCatalogSlugSegments,
  type ParsedCatalogPath,
} from '@/lib/catalog-paths'
import { buildCatalogShareUrl, catalogShareMessage } from '@/lib/whatsapp'
import { useCatalogData } from './catalog-data-context'
import { useAuth } from '@/hooks/useAuth'
import { useWholesalePricing } from '@/context/WholesalePricingContext'
import { useCatalogBuilder } from '@/context/CatalogBuilderContext'
import { isCatalogAdminUser } from '@/lib/is-catalog-admin'
import CatalogSelectionFab from '@/components/catalog/CatalogSelectionFab'
import WhatsAppCatalogModal from '@/components/catalog/WhatsAppCatalogModal'
import {
  productMatchesMetal,
  productPassesCatalogFilters,
  getProductSelectionKey,
} from '@/lib/catalog-product-filters'

type Product = Item

type Subcategory = {
  id: number
  name: string
  slug: string
  products: Product[]
}

type Category = {
  id: number
  name: string
  slug: string
  image_url?: string
  subcategories: Subcategory[]
}

/** Metal types for catalog navigation — values match backend metal_type (lowercase) */
const METAL_TABS = [
  { key: 'gold', label: 'Gold', icon: Sparkles },
  { key: 'silver', label: 'Silver', icon: LayoutGrid },
  { key: 'diamond', label: 'Diamond', icon: Gem },
] as const

type MetalKey = (typeof METAL_TABS)[number]['key']

type CatalogSessionState = {
  selectedMetal?: MetalKey
  activeStyleId?: number
  activeSkuId?: number
  expandedStyles?: number[]
  weightLow?: number
  weightHigh?: number
  priceLow?: number
  priceHigh?: number
  scrollToBarcode?: string
}

/** First metal that has products; used for smart default */
function firstAvailableMetal(categories: Category[]): MetalKey {
  const allProducts = categories.flatMap((c) =>
    c.subcategories.flatMap((s) => s.products),
  )
  for (const tab of METAL_TABS) {
    if (allProducts.some((p) => productMatchesMetal(p, tab.key))) return tab.key
  }
  return 'gold'
}

function collectFilteredIdsForStyle(
  filteredCategories: Category[],
  styleId: number,
  selectedMetal: MetalKey,
  weightLow: number,
  weightHigh: number,
  priceLow: number,
  priceHigh: number,
  rates: unknown,
  discountTier: DiscountTier | null,
): string[] {
  const cat = filteredCategories.find((c) => c.id === styleId)
  if (!cat) return []
  const out: string[] = []
  for (const sub of cat.subcategories) {
    for (const p of sub.products) {
      if (
        productPassesCatalogFilters(
          p,
          selectedMetal,
          weightLow,
          weightHigh,
          priceLow,
          priceHigh,
          rates,
          discountTier,
        )
      ) {
        const k = getProductSelectionKey(p)
        if (k) out.push(k)
      }
    }
  }
  return [...new Set(out)]
}

function collectFilteredIdsForSku(
  filteredCategories: Category[],
  styleId: number,
  skuId: number,
  selectedMetal: MetalKey,
  weightLow: number,
  weightHigh: number,
  priceLow: number,
  priceHigh: number,
  rates: unknown,
  discountTier: DiscountTier | null,
): string[] {
  const cat = filteredCategories.find((c) => c.id === styleId)
  if (!cat) return []
  const sub = cat.subcategories.find((s) => s.id === skuId)
  if (!sub) return []
  const out: string[] = []
  for (const p of sub.products) {
    if (
      productPassesCatalogFilters(
        p,
        selectedMetal,
        weightLow,
        weightHigh,
        priceLow,
        priceHigh,
        rates,
        discountTier,
      )
    ) {
      const k = getProductSelectionKey(p)
      if (k) out.push(k)
    }
  }
  return [...new Set(out)]
}

function BulkSelectCheckbox({
  allSelected,
  someSelected,
  onToggle,
  ariaLabel,
}: {
  allSelected: boolean
  someSelected: boolean
  onToggle: () => void
  ariaLabel: string
}) {
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = someSelected && !allSelected
  }, [someSelected, allSelected])
  return (
    <input
      ref={ref}
      type="checkbox"
      checked={allSelected}
      onChange={(e) => {
        e.stopPropagation()
        onToggle()
      }}
      onClick={(e) => e.stopPropagation()}
      aria-label={ariaLabel}
      className="size-4 shrink-0 cursor-pointer rounded border-slate-600 bg-slate-900 accent-amber-500"
    />
  )
}

function pathSegmentsFromPathname(pathname: string): ParsedCatalogPath | null {
  if (!pathname.startsWith(CATALOG_PATH + '/') && pathname !== CATALOG_PATH) return null
  const rest =
    pathname === CATALOG_PATH
      ? ''
      : pathname.slice(CATALOG_PATH.length).replace(/^\//, '')
  if (!rest) return null
  const parts = rest.split('/').filter(Boolean)
  return parseCatalogSlugSegments(parts)
}

/** True when URL path already matches current style/sku/metal (skip re-apply → fewer renders / no loops). */
function selectionMatchesPath(
  cats: Category[],
  parsed: ParsedCatalogPath,
  selectedMetal: MetalKey,
  activeStyleId: number | null,
  activeSkuId: number | null,
): boolean {
  if (parsed.metal !== selectedMetal) return false
  const cat = cats.find((c) => (c.slug || '').toLowerCase() === parsed.styleSlug.toLowerCase())
  if (!cat || cat.id !== activeStyleId) return false
  const sub = cat.subcategories.find(
    (s) => (s.slug || '').toLowerCase() === parsed.skuSlug.toLowerCase(),
  )
  return !!sub && sub.id === activeSkuId
}

export default function CatalogPageClient() {
  const pathname = usePathname()
  const router = useRouter()
  const { categories, rates, isBootstrapping, refresh, isRefreshing: contextRefreshing } =
    useCatalogData()
  const auth = useAuth()
  const wholesale = useWholesalePricing()
  const discountTier = wholesale.isWholesaleBuyer ? wholesale.discountTier : null
  const {
    catalogBuilderMode,
    setCatalogBuilderMode,
    selectedProductIds,
    toggleProductId,
    addProductIds,
    removeProductIds,
    isProductSelected,
    clearSelection,
  } = useCatalogBuilder()
  const isAdmin = auth.isAuthenticated === true && isCatalogAdminUser(auth.user)
  const [whatsappModalOpen, setWhatsappModalOpen] = useState(false)

  const [selectedMetal, setSelectedMetal] = useState<MetalKey>('gold')

  const [activeStyleId, setActiveStyleId] = useState<number | null>(null)
  const [activeSkuId, setActiveSkuId] = useState<number | null>(null)
  const [weightLow, setWeightLow] = useState(0)
  const [weightHigh, setWeightHigh] = useState(100)
  const [priceLow, setPriceLow] = useState(0)
  const [priceHigh, setPriceHigh] = useState(100000)
  const hasRestoredFromStorage = useRef(false)
  const skipNextBoundsSync = useRef(false)
  const [scrollToBarcode, setScrollToBarcode] = useState<string | null>(null)
  /** False until initial load finishes — blocks URL bar sync from forcing ?metal=gold before session/URL apply. */
  const [catalogHydrated, setCatalogHydrated] = useState(false)

  const saveCatalogState = useCallback((scrollToBarcode?: string) => {
    if (typeof window === 'undefined') return
    try {
      const state = {
        selectedMetal,
        activeStyleId,
        activeSkuId,
        weightLow,
        weightHigh,
        priceLow,
        priceHigh,
        scrollToBarcode,
      }
      sessionStorage.setItem(CATALOG_STATE_KEY, JSON.stringify(state))
      sessionStorage.setItem(CATALOG_FROM_PRODUCT_KEY, '1')
      if (scrollToBarcode) {
        sessionStorage.setItem(CATALOG_SCROLL_TO_KEY, scrollToBarcode)
      }
    } catch {
      /* ignore */
    }
  }, [selectedMetal, activeStyleId, activeSkuId, weightLow, weightHigh, priceLow, priceHigh])

  const selectedMetalRef = useRef(selectedMetal)
  const activeStyleIdRef = useRef(activeStyleId)
  const activeSkuIdRef = useRef(activeSkuId)
  useEffect(() => {
    if (!catalogBuilderMode) clearSelection()
  }, [catalogBuilderMode, clearSelection])

  useEffect(() => {
    selectedMetalRef.current = selectedMetal
  }, [selectedMetal])
  useEffect(() => {
    activeStyleIdRef.current = activeStyleId
  }, [activeStyleId])
  useEffect(() => {
    activeSkuIdRef.current = activeSkuId
  }, [activeSkuId])

  const applyPathSegments = useCallback((parsed: ParsedCatalogPath, cats: Category[]) => {
    const metalParam = parsed.metal
    if (metalParam === 'gold' || metalParam === 'silver' || metalParam === 'diamond') {
      setSelectedMetal(metalParam)
    }
    const styleSlug = parsed.styleSlug.toLowerCase()
    const skuSlug = parsed.skuSlug.toLowerCase()
    const cat = cats.find((c) => (c.slug || '').toLowerCase() === styleSlug)
    if (cat) {
      setActiveStyleId(cat.id)
      const sub = cat.subcategories.find((s) => (s.slug || '').toLowerCase() === skuSlug)
      if (sub) setActiveSkuId(sub.id)
      else if (cat.subcategories[0]) setActiveSkuId(cat.subcategories[0].id)
    } else {
      for (const c of cats) {
        const sub = c.subcategories.find((s) => (s.slug || '').toLowerCase() === skuSlug)
        if (sub) {
          setActiveStyleId(c.id)
          setActiveSkuId(sub.id)
          break
        }
      }
    }
  }, [])

  /** First paint: session restore, path, legacy query, or defaults — runs once when categories load. */
  useEffect(() => {
    if (categories.length === 0) return
    if (hasRestoredFromStorage.current) return

    const cats = categories
    let hasUrlParams = false
    let fromProduct = false
    try {
      const u = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '')
      hasUrlParams = u.has('style') || u.has('sku') || u.has('metal')
      fromProduct = sessionStorage.getItem(CATALOG_FROM_PRODUCT_KEY) === '1'
    } catch {
      hasUrlParams = false
    }

    const applyParsedSession = (parsed: CatalogSessionState) => {
      const validMetal =
        parsed.selectedMetal && METAL_TABS.some((t) => t.key === parsed.selectedMetal)
      const styleExists =
        parsed.activeStyleId != null && cats.some((c) => c.id === parsed.activeStyleId)
      const style = styleExists ? cats.find((c) => c.id === parsed.activeStyleId) : null
      const subExists =
        style &&
        parsed.activeSkuId != null &&
        style.subcategories.some((s) => s.id === parsed.activeSkuId)
      if (validMetal) setSelectedMetal(parsed.selectedMetal as MetalKey)
      if (styleExists && subExists) {
        setActiveStyleId(parsed.activeStyleId!)
        setActiveSkuId(parsed.activeSkuId!)
      } else {
        setActiveStyleId(cats[0].id)
        setActiveSkuId(cats[0].subcategories[0]?.id ?? null)
      }
      if (parsed.weightLow != null) setWeightLow(parsed.weightLow)
      if (parsed.weightHigh != null) setWeightHigh(parsed.weightHigh)
      if (parsed.priceLow != null) setPriceLow(parsed.priceLow)
      if (parsed.priceHigh != null) setPriceHigh(parsed.priceHigh)
      skipNextBoundsSync.current = true
      if (parsed.scrollToBarcode) setScrollToBarcode(parsed.scrollToBarcode)
    }

    const applyUrlQuery = () => {
      const u = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '')
      const metalParam = u.get('metal')?.toLowerCase()?.trim() || ''
      if (metalParam === 'gold' || metalParam === 'silver' || metalParam === 'diamond') {
        setSelectedMetal(metalParam)
      }
      const styleSlug = u.get('style')?.toLowerCase()?.trim() || ''
      const skuSlug = u.get('sku')?.toLowerCase()?.trim() || ''
      if (styleSlug) {
        const cat = cats.find((c) => (c.slug || '').toLowerCase() === styleSlug)
        if (cat) {
          setActiveStyleId(cat.id)
          if (skuSlug) {
            const sub = cat.subcategories.find((s) => (s.slug || '').toLowerCase() === skuSlug)
            if (sub) setActiveSkuId(sub.id)
            else if (cat.subcategories[0]) setActiveSkuId(cat.subcategories[0].id)
          } else if (cat.subcategories[0]) {
            setActiveSkuId(cat.subcategories[0].id)
          }
        }
      } else if (skuSlug) {
        for (const cat of cats) {
          const sub = cat.subcategories.find((s) => (s.slug || '').toLowerCase() === skuSlug)
          if (sub) {
            setActiveStyleId(cat.id)
            setActiveSkuId(sub.id)
            break
          }
        }
      }
      if (!styleSlug && !skuSlug) {
        setActiveStyleId(cats[0].id)
        setActiveSkuId(cats[0].subcategories[0]?.id ?? null)
      }
    }

    try {
      const stored = typeof window !== 'undefined' ? sessionStorage.getItem(CATALOG_STATE_KEY) : null
      const pathFromUrl = pathSegmentsFromPathname(pathname)

      if (stored && fromProduct) {
        const parsed = JSON.parse(stored) as CatalogSessionState
        applyParsedSession(parsed)
        sessionStorage.removeItem(CATALOG_STATE_KEY)
        sessionStorage.removeItem(CATALOG_FROM_PRODUCT_KEY)
      } else if (pathFromUrl) {
        if (stored) sessionStorage.removeItem(CATALOG_STATE_KEY)
        sessionStorage.removeItem(CATALOG_FROM_PRODUCT_KEY)
        applyPathSegments(pathFromUrl, cats)
      } else if (hasUrlParams) {
        if (stored) sessionStorage.removeItem(CATALOG_STATE_KEY)
        sessionStorage.removeItem(CATALOG_FROM_PRODUCT_KEY)
        applyUrlQuery()
      } else if (stored) {
        const parsed = JSON.parse(stored) as CatalogSessionState
        applyParsedSession(parsed)
        sessionStorage.removeItem(CATALOG_STATE_KEY)
      } else {
        setActiveStyleId(cats[0].id)
        setActiveSkuId(cats[0].subcategories[0]?.id ?? null)
      }
    } catch {
      setActiveStyleId(cats[0].id)
      setActiveSkuId(cats[0].subcategories[0]?.id ?? null)
    }

    hasRestoredFromStorage.current = true
    setCatalogHydrated(true)

    if (typeof window !== 'undefined') {
      const scrollTarget = sessionStorage.getItem(CATALOG_SCROLL_TO_KEY)
      if (scrollTarget) {
        setScrollToBarcode(scrollTarget)
        sessionStorage.removeItem(CATALOG_SCROLL_TO_KEY)
      }
    }
  }, [categories, applyPathSegments, pathname])

  const prevPathnameRef = useRef<string | null>(null)

  /** Browser back/forward or deep link: pathname changed while shell stayed mounted (skip first paint). */
  useEffect(() => {
    if (categories.length === 0 || !hasRestoredFromStorage.current) return
    if (prevPathnameRef.current === null) {
      prevPathnameRef.current = pathname
      return
    }
    if (prevPathnameRef.current === pathname) return
    prevPathnameRef.current = pathname
    const pathFromUrl = pathSegmentsFromPathname(pathname)
    if (!pathFromUrl) return
    if (
      selectionMatchesPath(
        categories,
        pathFromUrl,
        selectedMetalRef.current,
        activeStyleIdRef.current,
        activeSkuIdRef.current,
      )
    ) {
      return
    }
    applyPathSegments(pathFromUrl, categories)
  }, [pathname, categories, applyPathSegments])

  const { pullY, isRefreshing: pullRefreshing, handleTouchStart, handleTouchMove, handleTouchEnd } =
    usePullToRefresh(refresh)
  const showRefreshing = pullRefreshing || contextRefreshing

  useEffect(() => {
    if (!pathname.startsWith(CATALOG_PATH) || typeof window === 'undefined') return
    const scrollTarget = sessionStorage.getItem(CATALOG_SCROLL_TO_KEY)
    if (scrollTarget) {
      setScrollToBarcode(scrollTarget)
      sessionStorage.removeItem(CATALOG_SCROLL_TO_KEY)
    }
  }, [pathname])

  /** Smart default: when catalog loads, if current metal has no products, switch to first available */
  useEffect(() => {
    if (categories.length === 0) return
    const first = firstAvailableMetal(categories)
    setSelectedMetal((prev) => {
      const hasCurrent = categories.some((c) =>
        c.subcategories.some((s) =>
          s.products.some((p) => productMatchesMetal(p, prev)),
        ),
      )
      return hasCurrent ? prev : first
    })
  }, [categories])

  /** Filter categories/subcategories/products by selected metal type */
  const filteredCategories = useMemo(() => {
    return categories
      .map((cat) => ({
        ...cat,
        subcategories: cat.subcategories
          .map((sub) => ({
            ...sub,
            products: sub.products.filter((p) => productMatchesMetal(p, selectedMetal)),
          }))
          .filter((sub) => sub.products.length > 0),
      }))
      .filter((cat) => cat.subcategories.length > 0)
  }, [categories, selectedMetal])

  /** When metal changes, pick first available style/sku if current is empty */
  useEffect(() => {
    if (filteredCategories.length === 0) return
    const stillValid =
      activeStyleId != null &&
      filteredCategories.some((c) => c.id === activeStyleId) &&
      (activeSkuId == null ||
        filteredCategories
          .find((c) => c.id === activeStyleId)
          ?.subcategories.some((s) => s.id === activeSkuId))
    if (!stillValid) {
      const first = filteredCategories[0]
      setActiveStyleId(first.id)
      setActiveSkuId(first.subcategories[0]?.id ?? null)
    }
  }, [filteredCategories, activeStyleId, activeSkuId])

  const activeStyle = useMemo(
    () => filteredCategories.find((c) => c.id === activeStyleId) ?? null,
    [filteredCategories, activeStyleId],
  )

  const activeSku = useMemo(
    () => activeStyle?.subcategories.find((s) => s.id === activeSkuId) ?? null,
    [activeStyle, activeSkuId],
  )

  const rawProducts = activeSku?.products ?? []

  // Compute min/max from current products for slider bounds
  const { weightBounds, priceBounds } = useMemo(() => {
    if (rawProducts.length === 0) {
      return { weightBounds: [0, 100], priceBounds: [0, 100000] }
    }
    const weights = rawProducts.map((p) => p.net_weight ?? p.net_wt ?? p.weight ?? 0).filter((w) => w > 0)
    const prices = rawProducts.map((p) => {
      const b = calculateBreakdown(p, rates, (p as { gst_rate?: number }).gst_rate ?? 3, discountTier)
      return b.total
    })
    const wMin = weights.length ? Math.floor(Math.min(...weights)) : 0
    const wMax = weights.length ? Math.ceil(Math.max(...weights)) : 100
    const pMin = prices.length ? Math.floor(Math.min(...prices) / 1000) * 1000 : 0
    const pMax = prices.length ? Math.ceil(Math.max(...prices) / 1000) * 1000 : 100000
    return {
      weightBounds: [Math.max(0, wMin - 1), wMax + 1] as [number, number],
      priceBounds: [Math.max(0, pMin - 1000), pMax + 1000] as [number, number],
    }
  }, [rawProducts, rates, discountTier])

  // Sync slider bounds when category changes (skip once after restore from sessionStorage)
  useEffect(() => {
    if (skipNextBoundsSync.current) {
      skipNextBoundsSync.current = false
      return
    }
    setWeightLow(weightBounds[0])
    setWeightHigh(weightBounds[1])
    setPriceLow(priceBounds[0])
    setPriceHigh(priceBounds[1])
  }, [weightBounds[0], weightBounds[1], priceBounds[0], priceBounds[1]])

  const products = useMemo(() => {
    let list = rawProducts
    list = list.filter((p) => {
      const w = p.net_weight ?? p.net_wt ?? p.weight ?? 0
      return w >= weightLow && w <= weightHigh
    })
    list = list.filter((p) => {
      const b = calculateBreakdown(p, rates, (p as { gst_rate?: number }).gst_rate ?? 3, discountTier)
      return b.total >= priceLow && b.total <= priceHigh
    })
    return list
  }, [rawProducts, weightLow, weightHigh, priceLow, priceHigh, rates, discountTier])

  useEffect(() => {
    if (!scrollToBarcode || products.length === 0 || typeof window === 'undefined') return
    const el = document.querySelector(`[data-product-id="${CSS.escape(scrollToBarcode)}"]`)
    if (el) {
      requestAnimationFrame(() => {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      })
      setScrollToBarcode(null)
    } else {
      setScrollToBarcode(null)
    }
  }, [scrollToBarcode, products])

  const productGridSectionRef = useRef<HTMLElement | null>(null)
  const catalogSelectionSnapshotRef = useRef<{
    metal: MetalKey
    styleId: number | null
    skuId: number | null
  } | null>(null)

  useEffect(() => {
    if (!catalogHydrated || typeof window === 'undefined') return

    const next = {
      metal: selectedMetal,
      styleId: activeStyleId,
      skuId: activeSkuId,
    }
    if (scrollToBarcode) {
      catalogSelectionSnapshotRef.current = next
      return
    }
    const prev = catalogSelectionSnapshotRef.current
    catalogSelectionSnapshotRef.current = next
    if (prev === null) return
    if (
      prev.metal === next.metal &&
      prev.styleId === next.styleId &&
      prev.skuId === next.skuId
    ) {
      return
    }

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        productGridSectionRef.current?.scrollIntoView({
          behavior: 'smooth',
          block: 'start',
        })
      })
    })
  }, [catalogHydrated, selectedMetal, activeStyleId, activeSkuId, scrollToBarcode])

  const hasActiveFilters =
    weightLow > weightBounds[0] ||
    weightHigh < weightBounds[1] ||
    priceLow > priceBounds[0] ||
    priceHigh < priceBounds[1]

  const handleStyleClick = (cat: Category) => {
    setActiveStyleId(cat.id)
    if (cat.subcategories.length > 0) {
      setActiveSkuId(cat.subcategories[0].id)
    } else {
      setActiveSkuId(null)
    }
  }

  const handleSkuClick = (sub: Subcategory, catId: number) => {
    setActiveStyleId(catId)
    setActiveSkuId(sub.id)
  }

  const toggleStyleSelectAll = (styleId: number) => {
    const ids = collectFilteredIdsForStyle(
      filteredCategories,
      styleId,
      selectedMetal,
      weightLow,
      weightHigh,
      priceLow,
      priceHigh,
      rates,
      discountTier,
    )
    if (ids.length === 0) return
    const allOn = ids.every((id) => selectedProductIds.includes(id))
    if (allOn) removeProductIds(ids)
    else addProductIds(ids)
  }

  const toggleSkuSelectAll = (styleId: number, skuId: number) => {
    const ids = collectFilteredIdsForSku(
      filteredCategories,
      styleId,
      skuId,
      selectedMetal,
      weightLow,
      weightHigh,
      priceLow,
      priceHigh,
      rates,
      discountTier,
    )
    if (ids.length === 0) return
    const allOn = ids.every((id) => selectedProductIds.includes(id))
    if (allOn) removeProductIds(ids)
    else addProductIds(ids)
  }

  const breadcrumb = [activeStyle?.name, activeSku?.name]
    .filter(Boolean)
    .join(' \u203A ')

  /** Canonical path /catalog/{metal}/{category_slug}/{subcategory_slug} */
  useEffect(() => {
    if (!catalogHydrated || !pathname.startsWith(CATALOG_PATH)) return
    if (filteredCategories.length === 0) return
    const style = filteredCategories.find((c) => c.id === activeStyleId)
    const sub = style?.subcategories.find((s) => s.id === activeSkuId)
    if (!style?.slug || !sub?.slug) return
    const nextPath = buildCatalogSegmentPath(selectedMetal, style.slug, sub.slug)
    if (pathname !== nextPath) {
      router.replace(nextPath, { scroll: false })
    }
  }, [
    catalogHydrated,
    activeStyleId,
    activeSkuId,
    selectedMetal,
    filteredCategories,
    pathname,
    router,
  ])

  const catalogShareText = useMemo(() => {
    const shareUrl = buildCatalogShareUrl({
      style: activeStyle?.slug,
      sku: activeSku?.slug,
      metal: selectedMetal,
    })
    return catalogShareMessage({
      styleName: activeStyle?.name,
      skuName: activeSku?.name,
      metalLabel: METAL_TABS.find((t) => t.key === selectedMetal)?.label,
      itemCount: products.length,
      url: shareUrl,
    })
  }, [activeStyle, activeSku, selectedMetal, products.length])

  if (isBootstrapping) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100">
        <div className="max-w-[1400px] mx-auto px-4 py-6 pb-28">
          <div className="flex justify-center mb-4">
            <div className="h-12 w-full max-w-xl rounded-xl bg-slate-900/80 border border-slate-800 animate-pulse" />
          </div>
          <div className="flex gap-6">
            <aside className="hidden lg:block w-64 shrink-0 space-y-4">
              <div className="min-h-[280px] rounded-xl bg-slate-900/50 border border-slate-800 p-4 space-y-3">
                <div className="h-4 w-20 bg-slate-800 rounded animate-pulse" />
                <div className="h-10 bg-slate-800/80 rounded-lg animate-pulse" />
                <div className="h-10 bg-slate-800/80 rounded-lg animate-pulse" />
              </div>
              <div className="min-h-[200px] rounded-xl border border-slate-800/60 p-2 space-y-2">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="h-9 bg-slate-800/50 rounded-lg animate-pulse" />
                ))}
              </div>
            </aside>
            <div className="flex-1 grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <div
                  key={i}
                  className="rounded-xl border border-slate-800 overflow-hidden bg-slate-900/40"
                >
                  <div className="aspect-[4/5] bg-slate-800/60 animate-pulse" />
                  <div className="p-3 space-y-2">
                    <div className="h-3 bg-slate-800 rounded animate-pulse" />
                    <div className="h-4 w-2/3 bg-slate-800 rounded animate-pulse" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (categories.length === 0) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100">
        <main className="max-w-5xl mx-auto px-4 py-16 text-center">
          <LayoutGrid className="size-16 text-slate-700 mx-auto mb-4" />
          <p className="text-slate-400 text-lg">No catalogues published yet</p>
          <p className="text-slate-500 text-sm mt-1">
            Admin can sync from ERP and publish catalogues from the dashboard.
          </p>
        </main>
      </div>
    )
  }


  const PULL_THRESHOLD = 80

  return (
    <div
      className="min-h-screen bg-slate-950 text-slate-100"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {pullY > 0 && (
        <div
          className="absolute top-0 left-0 right-0 w-full text-center text-slate-400 transition-all z-50 py-3 text-xs safe-area-pt bg-slate-950"
          style={{ opacity: Math.min(pullY / PULL_THRESHOLD, 1) * 0.9 }}
        >
          {pullY >= PULL_THRESHOLD ? 'Release to refresh' : 'Pull to refresh'}
        </div>
      )}
      {showRefreshing && (
        <div className="absolute top-0 left-0 right-0 w-full text-center transition-all z-50 py-3 text-sm text-amber-500 bg-slate-900/90 backdrop-blur safe-area-pt">
          Refreshing…
        </div>
      )}
      <main
        className={`max-w-[1400px] mx-auto px-4 py-6 ${
          catalogBuilderMode && selectedProductIds.length > 0 ? 'pb-40 sm:pb-36' : 'pb-28'
        }`}
      >
        {/* Metal Type Tabs — touch-friendly; labels must not truncate (was blocking Diamond taps on narrow screens). */}
        <div className="flex justify-center mb-4 px-1">
          <div className="inline-flex w-full max-w-xl sm:max-w-none sm:w-auto p-1 rounded-xl bg-slate-900/80 border border-slate-800 shadow-lg">
            {METAL_TABS.map(({ key, label, icon: Icon }) => {
              const isActive = selectedMetal === key
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setSelectedMetal(key)}
                  className={`relative z-10 flex-1 sm:flex-initial flex flex-col sm:flex-row items-center justify-center gap-0.5 sm:gap-2 px-2 sm:px-5 py-2.5 sm:py-2.5 rounded-lg text-xs sm:text-sm font-semibold transition-all duration-200 whitespace-nowrap ${
                    isActive
                      ? 'bg-amber-500 text-slate-950 shadow-md ring-2 ring-amber-400/30'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50 active:bg-slate-800'
                  }`}
                >
                  <Icon className="size-4 shrink-0" aria-hidden />
                  <span>{label}</span>
                </button>
              )
            })}
          </div>
        </div>

        {isAdmin && (
          <div className="flex justify-center mb-4 px-1">
            <div className="flex w-full max-w-xl items-center justify-between gap-3 rounded-xl border border-slate-800/90 bg-slate-900/35 px-3 py-2 shadow-inner sm:justify-center sm:gap-6">
              <span className="text-xs font-medium text-slate-400 sm:text-sm">Catalog Builder</span>
              <button
                type="button"
                role="switch"
                aria-checked={catalogBuilderMode}
                onClick={() => setCatalogBuilderMode(!catalogBuilderMode)}
                className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer rounded-full border transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/60 ${
                  catalogBuilderMode
                    ? 'border-amber-400/50 bg-amber-500'
                    : 'border-slate-600 bg-slate-800'
                }`}
              >
                <span
                  className={`pointer-events-none absolute top-0.5 left-0.5 size-6 rounded-full bg-white shadow-md ring-1 ring-black/5 transition-transform ${
                    catalogBuilderMode ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>
          </div>
        )}

        {/* Contact = business chat; Share = wa.me/?text= catalogue link (distinct icons) */}
        <div className="flex items-center justify-between gap-2 mb-4">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <LayoutGrid className="size-5 shrink-0 text-amber-500" />
            <h1 className="truncate text-base font-semibold text-slate-200 sm:text-lg">
              Catalogue
            </h1>
          </div>
          {activeStyle && (
            <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
              <WhatsAppContactLink />
              <WhatsAppShareButton
                message={catalogShareText}
                label="Share"
                compact
                variant="whatsapp"
              />
            </div>
          )}
        </div>

        {/* ── Mobile: horizontal chips ── */}
        <div className="lg:hidden space-y-3 mb-5">
          {/* Style chips */}
          <div className="flex flex-col gap-1.5">
            {catalogBuilderMode && isAdmin && (
              <div className="flex items-center justify-between px-0.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                <span>Style</span>
                <span className="text-slate-600">Select</span>
              </div>
            )}
            <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
              {filteredCategories.length === 0 ? (
                <p className="text-slate-500 text-sm py-2">No {METAL_TABS.find((t) => t.key === selectedMetal)?.label ?? selectedMetal} styles</p>
              ) : filteredCategories.map((cat) => {
                const styleScopeIds = collectFilteredIdsForStyle(
                  filteredCategories,
                  cat.id,
                  selectedMetal,
                  weightLow,
                  weightHigh,
                  priceLow,
                  priceHigh,
                  rates,
                  discountTier,
                )
                const sn = styleScopeIds.filter((id) => selectedProductIds.includes(id)).length
                const allStyle = styleScopeIds.length > 0 && sn === styleScopeIds.length
                const someStyle = sn > 0 && sn < styleScopeIds.length
                return (
                  <div key={cat.id} className="flex shrink-0 items-center gap-1.5">
                    {catalogBuilderMode && isAdmin && (
                      <BulkSelectCheckbox
                        allSelected={allStyle}
                        someSelected={someStyle}
                        onToggle={() => toggleStyleSelectAll(cat.id)}
                        ariaLabel={`Select all filtered items in style ${cat.name}`}
                      />
                    )}
                    <button
                      type="button"
                      onClick={() => handleStyleClick(cat)}
                      className={`shrink-0 px-4 py-2 rounded-full text-sm font-semibold transition-colors ${
                        activeStyleId === cat.id
                          ? 'bg-amber-500 text-slate-950'
                          : 'bg-slate-800 text-slate-300 border border-slate-700'
                      }`}
                    >
                      {cat.name}
                    </button>
                  </div>
                )
              })}
            </div>
          </div>

          {/* SKU pills */}
          {activeStyle && activeStyle.subcategories.length > 0 && (
            <div className="flex flex-col gap-1.5">
              {catalogBuilderMode && isAdmin && (
                <div className="flex items-center justify-between px-0.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                  <span>SKU</span>
                  <span className="text-slate-600">Select</span>
                </div>
              )}
              <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
                {activeStyle.subcategories.map((sub) => {
                  const skuScopeIds = collectFilteredIdsForSku(
                    filteredCategories,
                    activeStyle.id,
                    sub.id,
                    selectedMetal,
                    weightLow,
                    weightHigh,
                    priceLow,
                    priceHigh,
                    rates,
                    discountTier,
                  )
                  const kn = skuScopeIds.filter((id) => selectedProductIds.includes(id)).length
                  const allSku = skuScopeIds.length > 0 && kn === skuScopeIds.length
                  const someSku = kn > 0 && kn < skuScopeIds.length
                  return (
                    <div key={sub.id} className="flex shrink-0 items-center gap-1.5">
                      {catalogBuilderMode && isAdmin && (
                        <BulkSelectCheckbox
                          allSelected={allSku}
                          someSelected={someSku}
                          onToggle={() => toggleSkuSelectAll(activeStyle.id, sub.id)}
                          ariaLabel={`Select all filtered items in SKU ${sub.name}`}
                        />
                      )}
                      <button
                        type="button"
                        onClick={() => handleSkuClick(sub, activeStyle.id)}
                        className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                          activeSkuId === sub.id
                            ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40'
                            : 'bg-slate-800/60 text-slate-400 border border-slate-700/60'
                        }`}
                      >
                        {sub.name}
                        <span className="ml-1 opacity-60">{sub.products.length}</span>
                      </button>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>

        <div className="flex gap-6">
          {/* ── Desktop sidebar (25 %) ── */}
          <aside className="hidden lg:block w-64 shrink-0 lg:min-h-[min(100vh,920px)]">
            {/* Filters — min height reduces layout jump when collection changes */}
            <div className="mb-6 p-4 rounded-xl bg-slate-900/50 border border-slate-800 space-y-5 min-h-[260px]">
              <h3 className="text-sm font-semibold text-slate-300 uppercase tracking-wider">Filters</h3>
              <DualRangeSlider
                min={weightBounds[0]}
                max={weightBounds[1]}
                low={weightLow}
                high={weightHigh}
                onLowChange={setWeightLow}
                onHighChange={setWeightHigh}
                step={0.5}
                label="Weight (gm)"
                formatValue={(v) => `${v} gm`}
              />
              <DualRangeSlider
                min={priceBounds[0]}
                max={priceBounds[1]}
                low={priceLow}
                high={priceHigh}
                onLowChange={setPriceLow}
                onHighChange={setPriceHigh}
                step={500}
                label="Price (₹)"
                formatValue={(v) => `₹${(v / 1000).toFixed(0)}k`}
              />
              {hasActiveFilters && (
                <button
                  onClick={() => {
                    setWeightLow(weightBounds[0])
                    setWeightHigh(weightBounds[1])
                    setPriceLow(priceBounds[0])
                    setPriceHigh(priceBounds[1])
                  }}
                  className="w-full py-1.5 text-xs text-amber-500 hover:text-amber-400 transition-colors"
                >
                  Clear filters
                </button>
              )}
            </div>
            <nav className="sticky top-24 space-y-1 max-h-[calc(100vh-8rem)] min-h-[12rem] overflow-y-auto pr-2 scrollbar-hide">
              {catalogBuilderMode && isAdmin && (
                <div className="flex items-center justify-between gap-2 px-2 pb-2 mb-1 border-b border-slate-800/60">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                    Style
                  </span>
                  <span className="text-[10px] font-medium uppercase text-slate-600">Select</span>
                </div>
              )}
              {filteredCategories.length === 0 ? (
                <p className="text-slate-500 text-sm px-2 py-4">
                  No {METAL_TABS.find((t) => t.key === selectedMetal)?.label ?? selectedMetal} styles
                </p>
              ) : (
                filteredCategories.map((cat) => {
                  const isExpanded = activeStyleId === cat.id
                  const isActive = activeStyleId === cat.id
                  const styleScopeIds = collectFilteredIdsForStyle(
                    filteredCategories,
                    cat.id,
                    selectedMetal,
                    weightLow,
                    weightHigh,
                    priceLow,
                    priceHigh,
                    rates,
                    discountTier,
                  )
                  const sn = styleScopeIds.filter((id) => selectedProductIds.includes(id)).length
                  const allStyle = styleScopeIds.length > 0 && sn === styleScopeIds.length
                  const someStyle = sn > 0 && sn < styleScopeIds.length
                  return (
                    <div key={cat.id}>
                      <div
                        className={`flex w-full items-center gap-1.5 rounded-lg px-1 py-0.5 ${
                          isActive ? 'bg-slate-800/50' : ''
                        }`}
                      >
                        {catalogBuilderMode && isAdmin && (
                          <BulkSelectCheckbox
                            allSelected={allStyle}
                            someSelected={someStyle}
                            onToggle={() => toggleStyleSelectAll(cat.id)}
                            ariaLabel={`Select all filtered items in style ${cat.name}`}
                          />
                        )}
                        <button
                          type="button"
                          onClick={() => handleStyleClick(cat)}
                          className={`flex min-w-0 flex-1 items-center justify-between gap-2 px-2 py-2 rounded-lg text-left transition-colors ${
                            isActive
                              ? 'text-amber-400'
                              : 'text-slate-300 hover:bg-slate-800/40'
                          }`}
                        >
                          <span className="font-semibold text-sm tracking-wide uppercase truncate">
                            {cat.name}
                          </span>
                          {isExpanded ? (
                            <ChevronDown className="size-4 shrink-0 text-slate-500" />
                          ) : (
                            <ChevronRight className="size-4 shrink-0 text-slate-500" />
                          )}
                        </button>
                      </div>

                      {isExpanded && cat.subcategories.length > 0 && (
                        <>
                          {catalogBuilderMode && isAdmin && (
                            <div className="ml-3 mt-1 flex items-center justify-between pl-3 border-l border-slate-800">
                              <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-600">
                                SKU
                              </span>
                              <span className="text-[10px] font-medium uppercase text-slate-600 pr-1">
                                Select
                              </span>
                            </div>
                          )}
                          <div className="ml-3 mt-0.5 mb-1 space-y-0.5 border-l border-slate-800 pl-3">
                            {cat.subcategories.map((sub) => {
                              const isSubActive = activeSkuId === sub.id
                              const skuScopeIds = collectFilteredIdsForSku(
                                filteredCategories,
                                cat.id,
                                sub.id,
                                selectedMetal,
                                weightLow,
                                weightHigh,
                                priceLow,
                                priceHigh,
                                rates,
                                discountTier,
                              )
                              const kn = skuScopeIds.filter((id) =>
                                selectedProductIds.includes(id),
                              ).length
                              const allSku = skuScopeIds.length > 0 && kn === skuScopeIds.length
                              const someSku = kn > 0 && kn < skuScopeIds.length
                              return (
                                <div
                                  key={sub.id}
                                  className={`flex w-full items-center gap-1.5 rounded-md px-0.5 py-0.5 ${
                                    isSubActive ? 'bg-amber-500/5' : ''
                                  }`}
                                >
                                  {catalogBuilderMode && isAdmin && (
                                    <BulkSelectCheckbox
                                      allSelected={allSku}
                                      someSelected={someSku}
                                      onToggle={() => toggleSkuSelectAll(cat.id, sub.id)}
                                      ariaLabel={`Select all filtered items in SKU ${sub.name}`}
                                    />
                                  )}
                                  <button
                                    type="button"
                                    onClick={() => handleSkuClick(sub, cat.id)}
                                    className={`min-w-0 flex-1 text-left px-2 py-1.5 rounded-md text-sm transition-colors ${
                                      isSubActive
                                        ? 'bg-amber-500/10 text-amber-400 font-medium'
                                        : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/30'
                                    }`}
                                  >
                                    {sub.name}
                                    <span className="ml-1.5 text-xs opacity-50">
                                      {sub.products.length}
                                    </span>
                                  </button>
                                </div>
                              )
                            })}
                          </div>
                        </>
                      )}
                    </div>
                  )
                })
              )}
            </nav>
          </aside>

          {/* ── Right: product grid (75 %) ── */}
          <section
            ref={productGridSectionRef}
            id="catalog-product-grid"
            className="flex-1 min-w-0 scroll-mt-12 md:scroll-mt-14"
          >
            {/* Mobile filters */}
            <div className="lg:hidden mb-4 p-4 rounded-xl bg-slate-900/50 border border-slate-800 space-y-4">
              <DualRangeSlider
                min={weightBounds[0]}
                max={weightBounds[1]}
                low={weightLow}
                high={weightHigh}
                onLowChange={setWeightLow}
                onHighChange={setWeightHigh}
                step={0.5}
                label="Weight (gm)"
                formatValue={(v) => `${v} gm`}
              />
              <DualRangeSlider
                min={priceBounds[0]}
                max={priceBounds[1]}
                low={priceLow}
                high={priceHigh}
                onLowChange={setPriceLow}
                onHighChange={setPriceHigh}
                step={500}
                label="Price (₹)"
                formatValue={(v) => `₹${(v / 1000).toFixed(0)}k`}
              />
              {hasActiveFilters && (
                <button
                  onClick={() => {
                    setWeightLow(weightBounds[0])
                    setWeightHigh(weightBounds[1])
                    setPriceLow(priceBounds[0])
                    setPriceHigh(priceBounds[1])
                  }}
                  className="text-xs text-amber-500 hover:text-amber-400"
                >
                  Clear filters
                </button>
              )}
            </div>
            {/* Breadcrumb + count */}
            <div className="flex items-center justify-between mb-4 gap-4">
              <p className="text-sm text-slate-400 truncate">
                {breadcrumb || 'Select a collection'}
              </p>
              {products.length > 0 && (
                <span className="text-xs text-slate-500 tabular-nums whitespace-nowrap">
                  {products.length} item{products.length !== 1 ? 's' : ''}
                </span>
              )}
            </div>

            {products.length === 0 ? (
              <div className="rounded-xl bg-slate-900/50 border border-slate-800 p-16 text-center">
                <p className="text-slate-500">
                  {filteredCategories.length === 0
                    ? `No ${METAL_TABS.find((t) => t.key === selectedMetal)?.label ?? selectedMetal} products in the catalogue`
                    : 'No products in this collection'}
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4 gap-4 md:gap-6">
                {products.map((p, i) => {
                  const selectionKey = getProductSelectionKey(p as Product)
                  return (
                    <ProductCard
                      key={p.barcode || p.id || p.sku}
                      product={
                        {
                          ...p,
                          style_code: activeStyle?.name,
                        } as Product
                      }
                      rates={rates}
                      priority={i < 16}
                      subcategorySlug={activeSku?.slug}
                      onBeforeNavigate={(barcode) => saveCatalogState(barcode)}
                      catalogBuilderActive={catalogBuilderMode && isAdmin}
                      selected={selectionKey ? isProductSelected(selectionKey) : false}
                      onToggleSelect={
                        selectionKey ? () => toggleProductId(selectionKey) : undefined
                      }
                    />
                  )
                })}
              </div>
            )}
          </section>
        </div>
      </main>
      <CatalogSelectionFab onGenerateClick={() => setWhatsappModalOpen(true)} />
      <WhatsAppCatalogModal
        open={whatsappModalOpen}
        onClose={() => setWhatsappModalOpen(false)}
      />
    </div>
  )
}

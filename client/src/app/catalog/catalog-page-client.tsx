'use client'

import { useEffect, useLayoutEffect, useState, useMemo, useCallback, useRef } from 'react'
import { flushSync } from 'react-dom'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import ProductCard from '@/components/ProductCard'
import WhatsAppShareButton from '@/components/WhatsAppShareButton'
import WhatsAppContactLink from '@/components/WhatsAppContactLink'
import {
  LayoutGrid,
  ChevronRight,
  ChevronLeft,
  ChevronDown,
  SlidersHorizontal,
} from 'lucide-react'
import {
  MetalTabFavicon,
  type MetalTabFaviconKey,
} from '@/components/icons/metal-tab-icons'
import DualRangeSlider from '@/components/DualRangeSlider'
import { calculateBreakdown, isFixedPriceCatalogItem, type Item } from '@/lib/pricing'
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
import { useCustomerTier } from '@/context/CustomerTierContext'
import { useResellerBranding } from '@/context/ResellerBrandingContext'
import { useCatalogBuilder } from '@/context/CatalogBuilderContext'
import { CUSTOMER_TIER, type WholesaleUserFields } from '@/lib/customer-tier'
import { resolveCatalogShareBrand, resolveCatalogShareOrigin } from '@/lib/catalog-share'
import { isCatalogAdminUser } from '@/lib/is-catalog-admin'
import CatalogSelectionFab from '@/components/catalog/CatalogSelectionFab'
import WhatsAppCatalogModal from '@/components/catalog/WhatsAppCatalogModal'
import {
  productMatchesMetal,
  productPassesCatalogFilters,
  getProductSelectionKey,
} from '@/lib/catalog-product-filters'
import { mergeDesignGroupOrder } from '@/lib/design-group-order'
import {
  CATALOG_SHOP_FOR_TABS,
  catalogProductTypeLabel,
  catalogPathWithRetailQuery,
  clampCatalogRetailFilters,
  collectAvailableProductTypes,
  filterCatalogTreeByRetail,
  isCatalogMetalKey,
  parseCatalogRetailSearchParams,
  resolveRetailCatalogSelection,
  isSelectionValidInRetailTree,
  type CatalogProductType,
  type CatalogShopFor,
} from '@/lib/catalog-retail-tags'

type Product = Item

type Subcategory = {
  id: number
  name: string
  slug: string
  design_group_order?: string[] | null
  audience?: string | null
  product_type?: string | null
  products: Product[]
}

type Category = {
  id: number
  name: string
  slug: string
  image_url?: string
  subcategories: Subcategory[]
}

/** Initial product cards before "Show more" — keeps long grids smooth on mobile. */
const CATALOG_PRODUCTS_PAGE_SIZE = 36

/** Metal types for catalog navigation — values match backend metal_type (lowercase) */
const METAL_TABS = [
  { key: 'gold', label: 'Gold' },
  { key: 'silver', label: 'Silver' },
  { key: 'diamond', label: 'Diamond' },
  { key: 'gifting', label: 'Gifting' },
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
  wholesale: import('@/lib/pricing').WholesalePricingInput | null,
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
          wholesale,
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
  wholesale: import('@/lib/pricing').WholesalePricingInput | null,
  /** When set, only products with this `design_group` (same as grid chips) — must match active SKU row only. */
  restrictDesignGroup?: string,
): string[] {
  const cat = filteredCategories.find((c) => c.id === styleId)
  if (!cat) return []
  const sub = cat.subcategories.find((s) => s.id === skuId)
  if (!sub) return []
  const out: string[] = []
  const dg = restrictDesignGroup ? String(restrictDesignGroup).trim() : ''
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
        wholesale,
      )
    ) {
      if (dg) {
        const g = String((p as { design_group?: string | null }).design_group ?? '').trim()
        if (g !== dg) continue
      }
      const k = getProductSelectionKey(p)
      if (k) out.push(k)
    }
  }
  return [...new Set(out)]
}

/**
 * SKU bulk-select must match what the grid shows: when a design-group chip is active for the
 * current subcategory, narrow bulk scope to that group only (fixes “header checked, cards empty”).
 */
function skuBulkDesignGroupForRow(
  skuId: number,
  activeSkuId: number | null,
  hasDesignGroupFilter: boolean,
  activeDesignGroup: 'all' | string,
): string | undefined {
  if (!hasDesignGroupFilter || activeDesignGroup === 'all') return undefined
  if (skuId !== activeSkuId) return undefined
  return activeDesignGroup
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
    <span className="inline-flex size-11 shrink-0 touch-manipulation items-center justify-center sm:size-8">
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
        className="size-5 shrink-0 cursor-pointer rounded border-slate-600 bg-slate-900 accent-amber-500 sm:size-4"
      />
    </span>
  )
}

function metalKeyFromCatalogPathname(pathname: string): MetalKey | null {
  if (!pathname.startsWith(CATALOG_PATH + '/') && pathname !== CATALOG_PATH) return null
  const rest =
    pathname === CATALOG_PATH
      ? ''
      : pathname.slice(CATALOG_PATH.length).replace(/^\//, '')
  if (!rest) return null
  const seg = rest.split('/').filter(Boolean)[0]?.toLowerCase()
  if (seg && isCatalogMetalKey(seg)) return seg
  return null
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

/**
 * URL segment may be a shorthand (e.g. `pitara-bangle`) while DB slug is suffixed (`pitara-bangle-37`).
 * Only allow prefix extension when the path segment looks like a full slug (contains a hyphen).
 */
function subSlugMatchesPathSegment(subSlug: string, pathSkuSegment: string): boolean {
  const s = (subSlug || '').toLowerCase()
  const w = (pathSkuSegment || '').toLowerCase().trim()
  if (!w) return false
  if (s === w) return true
  if (w.includes('-') && s.startsWith(`${w}-`)) return true
  return false
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
  const sub = cat.subcategories.find((s) => subSlugMatchesPathSegment(s.slug || '', parsed.skuSlug))
  return !!sub && sub.id === activeSkuId
}

export default function CatalogPageClient() {
  const pathname = usePathname()
  const router = useRouter()
  const searchParams = useSearchParams()
  const urlShopForParam = searchParams.get('shop_for')
  const urlProductTypeParam = searchParams.get('product_type')
  const { categories, rates, isBootstrapping, refresh, isRefreshing: contextRefreshing, retailBrowseEnabled } =
    useCatalogData()
  const auth = useAuth()
  const { wholesalePricing, customerTier } = useCustomerTier()
  const { active: resellerBrandingActive, businessName: resellerBrandName } = useResellerBranding()
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
  const canUseCatalogBuilder =
    auth.isAuthenticated === true &&
    (isCatalogAdminUser(auth.user) || customerTier === CUSTOMER_TIER.RESELLER)
  /** Resellers order by collection (PITARA, UTSAV); retail shop-for is B2C only. */
  const showRetailBrowse =
    retailBrowseEnabled && customerTier !== CUSTOMER_TIER.RESELLER
  const [whatsappModalOpen, setWhatsappModalOpen] = useState(false)

  const [selectedMetal, setSelectedMetal] = useState<MetalKey>('gold')

  const [activeStyleId, setActiveStyleId] = useState<number | null>(null)
  const [activeSkuId, setActiveSkuId] = useState<number | null>(null)
  /** When true, desktop sidebar (and mobile SKU row) hide subcategories for the active style — chevron toggles this. */
  const [styleNavSubmenuCollapsed, setStyleNavSubmenuCollapsed] = useState(false)
  const [weightLow, setWeightLow] = useState(0)
  const [weightHigh, setWeightHigh] = useState(100)
  const [priceLow, setPriceLow] = useState(0)
  const [priceHigh, setPriceHigh] = useState(100000)
  const [activeDesignGroup, setActiveDesignGroup] = useState<'all' | string>('all')
  const [gridShowCount, setGridShowCount] = useState(CATALOG_PRODUCTS_PAGE_SIZE)
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false)
  const [retailBrowseOpen, setRetailBrowseOpen] = useState(false)
  const hasRestoredFromStorage = useRef(false)
  const skipNextBoundsSync = useRef(false)
  const [scrollToBarcode, setScrollToBarcode] = useState<string | null>(null)
  /** Retail browse: Women / Men / Kids — only when admin enables + not B2B reseller view. */
  const [selectedShopFor, setSelectedShopFor] = useState<CatalogShopFor>('all')
  const [selectedProductType, setSelectedProductType] = useState<CatalogProductType | 'all'>('all')
  /** True when shop-for / product-type pills were clicked — prefer state over URL for that sync pass. */
  const retailFiltersFromUiRef = useRef(false)
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

  useEffect(() => {
    setStyleNavSubmenuCollapsed(false)
  }, [pathname, selectedMetal])

  const applyPathSegments = useCallback((parsed: ParsedCatalogPath, cats: Category[]) => {
    const metalParam = parsed.metal
    if (isCatalogMetalKey(metalParam)) {
      setSelectedMetal(metalParam)
    }
    const styleSlug = parsed.styleSlug.toLowerCase()
    const skuSlug = parsed.skuSlug.toLowerCase()
    const cat = cats.find((c) => (c.slug || '').toLowerCase() === styleSlug)
    if (cat) {
      setActiveStyleId(cat.id)
      const sub = cat.subcategories.find((s) => subSlugMatchesPathSegment(s.slug || '', skuSlug))
      if (sub) setActiveSkuId(sub.id)
      else if (cat.subcategories[0]) setActiveSkuId(cat.subcategories[0].id)
    } else {
      for (const c of cats) {
        const sub = c.subcategories.find((s) => subSlugMatchesPathSegment(s.slug || '', skuSlug))
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
      if (isCatalogMetalKey(metalParam)) {
        setSelectedMetal(metalParam)
      }
      const { shopFor, productType } = parseCatalogRetailSearchParams(u)
      setSelectedShopFor(shopFor)
      setSelectedProductType(productType)
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

      // Deep-linked path always wins over session snapshot (avoids URL vs grid mismatch / replace loops).
      if (pathFromUrl) {
        if (stored) sessionStorage.removeItem(CATALOG_STATE_KEY)
        sessionStorage.removeItem(CATALOG_FROM_PRODUCT_KEY)
        applyPathSegments(pathFromUrl, cats)
      } else if (stored && fromProduct) {
        const parsed = JSON.parse(stored) as CatalogSessionState
        applyParsedSession(parsed)
        sessionStorage.removeItem(CATALOG_STATE_KEY)
        sessionStorage.removeItem(CATALOG_FROM_PRODUCT_KEY)
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
      const { shopFor, productType } = parseCatalogRetailSearchParams(window.location.search)
      setSelectedShopFor(shopFor)
      setSelectedProductType(productType)
      const scrollTarget = sessionStorage.getItem(CATALOG_SCROLL_TO_KEY)
      if (scrollTarget) {
        setScrollToBarcode(scrollTarget)
        sessionStorage.removeItem(CATALOG_SCROLL_TO_KEY)
      }
    }
  }, [categories, applyPathSegments, pathname])

  const prevPathnameRef = useRef<string | null>(null)
  /** Skip canonical `router.replace` once: the next layout effect can run with stale closures right after `flushSync` from pathname sync (search / SmartSearch). */
  const suppressCanonicalAfterPathSyncRef = useRef(false)
  const retailSyncCtxRef = useRef({
    showRetailBrowse: false,
    filteredCategories: [] as Category[],
    selectedShopFor: 'all' as CatalogShopFor,
    selectedProductType: 'all' as CatalogProductType | 'all',
  })

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

  /** Smart default: when catalog first loads, if default metal has no products, switch to first available */
  useEffect(() => {
    if (categories.length === 0 || !catalogHydrated) return
    const first = firstAvailableMetal(categories)
    setSelectedMetal((prev) => {
      const hasCurrent = categories.some((c) =>
        c.subcategories.some((s) =>
          s.products.some((p) => productMatchesMetal(p, prev)),
        ),
      )
      return hasCurrent ? prev : first
    })
  }, [categories, catalogHydrated])

  /** Filter categories/subcategories/products by selected metal type */
  const metalFilteredCategories = useMemo(() => {
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

  /** Apply Shop for + product type when admin enables retail browse. */
  const filteredCategories = useMemo(() => {
    if (
      !showRetailBrowse ||
      (selectedShopFor === 'all' && selectedProductType === 'all')
    ) {
      return metalFilteredCategories
    }
    return filterCatalogTreeByRetail(
      metalFilteredCategories,
      selectedShopFor,
      selectedProductType,
    )
  }, [
    metalFilteredCategories,
    showRetailBrowse,
    selectedShopFor,
    selectedProductType,
  ])

  /** User tapped a metal tab — update selection + URL (must not be overwritten by path metal). */
  const handleMetalTabClick = useCallback(
    (key: MetalKey) => {
      if (key === selectedMetal) return
      setSelectedMetal(key)
      setActiveDesignGroup('all')
      setStyleNavSubmenuCollapsed(false)

      let tree = categories
        .map((cat) => ({
          ...cat,
          subcategories: cat.subcategories
            .map((sub) => ({
              ...sub,
              products: sub.products.filter((p) => productMatchesMetal(p, key)),
            }))
            .filter((sub) => sub.products.length > 0),
        }))
        .filter((cat) => cat.subcategories.length > 0)

      if (
        showRetailBrowse &&
        (selectedShopFor !== 'all' || selectedProductType !== 'all')
      ) {
        tree = filterCatalogTreeByRetail(tree, selectedShopFor, selectedProductType)
      }

      if (tree.length > 0) {
        setActiveStyleId(tree[0].id)
        setActiveSkuId(tree[0].subcategories[0]?.id ?? null)
      } else {
        setActiveStyleId(null)
        setActiveSkuId(null)
      }
    },
    [
      selectedMetal,
      categories,
      showRetailBrowse,
      selectedShopFor,
      selectedProductType,
    ],
  )

  retailSyncCtxRef.current = {
    showRetailBrowse,
    filteredCategories,
    selectedShopFor,
    selectedProductType,
  }

  /**
   * Pathname → selection sync. When retail filters are on, ignore paths outside the
   * filtered tree (URL may still say utsav-necklace while Women + Bangle is selected).
   */
  useLayoutEffect(() => {
    if (categories.length === 0 || !hasRestoredFromStorage.current) return
    if (prevPathnameRef.current === null) {
      prevPathnameRef.current = pathname
      return
    }
    if (prevPathnameRef.current === pathname) return
    prevPathnameRef.current = pathname
    const pathFromUrl = pathSegmentsFromPathname(pathname)
    if (!pathFromUrl) return

    const {
      showRetailBrowse: retailOn,
      filteredCategories: tree,
      selectedShopFor: shopFor,
      selectedProductType: productType,
    } = retailSyncCtxRef.current
    const retailActive =
      retailOn && (shopFor !== 'all' || productType !== 'all')

    if (retailActive) {
      const cat = tree.find(
        (c) => (c.slug || '').toLowerCase() === pathFromUrl.styleSlug.toLowerCase(),
      )
      const sub = cat?.subcategories.find((s) =>
        subSlugMatchesPathSegment(s.slug || '', pathFromUrl.skuSlug),
      )
      if (!cat || !sub) return
    }

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
    suppressCanonicalAfterPathSyncRef.current = true
    flushSync(() => {
      applyPathSegments(pathFromUrl, categories)
    })
  }, [pathname, categories, applyPathSegments])

  const availableProductTypes = useMemo(() => {
    if (!showRetailBrowse || selectedShopFor === 'all') return []
    return collectAvailableProductTypes(metalFilteredCategories, selectedShopFor)
  }, [metalFilteredCategories, showRetailBrowse, selectedShopFor])

  /** Reset retail filters when admin disables browse or user is B2B reseller. */
  useEffect(() => {
    if (!showRetailBrowse) {
      setSelectedShopFor('all')
      setSelectedProductType('all')
    }
  }, [showRetailBrowse])

  /** Drop product-type chip when it no longer applies (UI shop-for change — URL sync handles deep links). */
  useEffect(() => {
    if (!catalogHydrated || selectedProductType === 'all') return
    if (!showRetailBrowse || selectedShopFor === 'all') return
    const clamped = clampCatalogRetailFilters(
      metalFilteredCategories,
      selectedShopFor,
      selectedProductType,
    )
    if (clamped.productType !== selectedProductType) {
      setSelectedProductType(clamped.productType)
    }
  }, [
    catalogHydrated,
    showRetailBrowse,
    selectedShopFor,
    selectedProductType,
    metalFilteredCategories,
  ])

  const activeStyle = useMemo(
    () => filteredCategories.find((c) => c.id === activeStyleId) ?? null,
    [filteredCategories, activeStyleId],
  )

  const activeSku = useMemo(
    () => activeStyle?.subcategories.find((s) => s.id === activeSkuId) ?? null,
    [activeStyle, activeSkuId],
  )

  const rawProducts = activeSku?.products ?? []
  const savedDgOrderKey = useMemo(
    () => JSON.stringify(activeSku?.design_group_order ?? null),
    [activeSku?.design_group_order],
  )
  const designGroups = useMemo(() => {
    const seen = new Set<string>()
    for (const p of rawProducts) {
      const group = String((p as { design_group?: string | null }).design_group ?? '').trim()
      if (group) seen.add(group)
    }
    const discovered = [...seen]
    return mergeDesignGroupOrder(activeSku?.design_group_order, discovered)
  }, [rawProducts, activeSku?.id, savedDgOrderKey])
  const hasDesignGroupFilter = designGroups.length > 0

  useEffect(() => {
    setGridShowCount(CATALOG_PRODUCTS_PAGE_SIZE)
  }, [
    activeSkuId,
    activeStyleId,
    activeDesignGroup,
    weightLow,
    weightHigh,
    priceLow,
    priceHigh,
    selectedMetal,
    selectedShopFor,
    selectedProductType,
  ])

  // Compute min/max from current products for slider bounds
  const { weightBounds, priceBounds } = useMemo(() => {
    if (rawProducts.length === 0) {
      return { weightBounds: [0, 100], priceBounds: [0, 100000] }
    }
    const weights = rawProducts.map((p) => p.net_weight ?? p.net_wt ?? p.weight ?? 0).filter((w) => w > 0)
    const prices = rawProducts.map((p) => {
      const b = calculateBreakdown(
        p,
        rates,
        (p as { gst_rate?: number }).gst_rate ?? 3,
        wholesalePricing,
      )
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
  }, [rawProducts, rates, wholesalePricing])

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

  const sliderFilteredProducts = useMemo(() => {
    let list = rawProducts
    const skipWeightFilter = selectedMetal === 'gifting'
    if (!skipWeightFilter) {
      list = list.filter((p) => {
        if (isFixedPriceCatalogItem(p)) return true
        const w = p.net_weight ?? p.net_wt ?? p.weight ?? 0
        return w >= weightLow && w <= weightHigh
      })
    }
    list = list.filter((p) => {
      const b = calculateBreakdown(
        p,
        rates,
        (p as { gst_rate?: number }).gst_rate ?? 3,
        wholesalePricing,
      )
      return b.total >= priceLow && b.total <= priceHigh
    })
    return list
  }, [rawProducts, weightLow, weightHigh, priceLow, priceHigh, rates, wholesalePricing, selectedMetal])

  const products = useMemo(() => {
    if (!hasDesignGroupFilter || activeDesignGroup === 'all') return sliderFilteredProducts
    return sliderFilteredProducts.filter((p) => {
      const group = String((p as { design_group?: string | null }).design_group ?? '').trim()
      return group === activeDesignGroup
    })
  }, [sliderFilteredProducts, hasDesignGroupFilter, activeDesignGroup])

  useEffect(() => {
    if (!hasDesignGroupFilter) {
      if (activeDesignGroup !== 'all') setActiveDesignGroup('all')
      return
    }
    if (activeDesignGroup === 'all') return
    if (!designGroups.includes(activeDesignGroup)) {
      setActiveDesignGroup('all')
    }
  }, [hasDesignGroupFilter, designGroups, activeDesignGroup])

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

  const designGroupStripRef = useRef<HTMLDivElement>(null)
  const designChipRefs = useRef<Map<string, HTMLButtonElement>>(new Map())

  const registerDesignChipRef = useCallback((key: string, el: HTMLButtonElement | null) => {
    if (el) designChipRefs.current.set(key, el)
    else designChipRefs.current.delete(key)
  }, [])

  useLayoutEffect(() => {
    if (!hasDesignGroupFilter) return
    const key = activeDesignGroup === 'all' ? '__all__' : activeDesignGroup
    const el = designChipRefs.current.get(key)
    el?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' })
  }, [activeDesignGroup, hasDesignGroupFilter, designGroups])

  const designGroupNavSequence = useMemo(() => ['all', ...designGroups], [designGroups])

  const goPrevDesignGroup = useCallback(() => {
    const seq = designGroupNavSequence
    const i = seq.indexOf(activeDesignGroup)
    const nextIdx = i <= 0 ? seq.length - 1 : i - 1
    setActiveDesignGroup(seq[nextIdx] as 'all' | string)
  }, [activeDesignGroup, designGroupNavSequence])

  const goNextDesignGroup = useCallback(() => {
    const seq = designGroupNavSequence
    const i = seq.indexOf(activeDesignGroup)
    const nextIdx = i < 0 ? 0 : (i + 1) % seq.length
    setActiveDesignGroup(seq[nextIdx] as 'all' | string)
  }, [activeDesignGroup, designGroupNavSequence])

  const scrollDesignStrip = useCallback((dir: -1 | 1) => {
    const el = designGroupStripRef.current
    if (!el) return
    const delta = Math.max(120, el.clientWidth * 0.72) * dir
    el.scrollBy({ left: delta, behavior: 'smooth' })
  }, [])

  const gridProducts = useMemo(() => products.slice(0, gridShowCount), [products, gridShowCount])
  const hasMoreGridProducts = products.length > gridShowCount

  const sidebarNavRef = useRef<HTMLElement | null>(null)
  /** Scroll target when metal / style / SKU changes — "Catalogue" row (not page top). */
  const catalogBrowseAnchorRef = useRef<HTMLDivElement | null>(null)

  /** Keep the active style/SKU visible inside scrollable nav strips — never scroll the page. */
  const scrollCatalogNavActiveIntoView = useCallback(
    (root: HTMLElement | null, inline: ScrollLogicalPosition = 'nearest') => {
      if (!root || typeof window === 'undefined') return
      const active = root.querySelector<HTMLElement>('[data-catalog-nav-active="true"]')
      if (!active) return
      const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      active.scrollIntoView({
        block: 'nearest',
        inline,
        behavior: prefersReduced ? 'auto' : 'smooth',
      })
    },
    [],
  )

  useLayoutEffect(() => {
    if (!catalogHydrated) return
    scrollCatalogNavActiveIntoView(sidebarNavRef.current)
  }, [
    catalogHydrated,
    activeStyleId,
    activeSkuId,
    styleNavSubmenuCollapsed,
    scrollCatalogNavActiveIntoView,
  ])

  const mobileStyleStripRef = useRef<HTMLDivElement | null>(null)
  const mobileSkuStripRef = useRef<HTMLDivElement | null>(null)

  useLayoutEffect(() => {
    if (!catalogHydrated || typeof window === 'undefined') return
    if (window.matchMedia('(min-width: 1024px)').matches) return
    scrollCatalogNavActiveIntoView(mobileStyleStripRef.current, 'center')
    scrollCatalogNavActiveIntoView(mobileSkuStripRef.current, 'center')
  }, [
    catalogHydrated,
    activeStyleId,
    activeSkuId,
    styleNavSubmenuCollapsed,
    scrollCatalogNavActiveIntoView,
  ])

  const isGiftingCatalog = selectedMetal === 'gifting'

  const hasActiveFilters =
    (!isGiftingCatalog &&
      (weightLow > weightBounds[0] || weightHigh < weightBounds[1])) ||
    priceLow > priceBounds[0] ||
    priceHigh < priceBounds[1]

  const handleStyleClick = (cat: Category) => {
    if (cat.id === activeStyleId && cat.subcategories.length > 0) {
      setStyleNavSubmenuCollapsed((c) => !c)
      return
    }
    setStyleNavSubmenuCollapsed(false)
    setActiveStyleId(cat.id)
    if (cat.subcategories.length > 0) {
      setActiveSkuId(cat.subcategories[0].id)
    } else {
      setActiveSkuId(null)
    }
  }

  const handleSkuClick = (sub: Subcategory, catId: number) => {
    setStyleNavSubmenuCollapsed(false)
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
      wholesalePricing,
    )
    if (ids.length === 0) return
    const allOn = ids.every((id) => selectedProductIds.includes(id))
    if (allOn) removeProductIds(ids)
    else addProductIds(ids)
  }

  const toggleSkuSelectAll = (styleId: number, skuId: number) => {
    const dg = skuBulkDesignGroupForRow(
      skuId,
      activeSkuId,
      hasDesignGroupFilter,
      activeDesignGroup,
    )
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
      wholesalePricing,
      dg,
    )
    if (ids.length === 0) return
    const allOn = ids.every((id) => selectedProductIds.includes(id))
    if (allOn) removeProductIds(ids)
    else addProductIds(ids)
  }

  const breadcrumb = [activeStyle?.name, activeSku?.name]
    .filter(Boolean)
    .join(' \u203A ')

  /** Remount surface when metal/style/SKU changes — matches URL + ERP category & subcategory ids */
  const catalogProductSurfaceKey = useMemo(
    () => `${selectedMetal}:${activeStyleId ?? 'none'}:${activeSkuId ?? 'none'}`,
    [selectedMetal, activeStyleId, activeSkuId],
  )

  /**
   * Key for the animated product block: subcategory (sku id) + optional design_group filter.
   * `design_group` aligns with the ERP/catalog field; `activeDesignGroup` is 'all' or that key.
   */
  const catalogGridSurfaceKey = useMemo(
    () => `${catalogProductSurfaceKey}:${activeDesignGroup}`,
    [catalogProductSurfaceKey, activeDesignGroup],
  )

  /** When user switches metal / style / SKU, scroll to the Catalogue section (not page top). */
  const prevCatalogSurfaceKeyRef = useRef<string | null>(null)
  useLayoutEffect(() => {
    if (!catalogHydrated || typeof window === 'undefined') return
    const prev = prevCatalogSurfaceKeyRef.current
    prevCatalogSurfaceKeyRef.current = catalogProductSurfaceKey
    if (prev === null || prev === catalogProductSurfaceKey) return
    if (scrollToBarcode) return

    const anchor = catalogBrowseAnchorRef.current
    if (!anchor) return

    const navSpacer = document.querySelector('[data-kc-nav-spacer]')
    const headerOffset = navSpacer?.getBoundingClientRect().height ?? 48
    const anchorTop = anchor.getBoundingClientRect().top + window.scrollY
    const targetTop = Math.max(0, anchorTop - headerOffset - 6)
    const scrollY = window.scrollY

    // Only scroll up when the user was browsing below the Catalogue header (e.g. product grid).
    if (scrollY > targetTop + 20) {
      window.scrollTo({ top: targetTop, left: 0, behavior: 'auto' })
    }
  }, [catalogProductSurfaceKey, catalogHydrated, scrollToBarcode])

  /** Resolve selection + sync URL (path + ?shop_for= / ?product_type=) without page scroll. */
  useLayoutEffect(() => {
    if (!catalogHydrated || !pathname.startsWith(CATALOG_PATH)) return
    if (suppressCanonicalAfterPathSyncRef.current) {
      suppressCanonicalAfterPathSyncRef.current = false
      return
    }
    if (typeof window === 'undefined') return

    if (!showRetailBrowse) {
      const u = new URL(window.location.href)
      if (u.searchParams.has('shop_for') || u.searchParams.has('product_type')) {
        u.searchParams.delete('shop_for')
        u.searchParams.delete('product_type')
        const stripped = u.pathname + (u.search || '')
        if (window.location.pathname + window.location.search !== stripped) {
          router.replace(stripped, { scroll: false })
        }
      }
    }

    const urlRetail = parseCatalogRetailSearchParams(searchParams)
    const urlHasRetail =
      urlRetail.shopFor !== 'all' || urlRetail.productType !== 'all'

    let shopFor = selectedShopFor
    let productType = selectedProductType

    if (retailFiltersFromUiRef.current) {
      retailFiltersFromUiRef.current = false
      const clamped = clampCatalogRetailFilters(
        metalFilteredCategories,
        selectedShopFor,
        selectedProductType,
      )
      shopFor = clamped.shopFor
      productType = clamped.productType
    } else if (urlHasRetail) {
      const clamped = clampCatalogRetailFilters(
        metalFilteredCategories,
        urlRetail.shopFor,
        urlRetail.productType,
      )
      shopFor = clamped.shopFor
      productType = clamped.productType
    }

    if (shopFor !== selectedShopFor) setSelectedShopFor(shopFor)
    if (productType !== selectedProductType) setSelectedProductType(productType)

    // Tab selection drives the URL — do not revert to path metal (that blocked Diamond/Gifting clicks).
    const effectiveMetal = selectedMetal

    const retailTree =
      showRetailBrowse && (shopFor !== 'all' || productType !== 'all')
        ? filterCatalogTreeByRetail(metalFilteredCategories, shopFor, productType)
        : filteredCategories

    if (retailTree.length === 0) {
      const next = catalogPathWithRetailQuery(
        `${CATALOG_PATH}/${effectiveMetal}`,
        showRetailBrowse ? shopFor : 'all',
        showRetailBrowse ? productType : 'all',
      )
      const current = window.location.pathname + window.location.search
      if (current !== next) {
        router.replace(next, { scroll: false })
      }
      return
    }

    const retailActive =
      showRetailBrowse && (shopFor !== 'all' || productType !== 'all')

    let styleId = activeStyleId
    let skuId = activeSkuId

    if (retailActive) {
      const parsed = pathSegmentsFromPathname(pathname)
      const picked = resolveRetailCatalogSelection(
        retailTree,
        activeStyleId,
        activeSkuId,
        productType,
        parsed ? { styleSlug: parsed.styleSlug, skuSlug: parsed.skuSlug } : null,
      )
      if (!picked) return
      styleId = picked.styleId
      skuId = picked.skuId
    } else if (
      !isSelectionValidInRetailTree(retailTree, activeStyleId, activeSkuId)
    ) {
      const first = retailTree[0]
      styleId = first.id
      skuId = first.subcategories[0]?.id ?? null
    }

    if (styleId !== activeStyleId || skuId !== activeSkuId) {
      setActiveStyleId(styleId)
      setActiveSkuId(skuId)
    }

    const style = retailTree.find((c) => c.id === styleId)
    const sub = style?.subcategories.find((s) => s.id === skuId)
    if (!style?.slug || !sub?.slug) return

    const nextPath = buildCatalogSegmentPath(effectiveMetal, style.slug, sub.slug)
    const next = catalogPathWithRetailQuery(
      nextPath,
      showRetailBrowse ? shopFor : 'all',
      showRetailBrowse ? productType : 'all',
    )
    const current = window.location.pathname + window.location.search
    if (current !== next) {
      router.replace(next, { scroll: false })
    }
  }, [
    catalogHydrated,
    activeStyleId,
    activeSkuId,
    selectedMetal,
    filteredCategories,
    pathname,
    router,
    showRetailBrowse,
    selectedShopFor,
    selectedProductType,
    urlShopForParam,
    urlProductTypeParam,
    metalFilteredCategories,
  ])

  const catalogShareText = useMemo(() => {
    const user = auth.user as WholesaleUserFields | undefined
    const hostname = typeof window !== 'undefined' ? window.location.hostname : null
    const ctx = {
      browserHostname: hostname,
      customerTier,
      resellerCustomDomain: user?.custom_domain,
      userBusinessName: user?.business_name,
      brandingActive: resellerBrandingActive,
      brandingBusinessName: resellerBrandName,
    }
    const origin = resolveCatalogShareOrigin(ctx)
    const brand = resolveCatalogShareBrand(ctx)
    const shareUrl = buildCatalogShareUrl(
      {
        style: activeStyle?.slug,
        sku: activeSku?.slug,
        metal: selectedMetal,
      },
      { origin },
    )
    return catalogShareMessage({
      styleName: activeStyle?.name,
      skuName: activeSku?.name,
      metalLabel: METAL_TABS.find((t) => t.key === selectedMetal)?.label,
      itemCount: products.length,
      url: shareUrl,
      brandName: brand,
    })
  }, [
    auth.user,
    customerTier,
    resellerBrandingActive,
    resellerBrandName,
    activeStyle,
    activeSku,
    selectedMetal,
    products.length,
  ])

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
          <LayoutGrid className="mx-auto mb-4 size-16 text-amber-600/90" />
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
        className={`max-w-[1400px] mx-auto px-3 py-4 sm:px-4 sm:py-5 ${
          catalogBuilderMode && selectedProductIds.length > 0
            ? 'pb-[calc(8rem+env(safe-area-inset-bottom,0px))] sm:pb-32'
            : 'kc-pb-mobile-nav md:pb-8'
        }`}
      >
        {/* Sticky catalogue toolbar — metal tabs + optional retail browse */}
        <div className="kc-catalog-toolbar -mx-3 px-3 sm:-mx-4 sm:px-4">
          <div
            className="inline-grid w-full grid-cols-4 gap-0.5 rounded-lg border border-slate-700/30 bg-white/50 p-0.5 sm:gap-1 sm:rounded-xl sm:p-1"
            role="tablist"
            aria-label="Catalogue metal type"
          >
            {METAL_TABS.map(({ key, label }) => {
              const isActive = selectedMetal === key
              return (
                <button
                  key={key}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  onClick={() => handleMetalTabClick(key)}
                  className={`kc-metal-tab ${isActive ? 'kc-metal-tab--active' : ''}`}
                >
                  <span className="kc-metal-tab-icon">
                    <MetalTabFavicon metal={key as MetalTabFaviconKey} active={isActive} />
                  </span>
                  <span>{label}</span>
                </button>
              )
            })}
          </div>

          {showRetailBrowse ? (
            <div className="mt-2">
              <button
                type="button"
                onClick={() => setRetailBrowseOpen((o) => !o)}
                className="kc-collapse-trigger lg:hidden"
                aria-expanded={retailBrowseOpen}
              >
                <span className="inline-flex items-center gap-2">
                  Shop for
                  {selectedShopFor !== 'all' || selectedProductType !== 'all' ? (
                    <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold normal-case tracking-normal text-amber-600">
                      {selectedShopFor !== 'all' ? CATALOG_SHOP_FOR_TABS.find((t) => t.key === selectedShopFor)?.label : 'All'}
                      {selectedProductType !== 'all' ? ` · ${catalogProductTypeLabel(selectedProductType)}` : ''}
                    </span>
                  ) : null}
                </span>
                <ChevronDown
                  className={`size-4 shrink-0 text-slate-500 transition-transform ${retailBrowseOpen ? 'rotate-180' : ''}`}
                  aria-hidden
                />
              </button>
              <div className={`space-y-2 ${retailBrowseOpen ? 'mt-2 lg:mt-3' : 'hidden lg:block lg:mt-3'}`}>
                <div className="flex gap-1.5 overflow-x-auto pb-0.5 scrollbar-hide kc-scroll-contain lg:flex-wrap lg:overflow-visible">
                  {CATALOG_SHOP_FOR_TABS.map(({ key, label }) => {
                    const isActive = selectedShopFor === key
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => {
                          retailFiltersFromUiRef.current = true
                          setSelectedShopFor(key)
                          if (key === 'all') setSelectedProductType('all')
                        }}
                        className={`kc-chip ${isActive ? 'kc-chip--active' : ''}`}
                      >
                        {label}
                      </button>
                    )
                  })}
                </div>
                {selectedShopFor !== 'all' && availableProductTypes.length > 0 ? (
                  <div className="flex gap-1.5 overflow-x-auto pb-0.5 scrollbar-hide kc-scroll-contain">
                    <button
                      type="button"
                      onClick={() => {
                        retailFiltersFromUiRef.current = true
                        setSelectedProductType('all')
                      }}
                      className={`kc-chip ${selectedProductType === 'all' ? 'kc-chip--active' : ''}`}
                    >
                      All types
                    </button>
                    {availableProductTypes.map((pt) => {
                      const isActive = selectedProductType === pt
                      return (
                        <button
                          key={pt}
                          type="button"
                          onClick={() => {
                            retailFiltersFromUiRef.current = true
                            setSelectedProductType(pt)
                          }}
                          className={`kc-chip ${isActive ? 'kc-chip--active' : ''}`}
                        >
                          {catalogProductTypeLabel(pt)}
                        </button>
                      )
                    })}
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>

        <div
          ref={catalogBrowseAnchorRef}
          className="mb-3 mt-3 flex scroll-mt-[6.5rem] items-start justify-between gap-2 sm:mb-4 sm:mt-4 md:scroll-mt-[8.5rem]"
        >
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
              <h1 className="kc-page-title truncate text-base sm:text-xl md:text-2xl">
                {activeStyle && activeSku ? breadcrumb.split(' > ').pop() : 'Catalogue'}
              </h1>
              {products.length > 0 && (
                <span className="shrink-0 text-[10px] font-medium tabular-nums text-slate-500">
                  {products.length} item{products.length !== 1 ? 's' : ''}
                </span>
              )}
            </div>
            {activeStyle && activeSku ? (
              <p className="hidden truncate text-[11px] text-slate-500 sm:block sm:text-xs">
                {breadcrumb}
              </p>
            ) : (
              <p className="text-[10px] text-slate-500 sm:text-xs">
                Browse our curated collections
              </p>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {canUseCatalogBuilder && (
              <button
                type="button"
                role="switch"
                aria-checked={catalogBuilderMode}
                aria-label="Catalog Builder"
                title="Catalog Builder"
                onClick={() => setCatalogBuilderMode(!catalogBuilderMode)}
                className={`relative mr-1 inline-flex h-6 w-10 shrink-0 cursor-pointer rounded-full border transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/50 ${
                  catalogBuilderMode
                    ? 'border-amber-400/50 bg-amber-500'
                    : 'border-slate-700/50 bg-slate-800/40'
                }`}
              >
                <span
                  className={`pointer-events-none absolute top-0.5 left-0.5 size-5 rounded-full bg-white shadow-sm transition-transform ${
                    catalogBuilderMode ? 'translate-x-4' : 'translate-x-0'
                  }`}
                />
              </button>
            )}
            {activeStyle && (
              <>
                <WhatsAppContactLink compact />
                <WhatsAppShareButton
                  message={catalogShareText}
                  label="Share"
                  compact
                  variant="muted"
                />
              </>
            )}
          </div>
        </div>

        {catalogBuilderMode && canUseCatalogBuilder ? (
          <p className="-mt-2 mb-3 text-center text-[10px] text-slate-500 sm:text-xs">
            Tap cards to select · <span className="font-medium text-slate-400">View</span> for details
          </p>
        ) : null}

        {/* Mobile filters — above nav chips so products appear sooner */}
        <div className="mb-2.5 lg:hidden">
          <button
            type="button"
            onClick={() => setMobileFiltersOpen((o) => !o)}
            className="kc-collapse-trigger"
            aria-expanded={mobileFiltersOpen}
          >
            <span className="inline-flex items-center gap-2">
              <SlidersHorizontal className="size-4 text-slate-500" aria-hidden />
              Filters
              {hasActiveFilters ? (
                <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold text-amber-600">
                  Active
                </span>
              ) : null}
            </span>
            <ChevronDown
              className={`size-4 text-slate-500 transition-transform ${mobileFiltersOpen ? 'rotate-180' : ''}`}
              aria-hidden
            />
          </button>
          {mobileFiltersOpen ? (
            <div className="kc-surface mt-2 space-y-4 p-3.5">
              {!isGiftingCatalog ? (
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
              ) : (
                <p className="text-xs text-slate-500 leading-relaxed">
                  Gifting items use fixed prices — filter by price only.
                </p>
              )}
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
                  className="text-xs font-medium text-slate-500 hover:text-slate-300"
                >
                  Clear filters
                </button>
              )}
            </div>
          ) : null}
        </div>

        {/* ── Mobile: horizontal chips ── */}
        <div className="mb-3 space-y-1.5 lg:hidden">
          {/* Style chips */}
          <div className="flex flex-col gap-1.5">
            {catalogBuilderMode && canUseCatalogBuilder && (
              <div className="flex items-center justify-between px-0.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                <span>Style</span>
                <span className="text-slate-600">Select</span>
              </div>
            )}
            <div
              ref={mobileStyleStripRef}
              className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide kc-scroll-contain"
            >
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
                  wholesalePricing,
                )
                const sn = styleScopeIds.filter((id) => selectedProductIds.includes(id)).length
                const allStyle = styleScopeIds.length > 0 && sn === styleScopeIds.length
                const someStyle = sn > 0 && sn < styleScopeIds.length
                return (
                  <div key={cat.id} className="flex shrink-0 items-center gap-1.5">
                    {catalogBuilderMode && canUseCatalogBuilder && (
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
                      data-catalog-nav-active={activeStyleId === cat.id ? 'true' : undefined}
                      className={`kc-nav-chip ${activeStyleId === cat.id ? 'kc-nav-chip--active' : ''}`}
                    >
                      {cat.name}
                    </button>
                  </div>
                )
              })}
            </div>
          </div>

          {/* SKU pills */}
          {activeStyle &&
            activeStyle.subcategories.length > 0 &&
            !styleNavSubmenuCollapsed && (
            <div className="flex flex-col gap-1.5">
              {catalogBuilderMode && canUseCatalogBuilder && (
                <div className="flex items-center justify-between px-0.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                  <span>SKU</span>
                  <span className="text-slate-600">Select</span>
                </div>
              )}
              <div
                ref={mobileSkuStripRef}
                className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide kc-scroll-contain"
              >
                {activeStyle.subcategories.map((sub) => {
                  const skuDg = skuBulkDesignGroupForRow(
                    sub.id,
                    activeSkuId,
                    hasDesignGroupFilter,
                    activeDesignGroup,
                  )
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
                    wholesalePricing,
                    skuDg,
                  )
                  const kn = skuScopeIds.filter((id) => selectedProductIds.includes(id)).length
                  const allSku = skuScopeIds.length > 0 && kn === skuScopeIds.length
                  const someSku = kn > 0 && kn < skuScopeIds.length
                  const skuBulkAria =
                    skuDg != null
                      ? `Select all visible (${skuDg}) items in ${sub.name}`
                      : `Select all filtered items in SKU ${sub.name}`
                  return (
                    <div key={sub.id} className="flex shrink-0 items-center gap-1.5">
                      {catalogBuilderMode && canUseCatalogBuilder && (
                        <BulkSelectCheckbox
                          allSelected={allSku}
                          someSelected={someSku}
                          onToggle={() => toggleSkuSelectAll(activeStyle.id, sub.id)}
                          ariaLabel={skuBulkAria}
                        />
                      )}
                      <button
                        type="button"
                        onClick={() => handleSkuClick(sub, activeStyle.id)}
                        data-catalog-nav-active={activeSkuId === sub.id ? 'true' : undefined}
                        className={`kc-chip text-xs ${activeSkuId === sub.id ? 'kc-chip--active' : ''}`}
                      >
                        {sub.name}
                        <span className="ml-1 opacity-50 tabular-nums">{sub.products.length}</span>
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
            <div className="kc-surface mb-6 space-y-5 p-4 min-h-[260px]">
              <h3 className="kc-section-label">Filters</h3>
              {!isGiftingCatalog ? (
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
              ) : (
                <p className="text-xs text-slate-500 leading-relaxed">
                  Gifting items use fixed prices — filter by price only.
                </p>
              )}
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
            <nav
              ref={sidebarNavRef}
              className="sticky top-24 space-y-1 max-h-[calc(100vh-8rem)] min-h-[12rem] overflow-y-auto pr-2 scrollbar-hide kc-scroll-contain"
            >
              {catalogBuilderMode && canUseCatalogBuilder && (
                <div className="flex items-center justify-between gap-2 px-2 pb-2 mb-1 border-b border-slate-800/60">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                    Style
                  </span>
                  <span className="text-[10px] font-medium uppercase text-slate-600">Select</span>
                </div>
              )}
              {filteredCategories.length === 0 ? (
                <p className="text-slate-500 text-sm px-2 py-4">
                  {showRetailBrowse && selectedShopFor !== 'all'
                    ? 'No collections match this shop-for filter. Try All, another type, or ask admin to tag SKUs in Retail tags.'
                    : `No ${METAL_TABS.find((t) => t.key === selectedMetal)?.label ?? selectedMetal} styles`}
                </p>
              ) : (
                filteredCategories.map((cat) => {
                  const isExpanded =
                    activeStyleId === cat.id &&
                    !(styleNavSubmenuCollapsed && cat.subcategories.length > 0)
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
                    wholesalePricing,
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
                        {catalogBuilderMode && canUseCatalogBuilder && (
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
                          data-catalog-nav-active={
                            isActive && cat.subcategories.length === 0 ? 'true' : undefined
                          }
                          aria-expanded={
                            cat.subcategories.length > 0
                              ? activeStyleId === cat.id
                                ? !styleNavSubmenuCollapsed
                                : false
                              : undefined
                          }
                          className={`flex min-w-0 flex-1 items-center justify-between gap-2 px-2 py-2 rounded-lg text-left transition-colors ${
                            isActive
                              ? 'font-semibold text-amber-600'
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
                          {catalogBuilderMode && canUseCatalogBuilder && (
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
                              const skuDg = skuBulkDesignGroupForRow(
                                sub.id,
                                activeSkuId,
                                hasDesignGroupFilter,
                                activeDesignGroup,
                              )
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
                                wholesalePricing,
                                skuDg,
                              )
                              const kn = skuScopeIds.filter((id) =>
                                selectedProductIds.includes(id),
                              ).length
                              const allSku = skuScopeIds.length > 0 && kn === skuScopeIds.length
                              const someSku = kn > 0 && kn < skuScopeIds.length
                              const skuBulkAria =
                                skuDg != null
                                  ? `Select all visible (${skuDg}) items in ${sub.name}`
                                  : `Select all filtered items in SKU ${sub.name}`
                              return (
                                <div
                                  key={sub.id}
                                  className={`flex w-full items-center gap-1.5 rounded-md px-0.5 py-0.5 ${
                                    isSubActive ? 'bg-amber-500/5' : ''
                                  }`}
                                >
                                  {catalogBuilderMode && canUseCatalogBuilder && (
                                    <BulkSelectCheckbox
                                      allSelected={allSku}
                                      someSelected={someSku}
                                      onToggle={() => toggleSkuSelectAll(cat.id, sub.id)}
                                      ariaLabel={skuBulkAria}
                                    />
                                  )}
                                  <button
                                    type="button"
                                    onClick={() => handleSkuClick(sub, cat.id)}
                                    data-catalog-nav-active={isSubActive ? 'true' : undefined}
                                    className={`min-w-0 flex-1 text-left px-2 py-1.5 rounded-md text-sm transition-colors ${
                                      isSubActive
                                        ? 'bg-amber-500/10 text-amber-600 font-semibold'
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
            id="catalog-product-grid"
            className="flex-1 min-w-0 scroll-mt-12 md:scroll-mt-14"
          >
            {hasDesignGroupFilter && (
              <div className="kc-surface mb-5 p-3 sm:p-3.5">
                <div className="mb-2.5 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <p className="kc-section-label">Design group</p>
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    <span className="text-[11px] text-slate-500 tabular-nums order-first sm:order-none">
                      {products.length} visible
                    </span>
                    {designGroups.length > 0 && (
                      <div className="flex items-center rounded-lg border border-slate-700/80 bg-slate-800/50 p-0.5">
                        <button
                          type="button"
                          aria-label="Previous design theme"
                          onClick={goPrevDesignGroup}
                          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-slate-300 transition-colors hover:bg-slate-700/90 hover:text-amber-400"
                        >
                          <ChevronLeft className="size-4" aria-hidden />
                        </button>
                        <span className="hidden px-1 text-[10px] font-medium uppercase tracking-wide text-slate-500 sm:inline">
                          Theme
                        </span>
                        <button
                          type="button"
                          aria-label="Next design theme"
                          onClick={goNextDesignGroup}
                          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-slate-300 transition-colors hover:bg-slate-700/90 hover:text-amber-400"
                        >
                          <ChevronRight className="size-4" aria-hidden />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex items-stretch gap-1.5">
                  {designGroups.length > 3 && (
                    <button
                      type="button"
                      aria-label="Scroll design groups left"
                      onClick={() => scrollDesignStrip(-1)}
                      className="hidden h-auto min-h-[2.25rem] w-9 shrink-0 items-center justify-center rounded-lg border border-slate-700/80 bg-slate-800/60 text-slate-400 transition-colors hover:bg-slate-700/80 hover:text-slate-200 sm:flex"
                    >
                      <ChevronLeft className="size-4" aria-hidden />
                    </button>
                  )}
                  <div
                    ref={designGroupStripRef}
                    className="flex min-h-[2.25rem] flex-1 gap-2 overflow-x-auto pb-1 scrollbar-hide kc-scroll-contain"
                  >
                    <button
                      ref={(el) => registerDesignChipRef('__all__', el)}
                      type="button"
                      onClick={() => setActiveDesignGroup('all')}
                      className={`kc-chip ${activeDesignGroup === 'all' ? 'kc-chip--active' : ''}`}
                    >
                      All
                    </button>
                    {designGroups.map((group) => (
                      <button
                        key={group}
                        ref={(el) => registerDesignChipRef(group, el)}
                        type="button"
                        onClick={() => setActiveDesignGroup(group)}
                        className={`kc-chip ${activeDesignGroup === group ? 'kc-chip--active' : ''}`}
                      >
                        {group}
                      </button>
                    ))}
                  </div>
                  {designGroups.length > 3 && (
                    <button
                      type="button"
                      aria-label="Scroll design groups right"
                      onClick={() => scrollDesignStrip(1)}
                      className="hidden h-auto min-h-[2.25rem] w-9 shrink-0 items-center justify-center rounded-lg border border-slate-700/80 bg-slate-800/60 text-slate-400 transition-colors hover:bg-slate-700/80 hover:text-slate-200 sm:flex"
                    >
                      <ChevronRight className="size-4" aria-hidden />
                    </button>
                  )}
                </div>
                {designGroups.length > 3 && (
                  <p className="mt-1.5 text-center text-[10px] text-slate-600 sm:hidden">
                    Swipe for more
                  </p>
                )}
              </div>
            )}

            <div key={catalogGridSurfaceKey} className="kc-catalog-surface-enter">
              <div className="mb-3 hidden items-center justify-between gap-4 md:flex">
                <p className="truncate text-xs font-medium uppercase tracking-wider text-slate-500">
                  {breadcrumb || 'Select a collection'}
                </p>
              </div>

              {products.length === 0 ? (
                <div className="rounded-xl bg-slate-900/50 border border-slate-800 p-16 text-center">
                  <p className="text-slate-500">
                    {filteredCategories.length === 0
                      ? showRetailBrowse && selectedShopFor !== 'all'
                        ? 'Nothing here for this shop-for filter on this metal tab. Try All types, another tab, or switch Shop for to All.'
                        : `No ${METAL_TABS.find((t) => t.key === selectedMetal)?.label ?? selectedMetal} products in the catalogue`
                      : 'No products in this collection'}
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2 sm:gap-2.5 md:grid-cols-3 md:gap-4 lg:grid-cols-3 xl:grid-cols-4 xl:gap-5">
                  {gridProducts.map((p, i) => {
                    const selectionKey = getProductSelectionKey(p as Product)
                    const cardKey =
                      selectionKey !== ''
                        ? selectionKey
                        : `sku-${activeSkuId ?? 'x'}-${i}-${catalogGridSurfaceKey}`
                    return (
                      <ProductCard
                        key={cardKey}
                        product={
                          {
                            ...p,
                            style_code: activeStyle?.name,
                          } as Product
                        }
                        rates={rates}
                        priority={i < 8}
                        imageFetchPriority={i < 4 ? "high" : "auto"}
                        subcategorySlug={activeSku?.slug}
                        onBeforeNavigate={(barcode) => saveCatalogState(barcode)}
                        catalogBuilderActive={catalogBuilderMode && canUseCatalogBuilder}
                        selected={selectionKey ? isProductSelected(selectionKey) : false}
                        onToggleSelect={
                          selectionKey ? () => toggleProductId(selectionKey) : undefined
                        }
                        showStyleLabel={false}
                      />
                    )
                  })}
                </div>
              )}
              {hasMoreGridProducts && (
                <div className="mt-8 flex flex-col items-center gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      setGridShowCount((c) =>
                        Math.min(c + CATALOG_PRODUCTS_PAGE_SIZE, products.length),
                      )
                    }
                    className="rounded-full border border-slate-700/50 bg-white/70 px-5 py-2.5 text-sm font-medium tracking-wide text-slate-300 transition-colors hover:border-slate-600 hover:bg-white hover:text-slate-100 active:scale-[0.98]"
                  >
                    Show more jewellery
                    <span className="ml-1.5 tabular-nums text-slate-400">
                      ({products.length - gridShowCount} left)
                    </span>
                  </button>
                </div>
              )}
            </div>
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

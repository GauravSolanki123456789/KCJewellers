'use client'

import { useEffect, useState, useMemo, useCallback, useRef } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import ProductCard from '@/components/ProductCard'
import { useCatalogData } from './catalog-data-context'
import WhatsAppShareButton from '@/components/WhatsAppShareButton'
import WhatsAppContactLink from '@/components/WhatsAppContactLink'
import { LayoutGrid, ChevronRight, ChevronDown, Gem, Sparkles } from 'lucide-react'
import DualRangeSlider from '@/components/DualRangeSlider'
import { calculateBreakdown, type Item } from '@/lib/pricing'
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

/** Returns true if product's metal_type matches the selected metal tab */
function productMatchesMetal(product: Product, metal: MetalKey): boolean {
  const m = (product.metal_type || '').toLowerCase()
  if (metal === 'gold') return m.startsWith('gold') || m.includes('gold')
  if (metal === 'silver') return m.startsWith('silver') || m.includes('silver')
  if (metal === 'diamond') return m.startsWith('diamond') || m.includes('diamond')
  return false
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

export default function CatalogPageClient() {
  const pathname = usePathname()
  const router = useRouter()
  const { categories: categoriesFromCtx, rates, isBootstrapping, isRefreshing, refresh } =
    useCatalogData()
  /** Context JSON matches catalogue shape; assert once so helpers use Item[] consistently. */
  const categories = categoriesFromCtx as Category[]
  const [selectedMetal, setSelectedMetal] = useState<MetalKey>('gold')

  const [activeStyleId, setActiveStyleId] = useState<number | null>(null)
  const [activeSkuId, setActiveSkuId] = useState<number | null>(null)
  const [expandedStyles, setExpandedStyles] = useState<Set<number>>(new Set())
  const [weightLow, setWeightLow] = useState(0)
  const [weightHigh, setWeightHigh] = useState(100)
  const [priceLow, setPriceLow] = useState(0)
  const [priceHigh, setPriceHigh] = useState(100000)
  const hasRestoredFromStorage = useRef(false)
  const skipNextBoundsSync = useRef(false)
  const prevPathnameRef = useRef<string | null>(null)
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
        expandedStyles: Array.from(expandedStyles),
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
  }, [selectedMetal, activeStyleId, activeSkuId, expandedStyles, weightLow, weightHigh, priceLow, priceHigh])

  /** One-time: session restore, path, query, defaults — runs when catalogue payload first arrives. */
  useEffect(() => {
    const cats = categories
    if (cats.length === 0 || hasRestoredFromStorage.current) return

    if (typeof window !== 'undefined') {
      let hasUrlParams = false
      let fromProduct = false
      try {
        const u = new URLSearchParams(window.location.search)
        hasUrlParams = u.has('style') || u.has('sku') || u.has('metal')
        fromProduct = sessionStorage.getItem(CATALOG_FROM_PRODUCT_KEY) === '1'
      } catch {
        hasUrlParams = false
      }
      try {
        const stored = sessionStorage.getItem(CATALOG_STATE_KEY)

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
              setExpandedStyles(new Set(parsed.expandedStyles || [parsed.activeStyleId!]))
            } else {
              setActiveStyleId(cats[0].id)
              setExpandedStyles(new Set([cats[0].id]))
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
            const u = new URLSearchParams(window.location.search)
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
                setExpandedStyles((prev) => new Set([...prev, cat.id]))
                if (skuSlug) {
                  const sub = cat.subcategories.find(
                    (s) => (s.slug || '').toLowerCase() === skuSlug,
                  )
                  if (sub) setActiveSkuId(sub.id)
                  else if (cat.subcategories[0]) setActiveSkuId(cat.subcategories[0].id)
                } else if (cat.subcategories[0]) {
                  setActiveSkuId(cat.subcategories[0].id)
                }
              }
            } else if (skuSlug) {
              for (const cat of cats) {
                const sub = cat.subcategories.find(
                  (s) => (s.slug || '').toLowerCase() === skuSlug,
                )
                if (sub) {
                  setActiveStyleId(cat.id)
                  setExpandedStyles((prev) => new Set([...prev, cat.id]))
                  setActiveSkuId(sub.id)
                  break
                }
              }
            }
            if (!styleSlug && !skuSlug) {
              setActiveStyleId(cats[0].id)
              setExpandedStyles(new Set([cats[0].id]))
              setActiveSkuId(cats[0].subcategories[0]?.id ?? null)
            }
          }

          const applyPathSegments = (parsed: ParsedCatalogPath) => {
            const metalParam = parsed.metal
            if (metalParam === 'gold' || metalParam === 'silver' || metalParam === 'diamond') {
              setSelectedMetal(metalParam)
            }
            const styleSlug = parsed.styleSlug.toLowerCase()
            const skuSlug = parsed.skuSlug.toLowerCase()
            const cat = cats.find((c) => (c.slug || '').toLowerCase() === styleSlug)
            if (cat) {
              setActiveStyleId(cat.id)
              setExpandedStyles((prev) => new Set([...prev, cat.id]))
              const sub = cat.subcategories.find(
                (s) => (s.slug || '').toLowerCase() === skuSlug,
              )
              if (sub) setActiveSkuId(sub.id)
              else if (cat.subcategories[0]) setActiveSkuId(cat.subcategories[0].id)
            } else {
              for (const c of cats) {
                const sub = c.subcategories.find(
                  (s) => (s.slug || '').toLowerCase() === skuSlug,
                )
                if (sub) {
                  setActiveStyleId(c.id)
                  setExpandedStyles((prev) => new Set([...prev, c.id]))
                  setActiveSkuId(sub.id)
                  break
                }
              }
            }
          }

          const pathFromUrl = pathSegmentsFromPathname(pathname)

          if (stored && fromProduct) {
            const parsed = JSON.parse(stored) as CatalogSessionState
            applyParsedSession(parsed)
            sessionStorage.removeItem(CATALOG_STATE_KEY)
            sessionStorage.removeItem(CATALOG_FROM_PRODUCT_KEY)
          } else if (pathFromUrl) {
            if (stored) sessionStorage.removeItem(CATALOG_STATE_KEY)
            sessionStorage.removeItem(CATALOG_FROM_PRODUCT_KEY)
            applyPathSegments(pathFromUrl)
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
            setExpandedStyles(new Set([cats[0].id]))
            setActiveSkuId(cats[0].subcategories[0]?.id ?? null)
          }
      } catch {
        setActiveStyleId(cats[0].id)
        setExpandedStyles(new Set([cats[0].id]))
        setActiveSkuId(cats[0].subcategories[0]?.id ?? null)
      }
      hasRestoredFromStorage.current = true
      prevPathnameRef.current = pathname
      const scrollTarget = sessionStorage.getItem(CATALOG_SCROLL_TO_KEY)
      if (scrollTarget) {
        setScrollToBarcode(scrollTarget)
        sessionStorage.removeItem(CATALOG_SCROLL_TO_KEY)
      }
    } else {
      setActiveStyleId(cats[0].id)
      setExpandedStyles(new Set([cats[0].id]))
      setActiveSkuId(cats[0].subcategories[0]?.id ?? null)
      hasRestoredFromStorage.current = true
      prevPathnameRef.current = pathname
    }
    setCatalogHydrated(true)
  }, [categories, pathname])

  /** When URL path changes (same mounted layout), sync metal/style/sku without refetching catalogue. */
  useEffect(() => {
    if (!catalogHydrated || categories.length === 0) return
    if (prevPathnameRef.current === pathname) return
    const parsed = pathSegmentsFromPathname(pathname)
    if (!parsed) {
      prevPathnameRef.current = pathname
      return
    }
    const cats = categories
    const metalParam = parsed.metal
    if (metalParam === 'gold' || metalParam === 'silver' || metalParam === 'diamond') {
      setSelectedMetal(metalParam)
    }
    const styleSlug = parsed.styleSlug.toLowerCase()
    const skuSlug = parsed.skuSlug.toLowerCase()
    const cat = cats.find((c) => (c.slug || '').toLowerCase() === styleSlug)
    if (cat) {
      setActiveStyleId(cat.id)
      setExpandedStyles((prev) => new Set([...prev, cat.id]))
      const sub = cat.subcategories.find((s) => (s.slug || '').toLowerCase() === skuSlug)
      if (sub) setActiveSkuId(sub.id)
      else if (cat.subcategories[0]) setActiveSkuId(cat.subcategories[0].id)
    } else {
      for (const c of cats) {
        const sub = c.subcategories.find((s) => (s.slug || '').toLowerCase() === skuSlug)
        if (sub) {
          setActiveStyleId(c.id)
          setExpandedStyles((prev) => new Set([...prev, c.id]))
          setActiveSkuId(sub.id)
          break
        }
      }
    }
    prevPathnameRef.current = pathname
  }, [pathname, catalogHydrated, categories])

  const { pullY, isRefreshing: pullRefreshing, handleTouchStart, handleTouchMove, handleTouchEnd } =
    usePullToRefresh(refresh)

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
      setExpandedStyles(new Set([first.id]))
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
      const b = calculateBreakdown(p, rates, (p as { gst_rate?: number }).gst_rate ?? 3)
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
  }, [rawProducts, rates])

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
      const b = calculateBreakdown(p, rates, (p as { gst_rate?: number }).gst_rate ?? 3)
      return b.total >= priceLow && b.total <= priceHigh
    })
    return list
  }, [rawProducts, weightLow, weightHigh, priceLow, priceHigh, rates])

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

  const hasActiveFilters =
    weightLow > weightBounds[0] ||
    weightHigh < weightBounds[1] ||
    priceLow > priceBounds[0] ||
    priceHigh < priceBounds[1]

  const handleStyleClick = (cat: Category) => {
    setActiveStyleId(cat.id)
    setExpandedStyles((prev) => {
      const next = new Set(prev)
      if (next.has(cat.id)) next.delete(cat.id)
      else next.add(cat.id)
      return next
    })
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

  if (isBootstrapping && categories.length === 0) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100">
        <main className="max-w-[1400px] mx-auto px-4 py-6 pb-28">
          <div className="flex justify-center mb-4">
            <div className="h-11 w-full max-w-xl rounded-xl bg-slate-800/80 animate-pulse" />
          </div>
          <div className="flex flex-col lg:flex-row gap-6">
            <aside className="hidden lg:block w-64 shrink-0 space-y-4">
              <div className="p-4 rounded-xl bg-slate-900/50 border border-slate-800 space-y-4">
                <div className="h-4 w-20 bg-slate-700 rounded animate-pulse" />
                <div className="h-8 bg-slate-800 rounded animate-pulse" />
                <div className="h-8 bg-slate-800 rounded animate-pulse" />
              </div>
              <div className="space-y-2">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="h-10 bg-slate-800/60 rounded-lg animate-pulse" />
                ))}
              </div>
            </aside>
            <section className="flex-1 grid grid-cols-2 md:grid-cols-3 gap-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <div
                  key={i}
                  className="rounded-xl overflow-hidden bg-slate-900 border border-slate-800"
                >
                  <div className="aspect-[4/5] bg-slate-800 animate-pulse" />
                  <div className="p-3 space-y-2">
                    <div className="h-4 bg-slate-800 rounded animate-pulse" />
                    <div className="h-6 bg-slate-800 rounded w-2/3 animate-pulse" />
                    <div className="h-10 bg-slate-800 rounded animate-pulse" />
                  </div>
                </div>
              ))}
            </section>
          </div>
        </main>
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
      {(pullRefreshing || isRefreshing) && (
        <div className="absolute top-0 left-0 right-0 w-full text-center transition-all z-50 py-3 text-sm text-amber-500 bg-slate-900/90 backdrop-blur safe-area-pt">
          Refreshing…
        </div>
      )}
      <main className="max-w-[1400px] mx-auto px-4 py-6 pb-28">
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
          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
            {filteredCategories.length === 0 ? (
              <p className="text-slate-500 text-sm py-2">No {METAL_TABS.find((t) => t.key === selectedMetal)?.label ?? selectedMetal} styles</p>
            ) : filteredCategories.map((cat) => (
              <button
                key={cat.id}
                onClick={() => handleStyleClick(cat)}
                className={`shrink-0 px-4 py-2 rounded-full text-sm font-semibold transition-colors ${
                  activeStyleId === cat.id
                    ? 'bg-amber-500 text-slate-950'
                    : 'bg-slate-800 text-slate-300 border border-slate-700'
                }`}
              >
                {cat.name}
              </button>
            ))}
          </div>

          {/* SKU pills */}
          {activeStyle && activeStyle.subcategories.length > 0 && (
            <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
              {activeStyle.subcategories.map((sub) => (
                <button
                  key={sub.id}
                  onClick={() => handleSkuClick(sub, activeStyle.id)}
                  className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                    activeSkuId === sub.id
                      ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40'
                      : 'bg-slate-800/60 text-slate-400 border border-slate-700/60'
                  }`}
                >
                  {sub.name}
                  <span className="ml-1 opacity-60">
                    {sub.products.length}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex gap-6">
          {/* ── Desktop sidebar (25 %) ── */}
          <aside className="hidden lg:block w-64 shrink-0">
            {/* Filters */}
            <div className="mb-6 p-4 rounded-xl bg-slate-900/50 border border-slate-800 space-y-5">
              <h3 className="text-sm font-semibold text-slate-300 uppercase tracking-wider">Filters</h3>
              <DualRangeSlider
                key={`w-${activeSkuId ?? 0}-${selectedMetal}`}
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
                key={`p-${activeSkuId ?? 0}-${selectedMetal}`}
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
            <nav className="sticky top-24 space-y-1 max-h-[calc(100vh-8rem)] overflow-y-auto pr-2 scrollbar-hide">
              {filteredCategories.length === 0 ? (
                <p className="text-slate-500 text-sm px-2 py-4">
                  No {METAL_TABS.find((t) => t.key === selectedMetal)?.label ?? selectedMetal} styles
                </p>
              ) : (
              filteredCategories.map((cat) => {
                const isExpanded = expandedStyles.has(cat.id)
                const isActive = activeStyleId === cat.id
                return (
                  <div key={cat.id}>
                    <button
                      onClick={() => handleStyleClick(cat)}
                      className={`w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-lg text-left transition-colors ${
                        isActive
                          ? 'bg-slate-800/80 text-amber-400'
                          : 'text-slate-300 hover:bg-slate-800/40'
                      }`}
                    >
                      <span className="font-semibold text-sm tracking-wide uppercase">
                        {cat.name}
                      </span>
                      {isExpanded ? (
                        <ChevronDown className="size-4 shrink-0 text-slate-500" />
                      ) : (
                        <ChevronRight className="size-4 shrink-0 text-slate-500" />
                      )}
                    </button>

                    {isExpanded && cat.subcategories.length > 0 && (
                      <div className="ml-3 mt-0.5 mb-1 space-y-0.5 border-l border-slate-800 pl-3">
                        {cat.subcategories.map((sub) => {
                          const isSubActive = activeSkuId === sub.id
                          return (
                            <button
                              key={sub.id}
                              onClick={() => handleSkuClick(sub, cat.id)}
                              className={`w-full text-left px-2.5 py-1.5 rounded-md text-sm transition-colors ${
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
                          )
                        })}
                      </div>
                    )}
                  </div>
                )
              })
              )}
            </nav>
          </aside>

          {/* ── Right: product grid (75 %) ── */}
          <section className="flex-1 min-w-0">
            {/* Mobile filters */}
            <div className="lg:hidden mb-4 p-4 rounded-xl bg-slate-900/50 border border-slate-800 space-y-4">
              <DualRangeSlider
                key={`mw-${activeSkuId ?? 0}-${selectedMetal}`}
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
                key={`mp-${activeSkuId ?? 0}-${selectedMetal}`}
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
                {products.map((p, i) => (
                  <ProductCard
                    key={p.barcode || p.id || p.sku}
                    product={
                      {
                        ...p,
                        style_code: activeStyle?.name,
                      } as Product
                    }
                    rates={rates}
                    priority={i < 8}
                    onBeforeNavigate={(barcode) => saveCatalogState(barcode)}
                  />
                ))}
              </div>
            )}
          </section>
        </div>
      </main>
    </div>
  )
}

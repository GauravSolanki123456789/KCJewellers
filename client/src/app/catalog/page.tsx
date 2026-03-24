'use client'

import { useEffect, useState, useMemo, useCallback, useRef } from 'react'
import axios from '@/lib/axios'
import ProductCard from '@/components/ProductCard'
import { LayoutGrid, ChevronRight, ChevronDown, Gem, Sparkles } from 'lucide-react'
import DualRangeSlider from '@/components/DualRangeSlider'
import { calculateBreakdown, type Item } from '@/lib/pricing'
import { usePullToRefresh } from '@/hooks/usePullToRefresh'

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

const CATALOG_STATE_KEY = 'kc_catalog_state'

/** Metal types for catalog navigation — values match backend metal_type (lowercase) */
const METAL_TABS = [
  { key: 'gold', label: 'Gold', icon: Sparkles },
  { key: 'silver', label: 'Silver', icon: LayoutGrid },
  { key: 'diamond', label: 'Diamond', icon: Gem },
] as const

type MetalKey = (typeof METAL_TABS)[number]['key']

/** Returns true if product's metal_type matches the selected metal tab */
function productMatchesMetal(product: Product, metal: MetalKey): boolean {
  const m = (product.metal_type || '').toLowerCase()
  if (metal === 'gold') return m.startsWith('gold') || m.includes('gold')
  if (metal === 'silver') return m.startsWith('silver') || m.includes('silver')
  if (metal === 'diamond') return m.startsWith('diamond')
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

export default function CatalogPage() {
  const [categories, setCategories] = useState<Category[]>([])
  const [rates, setRates] = useState<unknown[]>([])
  const [loading, setLoading] = useState(true)
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
  const scrollToBarcodeRef = useRef<string | null>(null)

  const url = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'

  const saveCatalogState = useCallback((barcode?: string) => {
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
        scrollToBarcode: barcode || null,
      }
      sessionStorage.setItem(CATALOG_STATE_KEY, JSON.stringify(state))
    } catch {
      /* ignore */
    }
  }, [selectedMetal, activeStyleId, activeSkuId, expandedStyles, weightLow, weightHigh, priceLow, priceHigh])

  const loadCatalog = useCallback(async () => {
    try {
      const [catalogRes, ratesRes] = await Promise.all([
        axios.get(`${url}/api/catalog`),
        axios.get(`${url}/api/rates/display`),
      ])
      const cats: Category[] = catalogRes.data?.categories || []
      setCategories(cats)
      setRates(ratesRes.data?.rates ?? [])

      if (cats.length > 0 && typeof window !== 'undefined' && !hasRestoredFromStorage.current) {
        try {
          const stored = sessionStorage.getItem(CATALOG_STATE_KEY)
          if (stored) {
            const parsed = JSON.parse(stored) as {
              selectedMetal?: MetalKey
              activeStyleId?: number
              activeSkuId?: number
              expandedStyles?: number[]
              weightLow?: number
              weightHigh?: number
              priceLow?: number
              priceHigh?: number
              scrollToBarcode?: string | null
            }
            const validMetal = parsed.selectedMetal && METAL_TABS.some((t) => t.key === parsed.selectedMetal)
            const styleExists = parsed.activeStyleId != null && cats.some((c) => c.id === parsed.activeStyleId)
            const style = styleExists ? cats.find((c) => c.id === parsed.activeStyleId) : null
            const subExists = style && parsed.activeSkuId != null && style.subcategories.some((s) => s.id === parsed.activeSkuId)
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
            if (parsed.scrollToBarcode) scrollToBarcodeRef.current = parsed.scrollToBarcode
            skipNextBoundsSync.current = true
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
      } else if (cats.length > 0 && !hasRestoredFromStorage.current) {
        setActiveStyleId(cats[0].id)
        setExpandedStyles(new Set([cats[0].id]))
        setActiveSkuId(cats[0].subcategories[0]?.id ?? null)
        hasRestoredFromStorage.current = true
      }
    } catch {
      setCategories([])
    } finally {
      setLoading(false)
    }
  }, [url])

  const { pullY, isRefreshing, handleTouchStart, handleTouchMove, handleTouchEnd } = usePullToRefresh(loadCatalog)

  useEffect(() => {
    setLoading(true)
    loadCatalog()
  }, [loadCatalog])

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

  /** Scroll to product card when returning from product page */
  const scrollToProduct = useCallback((barcode: string) => {
    const el = document.querySelector(`[data-product-barcode="${CSS.escape(barcode)}"]`)
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [])

  useEffect(() => {
    const barcode = scrollToBarcodeRef.current
    if (!barcode || products.length === 0) return
    scrollToBarcodeRef.current = null
    const timer = requestAnimationFrame(() => scrollToProduct(barcode))
    return () => cancelAnimationFrame(timer)
  }, [products, scrollToProduct])

  /** Handle bfcache restore (e.g. router.back()) - sessionStorage may have scrollToBarcode */
  useEffect(() => {
    const handler = (e: PageTransitionEvent) => {
      if (!e.persisted || typeof window === 'undefined') return
      try {
        const stored = sessionStorage.getItem(CATALOG_STATE_KEY)
        if (!stored) return
        const parsed = JSON.parse(stored) as { scrollToBarcode?: string | null }
        if (parsed.scrollToBarcode && products.length > 0) {
          sessionStorage.removeItem(CATALOG_STATE_KEY)
          requestAnimationFrame(() => scrollToProduct(parsed.scrollToBarcode!))
        }
      } catch {
        /* ignore */
      }
    }
    window.addEventListener('pageshow', handler)
    return () => window.removeEventListener('pageshow', handler)
  }, [products.length, scrollToProduct])

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

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center">
        <div className="text-slate-400 animate-pulse">Loading catalogue…</div>
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
      {isRefreshing && (
        <div className="absolute top-0 left-0 right-0 w-full text-center transition-all z-50 py-3 text-sm text-amber-500 bg-slate-900/90 backdrop-blur safe-area-pt">
          Refreshing…
        </div>
      )}
      <main className="max-w-[1400px] mx-auto px-4 py-6 pb-28">
        {/* Metal Type Tabs — top-level navigation, responsive */}
        <div className="flex justify-center mb-6 px-1">
          <div className="inline-flex w-full sm:w-auto p-1 rounded-xl bg-slate-900/80 border border-slate-800 shadow-lg">
            {METAL_TABS.map(({ key, label, icon: Icon }) => {
              const isActive = selectedMetal === key
              return (
                <button
                  key={key}
                  onClick={() => setSelectedMetal(key)}
                  className={`flex-1 sm:flex-initial flex items-center justify-center gap-2 px-4 sm:px-5 py-3 sm:py-2.5 rounded-lg text-sm font-semibold transition-all duration-200 min-w-0 ${
                    isActive
                      ? 'bg-amber-500 text-slate-950 shadow-md ring-2 ring-amber-400/30'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50 active:bg-slate-800'
                  }`}
                >
                  <Icon className="size-4 shrink-0" />
                  <span className="truncate">{label}</span>
                </button>
              )
            })}
          </div>
        </div>

        {/* Header */}
        <div className="flex items-center gap-2 mb-5">
          <LayoutGrid className="size-5 text-amber-500" />
          <h1 className="text-lg font-semibold text-slate-200">
            Product Catalogue
          </h1>
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
                {products.map((p) => {
                  const barcode = p.barcode || p.sku || String(p.id || '')
                  return (
                    <div key={barcode} data-product-barcode={barcode}>
                      <ProductCard
                        product={
                          {
                            ...p,
                            style_code: activeStyle?.name,
                          } as Product
                        }
                        rates={rates}
                        onBeforeNavigate={saveCatalogState}
                      />
                    </div>
                  )
                })}
              </div>
            )}
          </section>
        </div>
      </main>
    </div>
  )
}

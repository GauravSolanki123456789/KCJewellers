'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { Gem, LayoutGrid, Loader2, Search, ShoppingCart, SlidersHorizontal, Sparkles } from 'lucide-react'
import DualRangeSlider from '@/components/DualRangeSlider'
import { useCatalogData } from '@/app/catalog/catalog-data-context'
import { useCustomerTier } from '@/context/CustomerTierContext'
import { useCart } from '@/context/CartContext'
import { CATALOG_PATH } from '@/lib/routes'
import { calculateBreakdown, getItemWeight, type Item } from '@/lib/pricing'
import {
  buildCatalogProductByKeyMap,
  firstMetalWithProducts,
  flattenWholesaleRows,
  getProductSelectionKey,
  productPassesCatalogFilters,
  wholesaleRowMatchesSearch,
  type CatalogMetalKey,
} from '@/lib/catalog-product-filters'
import {
  clearWholesaleQtyDraft,
  loadWholesaleQtyDraft,
  saveWholesaleQtyDraft,
  WHOLESALE_METAL_KEY,
} from '@/lib/wholesale-draft-storage'
import { normalizeCatalogImageSrc } from '@/lib/normalize-image-url'
import { cn } from '@/lib/utils'

const METAL_TABS: { key: CatalogMetalKey; label: string; icon: typeof Sparkles }[] = [
  { key: 'gold', label: 'Gold', icon: Sparkles },
  { key: 'silver', label: 'Silver', icon: LayoutGrid },
  { key: 'diamond', label: 'Diamond', icon: Gem },
]

function productKey(p: Item): string {
  return getProductSelectionKey(p)
}

type PricedWholesaleRow = {
  product: Item
  key: string
  breakdown: ReturnType<typeof calculateBreakdown>
  weight: number | null
  styleName: string
  subcategoryName: string
}

export default function WholesaleOrderClient() {
  const { categories, rates, isBootstrapping } = useCatalogData()
  const { hasWholesaleAccess, tierReady, wholesalePricing } = useCustomerTier()
  const cart = useCart()
  const [metal, setMetal] = useState<CatalogMetalKey>('gold')
  const metalInitialized = useRef(false)
  const [qtyByKey, setQtyByKey] = useState<Record<string, number>>({})
  const [draftHydrated, setDraftHydrated] = useState(false)
  const [adding, setAdding] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [weightLow, setWeightLow] = useState(0)
  const [weightHigh, setWeightHigh] = useState(100)
  const [priceLow, setPriceLow] = useState(0)
  const [priceHigh, setPriceHigh] = useState(100000)
  const [bulkQtyDraft, setBulkQtyDraft] = useState('')

  const rowsWithMeta = useMemo(() => flattenWholesaleRows(categories, metal), [categories, metal])

  /** Restore metal + qty draft from session (same tab — survives Ledger / back nav). */
  useEffect(() => {
    try {
      const m = sessionStorage.getItem(WHOLESALE_METAL_KEY)
      if (m === 'gold' || m === 'silver' || m === 'diamond') setMetal(m)
    } catch {
      /* ignore */
    }
    setQtyByKey(loadWholesaleQtyDraft())
    setDraftHydrated(true)
  }, [])

  /** After session restore, land on first metal with stock only if the restored tab is empty. */
  useEffect(() => {
    if (categories.length === 0 || !draftHydrated || metalInitialized.current) return
    metalInitialized.current = true
    setMetal((prev) =>
      flattenWholesaleRows(categories, prev).length > 0 ? prev : firstMetalWithProducts(categories),
    )
  }, [categories, draftHydrated])

  const { weightBounds, priceBounds } = useMemo(() => {
    const products = rowsWithMeta.map((r) => r.product)
    if (products.length === 0) {
      return { weightBounds: [0, 100] as [number, number], priceBounds: [0, 100000] as [number, number] }
    }
    const weights = products
      .map((p) => Number(p.net_weight ?? p.net_wt ?? p.weight ?? 0) || 0)
      .filter((w) => w > 0)
    const prices = products.map((p) =>
      calculateBreakdown(p, rates, (p as { gst_rate?: number }).gst_rate ?? 3, wholesalePricing).total,
    )
    const wMin = weights.length ? Math.floor(Math.min(...weights)) : 0
    const wMax = weights.length ? Math.ceil(Math.max(...weights)) : 100
    const pMin = prices.length ? Math.floor(Math.min(...prices) / 1000) * 1000 : 0
    const pMax = prices.length ? Math.ceil(Math.max(...prices) / 1000) * 1000 : 100000
    return {
      weightBounds: [Math.max(0, wMin - 1), wMax + 1] as [number, number],
      priceBounds: [Math.max(0, pMin - 1000), pMax + 1000] as [number, number],
    }
  }, [rowsWithMeta, rates, wholesalePricing])

  useEffect(() => {
    setWeightLow(weightBounds[0])
    setWeightHigh(weightBounds[1])
    setPriceLow(priceBounds[0])
    setPriceHigh(priceBounds[1])
  }, [weightBounds[0], weightBounds[1], priceBounds[0], priceBounds[1]])

  useEffect(() => {
    try {
      sessionStorage.setItem(WHOLESALE_METAL_KEY, metal)
    } catch {
      /* ignore */
    }
  }, [metal])

  useEffect(() => {
    if (!draftHydrated) return
    saveWholesaleQtyDraft(qtyByKey)
  }, [qtyByKey, draftHydrated])

  /** Changing metal only clears search — quantities stay in the draft (all metals). */
  useEffect(() => {
    setSearchQuery('')
  }, [metal])

  const productByKey = useMemo(() => buildCatalogProductByKeyMap(categories), [categories])

  const pricedRowsAll = useMemo((): PricedWholesaleRow[] => {
    return rowsWithMeta.map(({ product, styleName, subcategoryName }) => {
      const k = productKey(product)
      const key = k || `row-${String(product.sku ?? '')}`
      const breakdown = calculateBreakdown(product, rates, product.gst_rate ?? 3, wholesalePricing)
      const weight = getItemWeight(product)
      return { product, key, breakdown, weight, styleName, subcategoryName }
    })
  }, [rowsWithMeta, rates, wholesalePricing])

  const pricedVisible = useMemo(() => {
    return pricedRowsAll.filter((row) => {
      if (
        !productPassesCatalogFilters(
          row.product,
          metal,
          weightLow,
          weightHigh,
          priceLow,
          priceHigh,
          rates,
          wholesalePricing,
        )
      ) {
        return false
      }
      return wholesaleRowMatchesSearch(
        {
          product: row.product,
          styleName: row.styleName,
          subcategoryName: row.subcategoryName,
        },
        searchQuery,
      )
    })
  }, [
    pricedRowsAll,
    metal,
    weightLow,
    weightHigh,
    priceLow,
    priceHigh,
    rates,
    wholesalePricing,
    searchQuery,
  ])

  const hasActiveFilters =
    searchQuery.trim().length > 0 ||
    weightLow > weightBounds[0] ||
    weightHigh < weightBounds[1] ||
    priceLow > priceBounds[0] ||
    priceHigh < priceBounds[1]

  const resetFilters = useCallback(() => {
    setSearchQuery('')
    setWeightLow(weightBounds[0])
    setWeightHigh(weightBounds[1])
    setPriceLow(priceBounds[0])
    setPriceHigh(priceBounds[1])
  }, [weightBounds, priceBounds])

  const clearAllQuantities = useCallback(() => {
    setQtyByKey({})
    clearWholesaleQtyDraft()
  }, [])

  /** Totals for the full draft (all metals / all filters), not only the current visible slice. */
  const footerTotals = useMemo(() => {
    let weight = 0
    let price = 0
    let lines = 0
    for (const [key, q] of Object.entries(qtyByKey)) {
      if (q <= 0) continue
      const product = productByKey.get(key)
      if (!product) continue
      const pk = productKey(product)
      if (!pk) continue
      const breakdown = calculateBreakdown(product, rates, product.gst_rate ?? 3, wholesalePricing)
      lines += 1
      const w = getItemWeight(product) ?? 0
      weight += w * q
      price += breakdown.total * q
    }
    return { weight, price, lines }
  }, [qtyByKey, productByKey, rates, wholesalePricing])

  const onQtyChange = useCallback((key: string, raw: string) => {
    const n = parseInt(raw, 10)
    setQtyByKey((prev) => {
      const next = { ...prev }
      if (!Number.isFinite(n) || n < 1) {
        delete next[key]
        return next
      }
      next[key] = Math.min(9999, n)
      return next
    })
  }, [])

  const applyBulkQtyToVisible = useCallback(() => {
    const n = parseInt(bulkQtyDraft, 10)
    if (!Number.isFinite(n) || n < 1) return
    setQtyByKey((prev) => {
      const next = { ...prev }
      for (const { key } of pricedVisible) {
        next[key] = Math.min(9999, n)
      }
      return next
    })
  }, [pricedVisible, bulkQtyDraft])

  const handleBulkAdd = useCallback(async () => {
    setAdding(true)
    try {
      for (const [key, q] of Object.entries(qtyByKey)) {
        if (q < 1) continue
        const product = productByKey.get(key)
        if (!product || !productKey(product)) continue
        cart.addWithQty(product, q)
      }
      cart.openCart()
      setQtyByKey({})
      clearWholesaleQtyDraft()
    } finally {
      setAdding(false)
    }
  }, [qtyByKey, productByKey, cart])

  const sliderBlock = (
    <>
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
    </>
  )

  if (!tierReady || isBootstrapping) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center gap-4 bg-slate-950 px-4">
        <Loader2 className="size-10 animate-spin text-emerald-500" aria-hidden />
        <p className="text-sm text-slate-500">Loading catalogue…</p>
      </div>
    )
  }

  if (!hasWholesaleAccess) {
    return (
      <div className="min-h-[70vh] flex flex-col items-center justify-center gap-6 px-5 bg-slate-950 text-center">
        <div className="glass-card max-w-md rounded-2xl border border-white/10 p-8">
          <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-2xl bg-slate-800/80 ring-1 ring-white/10">
            <ShoppingCart className="size-7 text-slate-500" aria-hidden />
          </div>
          <h1 className="text-lg font-semibold text-slate-100">Wholesale access only</h1>
          <p className="mt-2 text-sm leading-relaxed text-slate-400">
            Sign in with your registered email or mobile. Contact KC Jewellers to enable B2B wholesale on your account.
          </p>
          <Link
            href={CATALOG_PATH}
            className="mt-6 inline-flex min-h-[48px] w-full touch-manipulation items-center justify-center rounded-xl bg-amber-500 px-5 text-sm font-semibold text-slate-950 shadow-lg shadow-amber-950/30 transition hover:bg-amber-400"
          >
            Back to catalogue
          </Link>
        </div>
      </div>
    )
  }

  const emptyMetal = rowsWithMeta.length === 0
  const emptyMatches = !emptyMetal && pricedVisible.length === 0

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-950 to-slate-900/80 text-slate-100 pb-[calc(11rem+env(safe-area-inset-bottom,0px))] md:pb-32">
      <div className="max-w-[1600px] mx-auto px-3 sm:px-5 pt-3 md:pt-8">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-400/85">B2B</p>
            <h1 className="mt-0.5 text-xl font-bold tracking-tight text-white md:text-2xl">Wholesale quick order</h1>
          </div>
          <Link
            href={CATALOG_PATH}
            className="shrink-0 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-medium text-slate-200 transition hover:border-emerald-500/35 hover:bg-white/[0.07]"
          >
            Retail
          </Link>
        </div>

        <div className="mb-3 flex gap-1.5 overflow-x-auto pb-1 scrollbar-hide -mx-0.5 px-0.5">
          {METAL_TABS.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              type="button"
              onClick={() => setMetal(key)}
              className={cn(
                'flex min-h-[40px] shrink-0 touch-manipulation items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-semibold transition-all active:scale-[0.98] md:min-h-[44px] md:gap-2 md:rounded-2xl md:px-4 md:py-2.5 md:text-sm',
                metal === key
                  ? 'border-emerald-500/55 bg-emerald-600 text-white shadow-md shadow-emerald-950/35'
                  : 'border-slate-700/80 bg-slate-900/80 text-slate-400 hover:border-slate-600 hover:text-slate-200',
              )}
            >
              <Icon className="size-3.5 md:size-4" aria-hidden />
              {label}
            </button>
          ))}
        </div>

        <p className="mb-3 text-[11px] leading-relaxed text-slate-500 md:text-xs">
          <span className="text-slate-400">
            {pricedVisible.length} shown
            {pricedRowsAll.length !== pricedVisible.length ? ` of ${pricedRowsAll.length}` : ''} · {metal}
            {hasActiveFilters ? ' · filtered' : ''}
          </span>
          {footerTotals.lines > 0 && (
            <span className="mt-1 block text-emerald-400/95 sm:mt-0 sm:ml-1 sm:inline">
              · Draft {footerTotals.lines} line{footerTotals.lines === 1 ? '' : 's'}
            </span>
          )}
        </p>

        <div className="lg:grid lg:grid-cols-[minmax(240px,280px)_1fr] lg:items-start lg:gap-8">
          <aside className="mb-4 space-y-3 lg:mb-0 lg:sticky lg:top-20 lg:self-start">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-500" aria-hidden />
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search SKU, style, name…"
                autoComplete="off"
                className="w-full rounded-xl border border-slate-700/90 bg-slate-950/80 py-2.5 pl-10 pr-3 text-sm text-slate-100 placeholder:text-slate-600 focus:border-emerald-500/50 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
              />
            </div>

            <div className="lg:hidden">
              <details className="group rounded-2xl border border-slate-800/90 bg-slate-900/35 open:border-emerald-500/20">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2.5 text-sm font-medium text-slate-200 [&::-webkit-details-marker]:hidden">
                  <span className="flex items-center gap-2">
                    <SlidersHorizontal className="size-4 text-emerald-400/90" aria-hidden />
                    Weight & price
                  </span>
                  <span className="text-xs text-slate-500 group-open:text-emerald-400/80">Tap</span>
                </summary>
                <div className="space-y-4 border-t border-slate-800/80 px-3 pb-3 pt-3">{sliderBlock}</div>
              </details>
            </div>

            <div className="hidden space-y-4 rounded-2xl border border-slate-800/90 bg-slate-900/35 p-3 lg:block">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Filters</p>
              {sliderBlock}
            </div>

            <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-800/80 bg-slate-900/30 px-3 py-2.5">
              <input
                type="number"
                min={1}
                max={9999}
                inputMode="numeric"
                placeholder="Qty"
                value={bulkQtyDraft}
                onChange={(e) => setBulkQtyDraft(e.target.value)}
                className="h-9 w-16 rounded-lg border border-slate-600/80 bg-slate-950 px-2 text-center text-sm tabular-nums text-slate-100 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500/30"
                aria-label="Quantity to apply to visible rows"
              />
              <button
                type="button"
                onClick={applyBulkQtyToVisible}
                disabled={pricedVisible.length === 0}
                className="min-h-9 touch-manipulation rounded-lg border border-emerald-500/35 bg-emerald-600/15 px-3 text-xs font-semibold text-emerald-200 transition hover:bg-emerald-600/25 disabled:pointer-events-none disabled:opacity-40"
              >
                Apply to list
              </button>
              <div className="flex w-full flex-wrap items-center gap-x-2 gap-y-1 sm:ml-auto sm:w-auto">
                {hasActiveFilters && (
                  <button
                    type="button"
                    onClick={resetFilters}
                    className="text-xs font-medium text-amber-400/90 underline-offset-2 hover:underline"
                  >
                    Clear filters
                  </button>
                )}
                {Object.keys(qtyByKey).length > 0 && (
                  <button
                    type="button"
                    onClick={clearAllQuantities}
                    className="text-xs font-medium text-slate-500 underline-offset-2 hover:text-rose-400/90 hover:underline"
                  >
                    Clear quantities
                  </button>
                )}
              </div>
            </div>
          </aside>

          <div>
            <div className="space-y-2.5 md:hidden">
              {emptyMetal ? (
                <div className="rounded-2xl border border-dashed border-slate-700 py-12 text-center text-sm text-slate-500">
                  No products in this metal.
                </div>
              ) : emptyMatches ? (
                <div className="rounded-2xl border border-dashed border-slate-700 px-3 py-12 text-center text-sm text-slate-500">
                  {footerTotals.lines > 0 ? (
                    <>
                      <span className="text-slate-300">No rows match current filters.</span>{' '}
                      <span className="text-emerald-400/90">
                        Your draft still has {footerTotals.lines} line{footerTotals.lines === 1 ? '' : 's'} — clear filters or search to see them.
                      </span>
                    </>
                  ) : (
                    'No matches — try another search or widen weight / price.'
                  )}
                </div>
              ) : (
                pricedVisible.map(({ product, key, breakdown, weight, styleName, subcategoryName }) => {
                  const src = normalizeCatalogImageSrc(product.image_url)
                  const purity = product.purity != null ? String(product.purity) : '—'
                  const retail = breakdown.wholesale_retail_total
                  const showWs =
                    breakdown.is_wholesale_price && retail != null && retail > breakdown.total + 0.5
                  const sku = product.barcode || product.sku || '—'
                  return (
                    <div
                      key={key}
                      className="rounded-2xl border border-slate-800/90 bg-slate-900/40 p-3 shadow-sm shadow-black/15"
                    >
                      <div className="flex gap-2.5">
                        <div className="relative size-14 shrink-0 overflow-hidden rounded-lg border border-slate-700/80 bg-slate-800">
                          {src ? (
                            <Image src={src} alt="" fill className="object-contain" sizes="56px" unoptimized />
                          ) : (
                            <span className="absolute inset-0 flex items-center justify-center text-sm font-bold text-slate-600">
                              {String(sku).charAt(0)}
                            </span>
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="font-mono text-[11px] text-emerald-400/90">{sku}</p>
                          <p className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-slate-500">
                            {styleName} · {subcategoryName}
                          </p>
                          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-slate-500">
                            <span>
                              <span className="tabular-nums text-slate-300">
                                {weight != null ? `${Number(weight).toFixed(2)} g` : '—'}
                              </span>
                            </span>
                            <span>
                              <span className="text-slate-300">{purity}</span>
                            </span>
                          </div>
                          <div className="mt-1.5">
                            {showWs && (
                              <div className="text-[10px] font-bold uppercase tracking-wide text-emerald-500">Wholesale</div>
                            )}
                            {showWs && (
                              <div className="text-xs line-through tabular-nums text-slate-500">
                                ₹{Math.round(retail).toLocaleString('en-IN')}
                              </div>
                            )}
                            <div
                              className={cn(
                                'text-base font-semibold tabular-nums',
                                showWs ? 'text-emerald-400' : 'text-amber-400',
                              )}
                            >
                              ₹{Math.round(breakdown.total).toLocaleString('en-IN')}
                              <span className="ml-1 text-[10px] font-normal text-slate-500">GST</span>
                            </div>
                          </div>
                        </div>
                      </div>
                      <div className="mt-2.5 flex items-center gap-2">
                        <span className="text-[10px] font-medium uppercase tracking-wide text-slate-500">Qty</span>
                        <input
                          type="number"
                          min={1}
                          max={9999}
                          inputMode="numeric"
                          placeholder="—"
                          autoComplete="off"
                          value={qtyByKey[key] ?? ''}
                          onChange={(e) => onQtyChange(key, e.target.value)}
                          className="h-10 min-w-0 flex-1 rounded-lg border border-slate-600/80 bg-slate-950 px-3 text-center text-sm tabular-nums text-slate-100 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500/25"
                        />
                      </div>
                    </div>
                  )
                })
              )}
            </div>

            <div className="hidden md:block rounded-2xl border border-slate-800/90 bg-slate-900/30 shadow-xl shadow-black/25 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] border-collapse text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-800 bg-slate-900/90 text-[11px] uppercase tracking-wider text-slate-400">
                      <th className="w-14 px-3 py-3 font-semibold">Img</th>
                      <th className="px-3 py-3 font-semibold">SKU</th>
                      <th className="px-3 py-3 font-semibold">Style</th>
                      <th className="px-3 py-3 text-right font-semibold">Net wt (g)</th>
                      <th className="px-3 py-3 font-semibold">Purity</th>
                      <th className="px-3 py-3 text-right font-semibold">Est. price</th>
                      <th className="w-28 px-3 py-3 text-center font-semibold">Qty</th>
                    </tr>
                  </thead>
                  <tbody>
                    {emptyMetal ? (
                      <tr>
                        <td colSpan={7} className="px-4 py-14 text-center text-slate-500">
                          No products in this metal.
                        </td>
                      </tr>
                    ) : emptyMatches ? (
                      <tr>
                        <td colSpan={7} className="px-4 py-14 text-center text-slate-500">
                          {footerTotals.lines > 0 ? (
                            <>
                              <span className="text-slate-300">No rows match current filters.</span>{' '}
                              <span className="text-emerald-400/90">
                                Draft has {footerTotals.lines} line{footerTotals.lines === 1 ? '' : 's'} — use Clear filters to show them.
                              </span>
                            </>
                          ) : (
                            'No matches — adjust search or filters.'
                          )}
                        </td>
                      </tr>
                    ) : (
                      pricedVisible.map(({ product, key, breakdown, weight, styleName, subcategoryName }) => {
                        const src = normalizeCatalogImageSrc(product.image_url)
                        const purity = product.purity != null ? String(product.purity) : '—'
                        const retail = breakdown.wholesale_retail_total
                        const showWs =
                          breakdown.is_wholesale_price && retail != null && retail > breakdown.total + 0.5
                        return (
                          <tr key={key} className="border-b border-slate-800/60 transition-colors hover:bg-slate-800/40">
                            <td className="w-14 p-2">
                              <div className="relative size-12 overflow-hidden rounded-lg border border-slate-700/80 bg-slate-800">
                                {src ? (
                                  <Image src={src} alt="" fill className="object-contain" sizes="48px" unoptimized />
                                ) : (
                                  <span className="absolute inset-0 flex items-center justify-center text-xs text-slate-600">
                                    {(product.sku || '?').toString().charAt(0)}
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="px-3 py-2.5 font-mono text-xs text-slate-200">
                              {product.barcode || product.sku || '—'}
                            </td>
                            <td className="max-w-[10rem] px-3 py-2.5 text-xs text-slate-400">
                              <span className="line-clamp-2">{styleName}</span>
                              <span className="block text-[10px] text-slate-600">{subcategoryName}</span>
                            </td>
                            <td className="px-3 py-2.5 text-right tabular-nums text-slate-300">
                              {weight != null ? Number(weight).toFixed(2) : '—'}
                            </td>
                            <td className="px-3 py-2.5 tabular-nums text-slate-400">{purity}</td>
                            <td className="px-3 py-2.5 text-right">
                              {showWs && (
                                <div className="text-[10px] font-bold uppercase tracking-wide text-emerald-500">Wholesale</div>
                              )}
                              {showWs && (
                                <div className="text-xs tabular-nums line-through text-slate-500">
                                  ₹{Math.round(retail).toLocaleString('en-IN')}
                                </div>
                              )}
                              <div
                                className={cn(
                                  'tabular-nums font-semibold',
                                  showWs ? 'text-emerald-400' : 'text-amber-400',
                                )}
                              >
                                ₹{Math.round(breakdown.total).toLocaleString('en-IN')}
                              </div>
                              <div className="text-[10px] text-slate-600">incl. GST</div>
                            </td>
                            <td className="px-2 py-2">
                              <input
                                type="number"
                                min={1}
                                max={9999}
                                inputMode="numeric"
                                placeholder="—"
                                value={qtyByKey[key] ?? ''}
                                onChange={(e) => onQtyChange(key, e.target.value)}
                                className="w-full min-h-10 rounded-lg border border-slate-600/80 bg-slate-950 px-2 text-center text-sm tabular-nums text-slate-100 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                              />
                            </td>
                          </tr>
                        )
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div
        className={cn(
          'kc-bottom-above-mobile-nav fixed left-0 right-0 z-40 border-t border-emerald-500/20 bg-slate-950/95 backdrop-blur-md shadow-[0_-8px_32px_rgba(0,0,0,0.45)] safe-area-pb px-3 py-2.5 md:px-6 md:py-4',
        )}
      >
        <div className="max-w-[1600px] mx-auto flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
          <div className="flex flex-wrap items-end gap-4 text-xs sm:gap-6 sm:text-sm">
            <div>
              <span className="block text-[9px] font-semibold uppercase tracking-wider text-slate-500 sm:text-[10px]">
                Lines <span className="font-normal text-slate-600">(draft)</span>
              </span>
              <span className="tabular-nums text-base font-bold text-slate-100 sm:text-lg">{footerTotals.lines}</span>
            </div>
            <div>
              <span className="block text-[9px] font-semibold uppercase tracking-wider text-slate-500 sm:text-[10px]">Weight</span>
              <span className="tabular-nums text-base font-bold text-slate-100 sm:text-lg">{footerTotals.weight.toFixed(2)} g</span>
            </div>
            <div>
              <span className="block text-[9px] font-semibold uppercase tracking-wider text-slate-500 sm:text-[10px]">Total</span>
              <span className="tabular-nums text-base font-bold text-emerald-400 sm:text-xl">
                ₹{Math.round(footerTotals.price).toLocaleString('en-IN')}
              </span>
            </div>
          </div>
          <button
            type="button"
            disabled={adding || footerTotals.price <= 0}
            onClick={handleBulkAdd}
            className="flex min-h-[48px] w-full touch-manipulation items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-600 to-emerald-500 px-5 text-sm font-bold text-white shadow-lg shadow-emerald-950/45 transition hover:from-emerald-500 hover:to-emerald-400 disabled:pointer-events-none disabled:opacity-35 sm:min-h-11 sm:w-auto sm:shrink-0 sm:rounded-2xl sm:px-8"
          >
            {adding ? (
              <>
                <Loader2 className="size-5 animate-spin" aria-hidden />
                Adding…
              </>
            ) : (
              <>
                <ShoppingCart className="size-4" aria-hidden />
                Add to cart
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}

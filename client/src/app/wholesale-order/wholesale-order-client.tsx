'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { Gem, LayoutGrid, Loader2, Search, ShoppingCart, SlidersHorizontal, Sparkles, X } from 'lucide-react'
import { useCatalogData } from '@/app/catalog/catalog-data-context'
import { useCustomerTier } from '@/context/CustomerTierContext'
import { useCart } from '@/context/CartContext'
import DualRangeSlider from '@/components/DualRangeSlider'
import { CATALOG_PATH } from '@/lib/routes'
import { calculateBreakdown, getItemWeight, type Item } from '@/lib/pricing'
import {
  firstMetalWithProducts,
  flattenProductsForMetal,
  productMatchesSearchQuery,
  productPassesCatalogFilters,
  type CatalogMetalKey,
} from '@/lib/catalog-product-filters'
import { normalizeCatalogImageSrc } from '@/lib/normalize-image-url'
import { cn } from '@/lib/utils'

const METAL_TABS: { key: CatalogMetalKey; label: string; icon: typeof Sparkles }[] = [
  { key: 'gold', label: 'Gold', icon: Sparkles },
  { key: 'silver', label: 'Silver', icon: LayoutGrid },
  { key: 'diamond', label: 'Diamond', icon: Gem },
]

function productKey(p: Item): string {
  return String(p.barcode ?? p.sku ?? p.id ?? '').trim()
}

export default function WholesaleOrderClient() {
  const { categories, rates, isBootstrapping } = useCatalogData()
  const { hasWholesaleAccess, tierReady, wholesalePricing } = useCustomerTier()
  const cart = useCart()
  const initialMetalDone = useRef(false)

  const [metal, setMetal] = useState<CatalogMetalKey>('gold')
  const [qtyByKey, setQtyByKey] = useState<Record<string, number>>({})
  const [adding, setAdding] = useState(false)
  const [searchInput, setSearchInput] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [weightLow, setWeightLow] = useState(0)
  const [weightHigh, setWeightHigh] = useState(100)
  const [priceLow, setPriceLow] = useState(0)
  const [priceHigh, setPriceHigh] = useState(100_000)
  const [bulkQtyInput, setBulkQtyInput] = useState('')

  /** Land on first metal that actually has SKUs (e.g. Silver when Gold is empty). */
  useEffect(() => {
    if (isBootstrapping || categories.length === 0) return
    if (initialMetalDone.current) return
    initialMetalDone.current = true
    setMetal(firstMetalWithProducts(categories))
  }, [categories, isBootstrapping])

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedSearch(searchInput), 220)
    return () => window.clearTimeout(t)
  }, [searchInput])

  const metalRows = useMemo(
    () => flattenProductsForMetal(categories, metal),
    [categories, metal],
  )

  const { weightBounds, priceBounds } = useMemo(() => {
    if (metalRows.length === 0) {
      return {
        weightBounds: [0, 100] as [number, number],
        priceBounds: [0, 100_000] as [number, number],
      }
    }
    const weights = metalRows
      .map((r) => r.product.net_weight ?? r.product.net_wt ?? r.product.weight ?? 0)
      .map(Number)
      .filter((w) => w > 0)
    const prices = metalRows.map((r) => {
      const p = r.product
      return calculateBreakdown(p, rates, (p as { gst_rate?: number }).gst_rate ?? 3, wholesalePricing).total
    })
    const wMin = weights.length ? Math.floor(Math.min(...weights)) : 0
    const wMax = weights.length ? Math.ceil(Math.max(...weights)) : 100
    const pMin = prices.length ? Math.floor(Math.min(...prices) / 1000) * 1000 : 0
    const pMax = prices.length ? Math.ceil(Math.max(...prices) / 1000) * 1000 : 100_000
    return {
      weightBounds: [Math.max(0, wMin - 1), wMax + 1] as [number, number],
      priceBounds: [Math.max(0, pMin - 1000), pMax + 1000] as [number, number],
    }
  }, [metalRows, rates, wholesalePricing])

  useEffect(() => {
    setWeightLow(weightBounds[0])
    setWeightHigh(weightBounds[1])
    setPriceLow(priceBounds[0])
    setPriceHigh(priceBounds[1])
    setSearchInput('')
  }, [metal, weightBounds[0], weightBounds[1], priceBounds[0], priceBounds[1]])

  const pricedRows = useMemo(() => {
    return metalRows
      .map((row) => {
        const p = row.product
        const k = productKey(p)
        const key = k || `row-${p.sku}`
        const b = calculateBreakdown(p, rates, p.gst_rate ?? 3, wholesalePricing)
        const w = getItemWeight(p)
        return { row, product: p, key, breakdown: b, weight: w }
      })
      .filter(({ row, product }) =>
        productPassesCatalogFilters(
          product,
          metal,
          weightLow,
          weightHigh,
          priceLow,
          priceHigh,
          rates,
          wholesalePricing,
        ) && productMatchesSearchQuery(row, debouncedSearch),
      )
  }, [metalRows, metal, weightLow, weightHigh, priceLow, priceHigh, rates, wholesalePricing, debouncedSearch])

  useEffect(() => {
    setQtyByKey({})
  }, [metal])

  const hasActiveFilters = useMemo(() => {
    return (
      weightLow > weightBounds[0] ||
      weightHigh < weightBounds[1] ||
      priceLow > priceBounds[0] ||
      priceHigh < priceBounds[1] ||
      debouncedSearch.trim().length > 0
    )
  }, [weightLow, weightHigh, priceLow, priceHigh, weightBounds, priceBounds, debouncedSearch])

  const footerTotals = useMemo(() => {
    let weight = 0
    let price = 0
    let lines = 0
    for (const { product, key, breakdown } of pricedRows) {
      const q = qtyByKey[key] ?? 0
      if (q <= 0) continue
      lines += 1
      const w = getItemWeight(product) ?? 0
      weight += w * q
      price += breakdown.total * q
    }
    return { weight, price, lines }
  }, [pricedRows, qtyByKey])

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

  const clearFilters = useCallback(() => {
    setWeightLow(weightBounds[0])
    setWeightHigh(weightBounds[1])
    setPriceLow(priceBounds[0])
    setPriceHigh(priceBounds[1])
    setSearchInput('')
  }, [weightBounds, priceBounds])

  const applyBulkQtyToFiltered = useCallback(() => {
    const n = parseInt(bulkQtyInput, 10)
    if (!Number.isFinite(n) || n < 1 || n > 9999) return
    setQtyByKey((prev) => {
      const next = { ...prev }
      for (const { key } of pricedRows) {
        next[key] = n
      }
      return next
    })
  }, [pricedRows, bulkQtyInput])

  const handleBulkAdd = useCallback(async () => {
    setAdding(true)
    try {
      for (const { product, key } of pricedRows) {
        const q = qtyByKey[key] ?? 0
        if (q < 1) continue
        if (!productKey(product)) continue
        cart.addWithQty(product, q)
      }
      cart.openCart()
      setQtyByKey({})
    } finally {
      setAdding(false)
    }
  }, [pricedRows, qtyByKey, cart])

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

  const filterSummaryCount = pricedRows.length

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-950 to-slate-900/80 text-slate-100 pb-[calc(10rem+env(safe-area-inset-bottom,0px))] md:pb-32">
      <div className="max-w-[1600px] mx-auto px-3 sm:px-5 pt-3 md:pt-8">
        {/* Compact header — less vertical space on mobile */}
        <div className="mb-3 md:mb-5 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between border-b border-white/5 pb-3 md:border-0 md:pb-0">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="rounded-md bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-emerald-400">
                B2B
              </span>
              <h1 className="text-lg font-bold tracking-tight text-white md:text-3xl">Wholesale quick order</h1>
            </div>
            <p className="mt-1 text-xs text-slate-500 md:text-sm md:max-w-2xl">
              Search by SKU or style, narrow by weight and price, then enter quantities.
            </p>
          </div>
          <Link
            href={CATALOG_PATH}
            className="inline-flex shrink-0 items-center justify-center self-start rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-medium text-slate-300 transition hover:border-emerald-500/30 hover:bg-white/[0.07] md:min-h-[44px] md:rounded-xl md:px-4 md:text-sm"
          >
            Retail catalogue
          </Link>
        </div>

        <div className="mb-3 flex gap-1.5 overflow-x-auto pb-0.5 scrollbar-hide -mx-0.5 px-0.5 md:gap-2 md:mb-4">
          {METAL_TABS.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              type="button"
              onClick={() => setMetal(key)}
              className={cn(
                'flex min-h-[40px] shrink-0 touch-manipulation items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-semibold transition-all active:scale-[0.98] md:min-h-[44px] md:gap-2 md:rounded-2xl md:px-4 md:text-sm',
                metal === key
                  ? 'border-emerald-500/60 bg-emerald-600 text-white shadow-md shadow-emerald-950/30'
                  : 'border-slate-700/80 bg-slate-900/80 text-slate-400 hover:border-slate-600 hover:text-slate-200',
              )}
            >
              <Icon className="size-3.5 md:size-4" aria-hidden />
              {label}
            </button>
          ))}
        </div>

        {/* Filters: collapsible on mobile, sidebar-style on desktop */}
        <details className="group mb-4 md:mb-5 rounded-xl border border-slate-800/90 bg-slate-900/35 md:rounded-2xl md:border-slate-800/80 md:bg-slate-900/25">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2.5 md:px-4 md:py-3 [&::-webkit-details-marker]:hidden">
            <span className="flex items-center gap-2 text-xs font-semibold text-slate-300 md:text-sm">
              <SlidersHorizontal className="size-4 text-amber-500/90" aria-hidden />
              Search &amp; filters
              {hasActiveFilters && (
                <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] font-medium text-amber-400">
                  Active
                </span>
              )}
            </span>
            <span className="text-[11px] text-slate-500 md:hidden">Tap to expand</span>
          </summary>
          <div className="space-y-4 border-t border-slate-800/80 px-3 pb-3 pt-3 md:grid md:grid-cols-2 md:gap-6 md:px-4 md:pb-4">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-slate-500" aria-hidden />
              <input
                type="search"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="SKU, design, style, category…"
                autoComplete="off"
                className="w-full rounded-lg border border-slate-700/80 bg-slate-950 py-2 pl-9 pr-9 text-sm text-slate-100 placeholder:text-slate-600 focus:border-emerald-500/50 focus:outline-none focus:ring-1 focus:ring-emerald-500/30"
              />
              {searchInput && (
                <button
                  type="button"
                  onClick={() => setSearchInput('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-slate-500 hover:bg-white/5 hover:text-slate-300"
                  aria-label="Clear search"
                >
                  <X className="size-4" />
                </button>
              )}
            </div>

            <div className="md:col-span-2 md:grid md:grid-cols-2 md:gap-6">
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
            </div>

            {hasActiveFilters && (
              <div className="flex flex-wrap items-center gap-2 md:col-span-2">
                <button
                  type="button"
                  onClick={clearFilters}
                  className="text-xs font-medium text-amber-500/90 hover:text-amber-400"
                >
                  Reset weight, price &amp; search
                </button>
              </div>
            )}

            <div className="flex flex-wrap items-end gap-2 border-t border-slate-800/60 pt-3 md:col-span-2">
              <div className="flex min-w-0 flex-1 flex-col gap-1 sm:max-w-[12rem]">
                <label className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Qty for all shown</label>
                <div className="flex gap-2">
                  <input
                    type="number"
                    min={1}
                    max={9999}
                    inputMode="numeric"
                    placeholder="e.g. 5"
                    value={bulkQtyInput}
                    onChange={(e) => setBulkQtyInput(e.target.value)}
                    className="min-h-[40px] w-24 rounded-lg border border-slate-600/80 bg-slate-950 px-2 text-center text-sm tabular-nums text-slate-100 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500/25"
                  />
                  <button
                    type="button"
                    onClick={applyBulkQtyToFiltered}
                    disabled={pricedRows.length === 0}
                    className="min-h-[40px] shrink-0 rounded-lg border border-emerald-500/40 bg-emerald-600/15 px-3 text-xs font-semibold text-emerald-200 transition hover:bg-emerald-600/25 disabled:opacity-40"
                  >
                    Apply to {filterSummaryCount} SKU{filterSummaryCount === 1 ? '' : 's'}
                  </button>
                </div>
              </div>
              <p className="text-[11px] leading-snug text-slate-500">
                Sets the same quantity on every row currently visible (after search and sliders).
              </p>
            </div>
          </div>
        </details>

        <p className="mb-2 text-[11px] text-slate-500 md:text-xs">
          {filterSummaryCount} SKU{filterSummaryCount === 1 ? '' : 's'} shown · {metal}
          {metalRows.length !== filterSummaryCount && (
            <span className="text-slate-600"> ({metalRows.length} total in metal)</span>
          )}
        </p>

        {/* Mobile: denser cards */}
        <div className="space-y-2 md:hidden">
          {pricedRows.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-700 py-12 text-center text-sm text-slate-500">
              No products match your filters.
            </div>
          ) : (
            pricedRows.map(({ row, product, key, breakdown, weight }) => {
              const src = normalizeCatalogImageSrc(product.image_url)
              const purity = product.purity != null ? String(product.purity) : '—'
              const retail = breakdown.wholesale_retail_total
              const showWs =
                breakdown.is_wholesale_price && retail != null && retail > breakdown.total + 0.5
              const sku = product.barcode || product.sku || '—'
              return (
                <div
                  key={key}
                  className="rounded-xl border border-slate-800/90 bg-slate-900/40 p-3 shadow-sm shadow-black/15"
                >
                  <div className="flex gap-2.5">
                    <div className="relative size-16 shrink-0 overflow-hidden rounded-lg border border-slate-700/80 bg-slate-800">
                      {src ? (
                        <Image src={src} alt="" fill className="object-contain" sizes="64px" unoptimized />
                      ) : (
                        <span className="absolute inset-0 flex items-center justify-center text-sm font-bold text-slate-600">
                          {String(sku).charAt(0)}
                        </span>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-mono text-[11px] text-emerald-400/90">{sku}</p>
                      <p className="mt-0.5 line-clamp-1 text-[10px] text-slate-500">{row.categoryName} · {row.subcategoryName}</p>
                      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-slate-500">
                        <span>
                          Wt{' '}
                          <span className="tabular-nums text-slate-300">
                            {weight != null ? `${Number(weight).toFixed(2)} g` : '—'}
                          </span>
                        </span>
                        <span>
                          Pur. <span className="text-slate-300">{purity}</span>
                        </span>
                      </div>
                      <div className="mt-1">
                        {showWs && (
                          <span className="text-[9px] font-bold uppercase tracking-wide text-emerald-500">Wholesale</span>
                        )}
                        {showWs && (
                          <div className="text-xs line-through tabular-nums text-slate-500">
                            ₹{Math.round(retail).toLocaleString('en-IN')}
                          </div>
                        )}
                        <div
                          className={cn(
                            'text-base font-semibold tabular-nums leading-tight',
                            showWs ? 'text-emerald-400' : 'text-amber-400',
                          )}
                        >
                          ₹{Math.round(breakdown.total).toLocaleString('en-IN')}
                          <span className="ml-1 text-[10px] font-normal text-slate-500">GST incl.</span>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="mt-2.5 flex items-center gap-2">
                    <span className="w-8 shrink-0 text-center text-[10px] font-semibold uppercase text-slate-500">Qty</span>
                    <input
                      type="number"
                      min={1}
                      max={9999}
                      inputMode="numeric"
                      placeholder="—"
                      autoComplete="off"
                      value={qtyByKey[key] ?? ''}
                      onChange={(e) => onQtyChange(key, e.target.value)}
                      className="min-h-[40px] min-w-0 flex-1 rounded-lg border border-slate-600/80 bg-slate-950 px-2 text-center text-base font-medium tabular-nums text-slate-100 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500/25"
                    />
                  </div>
                </div>
              )
            })
          )}
        </div>

        {/* Desktop: table */}
        <div className="hidden md:block rounded-2xl border border-slate-800/90 bg-slate-900/30 shadow-xl shadow-black/25 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm border-collapse min-w-[720px]">
              <thead>
                <tr className="border-b border-slate-800 bg-slate-900/90 text-[11px] uppercase tracking-wider text-slate-400">
                  <th className="px-3 py-3.5 w-14 font-semibold">Img</th>
                  <th className="px-3 py-3.5 font-semibold">SKU</th>
                  <th className="px-3 py-3.5 font-semibold">Style</th>
                  <th className="px-3 py-3.5 text-right font-semibold">Net wt (g)</th>
                  <th className="px-3 py-3.5 font-semibold">Purity</th>
                  <th className="px-3 py-3.5 text-right font-semibold">Est. price</th>
                  <th className="px-3 py-3.5 w-28 text-center font-semibold">Qty</th>
                </tr>
              </thead>
              <tbody>
                {pricedRows.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-14 text-center text-slate-500">
                      No products match your filters.
                    </td>
                  </tr>
                ) : (
                  pricedRows.map(({ row, product, key, breakdown, weight }) => {
                    const src = normalizeCatalogImageSrc(product.image_url)
                    const purity = product.purity != null ? String(product.purity) : '—'
                    const retail = breakdown.wholesale_retail_total
                    const showWs =
                      breakdown.is_wholesale_price && retail != null && retail > breakdown.total + 0.5
                    return (
                      <tr key={key} className="border-b border-slate-800/60 transition-colors hover:bg-slate-800/40">
                        <td className="p-2 w-14">
                          <div className="relative size-12 rounded-lg overflow-hidden bg-slate-800 border border-slate-700/80">
                            {src ? (
                              <Image src={src} alt="" fill className="object-contain" sizes="48px" unoptimized />
                            ) : (
                              <span className="absolute inset-0 flex items-center justify-center text-xs text-slate-600">
                                {(product.sku || '?').toString().charAt(0)}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-3 py-2.5 font-mono text-xs text-slate-200">{product.barcode || product.sku || '—'}</td>
                        <td className="px-3 py-2.5 max-w-[10rem]">
                          <span className="line-clamp-2 text-xs text-slate-400">{row.subcategoryName}</span>
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-slate-300">
                          {weight != null ? Number(weight).toFixed(2) : '—'}
                        </td>
                        <td className="px-3 py-2.5 text-slate-400 tabular-nums">{purity}</td>
                        <td className="px-3 py-2.5 text-right">
                          {showWs && (
                            <div className="text-[10px] font-bold uppercase tracking-wide text-emerald-500">Wholesale</div>
                          )}
                          {showWs && (
                            <div className="line-through text-slate-500 text-xs tabular-nums">
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
                            className="w-full min-h-[40px] rounded-lg border border-slate-600/80 bg-slate-950 px-2 text-center text-sm tabular-nums text-slate-100 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
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

      <div
        className={cn(
          'kc-bottom-above-mobile-nav fixed left-0 right-0 z-40 border-t border-emerald-500/20 bg-slate-950/95 backdrop-blur-md shadow-[0_-6px_24px_rgba(0,0,0,0.4)] safe-area-pb px-3 py-2.5 md:px-6 md:py-3.5',
        )}
      >
        <div className="max-w-[1600px] mx-auto flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 text-xs sm:text-sm md:gap-6">
            <div>
              <span className="text-slate-500 block text-[9px] font-semibold uppercase tracking-wider md:text-[10px]">Lines</span>
              <span className="tabular-nums text-base font-bold text-slate-100 md:text-lg">{footerTotals.lines}</span>
            </div>
            <div>
              <span className="text-slate-500 block text-[9px] font-semibold uppercase tracking-wider md:text-[10px]">Weight</span>
              <span className="tabular-nums text-base font-bold text-slate-100 md:text-lg">{footerTotals.weight.toFixed(2)} g</span>
            </div>
            <div>
              <span className="text-slate-500 block text-[9px] font-semibold uppercase tracking-wider md:text-[10px]">Total</span>
              <span className="tabular-nums text-lg font-bold text-emerald-400 md:text-xl">
                ₹{Math.round(footerTotals.price).toLocaleString('en-IN')}
              </span>
            </div>
          </div>
          <button
            type="button"
            disabled={adding || footerTotals.price <= 0}
            onClick={handleBulkAdd}
            className="flex min-h-[48px] w-full touch-manipulation items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-600 to-emerald-500 px-4 text-sm font-bold text-white shadow-lg shadow-emerald-950/40 transition hover:from-emerald-500 hover:to-emerald-400 disabled:pointer-events-none disabled:opacity-35 sm:min-h-[44px] sm:w-auto sm:shrink-0 sm:rounded-2xl sm:px-6"
          >
            {adding ? (
              <>
                <Loader2 className="size-5 animate-spin" aria-hidden />
                Adding…
              </>
            ) : (
              <>
                <ShoppingCart className="size-4 shrink-0" aria-hidden />
                <span className="md:hidden">Add to cart</span>
                <span className="hidden md:inline">Add bulk order to cart</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}

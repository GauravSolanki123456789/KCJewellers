'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { Gem, LayoutGrid, Loader2, Sparkles, ShoppingCart } from 'lucide-react'
import { useCatalogData } from '@/app/catalog/catalog-data-context'
import { useCustomerTier } from '@/context/CustomerTierContext'
import { useCart } from '@/context/CartContext'
import { CATALOG_PATH } from '@/lib/routes'
import { calculateBreakdown, getItemWeight, type Item } from '@/lib/pricing'
import { productMatchesMetal, type CatalogMetalKey } from '@/lib/catalog-product-filters'
import { normalizeCatalogImageSrc } from '@/lib/normalize-image-url'
import { cn } from '@/lib/utils'

const METAL_TABS: { key: CatalogMetalKey; label: string; icon: typeof Sparkles }[] = [
  { key: 'gold', label: 'Gold', icon: Sparkles },
  { key: 'silver', label: 'Silver', icon: LayoutGrid },
  { key: 'diamond', label: 'Diamond', icon: Gem },
]

function flattenProducts(categories: { subcategories: { products: Item[] }[] }[], metal: CatalogMetalKey): Item[] {
  const out: Item[] = []
  for (const c of categories) {
    for (const s of c.subcategories) {
      for (const p of s.products) {
        if (productMatchesMetal(p, metal)) out.push(p)
      }
    }
  }
  return out
}

function productKey(p: Item): string {
  return String(p.barcode ?? p.sku ?? p.id ?? '').trim()
}

export default function WholesaleOrderClient() {
  const { categories, rates, isBootstrapping } = useCatalogData()
  const { hasWholesaleAccess, tierReady, wholesalePricing } = useCustomerTier()
  const cart = useCart()
  const [metal, setMetal] = useState<CatalogMetalKey>('gold')
  const [qtyByKey, setQtyByKey] = useState<Record<string, number>>({})
  const [adding, setAdding] = useState(false)

  const rows = useMemo(() => flattenProducts(categories, metal), [categories, metal])

  const pricedRows = useMemo(() => {
    return rows.map((p) => {
      const k = productKey(p)
      const b = calculateBreakdown(p, rates, p.gst_rate ?? 3, wholesalePricing)
      const w = getItemWeight(p)
      return { product: p, key: k || `row-${p.sku}`, breakdown: b, weight: w }
    })
  }, [rows, rates, wholesalePricing])

  useEffect(() => {
    setQtyByKey({})
  }, [metal])

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

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-950 to-slate-900/80 text-slate-100 pb-[calc(11rem+env(safe-area-inset-bottom,0px))] md:pb-32">
      <div className="max-w-[1600px] mx-auto px-3 sm:px-5 pt-4 md:pt-8">
        <div className="relative mb-5 overflow-hidden rounded-2xl border border-emerald-500/20 bg-gradient-to-br from-emerald-950/50 via-slate-900/60 to-slate-950 p-4 sm:p-5 md:p-6 shadow-xl shadow-black/20">
          <div className="pointer-events-none absolute -right-16 -top-16 size-48 rounded-full bg-emerald-500/10 blur-3xl" aria-hidden />
          <div className="relative flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-emerald-400/90">B2B</p>
              <h1 className="mt-1 text-2xl font-bold tracking-tight text-white md:text-3xl">Wholesale quick order</h1>
              <p className="mt-2 max-w-xl text-sm leading-relaxed text-slate-400">
                Tab through quantity fields with your keyboard. Totals update live — add everything to cart in one tap.
              </p>
            </div>
            <Link
              href={CATALOG_PATH}
              className="inline-flex min-h-[44px] shrink-0 touch-manipulation items-center justify-center rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-medium text-slate-200 transition hover:border-emerald-500/30 hover:bg-white/10"
            >
              Retail catalogue
            </Link>
          </div>
        </div>

        <div className="mb-4 flex gap-2 overflow-x-auto pb-1 scrollbar-hide -mx-1 px-1">
          {METAL_TABS.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              type="button"
              onClick={() => setMetal(key)}
              className={cn(
                'flex min-h-[48px] shrink-0 touch-manipulation items-center gap-2 rounded-2xl border px-4 py-2.5 text-sm font-semibold transition-all active:scale-[0.98]',
                metal === key
                  ? 'border-emerald-500/60 bg-emerald-600 text-white shadow-lg shadow-emerald-950/40'
                  : 'border-slate-700/80 bg-slate-900/80 text-slate-400 hover:border-slate-600 hover:text-slate-200',
              )}
            >
              <Icon className="size-4" aria-hidden />
              {label}
            </button>
          ))}
        </div>

        <p className="mb-3 text-center text-[11px] text-slate-600 md:text-left">
          {pricedRows.length} SKU{pricedRows.length === 1 ? '' : 's'} · {metal}
        </p>

        {/* Mobile: card list */}
        <div className="space-y-3 md:hidden">
          {pricedRows.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-700 py-14 text-center text-sm text-slate-500">
              No products in this metal.
            </div>
          ) : (
            pricedRows.map(({ product, key, breakdown, weight }) => {
              const src = normalizeCatalogImageSrc(product.image_url)
              const purity = product.purity != null ? String(product.purity) : '—'
              const retail = breakdown.wholesale_retail_total
              const showWs =
                breakdown.is_wholesale_price && retail != null && retail > breakdown.total + 0.5
              const sku = product.barcode || product.sku || '—'
              return (
                <div
                  key={key}
                  className="rounded-2xl border border-slate-800/90 bg-slate-900/50 p-4 shadow-sm shadow-black/20"
                >
                  <div className="flex gap-3">
                    <div className="relative size-[4.5rem] shrink-0 overflow-hidden rounded-xl border border-slate-700/80 bg-slate-800">
                      {src ? (
                        <Image src={src} alt="" fill className="object-contain" sizes="72px" unoptimized />
                      ) : (
                        <span className="absolute inset-0 flex items-center justify-center text-lg font-bold text-slate-600">
                          {String(sku).charAt(0)}
                        </span>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-mono text-xs text-emerald-400/90">{sku}</p>
                      <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                        <span>
                          Wt:{' '}
                          <span className="tabular-nums text-slate-300">
                            {weight != null ? `${Number(weight).toFixed(2)} g` : '—'}
                          </span>
                        </span>
                        <span>
                          Purity: <span className="text-slate-300">{purity}</span>
                        </span>
                      </div>
                      <div className="mt-2">
                        {showWs && (
                          <span className="text-[10px] font-bold uppercase tracking-wide text-emerald-500">Wholesale</span>
                        )}
                        {showWs && (
                          <div className="text-sm line-through tabular-nums text-slate-500">
                            ₹{Math.round(retail).toLocaleString('en-IN')}
                          </div>
                        )}
                        <div
                          className={cn(
                            'text-lg font-semibold tabular-nums',
                            showWs ? 'text-emerald-400' : 'text-amber-400',
                          )}
                        >
                          ₹{Math.round(breakdown.total).toLocaleString('en-IN')}
                          <span className="ml-1 text-xs font-normal text-slate-500">incl. GST</span>
                        </div>
                      </div>
                    </div>
                  </div>
                  <label className="mt-4 flex items-center gap-3">
                    <span className="text-xs font-medium uppercase tracking-wide text-slate-500">Qty</span>
                    <input
                      type="number"
                      min={1}
                      max={9999}
                      inputMode="numeric"
                      placeholder="0"
                      autoComplete="off"
                      value={qtyByKey[key] ?? ''}
                      onChange={(e) => onQtyChange(key, e.target.value)}
                      className="min-h-[48px] min-w-0 flex-1 rounded-xl border border-slate-600/80 bg-slate-950 px-4 text-center text-lg font-medium tabular-nums text-slate-100 shadow-inner shadow-black/20 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/25"
                    />
                  </label>
                </div>
              )
            })
          )}
        </div>

        {/* Desktop: data table */}
        <div className="hidden md:block rounded-2xl border border-slate-800/90 bg-slate-900/30 shadow-xl shadow-black/25 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm border-collapse min-w-[720px]">
              <thead>
                <tr className="border-b border-slate-800 bg-slate-900/90 text-[11px] uppercase tracking-wider text-slate-400">
                  <th className="px-3 py-3.5 w-14 font-semibold">Img</th>
                  <th className="px-3 py-3.5 font-semibold">SKU</th>
                  <th className="px-3 py-3.5 text-right font-semibold">Net wt (g)</th>
                  <th className="px-3 py-3.5 font-semibold">Purity</th>
                  <th className="px-3 py-3.5 text-right font-semibold">Est. price</th>
                  <th className="px-3 py-3.5 w-32 text-center font-semibold">Qty</th>
                </tr>
              </thead>
              <tbody>
                {pricedRows.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-14 text-center text-slate-500">
                      No products in this metal.
                    </td>
                  </tr>
                ) : (
                  pricedRows.map(({ product, key, breakdown, weight }) => {
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
                            className="w-full min-h-[44px] rounded-lg border border-slate-600/80 bg-slate-950 px-2 text-center text-sm tabular-nums text-slate-100 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
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
          'kc-bottom-above-mobile-nav fixed left-0 right-0 z-40 border-t border-emerald-500/20 bg-slate-950/95 backdrop-blur-md shadow-[0_-8px_32px_rgba(0,0,0,0.45)] safe-area-pb px-3 py-3 md:px-6 md:py-4',
        )}
      >
        <div className="max-w-[1600px] mx-auto flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-end gap-6 text-sm">
            <div>
              <span className="text-slate-500 block text-[10px] font-semibold uppercase tracking-wider">Lines</span>
              <span className="tabular-nums text-lg font-bold text-slate-100">{footerTotals.lines}</span>
            </div>
            <div>
              <span className="text-slate-500 block text-[10px] font-semibold uppercase tracking-wider">Total weight</span>
              <span className="tabular-nums text-lg font-bold text-slate-100">{footerTotals.weight.toFixed(2)} g</span>
            </div>
            <div>
              <span className="text-slate-500 block text-[10px] font-semibold uppercase tracking-wider">Total (est.)</span>
              <span className="tabular-nums text-xl font-bold text-emerald-400">
                ₹{Math.round(footerTotals.price).toLocaleString('en-IN')}
              </span>
            </div>
          </div>
          <button
            type="button"
            disabled={adding || footerTotals.price <= 0}
            onClick={handleBulkAdd}
            className="flex min-h-[52px] w-full touch-manipulation items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-emerald-600 to-emerald-500 px-6 text-base font-bold text-white shadow-lg shadow-emerald-950/50 transition hover:from-emerald-500 hover:to-emerald-400 disabled:pointer-events-none disabled:opacity-35 sm:min-h-[48px] sm:w-auto sm:px-8 sm:text-sm"
          >
            {adding ? (
              <>
                <Loader2 className="size-5 animate-spin" aria-hidden />
                Adding…
              </>
            ) : (
              <>
                <ShoppingCart className="size-5 sm:size-4" aria-hidden />
                Add bulk order to cart
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}

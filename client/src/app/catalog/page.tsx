'use client'

import { useEffect, useState, useMemo } from 'react'
import axios from '@/lib/axios'
import ProductCard from '@/components/ProductCard'
import { LayoutGrid, ChevronRight, ChevronDown } from 'lucide-react'
import { calculateBreakdown, type Item } from '@/lib/pricing'

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

export default function CatalogPage() {
  const [categories, setCategories] = useState<Category[]>([])
  const [rates, setRates] = useState<unknown[]>([])
  const [loading, setLoading] = useState(true)

  const [activeStyleId, setActiveStyleId] = useState<number | null>(null)
  const [activeSkuId, setActiveSkuId] = useState<number | null>(null)
  const [expandedStyles, setExpandedStyles] = useState<Set<number>>(new Set())

  const url = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'

  useEffect(() => {
    const load = async () => {
      try {
        const [catalogRes, ratesRes] = await Promise.all([
          axios.get(`${url}/api/catalog`),
          axios.get(`${url}/api/rates/display`),
        ])
        const cats: Category[] = catalogRes.data?.categories || []
        setCategories(cats)
        setRates(ratesRes.data?.rates ?? [])

        if (cats.length > 0) {
          setActiveStyleId(cats[0].id)
          setExpandedStyles(new Set([cats[0].id]))
          if (cats[0].subcategories.length > 0) {
            setActiveSkuId(cats[0].subcategories[0].id)
          }
        }
      } catch {
        setCategories([])
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [url])

  const activeStyle = useMemo(
    () => categories.find((c) => c.id === activeStyleId) ?? null,
    [categories, activeStyleId],
  )

  const activeSku = useMemo(
    () => activeStyle?.subcategories.find((s) => s.id === activeSkuId) ?? null,
    [activeStyle, activeSkuId],
  )

  const rawProducts = activeSku?.products ?? []

  // Filter state: weight (gm) and price (₹)
  const [weightMin, setWeightMin] = useState<string>('')
  const [weightMax, setWeightMax] = useState<string>('')
  const [priceMin, setPriceMin] = useState<string>('')
  const [priceMax, setPriceMax] = useState<string>('')

  const products = useMemo(() => {
    let list = rawProducts
    const wMin = weightMin ? parseFloat(weightMin) : null
    const wMax = weightMax ? parseFloat(weightMax) : null
    const pMin = priceMin ? parseFloat(priceMin) : null
    const pMax = priceMax ? parseFloat(priceMax) : null
    if (wMin != null && !isNaN(wMin)) {
      list = list.filter((p) => (p.net_weight ?? p.net_wt ?? p.weight ?? 0) >= wMin)
    }
    if (wMax != null && !isNaN(wMax)) {
      list = list.filter((p) => (p.net_weight ?? p.net_wt ?? p.weight ?? 0) <= wMax)
    }
    if (pMin != null && !isNaN(pMin)) {
      list = list.filter((p) => {
        const b = calculateBreakdown(p, rates, (p as { gst_rate?: number }).gst_rate ?? 3)
        return b.total >= pMin
      })
    }
    if (pMax != null && !isNaN(pMax)) {
      list = list.filter((p) => {
        const b = calculateBreakdown(p, rates, (p as { gst_rate?: number }).gst_rate ?? 3)
        return b.total <= pMax
      })
    }
    return list
  }, [rawProducts, weightMin, weightMax, priceMin, priceMax, rates])

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

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <main className="max-w-[1400px] mx-auto px-4 py-6 pb-28">
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
            {categories.map((cat) => (
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
            <div className="mb-6 p-4 rounded-xl bg-slate-900/50 border border-slate-800 space-y-4">
              <h3 className="text-sm font-semibold text-slate-300 uppercase tracking-wider">Filters</h3>
              <div>
                <label className="text-xs text-slate-500 block mb-1">Weight (gm)</label>
                <div className="flex gap-2">
                  <input
                    type="number"
                    placeholder="Min"
                    value={weightMin}
                    onChange={(e) => setWeightMin(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-100 text-sm placeholder-slate-500 focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500/50"
                  />
                  <input
                    type="number"
                    placeholder="Max"
                    value={weightMax}
                    onChange={(e) => setWeightMax(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-100 text-sm placeholder-slate-500 focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500/50"
                  />
                </div>
              </div>
              <div>
                <label className="text-xs text-slate-500 block mb-1">Price (₹)</label>
                <div className="flex gap-2">
                  <input
                    type="number"
                    placeholder="Min"
                    value={priceMin}
                    onChange={(e) => setPriceMin(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-100 text-sm placeholder-slate-500 focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500/50"
                  />
                  <input
                    type="number"
                    placeholder="Max"
                    value={priceMax}
                    onChange={(e) => setPriceMax(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-100 text-sm placeholder-slate-500 focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500/50"
                  />
                </div>
              </div>
              {(weightMin || weightMax || priceMin || priceMax) && (
                <button
                  onClick={() => {
                    setWeightMin('')
                    setWeightMax('')
                    setPriceMin('')
                    setPriceMax('')
                  }}
                  className="w-full py-1.5 text-xs text-amber-500 hover:text-amber-400 transition-colors"
                >
                  Clear filters
                </button>
              )}
            </div>
            <nav className="sticky top-24 space-y-1 max-h-[calc(100vh-8rem)] overflow-y-auto pr-2 scrollbar-hide">
              {categories.map((cat) => {
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
              })}
            </nav>
          </aside>

          {/* ── Right: product grid (75 %) ── */}
          <section className="flex-1 min-w-0">
            {/* Mobile filters */}
            <div className="lg:hidden mb-4 p-4 rounded-xl bg-slate-900/50 border border-slate-800">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-500 block mb-1">Weight (gm)</label>
                  <div className="flex gap-1">
                    <input
                      type="number"
                      placeholder="Min"
                      value={weightMin}
                      onChange={(e) => setWeightMin(e.target.value)}
                      className="flex-1 px-2 py-1.5 rounded bg-slate-800 border border-slate-700 text-slate-100 text-sm"
                    />
                    <input
                      type="number"
                      placeholder="Max"
                      value={weightMax}
                      onChange={(e) => setWeightMax(e.target.value)}
                      className="flex-1 px-2 py-1.5 rounded bg-slate-800 border border-slate-700 text-slate-100 text-sm"
                    />
                  </div>
                </div>
                <div>
                  <label className="text-xs text-slate-500 block mb-1">Price (₹)</label>
                  <div className="flex gap-1">
                    <input
                      type="number"
                      placeholder="Min"
                      value={priceMin}
                      onChange={(e) => setPriceMin(e.target.value)}
                      className="flex-1 px-2 py-1.5 rounded bg-slate-800 border border-slate-700 text-slate-100 text-sm"
                    />
                    <input
                      type="number"
                      placeholder="Max"
                      value={priceMax}
                      onChange={(e) => setPriceMax(e.target.value)}
                      className="flex-1 px-2 py-1.5 rounded bg-slate-800 border border-slate-700 text-slate-100 text-sm"
                    />
                  </div>
                </div>
              </div>
              {(weightMin || weightMax || priceMin || priceMax) && (
                <button
                  onClick={() => { setWeightMin(''); setWeightMax(''); setPriceMin(''); setPriceMax('') }}
                  className="mt-2 text-xs text-amber-500"
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
                <p className="text-slate-500">No products in this collection</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4 gap-4 md:gap-6">
                {products.map((p) => (
                  <ProductCard
                    key={p.barcode || p.id || p.sku}
                    product={
                      {
                        ...p,
                        style_code: activeStyle?.name,
                      } as Product
                    }
                    rates={rates}
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

'use client'

import { useState, useEffect, Suspense, useCallback, useMemo } from 'react'
import axios from '@/lib/axios'
import AdminGuard from '@/components/AdminGuard'
import Link from 'next/link'
import {
  Package,
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  Globe,
  Check,
  CheckCircle2,
  ArrowUp,
  ArrowDown,
  GripVertical,
  ListOrdered,
  Sparkles,
  LayoutGrid,
  Gem,
  X,
} from 'lucide-react'
import { calculateBreakdown, type Item } from '@/lib/pricing'
import DiamondEnrichmentModal from '@/components/DiamondEnrichmentModal'

/** Metal types — values match backend metal_type (lowercase) */
const METAL_TABS = [
  { key: 'gold', label: 'Gold', icon: Sparkles },
  { key: 'silver', label: 'Silver', icon: LayoutGrid },
  { key: 'diamond', label: 'Diamond', icon: Gem },
] as const

type MetalKey = (typeof METAL_TABS)[number]['key']

function productMatchesMetal(p: { metal_type?: string }, metal: MetalKey): boolean {
  const m = (p.metal_type || '').toLowerCase()
  if (metal === 'gold') return m.startsWith('gold') || m.includes('gold')
  if (metal === 'silver') return m.startsWith('silver') || m.includes('silver')
  if (metal === 'diamond') return m.startsWith('diamond')
  return false
}

type Product = Item & {
  id?: number
  barcode?: string
  sku?: string
  style_code?: string
  short_name?: string
  item_name?: string
  net_weight?: number
  weight?: number
  purity?: string | number
  pcs?: number
  image_url?: string
  metal_type?: string
  mc_type?: string
  mc_rate?: number
  mc_value?: number
  gst_rate?: number
}

type GroupedCatalog = {
  styleCode: string
  skus: { sku: string; products: Product[] }[]
}

type SubcategoryInfo = { id: number; name: string; slug: string }
type WebCategory = {
  id: number
  name: string
  slug: string
  is_published: boolean
  discount_percentage?: number
  subcategories?: SubcategoryInfo[]
  /** From /api/admin/catalog — which metals have ≥1 active product in this style */
  has_gold?: boolean
  has_silver?: boolean
  has_diamond?: boolean
}

export default function AdminProductsPage() {
  const [products, setProducts] = useState<Product[]>([])
  const [rates, setRates] = useState<unknown[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedMetal, setSelectedMetal] = useState<MetalKey>('gold')
  const [viewMode, setViewMode] = useState<'table' | 'nested'>('nested')
  const [expandedStyles, setExpandedStyles] = useState<Set<string>>(new Set())
  const [expandedSkus, setExpandedSkus] = useState<Set<string>>(new Set())
  const [catalogCategories, setCatalogCategories] = useState<WebCategory[]>([])
  const [publishedIds, setPublishedIds] = useState<Set<number>>(new Set())
  const [savingPublish, setSavingPublish] = useState(false)
  const [publishToast, setPublishToast] = useState<
    'success' | 'error' | null
  >(null)
  const [filterStyle, setFilterStyle] = useState<string>('')
  const [filterSku, setFilterSku] = useState<string>('')
  const [savingDiscount, setSavingDiscount] = useState<number | null>(null) // category id being saved
  const [diamondEnrichProduct, setDiamondEnrichProduct] = useState<Product | null>(null)

  // Reorder state
  const [orderedCategories, setOrderedCategories] = useState<WebCategory[]>([])
  const [savingOrder, setSavingOrder] = useState(false)
  const [orderToast, setOrderToast] = useState<'success' | 'error' | null>(
    null,
  )

  const url = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'

  const loadCatalog = useCallback(async () => {
    try {
      const res = await axios.get(`${url}/api/admin/catalog`, {
        withCredentials: true,
      })
      const cats: WebCategory[] = res.data?.categories || []
      setCatalogCategories(cats)
      setOrderedCategories(cats)
      setPublishedIds(
        new Set(
          cats
            .filter((c: WebCategory) => c.is_published)
            .map((c: WebCategory) => c.id),
        ),
      )
    } catch {
      setCatalogCategories([])
    }
  }, [url])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [productsRes, ratesRes] = await Promise.all([
        axios.get(`${url}/api/products`, { params: { limit: 5000, metal_type: selectedMetal } }),
        axios.get(`${url}/api/rates/display`),
      ])
      const items =
        productsRes.data?.products ?? productsRes.data?.items ?? []
      setProducts(Array.isArray(items) ? items : [])
      setRates(ratesRes.data?.rates ?? [])
    } catch {
      setProducts([])
    } finally {
      setLoading(false)
    }
  }, [url, selectedMetal])

  useEffect(() => {
    load()
  }, [load])
  useEffect(() => {
    loadCatalog()
  }, [loadCatalog])

  const togglePublish = (id: number) => {
    setPublishedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const showToast = useCallback((type: 'success' | 'error') => {
    setPublishToast(type)
    setTimeout(() => setPublishToast(null), 4000)
  }, [])

  const showOrderToast = useCallback((type: 'success' | 'error') => {
    setOrderToast(type)
    setTimeout(() => setOrderToast(null), 4000)
  }, [])

  const handleSavePublish = async () => {
    setSavingPublish(true)
    try {
      const toPublish = Array.from(publishedIds)
      const toUnpublish = catalogCategories
        .filter((c) => !publishedIds.has(c.id))
        .map((c) => c.id)
      if (toPublish.length > 0) {
        await axios.put(
          `${url}/api/admin/catalog/publish`,
          { categoryIds: toPublish, publish: true },
          { withCredentials: true },
        )
      }
      if (toUnpublish.length > 0) {
        await axios.put(
          `${url}/api/admin/catalog/publish`,
          { categoryIds: toUnpublish, publish: false },
          { withCredentials: true },
        )
      }
      await loadCatalog()
      showToast('success')
    } catch {
      showToast('error')
    } finally {
      setSavingPublish(false)
    }
  }

  // ─── Reorder helpers ───
  const moveCategoryUp = (idx: number) => {
    if (idx <= 0) return
    setOrderedCategories((prev) => {
      const arr = [...prev]
      ;[arr[idx - 1], arr[idx]] = [arr[idx], arr[idx - 1]]
      return arr
    })
  }

  const moveCategoryDown = (idx: number) => {
    setOrderedCategories((prev) => {
      if (idx >= prev.length - 1) return prev
      const arr = [...prev]
      ;[arr[idx], arr[idx + 1]] = [arr[idx + 1], arr[idx]]
      return arr
    })
  }

  const moveSubUp = (catIdx: number, subIdx: number) => {
    if (subIdx <= 0) return
    setOrderedCategories((prev) => {
      const arr = prev.map((c, i) => {
        if (i !== catIdx || !c.subcategories) return c
        const subs = [...c.subcategories]
        ;[subs[subIdx - 1], subs[subIdx]] = [subs[subIdx], subs[subIdx - 1]]
        return { ...c, subcategories: subs }
      })
      return arr
    })
  }

  const moveSubDown = (catIdx: number, subIdx: number) => {
    setOrderedCategories((prev) => {
      const arr = prev.map((c, i) => {
        if (i !== catIdx || !c.subcategories) return c
        if (subIdx >= c.subcategories.length - 1) return c
        const subs = [...c.subcategories]
        ;[subs[subIdx], subs[subIdx + 1]] = [subs[subIdx + 1], subs[subIdx]]
        return { ...c, subcategories: subs }
      })
      return arr
    })
  }

  const handleSaveOrder = async () => {
    setSavingOrder(true)
    try {
      await axios.put(
        `${url}/api/admin/catalog/reorder-categories`,
        { orderedIds: orderedCategories.map((c) => c.id) },
        { withCredentials: true },
      )

      for (const cat of orderedCategories) {
        if (cat.subcategories && cat.subcategories.length > 0) {
          await axios.put(
            `${url}/api/admin/catalog/reorder-subcategories`,
            {
              categoryId: cat.id,
              orderedIds: cat.subcategories.map((s) => s.id),
            },
            { withCredentials: true },
          )
        }
      }

      await loadCatalog()
      showOrderToast('success')
    } catch {
      showOrderToast('error')
    } finally {
      setSavingOrder(false)
    }
  }

  const getProductPrice = (p: Product) => {
    const b = calculateBreakdown(p as Item, rates, p.gst_rate)
    return b.total
  }

  const handleCategoryDiscountSave = async (categoryId: number, discountPct: number) => {
    setSavingDiscount(categoryId)
    try {
      await axios.put(
        `${url}/api/admin/catalog/${categoryId}/discount`,
        { discount_percentage: discountPct },
        { withCredentials: true },
      )
      await loadCatalog()
      await load()
    } catch {
      // silent fail
    } finally {
      setSavingDiscount(null)
    }
  }

  const getCategoryForStyle = (styleCode: string) =>
    catalogCategories.find((c) => c.name === styleCode)

  const groupedCatalog = (): GroupedCatalog[] => {
    const byStyle: Record<string, Record<string, Product[]>> = {}
    for (const p of products) {
      const style =
        (p as { style_code?: string }).style_code || 'Uncategorized'
      const skuCode =
        (p as { sku_code?: string }).sku_code ||
        (p as { subcategory_slug?: string }).subcategory_slug ||
        p.sku ||
        'N/A'
      if (!byStyle[style]) byStyle[style] = {}
      if (!byStyle[style][skuCode]) byStyle[style][skuCode] = []
      byStyle[style][skuCode].push(p)
    }
    return Object.entries(byStyle).map(([styleCode, skuMap]) => ({
      styleCode,
      skus: Object.entries(skuMap).map(([sku, prods]) => ({
        sku,
        products: prods,
      })),
    }))
  }

  const toggleStyle = (s: string) => {
    setExpandedStyles((prev) => {
      const next = new Set(prev)
      if (next.has(s)) next.delete(s)
      else next.add(s)
      return next
    })
  }

  const toggleSku = (key: string) => {
    setExpandedSkus((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const catalog = groupedCatalog()

  /** Styles that have ≥1 active catalogue product for the selected metal (prefer server flags; else fall back to loaded products). */
  const categoriesWithProducts = useMemo(() => {
    const styleSet = new Set(
      products.map((p) => (p as { style_code?: string }).style_code).filter(Boolean),
    )
    return orderedCategories.filter((c) => {
      const hasMeta =
        c.has_gold !== undefined ||
        c.has_silver !== undefined ||
        c.has_diamond !== undefined
      if (!hasMeta) return styleSet.has(c.name)
      if (selectedMetal === 'gold') return !!c.has_gold
      if (selectedMetal === 'silver') return !!c.has_silver
      return !!c.has_diamond
    })
  }, [orderedCategories, selectedMetal, products])

  const uniqueStyles = Array.from(
    new Set(
      products.map(
        (p) => (p as { style_code?: string }).style_code || '',
      ),
    ),
  )
    .filter(Boolean)
    .sort()

  const skuCodeForProduct = (p: Product) =>
    (p as { sku_code?: string }).sku_code ||
    (p as { subcategory_slug?: string }).subcategory_slug ||
    p.sku ||
    ''

  const skusForStyle = filterStyle
    ? Array.from(
        new Set(
          products
            .filter(
              (p) =>
                ((p as { style_code?: string }).style_code || '') ===
                filterStyle,
            )
            .map(skuCodeForProduct),
        ),
      )
        .filter(Boolean)
        .sort()
    : []

  const flatFilteredProducts = products.filter((p) => {
    if (
      filterStyle &&
      ((p as { style_code?: string }).style_code || '') !== filterStyle
    )
      return false
    if (filterSku && skuCodeForProduct(p) !== filterSku) return false
    return true
  })

  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-slate-950 flex items-center justify-center">
          <div className="text-slate-400">Loading...</div>
        </div>
      }
    >
      <AdminGuard>
        {/* Toast notifications */}
        {(publishToast || orderToast) && (
          <div className="fixed top-5 left-1/2 -translate-x-1/2 z-[9999] animate-in fade-in slide-in-from-top-2 duration-200">
            <div
              className={`flex items-center gap-3 px-5 py-3 rounded-xl shadow-2xl border text-sm font-medium ${
                (publishToast || orderToast) === 'success'
                  ? 'bg-green-500/90 border-green-400/60 text-white'
                  : 'bg-red-500/90 border-red-400/60 text-white'
              }`}
            >
              <CheckCircle2 className="size-5 shrink-0" />
              {publishToast === 'success'
                ? 'Catalog published successfully!'
                : publishToast === 'error'
                  ? 'Failed to save publish settings'
                  : orderToast === 'success'
                    ? 'Catalogue order saved!'
                    : 'Failed to save order'}
            </div>
          </div>
        )}

        <div className="min-h-screen bg-slate-950 text-slate-100">
          <main className="max-w-6xl mx-auto px-4 py-8 pb-24">
            <Link
              href="/admin"
              className="inline-flex items-center gap-2 text-slate-400 hover:text-yellow-500 mb-6"
            >
              <ArrowLeft className="size-4" /> Back to Dashboard
            </Link>

            {/* Metal Type Tabs — same as public catalog */}
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

            {/* ─── Products & Catalogue ─── */}
            <div className="bg-slate-900/50 backdrop-blur border border-white/10 rounded-xl overflow-hidden">
              <div className="p-4 sm:p-6 border-b border-white/10 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div className="flex items-center gap-2">
                  <Package className="size-6 text-yellow-500" />
                  <h1 className="text-xl font-semibold text-slate-200">
                    Products & Catalogue
                  </h1>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={() =>
                      setViewMode(
                        viewMode === 'table' ? 'nested' : 'table',
                      )
                    }
                    className="px-3 py-2 rounded-lg bg-slate-800/80 border border-white/10 text-slate-300 text-sm hover:bg-slate-700/80"
                  >
                    {viewMode === 'table' ? 'Nested View' : 'Flat Table'}
                  </button>
                </div>
              </div>

              {loading ? (
                <div className="p-12 text-center text-slate-400">
                  Loading…
                </div>
              ) : products.length === 0 ? (
                <div className="p-12 text-center">
                  <Package className="size-12 text-slate-600 mx-auto mb-4" />
                  <p className="text-slate-400">No products found</p>
                  <p className="text-slate-500 text-sm mt-1">
                    Sync products from your jewellery ERP via POST
                    /api/sync/receive (x-api-key).
                  </p>
                </div>
              ) : viewMode === 'table' ? (
                <div>
                  {/* Filter bar */}
                  <div className="flex flex-wrap items-center gap-3 px-4 py-3 border-b border-white/10 bg-slate-800/20">
                    <div className="flex items-center gap-2 min-w-0">
                      <label className="text-xs font-medium text-slate-400 whitespace-nowrap">
                        Filter by Style
                      </label>
                      <select
                        value={filterStyle}
                        onChange={(e) => {
                          setFilterStyle(e.target.value)
                          setFilterSku('')
                        }}
                        className="bg-slate-800 text-slate-200 border border-white/10 rounded-lg px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-yellow-500/50 focus:border-yellow-500/50 transition-colors min-w-[140px]"
                      >
                        <option value="">All Styles</option>
                        {uniqueStyles.map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="flex items-center gap-2 min-w-0">
                      <label className="text-xs font-medium text-slate-400 whitespace-nowrap">
                        Filter by SKU
                      </label>
                      <select
                        value={filterSku}
                        onChange={(e) => setFilterSku(e.target.value)}
                        disabled={!filterStyle}
                        className="bg-slate-800 text-slate-200 border border-white/10 rounded-lg px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-yellow-500/50 focus:border-yellow-500/50 transition-colors min-w-[140px] disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        <option value="">All SKUs</option>
                        {skusForStyle.map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>
                    </div>
                    {(filterStyle || filterSku) && (
                      <button
                        onClick={() => {
                          setFilterStyle('')
                          setFilterSku('')
                        }}
                        className="text-xs text-slate-400 hover:text-yellow-500 transition-colors underline underline-offset-2"
                      >
                        Clear filters
                      </button>
                    )}
                    <span className="ml-auto text-xs text-slate-500 tabular-nums">
                      {flatFilteredProducts.length} product
                      {flatFilteredProducts.length !== 1 ? 's' : ''}
                    </span>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-white/10 bg-slate-800/30">
                          <th className="text-left py-3 px-4 text-slate-400 font-medium text-sm w-16">
                            Image
                          </th>
                          <th className="text-left py-3 px-4 text-slate-400 font-medium text-sm">
                            SKU
                          </th>
                          <th className="text-left py-3 px-4 text-slate-400 font-medium text-sm">
                            Product Name
                          </th>
                          <th className="text-left py-3 px-4 text-slate-400 font-medium text-sm">
                            Style Code
                          </th>
                          <th className="text-right py-3 px-4 text-slate-400 font-medium text-sm">
                            Net Weight
                          </th>
                          <th className="text-left py-3 px-4 text-slate-400 font-medium text-sm">
                            Purity
                          </th>
                          <th className="text-right py-3 px-4 text-slate-400 font-medium text-sm">
                            Stock Qty
                          </th>
                          <th className="text-right py-3 px-4 text-slate-400 font-medium text-sm">
                            Final Cost{' '}
                            <span className="text-slate-600 font-normal text-xs">
                              (incl. GST)
                            </span>
                          </th>
                          <th className="w-24" />
                        </tr>
                      </thead>
                      <tbody>
                        {flatFilteredProducts.length === 0 ? (
                          <tr>
                            <td
                              colSpan={9}
                              className="py-12 text-center text-slate-500 text-sm"
                            >
                              No products match the selected filters.
                            </td>
                          </tr>
                        ) : (
                          flatFilteredProducts.map((p) => (
                            <tr
                              key={p.barcode || p.id || Math.random()}
                              className="border-b border-white/5 hover:bg-white/5 transition-colors"
                            >
                              <td className="py-3 px-4">
                                <div className="w-12 h-12 rounded-lg bg-[#0B1120] border border-white/10 flex items-center justify-center overflow-hidden">
                                  {p.image_url ? (
                                    <img
                                      src={p.image_url}
                                      alt=""
                                      className="w-full h-full object-contain"
                                    />
                                  ) : (
                                    <Package className="size-5 text-slate-500" />
                                  )}
                                </div>
                              </td>
                              <td className="py-3 px-4 text-slate-300 font-mono text-sm">
                                {p.sku || '—'}
                              </td>
                              <td className="py-3 px-4 text-slate-200">
                                {(p as { name?: string }).name ||
                                  p.item_name ||
                                  p.short_name ||
                                  '—'}
                              </td>
                              <td className="py-3 px-4 text-slate-400">
                                {p.style_code || '—'}
                              </td>
                              <td className="py-3 px-4 text-right text-slate-300 tabular-nums">
                                {(p.net_weight ?? p.weight) != null
                                  ? `${Number(p.net_weight ?? p.weight)} g`
                                  : '—'}
                              </td>
                              <td className="py-3 px-4 text-slate-400">
                                {p.purity ?? '—'}
                              </td>
                              <td className="py-3 px-4 text-right text-slate-300 tabular-nums">
                                {p.pcs ?? 1}
                              </td>
                              <td className="py-3 px-4 text-right text-yellow-500/90 font-medium tabular-nums">
                                ₹
                                {Math.round(getProductPrice(p)).toLocaleString(
                                  'en-IN',
                                )}
                              </td>
                              <td className="py-3 px-4">
                                {(p.metal_type || '').toLowerCase().startsWith('diamond') && (
                                  <button
                                    type="button"
                                    onClick={() => setDiamondEnrichProduct(p)}
                                    className="px-2.5 py-1.5 rounded-lg bg-amber-500/20 text-amber-400 border border-amber-500/40 text-xs font-medium hover:bg-amber-500/30 transition-colors"
                                  >
                                    Enrich
                                  </button>
                                )}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                <div className="p-4">
                  <p className="text-slate-500 text-sm mb-4">
                    Nested catalogue: Style Code → SKU Code → Products
                  </p>
                  <div className="space-y-2">
                    {catalog.map(({ styleCode, skus }) => {
                      const styleKey = styleCode
                      const isStyleOpen = expandedStyles.has(styleKey)
                      return (
                        <div
                          key={styleKey}
                          className="rounded-lg border border-white/10 bg-slate-800/30 overflow-hidden"
                        >
                          <div className="flex flex-col sm:flex-row sm:items-center gap-3 p-4">
                            <button
                              onClick={() => toggleStyle(styleKey)}
                              className="flex items-center gap-2 text-left hover:bg-white/5 rounded-lg -m-2 p-2 transition-colors flex-1 min-w-0"
                            >
                              {isStyleOpen ? (
                                <ChevronDown className="size-4 text-yellow-500 shrink-0" />
                              ) : (
                                <ChevronRight className="size-4 text-yellow-500 shrink-0" />
                              )}
                              <span className="font-semibold text-slate-200 shrink-0">
                                {styleCode}
                              </span>
                              <span className="text-slate-500 text-sm truncate">
                                ({skus.length} SKU{skus.length !== 1 ? 's' : ''}, {skus.reduce((s, x) => s + x.products.length, 0)} products)
                              </span>
                            </button>
                            {getCategoryForStyle(styleCode) && (
                              <div
                                className="flex items-center gap-2 shrink-0 sm:ml-0"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <label className="text-xs text-slate-500 whitespace-nowrap">
                                  Discount %
                                </label>
                                <input
                                  type="number"
                                  min={0}
                                  max={100}
                                  step={0.5}
                                  defaultValue={
                                    getCategoryForStyle(styleCode)?.discount_percentage ?? 0
                                  }
                                  onBlur={(e) => {
                                    const cat = getCategoryForStyle(styleCode)
                                    if (!cat) return
                                    const v = parseFloat(e.target.value)
                                    if (!isNaN(v) && v >= 0 && v <= 100) {
                                      handleCategoryDiscountSave(cat.id, v)
                                    }
                                  }}
                                  className="w-14 sm:w-16 px-2 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-slate-100 text-sm text-right focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500/50"
                                  disabled={savingDiscount === getCategoryForStyle(styleCode)?.id}
                                />
                              </div>
                            )}
                          </div>
                          {isStyleOpen && (
                            <div className="border-t border-white/10">
                              {skus.map(({ sku, products: prods }) => {
                                const skuKey = `${styleKey}::${sku}`
                                const isSkuOpen = expandedSkus.has(skuKey)
                                return (
                                  <div
                                    key={skuKey}
                                    className="border-t border-white/5"
                                  >
                                    <button
                                      onClick={() => toggleSku(skuKey)}
                                      className="w-full flex items-center gap-2 pl-8 sm:pl-12 pr-4 py-3 text-left hover:bg-white/5 transition-colors"
                                    >
                                      {isSkuOpen ? (
                                        <ChevronDown className="size-4 text-slate-400 shrink-0" />
                                      ) : (
                                        <ChevronRight className="size-4 text-slate-400 shrink-0" />
                                      )}
                                      <span className="text-slate-300 font-medium">
                                        {sku}
                                      </span>
                                      <span className="text-slate-500 text-sm">
                                        ({prods.length} items)
                                      </span>
                                    </button>
                                    {isSkuOpen && (
                                      <div className="pl-10 sm:pl-16 pr-4 pb-4 space-y-2">
                                        {prods.map((p) => (
                                          <div
                                            key={p.barcode || p.id}
                                            className="flex flex-wrap items-center gap-3 sm:gap-4 p-3 rounded-lg bg-slate-900/50 border border-white/5"
                                          >
                                            <div className="w-10 h-10 rounded bg-[#0B1120] flex items-center justify-center shrink-0 overflow-hidden">
                                              {p.image_url ? (
                                                <img
                                                  src={p.image_url}
                                                  alt=""
                                                  className="w-full h-full object-contain"
                                                />
                                              ) : (
                                                <Package className="size-4 text-slate-500" />
                                              )}
                                            </div>
                                            <div className="min-w-0 flex-1">
                                              <div className="font-medium text-slate-200 truncate">
                                                {(
                                                  p as {
                                                    name?: string
                                                  }
                                                ).name ||
                                                  p.item_name ||
                                                  p.short_name ||
                                                  p.barcode ||
                                                  '—'}
                                              </div>
                                              <div className="text-xs text-slate-500">
                                                {p.barcode &&
                                                  `Barcode: ${p.barcode}`}
                                                {(p.net_weight ??
                                                  p.weight) != null &&
                                                  ` • ${Number(p.net_weight ?? p.weight)} g`}
                                                {p.purity &&
                                                  ` • ${p.purity}`}
                                              </div>
                                            </div>
                                            <div className="flex items-center gap-2 shrink-0">
                                              {(p.metal_type || '').toLowerCase().startsWith('diamond') && (
                                                <button
                                                  type="button"
                                                  onClick={() => setDiamondEnrichProduct(p)}
                                                  className="shrink-0 px-2.5 py-1.5 rounded-lg bg-amber-500/20 text-amber-400 border border-amber-500/40 text-xs font-medium hover:bg-amber-500/30 transition-colors"
                                                >
                                                  Enrich Details
                                                </button>
                                              )}
                                              <div className="text-right">
                                                <div className="text-sm font-medium text-yellow-500/90 font-mono">
                                                  ₹
                                                  {Math.round(
                                                    getProductPrice(p),
                                                  ).toLocaleString('en-IN')}
                                                </div>
                                                <div className="text-xs text-slate-500">
                                                  Qty: {p.pcs ?? 1}
                                                </div>
                                              </div>
                                            </div>
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                )
                              })}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* ─── Catalogue Order ─── */}
            <div className="mt-8 bg-slate-900/50 backdrop-blur border border-white/10 rounded-xl overflow-hidden">
              <div className="p-4 sm:p-6 border-b border-white/10 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div className="flex items-center gap-2">
                  <ListOrdered className="size-6 text-amber-500" />
                  <h2 className="text-lg font-semibold text-slate-200">
                    Catalogue Order
                  </h2>
                </div>
                <button
                  onClick={handleSaveOrder}
                  disabled={savingOrder || orderedCategories.length === 0}
                  className="px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-sm disabled:opacity-60 transition-colors"
                >
                  {savingOrder ? 'Saving…' : 'Save Order'}
                </button>
              </div>
              <div className="p-4 sm:p-6">
                <p className="text-slate-500 text-sm mb-4">
                  Rearrange styles and SKUs. The order here is reflected in
                  the public Catalog page.
                </p>
                {categoriesWithProducts.length === 0 ? (
                  <p className="text-slate-500 text-sm">
                    No {METAL_TABS.find((t) => t.key === selectedMetal)?.label ?? selectedMetal} catalogues. Sync products from ERP first.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {categoriesWithProducts.map((cat, catIdx) => {
                      const fullIdx = orderedCategories.findIndex((c) => c.id === cat.id)
                      return (
                      <div
                        key={cat.id}
                        className="rounded-lg border border-white/10 bg-slate-800/30 overflow-hidden"
                      >
                        {/* Category row */}
                        <div className="flex items-center gap-2 p-3 sm:p-4">
                          <GripVertical className="size-4 text-slate-600 shrink-0 hidden sm:block" />
                          <span className="font-semibold text-slate-200 flex-1 min-w-0 truncate">
                            {cat.name}
                          </span>
                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              onClick={() => moveCategoryUp(fullIdx)}
                              disabled={fullIdx <= 0}
                              className="p-1.5 rounded-md hover:bg-white/10 disabled:opacity-20 transition-colors"
                              title="Move up"
                            >
                              <ArrowUp className="size-4 text-slate-400" />
                            </button>
                            <button
                              onClick={() => moveCategoryDown(fullIdx)}
                              disabled={
                                fullIdx < 0 || fullIdx >= orderedCategories.length - 1
                              }
                              className="p-1.5 rounded-md hover:bg-white/10 disabled:opacity-20 transition-colors"
                              title="Move down"
                            >
                              <ArrowDown className="size-4 text-slate-400" />
                            </button>
                          </div>
                        </div>

                        {/* Subcategories */}
                        {cat.subcategories &&
                          cat.subcategories.length > 0 && (
                            <div className="border-t border-white/5 bg-slate-900/30">
                              {cat.subcategories.map((sub, subIdx) => (
                                <div
                                  key={sub.id}
                                  className="flex items-center gap-2 pl-8 sm:pl-12 pr-3 sm:pr-4 py-2.5 border-t border-white/5 first:border-t-0"
                                >
                                  <GripVertical className="size-3.5 text-slate-700 shrink-0 hidden sm:block" />
                                  <span className="text-sm text-slate-400 flex-1 min-w-0 truncate">
                                    {sub.name}
                                  </span>
                                  <div className="flex items-center gap-1 shrink-0">
                                    <button
                                      onClick={() =>
                                        moveSubUp(fullIdx, subIdx)
                                      }
                                      disabled={subIdx === 0}
                                      className="p-1 rounded-md hover:bg-white/10 disabled:opacity-20 transition-colors"
                                      title="Move up"
                                    >
                                      <ArrowUp className="size-3.5 text-slate-500" />
                                    </button>
                                    <button
                                      onClick={() =>
                                        moveSubDown(fullIdx, subIdx)
                                      }
                                      disabled={
                                        subIdx ===
                                        (cat.subcategories?.length ?? 0) - 1
                                      }
                                      className="p-1 rounded-md hover:bg-white/10 disabled:opacity-20 transition-colors"
                                      title="Move down"
                                    >
                                      <ArrowDown className="size-3.5 text-slate-500" />
                                    </button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                      </div>
                    )})}
                  </div>
                )}
              </div>
            </div>

            {/* ─── Publish Catalogue ─── */}
            <div className="mt-8 bg-slate-900/50 backdrop-blur border border-white/10 rounded-xl overflow-hidden">
              <div className="p-4 sm:p-6 border-b border-white/10 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div className="flex items-center gap-2">
                  <Globe className="size-6 text-cyan-500" />
                  <h2 className="text-lg font-semibold text-slate-200">
                    Publish Catalogue
                  </h2>
                </div>
                <button
                  onClick={handleSavePublish}
                  disabled={
                    savingPublish || catalogCategories.length === 0
                  }
                  className="px-4 py-2 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-semibold text-sm disabled:opacity-60"
                >
                  {savingPublish ? 'Saving…' : 'Save Publish Settings'}
                </button>
              </div>
              <div className="p-4 sm:p-6">
                <p className="text-slate-500 text-sm mb-4">
                  Select catalogues (Styles) to publish. Published
                  catalogues appear in the public Catalog page. Works on
                  desktop and mobile—tap to select, long-press on mobile for
                  multi-select.
                </p>
                {categoriesWithProducts.length === 0 ? (
                  <p className="text-slate-500 text-sm">
                    No {METAL_TABS.find((t) => t.key === selectedMetal)?.label ?? selectedMetal} catalogues. Sync via ERP first.
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-3">
                    {categoriesWithProducts.map((cat) => (
                      <button
                        key={cat.id}
                        onClick={() => togglePublish(cat.id)}
                        onContextMenu={(e) => {
                          e.preventDefault()
                          togglePublish(cat.id)
                        }}
                        className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border text-sm font-medium transition-colors ${
                          publishedIds.has(cat.id)
                            ? 'bg-cyan-500/20 border-cyan-500/40 text-cyan-400'
                            : 'bg-slate-800/50 border-white/10 text-slate-400 hover:border-white/20'
                        }`}
                      >
                        {publishedIds.has(cat.id) && (
                          <Check className="size-4" />
                        )}
                        {cat.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </main>

          <DiamondEnrichmentModal
            open={!!diamondEnrichProduct}
            onClose={() => setDiamondEnrichProduct(null)}
            product={diamondEnrichProduct ?? {}}
            onSaved={() => load()}
          />
        </div>
      </AdminGuard>
    </Suspense>
  )
}

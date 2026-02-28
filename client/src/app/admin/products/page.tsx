'use client'

import { useState, useEffect } from 'react'
import axios from '@/lib/axios'
import AdminGuard from '@/components/AdminGuard'
import Link from 'next/link'
import { Package, ArrowLeft, ChevronDown, ChevronRight, RefreshCw, Globe, Check } from 'lucide-react'
import { calculateBreakdown, type Item } from '@/lib/pricing'

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

type WebCategory = { id: number; name: string; slug: string; is_published: boolean }

export default function AdminProductsPage() {
  const [products, setProducts] = useState<Product[]>([])
  const [rates, setRates] = useState<unknown[]>([])
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [viewMode, setViewMode] = useState<'table' | 'nested'>('nested')
  const [expandedStyles, setExpandedStyles] = useState<Set<string>>(new Set())
  const [expandedSkus, setExpandedSkus] = useState<Set<string>>(new Set())
  const [catalogCategories, setCatalogCategories] = useState<WebCategory[]>([])
  const [publishedIds, setPublishedIds] = useState<Set<number>>(new Set())
  const [savingPublish, setSavingPublish] = useState(false)
  const [filterStyle, setFilterStyle] = useState<string>('')
  const [filterSku, setFilterSku] = useState<string>('')

  const url = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000'

  const loadCatalog = async () => {
    try {
      const res = await axios.get(`${url}/api/admin/catalog`, { withCredentials: true })
      const cats = res.data?.categories || []
      setCatalogCategories(cats)
      setPublishedIds(new Set(cats.filter((c: WebCategory) => c.is_published).map((c: WebCategory) => c.id)))
    } catch {
      setCatalogCategories([])
    }
  }

  const load = async () => {
    setLoading(true)
    try {
      const [productsRes, ratesRes] = await Promise.all([
        axios.get(`${url}/api/products`, { params: { limit: 500 } }),
        axios.get(`${url}/api/rates/display`),
      ])
      const items = productsRes.data?.products ?? productsRes.data?.items ?? []
      setProducts(Array.isArray(items) ? items : [])
      setRates(ratesRes.data?.rates ?? [])
    } catch {
      setProducts([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])
  useEffect(() => {
    loadCatalog()
  }, [])

  const togglePublish = (id: number) => {
    setPublishedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handleSavePublish = async () => {
    setSavingPublish(true)
    try {
      await axios.put(
        `${url}/api/admin/catalog/publish`,
        { categoryIds: Array.from(publishedIds), publish: true },
        { withCredentials: true }
      )
      const unpublishIds = catalogCategories.filter((c) => !publishedIds.has(c.id)).map((c) => c.id)
      if (unpublishIds.length > 0) {
        await axios.put(
          `${url}/api/admin/catalog/publish`,
          { categoryIds: unpublishIds, publish: false },
          { withCredentials: true }
        )
      }
      await loadCatalog()
    } catch {
      alert('Failed to save publish settings')
    } finally {
      setSavingPublish(false)
    }
  }

  const getProductPrice = (p: Product) => {
    const b = calculateBreakdown(p as Item, rates, p.gst_rate)
    return b.total
  }

  const handleSyncFromERP = async () => {
    setSyncing(true)
    try {
      const res = await axios.post(`${url}/api/admin/sync/products`, {}, { withCredentials: true })
      const { productsSynced, categoriesCreated, subcategoriesCreated } = res.data || {}
      alert(`Synced: ${productsSynced ?? 0} products, ${categoriesCreated ?? 0} categories, ${subcategoriesCreated ?? 0} subcategories`)
      await load()
      await loadCatalog()
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Sync failed'
      alert(msg)
    } finally {
      setSyncing(false)
    }
  }

  const groupedCatalog = (): GroupedCatalog[] => {
    const byStyle: Record<string, Record<string, Product[]>> = {}
    for (const p of products) {
      const style = p.style_code || 'Uncategorized'
      const sku = p.sku || p.barcode || 'N/A'
      if (!byStyle[style]) byStyle[style] = {}
      if (!byStyle[style][sku]) byStyle[style][sku] = []
      byStyle[style][sku].push(p)
    }
    return Object.entries(byStyle).map(([styleCode, skuMap]) => ({
      styleCode,
      skus: Object.entries(skuMap).map(([sku, prods]) => ({ sku, products: prods })),
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

  const uniqueStyles = Array.from(new Set(products.map((p) => p.style_code || ''))).filter(Boolean).sort()

  const skusForStyle = filterStyle
    ? Array.from(new Set(products.filter((p) => (p.style_code || '') === filterStyle).map((p) => p.sku || p.barcode || ''))).filter(Boolean).sort()
    : []

  const flatFilteredProducts = products.filter((p) => {
    if (filterStyle && (p.style_code || '') !== filterStyle) return false
    if (filterSku && (p.sku || p.barcode || '') !== filterSku) return false
    return true
  })

  return (
    <AdminGuard>
      <div className="min-h-screen bg-slate-950 text-slate-100">
        <main className="max-w-6xl mx-auto px-4 py-8 pb-24">
          <Link
            href="/admin"
            className="inline-flex items-center gap-2 text-slate-400 hover:text-yellow-500 mb-6"
          >
            <ArrowLeft className="size-4" /> Back to Dashboard
          </Link>

          <div className="bg-slate-900/50 backdrop-blur border border-white/10 rounded-xl overflow-hidden">
            <div className="p-4 sm:p-6 border-b border-white/10 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div className="flex items-center gap-2">
                <Package className="size-6 text-yellow-500" />
                <h1 className="text-xl font-semibold text-slate-200">Products & Catalogue</h1>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={() => setViewMode(viewMode === 'table' ? 'nested' : 'table')}
                  className="px-3 py-2 rounded-lg bg-slate-800/80 border border-white/10 text-slate-300 text-sm hover:bg-slate-700/80"
                >
                  {viewMode === 'table' ? 'Nested View' : 'Flat Table'}
                </button>
                <button
                  onClick={handleSyncFromERP}
                  disabled={syncing}
                  className="px-4 py-2 rounded-lg bg-yellow-500 hover:bg-yellow-400 text-slate-950 font-semibold text-sm inline-flex items-center gap-2 disabled:opacity-60"
                >
                  <RefreshCw className={`size-4 ${syncing ? 'animate-spin' : ''}`} />
                  {syncing ? 'Syncing…' : 'Sync from ERP'}
                </button>
              </div>
            </div>

            {loading ? (
              <div className="p-12 text-center text-slate-400">Loading…</div>
            ) : products.length === 0 ? (
              <div className="p-12 text-center">
                <Package className="size-12 text-slate-600 mx-auto mb-4" />
                <p className="text-slate-400">No products found</p>
                <p className="text-slate-500 text-sm mt-1">
                  Sync from your jewellery ERP or add products manually.
                </p>
              </div>
            ) : viewMode === 'table' ? (
              <div>
                {/* Filter bar */}
                <div className="flex flex-wrap items-center gap-3 px-4 py-3 border-b border-white/10 bg-slate-800/20">
                  <div className="flex items-center gap-2 min-w-0">
                    <label className="text-xs font-medium text-slate-400 whitespace-nowrap">Filter by Style</label>
                    <select
                      value={filterStyle}
                      onChange={(e) => { setFilterStyle(e.target.value); setFilterSku('') }}
                      className="bg-slate-800 text-slate-200 border border-white/10 rounded-lg px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-yellow-500/50 focus:border-yellow-500/50 transition-colors min-w-[140px]"
                    >
                      <option value="">All Styles</option>
                      {uniqueStyles.map((s) => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  </div>
                  <div className="flex items-center gap-2 min-w-0">
                    <label className="text-xs font-medium text-slate-400 whitespace-nowrap">Filter by SKU</label>
                    <select
                      value={filterSku}
                      onChange={(e) => setFilterSku(e.target.value)}
                      disabled={!filterStyle}
                      className="bg-slate-800 text-slate-200 border border-white/10 rounded-lg px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-yellow-500/50 focus:border-yellow-500/50 transition-colors min-w-[140px] disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <option value="">All SKUs</option>
                      {skusForStyle.map((s) => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  </div>
                  {(filterStyle || filterSku) && (
                    <button
                      onClick={() => { setFilterStyle(''); setFilterSku('') }}
                      className="text-xs text-slate-400 hover:text-yellow-500 transition-colors underline underline-offset-2"
                    >
                      Clear filters
                    </button>
                  )}
                  <span className="ml-auto text-xs text-slate-500 tabular-nums">
                    {flatFilteredProducts.length} product{flatFilteredProducts.length !== 1 ? 's' : ''}
                  </span>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-white/10 bg-slate-800/30">
                        <th className="text-left py-3 px-4 text-slate-400 font-medium text-sm w-16">Image</th>
                        <th className="text-left py-3 px-4 text-slate-400 font-medium text-sm">SKU</th>
                        <th className="text-left py-3 px-4 text-slate-400 font-medium text-sm">Product Name</th>
                        <th className="text-left py-3 px-4 text-slate-400 font-medium text-sm">Style Code</th>
                        <th className="text-right py-3 px-4 text-slate-400 font-medium text-sm">Net Weight</th>
                        <th className="text-left py-3 px-4 text-slate-400 font-medium text-sm">Purity</th>
                        <th className="text-right py-3 px-4 text-slate-400 font-medium text-sm">Stock Qty</th>
                        <th className="text-right py-3 px-4 text-slate-400 font-medium text-sm">Final Cost</th>
                      </tr>
                    </thead>
                    <tbody>
                      {flatFilteredProducts.length === 0 ? (
                        <tr>
                          <td colSpan={8} className="py-12 text-center text-slate-500 text-sm">
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
                              <div className="w-12 h-12 rounded-lg bg-slate-800/80 border border-white/10 flex items-center justify-center overflow-hidden">
                                {p.image_url ? (
                                  <img src={p.image_url} alt="" className="w-full h-full object-cover" />
                                ) : (
                                  <Package className="size-5 text-slate-500" />
                                )}
                              </div>
                            </td>
                            <td className="py-3 px-4 text-slate-300 font-mono text-sm">{p.sku || '—'}</td>
                            <td className="py-3 px-4 text-slate-200">{p.item_name || p.short_name || '—'}</td>
                            <td className="py-3 px-4 text-slate-400">{p.style_code || '—'}</td>
                            <td className="py-3 px-4 text-right text-slate-300 tabular-nums">
                              {(p.net_weight ?? p.weight) != null ? `${Number(p.net_weight ?? p.weight)} g` : '—'}
                            </td>
                            <td className="py-3 px-4 text-slate-400">{p.purity ?? '—'}</td>
                            <td className="py-3 px-4 text-right text-slate-300 tabular-nums">
                              {p.pcs ?? 1}
                            </td>
                            <td className="py-3 px-4 text-right text-yellow-500/90 font-medium tabular-nums">
                              ₹{Math.round(getProductPrice(p)).toLocaleString('en-IN')}
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
                        <button
                          onClick={() => toggleStyle(styleKey)}
                          className="w-full flex items-center gap-2 p-4 text-left hover:bg-white/5 transition-colors"
                        >
                          {isStyleOpen ? (
                            <ChevronDown className="size-4 text-yellow-500 shrink-0" />
                          ) : (
                            <ChevronRight className="size-4 text-yellow-500 shrink-0" />
                          )}
                          <span className="font-semibold text-slate-200">{styleCode}</span>
                          <span className="text-slate-500 text-sm">
                            ({skus.length} SKU{skus.length !== 1 ? 's' : ''}, {skus.reduce((s, x) => s + x.products.length, 0)} products)
                          </span>
                        </button>
                        {isStyleOpen && (
                          <div className="border-t border-white/10">
                            {skus.map(({ sku, products: prods }) => {
                              const skuKey = `${styleKey}::${sku}`
                              const isSkuOpen = expandedSkus.has(skuKey)
                              return (
                                <div key={skuKey} className="border-t border-white/5">
                                  <button
                                    onClick={() => toggleSku(skuKey)}
                                    className="w-full flex items-center gap-2 pl-12 pr-4 py-3 text-left hover:bg-white/5 transition-colors"
                                  >
                                    {isSkuOpen ? (
                                      <ChevronDown className="size-4 text-slate-400 shrink-0" />
                                    ) : (
                                      <ChevronRight className="size-4 text-slate-400 shrink-0" />
                                    )}
                                    <span className="text-slate-300 font-medium">{sku}</span>
                                    <span className="text-slate-500 text-sm">({prods.length} items)</span>
                                  </button>
                                  {isSkuOpen && (
                                    <div className="pl-16 pr-4 pb-4 space-y-2">
                                      {prods.map((p) => (
                                        <div
                                          key={p.barcode || p.id}
                                          className="flex flex-wrap items-center gap-4 p-3 rounded-lg bg-slate-900/50 border border-white/5"
                                        >
                                          <div className="w-10 h-10 rounded bg-slate-800 flex items-center justify-center shrink-0">
                                            {p.image_url ? (
                                              <img src={p.image_url} alt="" className="w-full h-full object-cover rounded" />
                                            ) : (
                                              <Package className="size-4 text-slate-500" />
                                            )}
                                          </div>
                                          <div className="min-w-0 flex-1">
                                            <div className="font-medium text-slate-200 truncate">
                                              {p.item_name || p.short_name || p.barcode || '—'}
                                            </div>
                                            <div className="text-xs text-slate-500">
                                              {p.barcode && `Barcode: ${p.barcode}`}
                                              {(p.net_weight ?? p.weight) != null && ` • ${Number(p.net_weight ?? p.weight)} g`}
                                              {p.purity && ` • ${p.purity}`}
                                            </div>
                                          </div>
                                          <div className="text-right shrink-0">
                                            <div className="text-sm font-medium text-yellow-500/90 font-mono">
                                              ₹{Math.round(getProductPrice(p)).toLocaleString('en-IN')}
                                            </div>
                                            <div className="text-xs text-slate-500">Qty: {p.pcs ?? 1}</div>
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

          {/* Publish Catalogue */}
          <div className="mt-8 bg-slate-900/50 backdrop-blur border border-white/10 rounded-xl overflow-hidden">
            <div className="p-4 sm:p-6 border-b border-white/10 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div className="flex items-center gap-2">
                <Globe className="size-6 text-cyan-500" />
                <h2 className="text-lg font-semibold text-slate-200">Publish Catalogue</h2>
              </div>
              <button
                onClick={handleSavePublish}
                disabled={savingPublish || catalogCategories.length === 0}
                className="px-4 py-2 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-semibold text-sm disabled:opacity-60"
              >
                {savingPublish ? 'Saving…' : 'Save Publish Settings'}
              </button>
            </div>
            <div className="p-4 sm:p-6">
              <p className="text-slate-500 text-sm mb-4">
                Select catalogues (Styles) to publish. Published catalogues appear in the public Catalog page. Works on desktop and mobile—tap to select, long-press on mobile for multi-select.
              </p>
              {catalogCategories.length === 0 ? (
                <p className="text-slate-500 text-sm">Sync from ERP first to see catalogues.</p>
              ) : (
                <div className="flex flex-wrap gap-3">
                  {catalogCategories.map((cat) => (
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
                      {publishedIds.has(cat.id) && <Check className="size-4" />}
                      {cat.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </main>
      </div>
    </AdminGuard>
  )
}

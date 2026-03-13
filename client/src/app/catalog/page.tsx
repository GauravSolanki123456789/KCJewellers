'use client'

import { useEffect, useState } from 'react'
import axios from '@/lib/axios'
import ProductCard from '@/components/ProductCard'
import { LayoutGrid, ChevronRight } from 'lucide-react'
import { type Item } from '@/lib/pricing'

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
  const [selectedSubcategory, setSelectedSubcategory] = useState<Subcategory | null>(null)
  const [selectedCategory, setSelectedCategory] = useState<Category | null>(null)
  // Mobile: show sidebar overlay
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false)

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
        // Auto-select first subcategory for a good first impression
        if (cats.length > 0 && cats[0].subcategories.length > 0) {
          setSelectedCategory(cats[0])
          setSelectedSubcategory(cats[0].subcategories[0])
        }
      } catch {
        setCategories([])
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [url])

  const handleSubcategorySelect = (cat: Category, sub: Subcategory) => {
    setSelectedCategory(cat)
    setSelectedSubcategory(sub)
    setMobileSidebarOpen(false)
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center">
        <div className="text-slate-400 text-sm animate-pulse">Loading catalogue…</div>
      </div>
    )
  }

  const hasCategories = categories.length > 0

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <main className="max-w-screen-xl mx-auto px-4 py-6 pb-24">

        {/* Page header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <LayoutGrid className="size-5 text-amber-500" />
            <h1 className="text-lg font-semibold text-slate-200 tracking-tight">Product Catalogue</h1>
          </div>

          {/* Mobile: browse button */}
          {hasCategories && (
            <button
              className="md:hidden flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 border border-white/10 text-slate-300 text-sm"
              onClick={() => setMobileSidebarOpen(true)}
            >
              <LayoutGrid className="size-4" />
              Browse
            </button>
          )}
        </div>

        {!hasCategories ? (
          /* Empty state */
          <div className="rounded-xl bg-slate-900/50 border border-white/10 p-12 text-center">
            <LayoutGrid className="size-16 text-slate-600 mx-auto mb-4" />
            <p className="text-slate-400">No catalogues published yet</p>
            <p className="text-slate-500 text-sm mt-1">
              Admin can sync from ERP and publish catalogues from the dashboard.
            </p>
          </div>
        ) : (
          <div className="flex gap-0 md:gap-6 relative">

            {/* ── Left Sidebar ── */}
            {/* Desktop: always visible */}
            <aside className="hidden md:block w-56 shrink-0 self-start sticky top-24">
              <nav className="space-y-5">
                {categories.map((cat) => (
                  <div key={cat.id}>
                    <p className="px-2 mb-1.5 text-[11px] font-bold uppercase tracking-[0.15em] text-amber-500/80">
                      {cat.name}
                    </p>
                    <ul className="space-y-0.5">
                      {cat.subcategories.map((sub) => {
                        const active = selectedSubcategory?.id === sub.id
                        return (
                          <li key={sub.id}>
                            <button
                              onClick={() => handleSubcategorySelect(cat, sub)}
                              className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm font-medium transition-all duration-150 group ${
                                active
                                  ? 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
                                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 border border-transparent'
                              }`}
                            >
                              <span className="truncate">{sub.name}</span>
                              <span className={`text-[10px] tabular-nums ml-2 shrink-0 ${active ? 'text-amber-500/60' : 'text-slate-600 group-hover:text-slate-500'}`}>
                                {sub.products.length}
                              </span>
                            </button>
                          </li>
                        )
                      })}
                    </ul>
                  </div>
                ))}
              </nav>
            </aside>

            {/* Mobile: overlay sidebar */}
            {mobileSidebarOpen && (
              <div className="md:hidden fixed inset-0 z-50 flex">
                {/* Backdrop */}
                <div
                  className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                  onClick={() => setMobileSidebarOpen(false)}
                />
                {/* Drawer */}
                <div className="relative w-72 max-w-[85vw] h-full bg-slate-950 border-r border-white/10 overflow-y-auto p-4 z-10">
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-sm font-semibold text-slate-200">Browse</span>
                    <button
                      onClick={() => setMobileSidebarOpen(false)}
                      className="text-slate-400 hover:text-slate-200 p-1"
                    >
                      ✕
                    </button>
                  </div>
                  <nav className="space-y-5">
                    {categories.map((cat) => (
                      <div key={cat.id}>
                        <p className="px-2 mb-1.5 text-[11px] font-bold uppercase tracking-[0.15em] text-amber-500/80">
                          {cat.name}
                        </p>
                        <ul className="space-y-0.5">
                          {cat.subcategories.map((sub) => {
                            const active = selectedSubcategory?.id === sub.id
                            return (
                              <li key={sub.id}>
                                <button
                                  onClick={() => handleSubcategorySelect(cat, sub)}
                                  className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                                    active
                                      ? 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
                                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 border border-transparent'
                                  }`}
                                >
                                  <span className="truncate">{sub.name}</span>
                                  <span className="text-[10px] tabular-nums ml-2 shrink-0 text-slate-500">
                                    {sub.products.length}
                                  </span>
                                </button>
                              </li>
                            )
                          })}
                        </ul>
                      </div>
                    ))}
                  </nav>
                </div>
              </div>
            )}

            {/* Mobile: horizontal SKU pills (below header, above grid) */}
            <div className="md:hidden w-full mb-4">
              <div className="flex gap-2 overflow-x-auto pb-2 no-scrollbar">
                {categories.map((cat) =>
                  cat.subcategories.map((sub) => {
                    const active = selectedSubcategory?.id === sub.id
                    return (
                      <button
                        key={sub.id}
                        onClick={() => handleSubcategorySelect(cat, sub)}
                        className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors whitespace-nowrap ${
                          active
                            ? 'bg-amber-500/20 text-amber-400 border-amber-500/40'
                            : 'bg-slate-800/60 text-slate-400 border-white/10 hover:border-white/20'
                        }`}
                      >
                        {sub.name}
                        <span className="ml-1 text-[10px] opacity-60">{sub.products.length}</span>
                      </button>
                    )
                  })
                )}
              </div>
            </div>

            {/* ── Right Product Grid ── */}
            <div className="flex-1 min-w-0">
              {selectedSubcategory && selectedCategory ? (
                <>
                  {/* Section header */}
                  <div className="flex items-center gap-2 mb-5">
                    <span className="text-[11px] font-bold uppercase tracking-widest text-amber-500/70">
                      {selectedCategory.name}
                    </span>
                    <ChevronRight className="size-3 text-slate-600" />
                    <h2 className="text-base font-semibold text-slate-200">{selectedSubcategory.name}</h2>
                    <span className="ml-auto text-xs text-slate-500 tabular-nums">
                      {selectedSubcategory.products.length} item{selectedSubcategory.products.length !== 1 ? 's' : ''}
                    </span>
                  </div>

                  {selectedSubcategory.products.length === 0 ? (
                    <div className="py-16 text-center text-slate-500 text-sm">
                      No products in this collection yet.
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-6">
                      {selectedSubcategory.products.map((p) => (
                        <ProductCard
                          key={p.barcode || p.id || p.sku}
                          product={{ ...p, style_code: selectedCategory.name } as Product}
                          rates={rates}
                        />
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <div className="flex flex-col items-center justify-center py-20 text-center">
                  <LayoutGrid className="size-12 text-slate-700 mb-3" />
                  <p className="text-slate-500 text-sm">Select a collection to browse products</p>
                </div>
              )}
            </div>

          </div>
        )}
      </main>
    </div>
  )
}

'use client'

import { useEffect, useState } from 'react'
import axios from '@/lib/axios'
import ProductCard from '@/components/ProductCard'
import { LayoutGrid, ChevronRight } from 'lucide-react'

type Product = {
  id?: number
  barcode?: string
  sku?: string
  style_code?: string
  item_name?: string
  short_name?: string
  net_weight?: number
  weight?: number
  [key: string]: unknown
}

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
  const [loading, setLoading] = useState(true)
  const [selectedCategory, setSelectedCategory] = useState<Category | null>(null)
  const [selectedSubcategory, setSelectedSubcategory] = useState<Subcategory | null>(null)

  const url = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000'

  useEffect(() => {
    const load = async () => {
      try {
        const res = await axios.get(`${url}/api/catalog`)
        setCategories(res.data?.categories || [])
      } catch {
        setCategories([])
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [url])

  const handleStyleClick = (cat: Category) => {
    setSelectedCategory(cat)
    setSelectedSubcategory(null)
  }

  const handleSubcategoryClick = (sub: Subcategory) => {
    setSelectedSubcategory(sub)
  }

  const handleBackToStyles = () => {
    setSelectedCategory(null)
    setSelectedSubcategory(null)
  }

  const handleBackToSkus = () => {
    setSelectedSubcategory(null)
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 p-4">
        <div className="max-w-4xl mx-auto py-12 text-center text-slate-400">Loading catalogue…</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <main className="max-w-4xl mx-auto px-4 py-8 pb-24">
        <div className="flex items-center gap-2 mb-6">
          <LayoutGrid className="size-6 text-yellow-500" />
          <h1 className="text-xl font-semibold text-slate-200">Product Catalogue</h1>
        </div>

        {categories.length === 0 ? (
          <div className="rounded-xl bg-slate-900/50 border border-white/10 p-12 text-center">
            <LayoutGrid className="size-16 text-slate-600 mx-auto mb-4" />
            <p className="text-slate-400">No catalogues published yet</p>
            <p className="text-slate-500 text-sm mt-1">
              Admin can sync from ERP and publish catalogues from the dashboard.
            </p>
          </div>
        ) : !selectedCategory ? (
          <>
            <p className="text-slate-500 text-sm mb-4">Select a style to browse products</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              {categories.map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => handleStyleClick(cat)}
                  className="group rounded-xl bg-slate-800/50 border border-white/10 hover:border-yellow-500/30 p-6 text-left transition-all"
                >
                  <div className="aspect-square rounded-lg bg-slate-800/80 flex items-center justify-center mb-3 overflow-hidden">
                    {cat.image_url ? (
                      <img src={cat.image_url} alt={cat.name} className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-4xl text-yellow-500/40 font-bold">{cat.name.charAt(0)}</span>
                    )}
                  </div>
                  <div className="font-semibold text-slate-200 group-hover:text-yellow-400">{cat.name}</div>
                  <div className="text-xs text-slate-500 mt-0.5">
                    {cat.subcategories.length} collection{cat.subcategories.length !== 1 ? 's' : ''}
                  </div>
                  <ChevronRight className="size-4 text-slate-500 mt-2 group-hover:text-yellow-500" />
                </button>
              ))}
            </div>
          </>
        ) : !selectedSubcategory ? (
          <>
            <button
              onClick={handleBackToStyles}
              className="text-sm text-slate-400 hover:text-yellow-500 mb-4"
            >
              ← Back to styles
            </button>
            <h2 className="text-lg font-semibold text-slate-200 mb-4">{selectedCategory.name}</h2>
            <p className="text-slate-500 text-sm mb-4">Select a subcategory</p>
            <div className="flex flex-wrap gap-2">
              {selectedCategory.subcategories.map((sub) => (
                <button
                  key={sub.id}
                  onClick={() => handleSubcategoryClick(sub)}
                  className="px-4 py-2 rounded-full bg-slate-800 border border-white/10 hover:border-yellow-500/30 text-slate-200 text-sm font-medium transition-colors"
                >
                  {sub.name}
                  <span className="ml-1.5 text-slate-500">({sub.products.length})</span>
                </button>
              ))}
            </div>
          </>
        ) : (
          <>
            <button
              onClick={handleBackToSkus}
              className="text-sm text-slate-400 hover:text-yellow-500 mb-4"
            >
              ← Back to {selectedCategory.name}
            </button>
            <h2 className="text-lg font-semibold text-slate-200 mb-4">{selectedSubcategory.name}</h2>
            {selectedSubcategory.products.length === 0 ? (
              <p className="text-slate-500 py-8">No products in this collection</p>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {selectedSubcategory.products.map((p) => (
                  <ProductCard key={p.barcode || p.id || p.sku} product={p} />
                ))}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  )
}

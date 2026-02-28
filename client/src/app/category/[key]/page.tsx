'use client'
import axios from "axios"
import React, { useEffect, useState } from "react"
import ProductCard from "@/components/ProductCard"

export default function CategoryPage({ params }: { params: Promise<{ key: string }> }) {
  const { key } = React.use(params)
  const [products, setProducts] = useState<any[]>([])
  useEffect(() => {
    const url = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000"
    const load = async () => {
      try {
        const k = (key || '').toLowerCase()
        if (k === 'gold' || k === 'silver') {
          const res = await axios.get(`${url}/api/products`, { params: { limit: 50, metal_type: k } })
          setProducts(res.data?.products || res.data?.items || res.data || [])
        } else {
          const res = await axios.get(`${url}/api/products`, { params: { limit: 50, search: 'gift' } })
          setProducts(res.data?.products || res.data?.items || res.data || [])
        }
      } catch {}
    }
    load()
  }, [key])
  return (
    <div className="p-4 space-y-4">
      <div className="glass-card p-4">
        <div className="text-lg font-semibold capitalize">{key} Collection</div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-3">
          {products.map((p: any) => <ProductCard key={p.barcode || p.id} product={p} />)}
        </div>
      </div>
    </div>
  )
}

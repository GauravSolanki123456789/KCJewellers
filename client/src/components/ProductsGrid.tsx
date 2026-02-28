'use client'
import axios from "axios"
import { useEffect, useState } from "react"
import ProductCard from "./ProductCard"

export default function ProductsGrid() {
  const [products, setProducts] = useState<any[]>([])
  useEffect(() => {
    const url = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000"
    const load = async () => {
      try {
        const res = await axios.get(`${url}/api/products`, { params: { limit: 12 } })
        setProducts(res.data?.items || res.data || [])
      } catch {}
    }
    load()
  }, [])
  return (
    <div className="glass-card p-4">
      <div className="text-lg font-semibold mb-3">Products</div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {products.map((p: any) => <ProductCard key={p.barcode || p.id} product={p} />)}
      </div>
    </div>
  )
}

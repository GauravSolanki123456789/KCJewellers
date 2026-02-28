'use client'
import axios from "axios"
import BreakdownModal from "@/components/BreakdownModal"
import { calculateBreakdown, type Item } from "@/lib/pricing"
import { trackProductView, trackAddToCart } from "@/components/GoogleAnalytics"
import { getSocket } from "@/lib/socket"
import React, { useEffect, useRef, useState } from "react"
import { useCart } from "@/context/CartContext"

type RateRow = { metal_type?: string, display_rate?: number, sell_rate?: number }
export default function ProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = React.use(params)
  const [product, setProduct] = useState<Item | null>(null)
  const [open, setOpen] = useState(false)
  const [b, setB] = useState<ReturnType<typeof calculateBreakdown> | null>(null)
  const cart = useCart()
  const productRef = useRef<Item | null>(null)
  useEffect(() => {
    const url = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000"
    const load = async () => {
      const safeId = String(id || '').slice(0, 64)
      const res = await axios.get(`${url}/api/products`, { params: { barcode: safeId, limit: 1 } })
      const item = Array.isArray(res.data?.items) ? res.data.items[0] : (res.data?.[0] || null)
      setProduct(item)
      productRef.current = item
      const dr = await axios.get(`${url}/api/rates/display`)
      if (item) {
        setB(calculateBreakdown(item, dr.data?.rates || []))
        trackProductView(item.barcode || item.id || '', item.item_name || item.short_name || 'Product')
      }
    }
    load()
    const s = getSocket()
    const on = (p: { rates?: RateRow[] }) => {
      const cur = productRef.current
      if (cur) setB(calculateBreakdown(cur, p?.rates || []))
    }
    s.on("live-rate", on)
    return () => { s.off("live-rate", on) }
  }, [id])
  // Breakdown recompute occurs in socket handler and after initial load
  if (!product) return <div className="p-4">Loading...</div>
  return (
    <div className="p-4 space-y-4">
      <div className="glass-card p-4">
        <div className="text-2xl font-semibold">{product.item_name || product.short_name}</div>
        <div className="opacity-80">{product.style_code}</div>
        <div className="mt-2">Wt: {product.net_wt || product.weight} gm</div>
        <div className="mt-2 text-xl">₹{Math.round(b?.total || 0)}</div>
        <div className="mt-4 flex gap-2">
          <button className="px-4 py-2 gold-bg text-black rounded" onClick={() => setOpen(true)}>View Breakdown</button>
          <button className="px-4 py-2 glass-card" onClick={() => {
            cart.add(product)
            trackAddToCart(product.barcode || product.id || '', product.item_name || product.short_name || 'Product', b?.total || 0)
          }}>Add to Cart</button>
        </div>
      </div>
      {b && <BreakdownModal open={open} onClose={() => setOpen(false)} breakdown={b} />}
    </div>
  )
}

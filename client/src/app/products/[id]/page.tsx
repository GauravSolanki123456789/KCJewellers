'use client'
import axios from "axios"
import Image from "next/image"
import BreakdownModal from "@/components/BreakdownModal"
import HoverZoomImage from "@/components/HoverZoomImage"
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
    const url = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000"
    const load = async () => {
      const safeId = String(id || '').slice(0, 64)
      const res = await axios.get(`${url}/api/products`, { params: { barcode: safeId, limit: 1 } })
      const item = Array.isArray(res.data?.items) ? res.data.items[0] : (res.data?.[0] || null)
      setProduct(item)
      productRef.current = item
      const dr = await axios.get(`${url}/api/rates/display`)
      if (item) {
        setB(calculateBreakdown(item, dr.data?.rates || []))
        trackProductView(item.barcode || String(item.id || ''), item.item_name || item.short_name || 'Product')
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

  const displayName = product.item_name || product.short_name || 'Product'
  const imageUrl = product.image_url

  return (
    <div className="p-4 space-y-4 max-w-4xl mx-auto">
      <div className="glass-card p-4 flex flex-col sm:flex-row gap-6">
        {/* Main product image with hover-to-zoom */}
        {imageUrl && (
          <div className="shrink-0 w-full sm:w-80 aspect-[4/5] relative rounded-lg overflow-hidden bg-slate-900/50">
            <HoverZoomImage className="absolute inset-0">
              <Image
                src={imageUrl}
                alt={displayName}
                fill
                sizes="(max-width: 640px) 100vw, 320px"
                className="object-contain"
              />
            </HoverZoomImage>
            <span className="absolute bottom-2 left-2 text-[10px] text-slate-500 uppercase tracking-wider">
              Hover to zoom
            </span>
          </div>
        )}
        <div className="flex-1 min-w-0">
        <div className="text-2xl font-semibold">{product.item_name || product.short_name}</div>
        <div className="opacity-80">{product.style_code}</div>
        <div className="mt-2">Wt: {product.net_wt || product.net_weight || product.weight || 0} gm</div>
        <div className="mt-2 text-xl">₹{Math.round(b?.total || 0)}</div>
        <div className="mt-4 flex gap-2">
          <button className="px-4 py-2 gold-bg text-black rounded" onClick={() => setOpen(true)}>View Breakdown</button>
          <button className="px-4 py-2 glass-card" onClick={() => {
            cart.add({ ...product, id: product.id ? String(product.id) : product.barcode })
            trackAddToCart(product.barcode || String(product.id || ''), product.item_name || product.short_name || 'Product', b?.total || 0)
          }}>Add to Cart</button>
        </div>
        </div>
      </div>
      {b && <BreakdownModal open={open} onClose={() => setOpen(false)} breakdown={b} />}
    </div>
  )
}

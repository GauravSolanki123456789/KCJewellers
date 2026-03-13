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
  const styleCode = product.style_code || ''
  const sku = product.sku || product.barcode || ''
  const netWeight = product.net_wt ?? product.net_weight ?? product.weight ?? null
  const purity = product.purity ?? null
  const barcode = product.barcode || product.sku || String(product.id || '')

  return (
    <div className="p-4 max-w-6xl mx-auto mt-8">
      <div className="grid md:grid-cols-2 gap-12">
        {/* Left column — Image */}
        <div className="relative w-full aspect-square md:aspect-[4/5] bg-[#0B1120] rounded-2xl overflow-hidden shadow-2xl border border-white/5">
          {imageUrl ? (
            <>
              <HoverZoomImage>
                <Image
                  src={imageUrl}
                  alt={displayName}
                  fill
                  sizes="(max-width: 768px) 100vw, 50vw"
                  className="object-contain"
                />
              </HoverZoomImage>
              <span className="absolute bottom-3 left-3 text-[10px] text-slate-500 uppercase tracking-wider">
                Hover to zoom
              </span>
            </>
          ) : (
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-6xl font-bold text-slate-600 select-none">
                {displayName.charAt(0)}
              </span>
            </div>
          )}
        </div>

        {/* Right column — Details */}
        <div className="flex flex-col">
          {/* Style Code, SKU, Name */}
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-500 uppercase tracking-widest">
            {styleCode && <span>{styleCode}</span>}
            {sku && <span className="text-slate-600">{styleCode ? '· ' : ''}{sku}</span>}
          </div>
          <h1 className="text-2xl md:text-3xl font-semibold text-slate-100 mt-2 tracking-tight">
            {displayName}
          </h1>

          {/* Price */}
          <div className="mt-6 text-3xl md:text-4xl font-bold text-amber-500 tabular-nums">
            ₹{Math.round(b?.total || 0).toLocaleString('en-IN')}
            <span className="ml-2 text-base font-normal text-slate-500">incl. GST</span>
          </div>

          {/* Specifications */}
          <div className="mt-8 grid grid-cols-1 sm:grid-cols-3 gap-4">
            {netWeight != null && (
              <div className="rounded-lg bg-slate-900/60 border border-slate-800/80 px-4 py-3">
                <span className="text-xs text-slate-500 uppercase tracking-wider block">Net Weight</span>
                <span className="text-slate-200 font-medium">{Number(netWeight).toFixed(2)} gm</span>
              </div>
            )}
            {purity != null && (
              <div className="rounded-lg bg-slate-900/60 border border-slate-800/80 px-4 py-3">
                <span className="text-xs text-slate-500 uppercase tracking-wider block">Purity</span>
                <span className="text-slate-200 font-medium">{String(purity)}</span>
              </div>
            )}
            {barcode && (
              <div className="rounded-lg bg-slate-900/60 border border-slate-800/80 px-4 py-3">
                <span className="text-xs text-slate-500 uppercase tracking-wider block">Barcode</span>
                <span className="text-slate-200 font-medium font-mono text-sm">{barcode}</span>
              </div>
            )}
          </div>

          {/* Action buttons */}
          <div className="mt-8 flex flex-wrap gap-3">
            <button
              className="px-6 py-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold transition-colors"
              onClick={() => setOpen(true)}
            >
              View Breakdown
            </button>
            <button
              className="px-6 py-3 rounded-xl border border-slate-600 hover:border-slate-500 bg-slate-800/50 hover:bg-slate-800 text-slate-200 font-semibold transition-colors"
              onClick={() => {
                cart.add({ ...product, id: product.id ? String(product.id) : product.barcode })
                trackAddToCart(product.barcode || String(product.id || ''), product.item_name || product.short_name || 'Product', b?.total || 0)
              }}
            >
              Add to Cart
            </button>
          </div>
        </div>
      </div>
      {b && <BreakdownModal open={open} onClose={() => setOpen(false)} breakdown={b} />}
    </div>
  )
}

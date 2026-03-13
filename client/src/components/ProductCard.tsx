'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useCart } from '@/context/CartContext'
import { calculateBreakdown, type Item } from '@/lib/pricing'

type ProductCardProps = { product: Item; rates?: unknown[] }

export default function ProductCard({ product, rates = [] }: ProductCardProps) {
  const cart = useCart()
  const [imgError, setImgError] = useState(false)

  const displayName =
    (product as { name?: string }).name ||
    product.item_name ||
    product.short_name ||
    'Item'
  const weight = product.net_weight ?? product.net_wt ?? product.weight
  const barcode = product.barcode || product.sku || String(product.id || '')
  const styleCode =
    (product as { style_code?: string }).style_code || product.sku || ''
  const { total } = calculateBreakdown(product, rates, product.gst_rate ?? 3)

  const showImage = product.image_url && !imgError

  return (
    <Link
      href={`/products/${encodeURIComponent(barcode)}`}
      className="group rounded-xl overflow-hidden bg-slate-900 border border-slate-800 hover:border-amber-500/30 shadow-sm hover:shadow-lg hover:shadow-amber-500/5 transition-all duration-300 flex flex-col"
    >
      {/* Image — 70 % of card */}
      <div className="relative aspect-[4/5] bg-[#0B1120] overflow-hidden">
        {showImage ? (
          <img
            src={product.image_url}
            alt={displayName}
            loading="lazy"
            onError={() => setImgError(true)}
            className="w-full h-full object-contain transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-[#0B1120]">
            <span className="text-5xl font-bold text-slate-600 select-none">
              {displayName.charAt(0)}
            </span>
          </div>
        )}
      </div>

      {/* Details — 30 % of card */}
      <div className="flex flex-col gap-0.5 p-3 flex-1">
        {styleCode && (
          <span className="text-[11px] text-slate-500 uppercase tracking-wider">
            {styleCode}
          </span>
        )}

        <span className="text-base font-bold text-slate-100 truncate leading-tight">
          {barcode}
        </span>

        {weight != null && (
          <span className="text-sm text-slate-400">
            Wt: {Number(weight).toFixed(2)} gm
          </span>
        )}

        <div className="text-lg font-medium text-amber-500 tabular-nums mt-0.5">
          ₹{Math.round(total).toLocaleString('en-IN')}
          <span className="ml-1 text-xs text-slate-500 font-normal">
            incl. GST
          </span>
        </div>

        <button
          className="w-full mt-auto pt-2"
          onClick={(e) => {
            e.preventDefault()
            cart.add(product)
          }}
        >
          <span className="block w-full py-2.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 text-sm font-semibold transition-colors">
            Add to Cart
          </span>
        </button>
      </div>
    </Link>
  )
}

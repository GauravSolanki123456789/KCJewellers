'use client'

import { useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useCart } from '@/context/CartContext'
import { calculateBreakdown, getItemWeight, type Item } from '@/lib/pricing'
import { productImageAbsoluteUrl } from '@/lib/product-image-url'

type ProductCardProps = {
  product: Item
  rates?: unknown[]
  onBeforeNavigate?: (barcode: string) => void
  /** First grid items: faster LCP */
  priority?: boolean
}

export default function ProductCard({
  product,
  rates = [],
  onBeforeNavigate,
  priority = false,
}: ProductCardProps) {
  const cart = useCart()
  const [imgError, setImgError] = useState(false)

  const displayName =
    (product as { name?: string }).name ||
    product.item_name ||
    product.short_name ||
    'Item'
  const weight = getItemWeight(product)
  const barcode = product.barcode || product.sku || String(product.id || '')
  const styleCode =
    (product as { style_code?: string }).style_code || product.sku || ''
  const breakdown = calculateBreakdown(product, rates, product.gst_rate ?? 3)
  const { total, originalTotal, discountPercent } = breakdown
  const hasDiscount = (discountPercent ?? 0) > 0

  const resolvedSrc = productImageAbsoluteUrl(product.image_url)
  const showImage = Boolean(resolvedSrc) && !imgError

  return (
    <Link
      href={`/products/${encodeURIComponent(barcode)}`}
      onClick={() => onBeforeNavigate?.(barcode)}
      data-product-id={barcode}
      className="group rounded-xl overflow-hidden bg-slate-900 border border-slate-800 hover:border-amber-500/30 shadow-sm hover:shadow-lg hover:shadow-amber-500/5 transition-all duration-300 flex flex-col"
    >
      <div className="relative aspect-[4/5] bg-[#0B1120] overflow-hidden">
        {hasDiscount && (
          <span className="absolute top-2 right-2 z-10 px-2 py-0.5 rounded-md bg-amber-500 text-slate-950 text-xs font-bold">
            {Math.round(discountPercent ?? 0)}% OFF
          </span>
        )}
        {showImage && resolvedSrc ? (
          <Image
            src={resolvedSrc}
            alt={displayName}
            fill
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
            className="object-contain transition-transform duration-500 group-hover:scale-105"
            loading={priority ? 'eager' : 'lazy'}
            priority={priority}
            fetchPriority={priority ? 'high' : 'low'}
            decoding="async"
            onError={() => setImgError(true)}
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center bg-[#0B1120]">
            <span className="text-5xl font-bold text-slate-600 select-none">
              {displayName.charAt(0)}
            </span>
          </div>
        )}
      </div>

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
            Weight: {Number(weight).toFixed(2)} gm
          </span>
        )}

        <div className="flex flex-col gap-0.5 mt-0.5 min-w-0">
          {hasDiscount && (
            <span className="line-through text-slate-500 text-sm sm:text-base">
              ₹{Math.round(originalTotal ?? total).toLocaleString('en-IN')}
            </span>
          )}
          <div className="flex items-baseline gap-1.5 flex-wrap">
            <span className="text-amber-500 font-medium tabular-nums text-base sm:text-lg">
              ₹{Math.round(total).toLocaleString('en-IN')}
            </span>
            <span className="text-xs text-slate-500 font-normal shrink-0">
              incl. GST
            </span>
          </div>
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

'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { cn } from '@/lib/utils'
import { catalogProductImageClass } from '@/lib/product-image-classes'
import {
  analyzeProductImage,
  shouldAnalyzeImageSurface,
  type ProductImageAnalysis,
} from '@/lib/detect-image-surface'
import { blendClassForSurface } from '@/lib/product-image-blend'
import {
  isFlatProductImageTone,
  productImageViewportWrapperClass,
} from '@/lib/flat-product-image'
import { useCart } from '@/context/CartContext'
import { calculateBreakdown, getItemWeight, type Item } from '@/lib/pricing'
import { normalizeCatalogImageSrc } from '@/lib/normalize-image-url'

type ProductCardProps = {
  product: Item
  rates?: unknown[]
  onBeforeNavigate?: (barcode: string) => void
  /** First grid items: faster LCP */
  priority?: boolean
  /** Web subcategory slug (e.g. `pitara-tops`) — optional framing tweak for known batches */
  subcategorySlug?: string | null
}

export default function ProductCard({
  product,
  rates = [],
  onBeforeNavigate,
  priority = false,
  subcategorySlug = null,
}: ProductCardProps) {
  const cart = useCart()
  const [imgError, setImgError] = useState(false)
  const [imageLoaded, setImageLoaded] = useState(false)
  const [imageAnalysis, setImageAnalysis] = useState<ProductImageAnalysis | null>(null)
  const [fallbackUnoptimized, setFallbackUnoptimized] = useState(false)

  const displayName =
    (product as { name?: string }).name ||
    product.item_name ||
    product.short_name ||
    'Item'
  const weight = getItemWeight(product)
  const barcode = product.barcode || product.sku || String(product.id || '')

  const imageSrc = normalizeCatalogImageSrc(product.image_url)

  useEffect(() => {
    setImageLoaded(false)
    setImgError(false)
    setImageAnalysis(null)
    setFallbackUnoptimized(false)
  }, [product.image_url, barcode, imageSrc])
  const styleCode =
    (product as { style_code?: string }).style_code || product.sku || ''
  const breakdown = calculateBreakdown(product, rates, product.gst_rate ?? 3)
  const { total, originalTotal, discountPercent } = breakdown
  const hasDiscount = (discountPercent ?? 0) > 0

  const showImage = !!imageSrc && !imgError
  const isFlatBg = isFlatProductImageTone(imageAnalysis?.tone)

  return (
    <Link
      href={`/products/${encodeURIComponent(barcode)}`}
      onClick={() => onBeforeNavigate?.(barcode)}
      data-product-id={barcode}
      className="group rounded-xl overflow-hidden bg-slate-900 border border-slate-800 hover:border-amber-500/30 shadow-sm hover:shadow-lg hover:shadow-amber-500/5 transition-all duration-300 flex flex-col"
    >
      <div className="relative isolate aspect-[4/5] bg-[#0B1120] overflow-hidden">
        {hasDiscount && (
          <span className="absolute top-2 right-2 z-10 px-2 py-0.5 rounded-md bg-amber-500 text-slate-950 text-xs font-bold">
            {Math.round(discountPercent ?? 0)}% OFF
          </span>
        )}
        {showImage ? (
          <>
            <div
              aria-hidden
              className={cn(
                'absolute inset-0 bg-gradient-to-br from-slate-800/40 via-[#0B1120] to-slate-950',
                imageLoaded ? 'opacity-0' : 'opacity-100',
                'transition-opacity duration-150',
              )}
            />
            <div
              className={cn(
                'absolute inset-0 flex items-center justify-center bg-[#0B1120]',
                imageLoaded ? 'opacity-0 pointer-events-none' : 'opacity-100',
                'transition-opacity duration-150',
              )}
            >
              <span className="text-5xl font-bold text-slate-600/60 select-none">
                {displayName.charAt(0)}
              </span>
            </div>
            <div className={productImageViewportWrapperClass(isFlatBg)}>
              <Image
                key={`${imageSrc}-${fallbackUnoptimized ? 'u' : 'o'}`}
                src={imageSrc}
                alt={displayName}
                fill
                sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
                className={cn(
                  catalogProductImageClass(subcategorySlug, { flatTone: isFlatBg }),
                  blendClassForSurface(imageAnalysis?.tone ?? null),
                  'transition-transform duration-300 ease-out group-hover:scale-105',
                )}
                unoptimized={fallbackUnoptimized}
                decoding="async"
                loading={priority ? 'eager' : 'lazy'}
                priority={priority}
                fetchPriority={priority ? 'high' : 'low'}
                onLoad={(e) => {
                  const el = e.currentTarget
                  setImageLoaded(true)
                  if (shouldAnalyzeImageSurface(el)) {
                    setImageAnalysis(analyzeProductImage(el))
                  }
                }}
                onError={() => {
                  if (!fallbackUnoptimized) {
                    setFallbackUnoptimized(true)
                    return
                  }
                  setImgError(true)
                }}
              />
            </div>
          </>
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

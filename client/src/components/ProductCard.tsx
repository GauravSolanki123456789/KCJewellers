'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import { catalogProductImageClass } from '@/lib/product-image-classes'
import { productImageViewportWrapperClass } from '@/lib/flat-product-image'
import { productImageWellClass } from '@/lib/product-image-theme'
import { useCart } from '@/context/CartContext'
import { calculateBreakdown, getItemWeight, type Item } from '@/lib/pricing'
import { getProductSelectionKey } from '@/lib/catalog-product-filters'
import { useCustomerTier } from '@/context/CustomerTierContext'
import { normalizeCatalogImageSrc } from '@/lib/normalize-image-url'
import { CATALOG_GRID_IMAGE_SIZES } from '@/lib/product-card-image-sizes'

type ProductCardProps = {
  product: Item
  rates?: unknown[]
  onBeforeNavigate?: (barcode: string) => void
  /** Responsive `sizes` for `next/image` — should match the parent grid (see `product-card-image-sizes.ts`). */
  imageSizes?: string
  /** First grid items: faster LCP */
  priority?: boolean
  /** Hint for browser resource loading when `priority` is true (stagger grid downloads). */
  imageFetchPriority?: 'high' | 'low' | 'auto'
  /** Web subcategory slug (e.g. `pitara-tops`) — optional framing tweak for known batches */
  subcategorySlug?: string | null
  /** Admin catalogue builder: selection checkbox on the card */
  catalogBuilderActive?: boolean
  selected?: boolean
  onToggleSelect?: () => void
}

export default function ProductCard({
  product,
  rates = [],
  onBeforeNavigate,
  imageSizes = CATALOG_GRID_IMAGE_SIZES,
  priority = false,
  imageFetchPriority,
  subcategorySlug = null,
  catalogBuilderActive = false,
  selected = false,
  onToggleSelect,
}: ProductCardProps) {
  const cart = useCart()
  const { wholesalePricing, hasWholesaleAccess } = useCustomerTier()
  const [imgError, setImgError] = useState(false)
  const [imageLoaded, setImageLoaded] = useState(false)
  const [fallbackUnoptimized, setFallbackUnoptimized] = useState(false)

  const displayName =
    (product as { name?: string }).name ||
    product.item_name ||
    product.short_name ||
    'Item'
  const weight = getItemWeight(product)
  const barcode = getProductSelectionKey(product)

  const imageSrc = normalizeCatalogImageSrc(product.image_url)

  useEffect(() => {
    setImageLoaded(false)
    setImgError(false)
    setFallbackUnoptimized(false)
  }, [product.image_url, barcode, imageSrc])
  const styleCode =
    (product as { style_code?: string }).style_code || product.sku || ''
  const breakdown = calculateBreakdown(product, rates, product.gst_rate ?? 3, wholesalePricing)
  const { total, originalTotal, discountPercent, wholesale_retail_total, is_wholesale_price } = breakdown
  const hasDiscount = (discountPercent ?? 0) > 0
  const fetchPriority = imageFetchPriority ?? (priority ? 'high' : undefined)
  const showWholesale =
    hasWholesaleAccess &&
    is_wholesale_price &&
    wholesale_retail_total != null &&
    wholesale_retail_total > total + 0.5

  const showImage = !!imageSrc && !imgError
  return (
    <div className="relative">
      {catalogBuilderActive && (
        <button
          type="button"
          aria-pressed={selected}
          aria-label={selected ? 'Deselect item' : 'Select item'}
          onClick={(e) => {
            e.preventDefault()
            e.stopPropagation()
            onToggleSelect?.()
          }}
          className="absolute left-2 top-2 z-30 flex size-9 items-center justify-center rounded-lg border border-slate-600/90 bg-slate-950/90 shadow-md backdrop-blur-sm transition hover:border-amber-500/50 md:left-2.5 md:top-2.5"
        >
          <span
            className={cn(
              'flex size-5 items-center justify-center rounded border-2 transition-colors',
              selected
                ? 'border-amber-400 bg-amber-500 text-slate-950'
                : 'border-slate-500 bg-slate-900/80',
            )}
          >
            {selected && <Check className="size-3.5 stroke-[3]" aria-hidden />}
          </span>
        </button>
      )}
      <Link
        href={`/products/${encodeURIComponent(barcode)}`}
        onClick={() => onBeforeNavigate?.(barcode)}
        data-product-id={barcode}
        className="group flex flex-col overflow-hidden rounded-xl border border-slate-800 bg-slate-900 shadow-sm transition-all duration-300 hover:border-amber-500/30 hover:shadow-lg hover:shadow-amber-500/5"
      >
      <div
        className={`relative isolate aspect-[4/5] overflow-hidden ${productImageWellClass}`}
      >
        {showWholesale && (
          <span className="absolute top-2 left-2 z-10 px-2 py-0.5 rounded-md bg-emerald-600/95 text-white text-[10px] font-bold uppercase tracking-wide border border-emerald-400/40">
            Wholesale
          </span>
        )}
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
                'absolute inset-0 bg-gradient-to-br from-slate-800/30 via-[#0B1120] to-slate-950',
                imageLoaded ? 'opacity-0' : 'opacity-100',
                'transition-opacity duration-200',
                !imageLoaded && 'animate-pulse',
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
            <div className={productImageViewportWrapperClass()}>
              <Image
                key={`${imageSrc}-${fallbackUnoptimized ? 'u' : 'o'}`}
                src={imageSrc}
                alt={displayName}
                fill
                quality={72}
                sizes={imageSizes}
                className={cn(
                  catalogProductImageClass(subcategorySlug),
                  'transition-[filter,transform] duration-300 ease-out group-hover:brightness-105 group-hover:scale-[1.02]',
                )}
                unoptimized={fallbackUnoptimized}
                decoding="async"
                loading={priority ? 'eager' : 'lazy'}
                priority={priority}
                fetchPriority={fetchPriority}
                onLoad={() => setImageLoaded(true)}
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
          {showWholesale && (
            <span className="text-[11px] font-semibold uppercase tracking-wide text-emerald-400/90">
              Wholesale rate
            </span>
          )}
          {showWholesale && (
            <span className="line-through text-slate-500 text-sm sm:text-base">
              ₹{Math.round(wholesale_retail_total ?? total).toLocaleString('en-IN')}
            </span>
          )}
          {!showWholesale && hasDiscount && (
            <span className="line-through text-slate-500 text-sm sm:text-base">
              ₹{Math.round(originalTotal ?? total).toLocaleString('en-IN')}
            </span>
          )}
          <div className="flex items-baseline gap-1.5 flex-wrap">
            <span
              className={`font-medium tabular-nums text-base sm:text-lg ${
                showWholesale ? 'text-emerald-400' : 'text-amber-500'
              }`}
            >
              ₹{Math.round(total).toLocaleString('en-IN')}
            </span>
            <span className="text-xs text-slate-500 font-normal shrink-0">
              incl. GST
            </span>
          </div>
        </div>

        {!catalogBuilderActive && (
          <button
            className="mt-auto w-full pt-2"
            onClick={(e) => {
              e.preventDefault()
              cart.add(product)
            }}
          >
            <span className="block w-full rounded-lg bg-amber-500 py-2.5 text-sm font-semibold text-slate-950 transition-colors hover:bg-amber-400">
              Add to Cart
            </span>
          </button>
        )}
      </div>
    </Link>
    </div>
  )
}

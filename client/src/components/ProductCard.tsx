'use client'

import Link from 'next/link'
import { Check, ExternalLink } from 'lucide-react'
import { cn } from '@/lib/utils'
import { productImageEmptyWellClass, productImageWellClass } from '@/lib/product-image-theme'
import { useCart } from '@/context/CartContext'
import {
  calculateBreakdown,
  getCustomerDisplaySize,
  getCustomerDisplayWeight,
  productPriceShowsInclGst,
  type Item,
} from '@/lib/pricing'
import { getProductSelectionKey } from '@/lib/catalog-product-filters'
import { useCustomerTier } from '@/context/CustomerTierContext'
import { useCatalogPricingSettings } from '@/context/CatalogPricingSettingsContext'
import { normalizeCatalogImageSrc } from '@/lib/normalize-image-url'
import { CATALOG_GRID_IMAGE_SIZES } from '@/lib/product-card-image-sizes'
import DualJewelleryProductImage from '@/components/catalog/DualJewelleryProductImage'

type ProductCardProps = {
  product: Item
  rates?: unknown[]
  onBeforeNavigate?: (barcode: string) => void
  imageSizes?: string
  priority?: boolean
  imageFetchPriority?: 'high' | 'low' | 'auto'
  subcategorySlug?: string | null
  catalogBuilderActive?: boolean
  selected?: boolean
  onToggleSelect?: () => void
  /** Hide redundant style label when browsing within that collection */
  showStyleLabel?: boolean
}

function CatalogBuilderCheckmark({
  selected,
  onToggle,
  className,
}: {
  selected: boolean
  onToggle: () => void
  className?: string
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      aria-label={selected ? 'Remove from catalogue selection' : 'Add to catalogue selection'}
      onClick={(e) => {
        e.preventDefault()
        e.stopPropagation()
        onToggle()
      }}
      className={cn(
        'flex shrink-0 touch-manipulation items-center justify-center rounded-full border-2 shadow-md transition active:scale-95',
        'size-11 min-h-[44px] min-w-[44px] sm:size-10 sm:min-h-[40px] sm:min-w-[40px]',
        selected
          ? 'border-emerald-400/60 bg-emerald-600 text-white'
          : 'border-white/90 bg-white/95 text-slate-700 hover:bg-white',
        className,
      )}
    >
      {selected ? <Check className="size-5 stroke-[2.5]" aria-hidden /> : null}
    </button>
  )
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
  showStyleLabel = true,
}: ProductCardProps) {
  const cart = useCart()
  const { wholesalePricing, hasWholesaleAccess } = useCustomerTier()
  const { pricingOptions } = useCatalogPricingSettings()

  const displayName =
    (product as { name?: string }).name ||
    product.item_name ||
    product.short_name ||
    'Item'
  const weight = getCustomerDisplayWeight(product)
  const sizeInches = getCustomerDisplaySize(product)
  const barcode = getProductSelectionKey(product)
  const productHref = `/products/${encodeURIComponent(barcode)}`

  const imageSrc = normalizeCatalogImageSrc(product.image_url)

  const styleCode =
    (product as { style_code?: string }).style_code || product.sku || ''
  const breakdown = calculateBreakdown(product, rates, product.gst_rate ?? 3, wholesalePricing, pricingOptions)
  const showInclGst = productPriceShowsInclGst(product, pricingOptions)
  const { total, originalTotal, discountPercent, wholesale_retail_total, is_wholesale_price } = breakdown
  const hasDiscount = (discountPercent ?? 0) > 0
  const showWholesale =
    hasWholesaleAccess &&
    is_wholesale_price &&
    wholesale_retail_total != null &&
    wholesale_retail_total > total + 0.5
  const fetchPriority = imageFetchPriority ?? (priority ? 'high' : undefined)

  const showImage = !!imageSrc

  const toggleSelection = () => onToggleSelect?.()

  const cardShellClass = cn(
    'kc-product-card group',
    catalogBuilderActive
      ? cn(
          'cursor-pointer select-none touch-manipulation',
          selected
            ? 'ring-2 ring-amber-500/30 border-amber-500/40'
            : '',
        )
      : '',
  )

  const imageBlock = (
    <div
      className={cn(
        'relative isolate aspect-[4/5] overflow-hidden',
        productImageWellClass,
      )}
    >
      {catalogBuilderActive ? (
        <div className="absolute left-2 top-2 z-40 sm:left-2.5 sm:top-2.5">
          <CatalogBuilderCheckmark selected={selected} onToggle={toggleSelection} />
        </div>
      ) : null}

      {showWholesale && !catalogBuilderActive ? (
        <span className="absolute left-2 top-2 z-10 rounded-sm bg-emerald-700/90 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-white">
          Wholesale
        </span>
      ) : null}

      {hasDiscount ? (
        <span className={cn('kc-discount-badge', catalogBuilderActive && 'right-2 left-auto')}>
          {Math.round(discountPercent ?? 0)}% off
        </span>
      ) : null}

      {catalogBuilderActive ? (
        <Link
          href={productHref}
          onClick={(e) => {
            e.stopPropagation()
            onBeforeNavigate?.(barcode)
          }}
          className="absolute bottom-2 right-2 z-40 inline-flex min-h-[32px] touch-manipulation items-center gap-1 rounded-full border border-slate-700/40 bg-white/95 px-2.5 py-1 text-[10px] font-medium tracking-wide text-slate-700 shadow-sm transition hover:bg-white active:scale-95"
          aria-label={`View ${barcode} details`}
        >
          View
          <ExternalLink className="size-3 shrink-0 opacity-60" aria-hidden />
        </Link>
      ) : null}

      {showImage ? (
        <DualJewelleryProductImage
          primarySrc={imageSrc}
          secondary_image_url={(product as { secondary_image_url?: string | null }).secondary_image_url}
          alt={displayName}
          sizes={imageSizes}
          subcategorySlug={subcategorySlug}
          priority={priority}
          fetchPriority={fetchPriority}
        />
      ) : (
        <div
          className={cn(
            'absolute inset-0 flex flex-col items-center justify-center gap-2',
            productImageEmptyWellClass,
          )}
        >
          <span className="sr-only">{displayName} — awaiting photo</span>
        </div>
      )}
    </div>
  )

  const detailsBlock = (
    <div className="kc-product-card-body">
      {showStyleLabel && styleCode ? (
        <span className="truncate text-[9px] font-medium uppercase tracking-[0.14em] text-slate-500 sm:text-[10px]">
          {styleCode}
        </span>
      ) : null}

      <span className="truncate font-mono text-[11px] font-medium tabular-nums text-slate-300 sm:text-xs">
        {barcode}
      </span>

      {weight != null ? (
        <span className="text-[10px] text-slate-500">{Number(weight).toFixed(2)} gm</span>
      ) : null}
      {sizeInches ? (
        <span className="text-[10px] text-slate-500">Size {sizeInches}</span>
      ) : null}

      <div className="mt-auto flex min-w-0 flex-col gap-0.5 pt-1.5">
        {showWholesale ? (
          <span className="text-[9px] font-semibold uppercase tracking-wider text-emerald-600">
            Wholesale rate
          </span>
        ) : null}
        {showWholesale ? (
          <span className="text-[10px] line-through text-slate-500">
            ₹{Math.round(wholesale_retail_total ?? total).toLocaleString('en-IN')}
          </span>
        ) : null}
        {!showWholesale && hasDiscount ? (
          <span className="text-[10px] line-through text-slate-500">
            ₹{Math.round(originalTotal ?? total).toLocaleString('en-IN')}
          </span>
        ) : null}
        <div className="flex flex-wrap items-baseline gap-x-1 gap-y-0">
          <span
            className={cn(
              'text-sm font-semibold tabular-nums tracking-tight sm:text-[0.9375rem]',
              showWholesale ? 'text-emerald-600' : 'text-slate-100',
            )}
          >
            ₹{Math.round(total).toLocaleString('en-IN')}
          </span>
          {showInclGst ? (
            <span className="shrink-0 text-[8px] font-normal uppercase tracking-wide text-slate-500 sm:text-[9px]">
              incl. GST
            </span>
          ) : null}
        </div>
      </div>

      {catalogBuilderActive ? (
        <p className="mt-2 text-center text-[10px] font-medium text-slate-500">
          {selected ? 'Tap to remove' : 'Tap to select'}
        </p>
      ) : (
        <button
          className="mt-2 w-full"
          onClick={(e) => {
            e.preventDefault()
            cart.add(product)
          }}
        >
          <span className="kc-btn-cart">Add to Cart</span>
        </button>
      )}
    </div>
  )

  if (catalogBuilderActive) {
    return (
      <article
        data-product-id={barcode}
        role="button"
        tabIndex={0}
        aria-pressed={selected}
        aria-label={`${selected ? 'Deselect' : 'Select'} ${barcode}`}
        onClick={toggleSelection}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            toggleSelection()
          }
        }}
        className={cardShellClass}
      >
        {imageBlock}
        {detailsBlock}
      </article>
    )
  }

  return (
    <div className="relative">
      <Link
        href={productHref}
        onClick={() => onBeforeNavigate?.(barcode)}
        data-product-id={barcode}
        className={cardShellClass}
      >
        {imageBlock}
        {detailsBlock}
      </Link>
    </div>
  )
}

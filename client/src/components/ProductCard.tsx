'use client'

import Link from 'next/link'
import { Check, ExternalLink, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { productImageEmptyWellClass, productImageWellClass } from '@/lib/product-image-theme'
import { useCart } from '@/context/CartContext'
import { calculateBreakdown, getItemWeight, type Item } from '@/lib/pricing'
import { getProductSelectionKey } from '@/lib/catalog-product-filters'
import { useCustomerTier } from '@/context/CustomerTierContext'
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
  /** Catalogue builder — tap card or checkmark to add to `selectedProductIds`. */
  catalogBuilderActive?: boolean
  selected?: boolean
  onToggleSelect?: () => void
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
        'flex shrink-0 touch-manipulation items-center justify-center rounded-full border-[3px] shadow-lg transition active:scale-95',
        'size-12 min-h-[48px] min-w-[48px] sm:size-11 sm:min-h-[44px] sm:min-w-[44px]',
        selected
          ? 'border-emerald-300 bg-emerald-600 text-white'
          : 'border-white/90 bg-white/95 text-neutral-800 hover:bg-white',
        className,
      )}
    >
      {selected ? <Check className="size-6 stroke-[2.75] sm:size-5" aria-hidden /> : null}
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
}: ProductCardProps) {
  const cart = useCart()
  const { wholesalePricing, hasWholesaleAccess } = useCustomerTier()

  const displayName =
    (product as { name?: string }).name ||
    product.item_name ||
    product.short_name ||
    'Item'
  const weight = getItemWeight(product)
  const barcode = getProductSelectionKey(product)
  const productHref = `/products/${encodeURIComponent(barcode)}`

  const imageSrc = normalizeCatalogImageSrc(product.image_url)

  const styleCode =
    (product as { style_code?: string }).style_code || product.sku || ''
  const breakdown = calculateBreakdown(product, rates, product.gst_rate ?? 3, wholesalePricing)
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
    'group flex flex-col overflow-hidden rounded-xl border bg-slate-900 shadow-sm transition-all duration-300',
    catalogBuilderActive
      ? cn(
          'cursor-pointer select-none touch-manipulation',
          selected
            ? 'border-amber-500/80 ring-2 ring-amber-500/35 shadow-md shadow-amber-500/10'
            : 'border-slate-800 hover:border-amber-500/40',
        )
      : 'border-slate-800 hover:border-amber-500/30 hover:shadow-lg hover:shadow-amber-500/5',
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
        <span className="absolute left-2 top-2 z-10 rounded-md border border-emerald-400/40 bg-emerald-600/95 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
          Wholesale
        </span>
      ) : null}

      {hasDiscount ? (
        <span
          className={cn(
            'absolute top-2 z-10 rounded-md bg-amber-500 px-2 py-0.5 text-xs font-bold text-white',
            catalogBuilderActive ? 'right-2' : 'right-2',
          )}
        >
          {Math.round(discountPercent ?? 0)}% OFF
        </span>
      ) : null}

      {catalogBuilderActive ? (
        <Link
          href={productHref}
          onClick={(e) => {
            e.stopPropagation()
            onBeforeNavigate?.(barcode)
          }}
          className="absolute bottom-2 right-2 z-40 inline-flex min-h-[36px] touch-manipulation items-center gap-1 rounded-full border border-white/80 bg-white/95 px-2.5 py-1.5 text-[11px] font-semibold text-neutral-800 shadow-md transition hover:bg-white active:scale-95"
          aria-label={`View ${barcode} details`}
        >
          View
          <ExternalLink className="size-3 shrink-0 opacity-70" aria-hidden />
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
          <Loader2 className="size-8 animate-spin text-slate-400" aria-hidden />
          <span className="sr-only">{displayName} — awaiting photo</span>
        </div>
      )}
    </div>
  )

  const detailsBlock = (
    <div className="flex flex-1 flex-col gap-0.5 p-3">
      {styleCode ? (
        <span className="text-[11px] uppercase tracking-wider text-slate-500">{styleCode}</span>
      ) : null}

      <span className="truncate text-base font-bold leading-tight text-slate-100">{barcode}</span>

      {weight != null ? (
        <span className="text-sm text-slate-400">Weight: {Number(weight).toFixed(2)} gm</span>
      ) : null}

      <div className="mt-0.5 flex min-w-0 flex-col gap-0.5">
        {showWholesale ? (
          <span className="text-[11px] font-semibold uppercase tracking-wide text-emerald-400/90">
            Wholesale rate
          </span>
        ) : null}
        {showWholesale ? (
          <span className="text-sm line-through text-slate-500 sm:text-base">
            ₹{Math.round(wholesale_retail_total ?? total).toLocaleString('en-IN')}
          </span>
        ) : null}
        {!showWholesale && hasDiscount ? (
          <span className="text-sm line-through text-slate-500 sm:text-base">
            ₹{Math.round(originalTotal ?? total).toLocaleString('en-IN')}
          </span>
        ) : null}
        <div className="flex flex-wrap items-baseline gap-1.5">
          <span
            className={cn(
              'text-base font-semibold tabular-nums sm:text-lg',
              showWholesale ? 'text-emerald-400' : 'text-amber-500',
            )}
          >
            ₹{Math.round(total).toLocaleString('en-IN')}
          </span>
          <span className="shrink-0 text-xs font-normal text-slate-500">incl. GST</span>
        </div>
      </div>

      {catalogBuilderActive ? (
        <p className="mt-2 text-center text-[11px] font-medium text-slate-500 sm:text-xs">
          {selected ? 'Tap again to remove' : 'Tap card to select'}
        </p>
      ) : (
        <button
          className="mt-auto w-full pt-2"
          onClick={(e) => {
            e.preventDefault()
            cart.add(product)
          }}
        >
          <span className="block w-full rounded-lg bg-amber-500 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-amber-400">
            Add to Cart
          </span>
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

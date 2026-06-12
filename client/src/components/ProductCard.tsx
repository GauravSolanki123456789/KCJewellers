'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Check, ExternalLink } from 'lucide-react'
import { cn } from '@/lib/utils'
import { productImageEmptyWellClass, productImageWellClass } from '@/lib/product-image-theme'
import { useCart } from '@/context/CartContext'
import { useCatalogBuilderOptional } from '@/context/CatalogBuilderContext'
import {
  calculateBreakdown,
  getCustomerDisplaySize,
  getCustomerDisplayWeightLabel,
  productPriceShowsInclGst,
  type Item,
} from '@/lib/pricing'
import { getProductSelectionKey } from '@/lib/catalog-product-filters'
import { useCustomerTier } from '@/context/CustomerTierContext'
import { useCatalogPricingSettings } from '@/context/CatalogPricingSettingsContext'
import { normalizeCatalogImageSrc } from '@/lib/normalize-image-url'
import { CATALOG_GRID_IMAGE_SIZES } from '@/lib/product-card-image-sizes'
import DualJewelleryProductImage from '@/components/catalog/DualJewelleryProductImage'
import BoxOptionToggle from '@/components/catalog/BoxOptionToggle'
import GiftingSizeVariantPicker from '@/components/catalog/GiftingSizeVariantPicker'
import {
  boxImageSlideIndex,
  giftingDisplayTotal,
  productHasBoxOption,
} from '@/lib/product-box-pricing'
import {
  getAttachedVariants,
  variantDisplayTitle,
  type ItemWithVariants,
} from '@/lib/product-variants'

type ProductCardProps = {
  product: ItemWithVariants
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
  selected: selectedProp = false,
  onToggleSelect,
  showStyleLabel = true,
}: ProductCardProps) {
  const cart = useCart()
  const catalogBuilder = useCatalogBuilderOptional()
  const { wholesalePricing, hasWholesaleAccess } = useCustomerTier()
  const { pricingOptions } = useCatalogPricingSettings()

  const variants = useMemo(() => getAttachedVariants(product), [product])
  const hasVariants = variants.length > 1
  const [activeVariant, setActiveVariant] = useState<Item>(() => variants[0] ?? product)
  const [includeBox, setIncludeBox] = useState(false)
  const [galleryScrollIdx, setGalleryScrollIdx] = useState<number | null>(null)

  useEffect(() => {
    setActiveVariant(variants[0] ?? product)
    setIncludeBox(false)
    setGalleryScrollIdx(null)
  }, [product, variants])

  const active = hasVariants ? activeVariant : product
  const hasBox = productHasBoxOption(active)
  const boxSlideIdx = boxImageSlideIndex(active)
  const displayName = variantDisplayTitle(product)
  const weightLabel = getCustomerDisplayWeightLabel(active)
  const barcode = getProductSelectionKey(active)
  const productHref =
    includeBox && hasBox
      ? `/products/${encodeURIComponent(barcode)}?box=1`
      : `/products/${encodeURIComponent(barcode)}`

  const imageSrc = normalizeCatalogImageSrc(
    active.image_url || product.image_url,
  )

  const styleCode =
    (product as { style_code?: string }).style_code || product.sku || ''
  const breakdown = calculateBreakdown(
    active,
    rates,
    active.gst_rate ?? 3,
    wholesalePricing,
    pricingOptions,
  )
  const displayTotal = giftingDisplayTotal(
    active,
    rates,
    includeBox,
    wholesalePricing,
    pricingOptions,
  )
  const showInclGst = productPriceShowsInclGst(active, pricingOptions)
  const { total, originalTotal, discountPercent, wholesale_retail_total, is_wholesale_price } = breakdown
  const hasDiscount = (discountPercent ?? 0) > 0
  const showWholesale =
    hasWholesaleAccess &&
    is_wholesale_price &&
    wholesale_retail_total != null &&
    wholesale_retail_total > total + 0.5
  const fetchPriority = imageFetchPriority ?? (priority ? 'high' : undefined)

  const showImage = !!imageSrc

  const builderSelected =
    catalogBuilderActive && catalogBuilder
      ? catalogBuilder.isProductSelected(barcode)
      : selectedProp

  const toggleSelection = () => {
    if (catalogBuilderActive && catalogBuilder) {
      catalogBuilder.toggleProductId(barcode)
      return
    }
    onToggleSelect?.()
  }

  const cardShellClass = cn(
    'kc-product-card group',
    catalogBuilderActive
      ? cn(
          'cursor-pointer select-none touch-manipulation',
          builderSelected
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
          <CatalogBuilderCheckmark selected={builderSelected} onToggle={toggleSelection} />
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
          secondary_image_url={active.secondary_image_url ?? product.secondary_image_url}
          box_image_url={active.box_image_url ?? (product as Item).box_image_url}
          video_url={active.video_url ?? (product as Item).video_url}
          alt={displayName}
          sizes={imageSizes}
          subcategorySlug={subcategorySlug}
          priority={priority}
          fetchPriority={fetchPriority}
          scrollToIndex={galleryScrollIdx}
          onActiveIndexChange={(idx) => {
            if (boxSlideIdx != null && idx === boxSlideIdx) setIncludeBox(true)
            else if (hasBox) setIncludeBox(false)
          }}
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

      <span className="line-clamp-2 text-[11px] font-semibold leading-snug text-slate-100 sm:text-xs">
        {displayName}
      </span>

      {weightLabel ? (
        <span className="text-[10px] text-slate-500">{weightLabel}</span>
      ) : null}
      {hasVariants ? (
        <div
          onClick={(e) => {
            e.preventDefault()
            e.stopPropagation()
          }}
          onKeyDown={(e) => e.stopPropagation()}
        >
          <GiftingSizeVariantPicker
            variants={variants}
            selected={active}
            onSelect={setActiveVariant}
            density="card"
            className="mt-0.5"
          />
        </div>
      ) : getCustomerDisplaySize(active) ? (
        <span className="kc-size-chip-single mt-0.5 w-fit">
          {getCustomerDisplaySize(active)}
        </span>
      ) : null}

      {hasBox ? (
        <BoxOptionToggle
          item={active}
          includeBox={includeBox}
          onChange={(withBox) => {
            setIncludeBox(withBox)
            if (withBox && boxSlideIdx != null) setGalleryScrollIdx(boxSlideIdx)
            else setGalleryScrollIdx(0)
          }}
          density="card"
        />
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
            ₹{Math.round(hasBox ? displayTotal : total).toLocaleString('en-IN')}
          </span>
          {hasBox && includeBox ? (
            <span className="shrink-0 text-[8px] font-normal uppercase tracking-wide text-emerald-500/90 sm:text-[9px]">
              with box
            </span>
          ) : null}
          {showInclGst ? (
            <span className="shrink-0 text-[8px] font-normal uppercase tracking-wide text-slate-500 sm:text-[9px]">
              incl. GST
            </span>
          ) : null}
        </div>
      </div>

      {catalogBuilderActive ? (
        <p className="mt-2 text-center text-[10px] font-medium text-slate-500">
          {builderSelected ? 'Tap to remove' : 'Tap to select'}
        </p>
      ) : (
        <button
          className="mt-2 w-full"
          onClick={(e) => {
            e.preventDefault()
            e.stopPropagation()
            cart.add({ ...active, include_box: includeBox })
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
        aria-pressed={builderSelected}
        aria-label={`${builderSelected ? 'Deselect' : 'Select'} ${displayName}`}
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

'use client'

import type { KeyboardEvent, MouseEvent } from 'react'
import { cn } from '@/lib/utils'
import {
  getProductBoxCharges,
  giftingDisplayTotal,
  productHasBoxOption,
} from '@/lib/product-box-pricing'
import { type Item } from '@/lib/pricing'
import { useCatalogPricingSettings } from '@/context/CatalogPricingSettingsContext'
import { useCustomerTier } from '@/context/CustomerTierContext'

type Props = {
  item: Item
  includeBox: boolean
  onChange: (withBox: boolean) => void
  density?: 'card' | 'detail'
  /** When false, chips show labels only (price shown elsewhere — e.g. shared catalogue). */
  showChipPrices?: boolean
  className?: string
}

function stopNav(e: MouseEvent | KeyboardEvent) {
  e.preventDefault()
  e.stopPropagation()
}

export default function BoxOptionToggle({
  item,
  includeBox,
  onChange,
  density = 'card',
  showChipPrices = true,
  className,
}: Props) {
  const { wholesalePricing } = useCustomerTier()
  const { pricingOptions } = useCatalogPricingSettings()

  if (!productHasBoxOption(item)) return null

  const boxAdd = getProductBoxCharges(item)
  const withoutTotal = giftingDisplayTotal(item, [], false, wholesalePricing, pricingOptions)
  const withTotal = withoutTotal + boxAdd
  const isDetail = density === 'detail'
  /** Light KC chips on cards and PDP — dark chips clash on cream product pages. */
  const activeCls = 'kc-size-chip-active'
  const idleCls = 'kc-size-chip-idle'

  const chipBase = cn(
    'kc-size-chip shrink-0 touch-manipulation rounded-lg border font-semibold transition',
    isDetail
      ? 'min-h-[48px] flex-1 px-3 py-2.5 text-sm'
      : showChipPrices
        ? 'min-h-[32px] px-2 py-1 text-[10px] sm:min-h-[36px] sm:px-2.5 sm:text-[11px]'
        : 'min-h-[28px] flex-1 px-2 py-1 text-[10px] sm:min-h-[30px] sm:text-[11px]',
  )

  return (
    <div
      className={cn('min-w-0', className)}
      onClick={stopNav}
      onKeyDown={stopNav}
      role="group"
      aria-label="Gift box option"
    >
      <p
        className={cn(
          'font-medium uppercase tracking-wider',
          isDetail
            ? 'mb-2 text-xs font-semibold text-slate-600'
            : 'mb-1 text-[9px] text-slate-500 sm:text-[10px]',
        )}
      >
        Packaging
      </p>
      <div className="flex gap-1.5">
        <button
          type="button"
          aria-pressed={!includeBox}
          onClick={(e) => {
            stopNav(e)
            onChange(false)
          }}
          className={cn(chipBase, !includeBox ? activeCls : idleCls)}
        >
          <span className="block leading-tight">Without box</span>
          {showChipPrices ? (
            <span
              className={cn(
                'mt-0.5 block font-normal tabular-nums',
                isDetail ? 'text-[11px] opacity-90' : 'text-[9px] opacity-80',
              )}
            >
              ₹{Math.round(withoutTotal).toLocaleString('en-IN')}
            </span>
          ) : null}
        </button>
        <button
          type="button"
          aria-pressed={includeBox}
          onClick={(e) => {
            stopNav(e)
            onChange(true)
          }}
          className={cn(chipBase, includeBox ? activeCls : idleCls)}
        >
          <span className="block leading-tight">With box</span>
          {showChipPrices ? (
            <span
              className={cn(
                'mt-0.5 block font-normal tabular-nums',
                isDetail ? 'text-[11px] opacity-90' : 'text-[9px] opacity-80',
              )}
            >
              ₹{Math.round(withTotal).toLocaleString('en-IN')}
            </span>
          ) : null}
        </button>
      </div>
    </div>
  )
}

'use client'

import { useMemo } from 'react'
import { cn } from '@/lib/utils'
import {
  getProductBoxCharges,
  giftingDisplayTotal,
  productHasBoxOption,
} from '@/lib/product-box-pricing'
import type { CatalogPricingOptions, Item, WholesalePricingInput } from '@/lib/pricing'

type Props = {
  item: Item
  includeBox: boolean
  onChange: (withBox: boolean) => void
  density?: 'card' | 'detail'
  className?: string
  rates?: unknown[]
  wholesalePricing?: WholesalePricingInput | null
  pricingOptions?: CatalogPricingOptions
}

function formatInr(n: number): string {
  return `₹${Math.round(n).toLocaleString('en-IN')}`
}

export default function BoxOptionToggle({
  item,
  includeBox,
  onChange,
  density = 'card',
  className,
  rates = [],
  wholesalePricing = null,
  pricingOptions,
}: Props) {
  const boxAdd = getProductBoxCharges(item)
  const hasBox = productHasBoxOption(item)
  const baseTotal = useMemo(
    () => giftingDisplayTotal(item, rates, false, wholesalePricing, pricingOptions),
    [item, rates, wholesalePricing, pricingOptions],
  )
  const withBoxTotal = useMemo(
    () => giftingDisplayTotal(item, rates, true, wholesalePricing, pricingOptions),
    [item, rates, wholesalePricing, pricingOptions],
  )

  if (!hasBox) return null

  const isDetail = density === 'detail'

  return (
    <div className={cn('min-w-0', className)}>
      <p
        className={cn(
          'font-medium uppercase tracking-wider',
          isDetail ? 'mb-2 text-xs text-slate-600' : 'mb-1 text-[9px] text-slate-600 sm:text-[10px]',
        )}
      >
        Packaging
      </p>
      <div
        role="group"
        aria-label="Choose with or without gift box"
        className={cn(
          'flex gap-1.5 overflow-x-auto pb-0.5 scrollbar-hide',
          isDetail ? 'flex-wrap gap-2' : 'snap-x snap-mandatory',
        )}
      >
        <button
          type="button"
          aria-pressed={!includeBox}
          onClick={(e) => {
            e.preventDefault()
            e.stopPropagation()
            onChange(false)
          }}
          className={cn(
            'kc-size-chip shrink-0 snap-start touch-manipulation rounded-lg border font-semibold tabular-nums transition',
            isDetail
              ? 'min-h-[44px] px-4 py-2.5 text-sm'
              : 'min-h-[32px] px-2.5 py-1 text-[11px] sm:min-h-[36px] sm:px-3 sm:text-xs',
            !includeBox ? 'kc-size-chip-active' : 'kc-size-chip-idle',
          )}
        >
          {isDetail ? `Without box · ${formatInr(baseTotal)}` : 'Without box'}
        </button>
        <button
          type="button"
          aria-pressed={includeBox}
          onClick={(e) => {
            e.preventDefault()
            e.stopPropagation()
            onChange(true)
          }}
          className={cn(
            'kc-size-chip shrink-0 snap-start touch-manipulation rounded-lg border font-semibold tabular-nums transition',
            isDetail
              ? 'min-h-[44px] px-4 py-2.5 text-sm'
              : 'min-h-[32px] px-2.5 py-1 text-[11px] sm:min-h-[36px] sm:px-3 sm:text-xs',
            includeBox ? 'kc-size-chip-active border-emerald-500/40 bg-emerald-500/10 text-emerald-800' : 'kc-size-chip-idle',
          )}
        >
          {isDetail ? (
            `With box · ${formatInr(withBoxTotal)}`
          ) : (
            <>
              With box
              {boxAdd > 0 ? (
                <span className="ml-1 font-normal opacity-80">+{formatInr(boxAdd)}</span>
              ) : null}
            </>
          )}
        </button>
      </div>
    </div>
  )
}

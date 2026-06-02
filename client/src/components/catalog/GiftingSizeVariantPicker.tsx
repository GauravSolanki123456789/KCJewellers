'use client'

import { useMemo } from 'react'
import { cn } from '@/lib/utils'
import { getCustomerDisplaySize, type Item } from '@/lib/pricing'
import { getProductSelectionKey } from '@/lib/catalog-product-filters'
import { sortSizeVariants } from '@/lib/product-variants'

type Props = {
  variants: Item[]
  selected: Item
  onSelect: (variant: Item) => void
  /** Compact row for product cards; roomy chips on PDP. */
  density?: 'card' | 'detail'
  className?: string
}

function sizeLabel(v: Item): string {
  return getCustomerDisplaySize(v) || String(v.size ?? '').trim() || '—'
}

export default function GiftingSizeVariantPicker({
  variants,
  selected,
  onSelect,
  density = 'card',
  className,
}: Props) {
  const sorted = useMemo(() => sortSizeVariants(variants), [variants])
  if (sorted.length <= 1) return null

  const selectedKey = getProductSelectionKey(selected)
  const isDetail = density === 'detail'

  return (
    <div className={cn('min-w-0', className)}>
      <p
        className={cn(
          'font-medium uppercase tracking-wider text-slate-500',
          isDetail ? 'mb-2 text-xs' : 'mb-1 text-[9px] sm:text-[10px]',
        )}
      >
        Size
      </p>
      <div
        role="listbox"
        aria-label="Choose size"
        className={cn(
          'flex gap-1.5 overflow-x-auto pb-0.5 scrollbar-hide',
          isDetail ? 'flex-wrap gap-2' : 'snap-x snap-mandatory',
        )}
      >
        {sorted.map((v) => {
          const key = getProductSelectionKey(v)
          const active = key === selectedKey
          const label = sizeLabel(v)
          return (
            <button
              key={key || label}
              type="button"
              role="option"
              aria-selected={active}
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                onSelect(v)
              }}
              className={cn(
                'shrink-0 snap-start touch-manipulation rounded-lg border font-medium tabular-nums transition',
                isDetail
                  ? 'min-h-[44px] px-4 py-2.5 text-sm'
                  : 'min-h-[32px] px-2.5 py-1 text-[11px] sm:min-h-[36px] sm:px-3 sm:text-xs',
                active
                  ? 'border-amber-500/70 bg-amber-500/15 text-amber-200 ring-1 ring-amber-500/30'
                  : 'border-slate-600/80 bg-slate-900/50 text-slate-300 hover:border-slate-500 hover:bg-slate-800/80',
              )}
            >
              {label}
            </button>
          )
        })}
      </div>
    </div>
  )
}

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
  /** Keys (barcode/sku) of variants already shortlisted — shows a dot on size chips. */
  shortlistedKeys?: Set<string>
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
  shortlistedKeys,
  className,
}: Props) {
  const sorted = useMemo(() => sortSizeVariants(variants), [variants])
  const selectedKey = getProductSelectionKey(selected)
  const isDetail = density === 'detail'

  if (sorted.length <= 1) return null

  return (
    <div className={cn('min-w-0', className)}>
      <p
        className={cn(
          'font-medium uppercase tracking-wider',
          isDetail ? 'mb-2 text-xs text-slate-600' : 'mb-1 text-[9px] text-slate-600 sm:text-[10px]',
        )}
      >
        Size
      </p>
      <div
        role="listbox"
        aria-label="Choose size"
        className={cn(
          'flex min-w-0 flex-row gap-1.5 overflow-x-auto scroll-smooth [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
          isDetail ? 'gap-2 pb-0.5' : 'pb-0.5',
        )}
      >
        {sorted.map((v) => {
          const key = getProductSelectionKey(v)
          const active = key === selectedKey
          const shortlisted = !!(key && shortlistedKeys?.has(key))
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
                'kc-size-chip relative shrink-0 touch-manipulation whitespace-nowrap rounded-lg border font-semibold tabular-nums transition',
                isDetail
                  ? 'min-h-[44px] px-4 py-2.5 text-sm'
                  : 'min-h-[32px] px-2.5 py-1 text-[11px] sm:min-h-[36px] sm:px-3 sm:text-xs',
                active ? 'kc-size-chip-active' : 'kc-size-chip-idle',
                shortlisted && !active ? 'kc-size-chip-shortlisted' : '',
              )}
            >
              {label}
              {shortlisted ? (
                <span
                  className="absolute -right-0.5 -top-0.5 size-2 rounded-full bg-[var(--kc-accent,var(--color-emerald-600))] ring-2 ring-white"
                  aria-hidden
                />
              ) : null}
            </button>
          )
        })}
      </div>
    </div>
  )
}

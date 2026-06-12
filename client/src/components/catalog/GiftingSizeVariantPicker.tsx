'use client'

import { useEffect, useMemo, useRef } from 'react'
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
  const scrollRef = useRef<HTMLDivElement>(null)
  const chipRefs = useRef<(HTMLButtonElement | null)[]>([])
  const selectedKey = getProductSelectionKey(selected)
  const selectedIdx = sorted.findIndex((v) => getProductSelectionKey(v) === selectedKey)
  const isDetail = density === 'detail'

  /** Keep selected size centered so the next (or previous) inch chip scrolls into view on tap. */
  useEffect(() => {
    if (sorted.length <= 1 || selectedIdx < 0) return
    const active = chipRefs.current[selectedIdx]
    const next = chipRefs.current[selectedIdx + 1]
    const prev = chipRefs.current[selectedIdx - 1]
    const container = scrollRef.current
    if (!container) return

    const scrollToChip = (chip: HTMLButtonElement, inline: ScrollLogicalPosition) => {
      chip.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline })
    }

    if (next) {
      scrollToChip(next, 'end')
    } else if (prev) {
      scrollToChip(prev, 'start')
    } else if (active) {
      scrollToChip(active, 'center')
    }
  }, [selectedIdx, selectedKey, sorted.length])

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
        ref={scrollRef}
        role="listbox"
        aria-label="Choose size"
        className={cn(
          'flex gap-1.5 overflow-x-auto pb-0.5 scrollbar-hide',
          isDetail ? 'flex-wrap gap-2' : 'snap-x snap-mandatory',
        )}
      >
        {sorted.map((v, i) => {
          const key = getProductSelectionKey(v)
          const active = key === selectedKey
          const label = sizeLabel(v)
          return (
            <button
              key={key || label}
              ref={(el) => {
                chipRefs.current[i] = el
              }}
              type="button"
              role="option"
              aria-selected={active}
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                onSelect(v)
              }}
              className={cn(
                'kc-size-chip shrink-0 snap-start touch-manipulation rounded-lg border font-semibold tabular-nums transition',
                isDetail
                  ? 'min-h-[44px] px-4 py-2.5 text-sm'
                  : 'min-h-[32px] px-2.5 py-1 text-[11px] sm:min-h-[36px] sm:px-3 sm:text-xs',
                active ? 'kc-size-chip-active' : 'kc-size-chip-idle',
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

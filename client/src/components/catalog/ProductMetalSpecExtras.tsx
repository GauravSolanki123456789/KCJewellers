'use client'

import {
  getProductCardMetalExtras,
  type ProductCardMetalExtras,
} from '@/lib/product-metal-specs'
import type { Item, PriceBreakdown } from '@/lib/pricing'
import { cn } from '@/lib/utils'

type Density = 'card' | 'detail' | 'shared'

export function useProductMetalExtras(
  item: Item | null | undefined,
  rates?: unknown,
  breakdown?: PriceBreakdown | null,
): ProductCardMetalExtras {
  if (!item) {
    return { wastage: null, hasComponentWeights: false, componentParts: [], componentSummary: null }
  }
  return getProductCardMetalExtras(item, rates, breakdown)
}

export function ProductMetalSpecExtras({
  item,
  rates,
  breakdown,
  density = 'card',
  className,
}: {
  item: Item
  rates?: unknown
  breakdown?: PriceBreakdown | null
  density?: Density
  className?: string
}) {
  const extras = getProductCardMetalExtras(item, rates, breakdown)
  if (!extras.wastage && !extras.hasComponentWeights) return null

  if (density === 'detail') {
    return (
      <>
        {extras.wastage ? (
          <div className={cn('rounded-lg border border-slate-800/80 bg-slate-900/60 px-4 py-3', className)}>
            <span className="block text-xs uppercase tracking-wider text-slate-500">
              {extras.wastage.label}
            </span>
            <span className="font-medium tabular-nums text-slate-100">{extras.wastage.value}</span>
          </div>
        ) : null}
        {extras.hasComponentWeights ? (
          <div className={cn('col-span-full rounded-lg border border-slate-800/80 bg-slate-900/60 px-4 py-3', className)}>
            <span className="mb-2 block text-xs uppercase tracking-wider text-slate-500">
              Set weights
            </span>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {extras.componentParts.map((part) => (
                <div
                  key={part.key}
                  className="rounded-md border border-slate-800/60 bg-slate-950/40 px-2.5 py-2"
                >
                  <span className="block text-[10px] uppercase tracking-wide text-slate-500">
                    {part.label}
                  </span>
                  <span className="text-sm font-medium tabular-nums text-slate-100">
                    {part.value}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </>
    )
  }

  const specCls = 'kc-product-card-spec'

  return (
    <div className={cn('space-y-0.5', className)}>
      {extras.wastage ? (
        <p className={cn(specCls, 'tabular-nums')}>
          {extras.wastage.label}: {extras.wastage.value}
        </p>
      ) : null}
      {extras.componentSummary ? (
        <p className={cn(specCls, 'leading-snug')}>{extras.componentSummary}</p>
      ) : null}
    </div>
  )
}

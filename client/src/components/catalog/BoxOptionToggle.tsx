'use client'

import { cn } from '@/lib/utils'
import {
  calculateBreakdown,
  type Item,
} from '@/lib/pricing'
import { useCatalogPricingSettings } from '@/context/CatalogPricingSettingsContext'
import { useCustomerTier } from '@/context/CustomerTierContext'
import { getProductBoxCharges, productHasBoxOption } from '@/lib/product-box-pricing'

type BoxOptionToggleProps = {
  item: Item
  includeBox: boolean
  onChange: (withBox: boolean) => void
  density?: 'card' | 'detail'
  className?: string
  rates?: unknown[]
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
}: BoxOptionToggleProps) {
  const { wholesalePricing } = useCustomerTier()
  const { pricingOptions } = useCatalogPricingSettings()

  if (!productHasBoxOption(item)) return null

  const boxAdd = getProductBoxCharges(item)
  const base = calculateBreakdown(
    item,
    rates,
    item.gst_rate,
    wholesalePricing,
    pricingOptions,
  ).total
  const withBoxTotal = Math.round(base + boxAdd)
  const isDark = density === 'detail'

  const activeCls = isDark
    ? 'kc-size-chip-active-dark'
    : 'kc-size-chip-active'
  const idleCls = isDark
    ? 'kc-size-chip-idle-dark'
    : 'kc-size-chip-idle'

  return (
    <div
      className={cn('flex flex-wrap gap-1.5', className)}
      role="group"
      aria-label="Gift box packaging"
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        aria-pressed={!includeBox}
        onClick={() => onChange(false)}
        className={cn(
          'min-h-[28px] rounded-lg border px-2 py-0.5 text-[10px] font-semibold transition sm:min-h-[30px] sm:px-2.5 sm:text-[11px]',
          !includeBox ? activeCls : idleCls,
        )}
      >
        Without box · {formatInr(base)}
      </button>
      <button
        type="button"
        aria-pressed={includeBox}
        onClick={() => onChange(true)}
        className={cn(
          'min-h-[28px] rounded-lg border px-2 py-0.5 text-[10px] font-semibold transition sm:min-h-[30px] sm:px-2.5 sm:text-[11px]',
          includeBox ? activeCls : idleCls,
        )}
      >
        With box · {formatInr(withBoxTotal)}
      </button>
    </div>
  )
}

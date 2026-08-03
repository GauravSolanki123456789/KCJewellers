'use client'

import { getProductMrpBehindBox } from '@/lib/product-box-pricing'
import type { Item } from '@/lib/pricing'
import { cn } from '@/lib/utils'

type Props = {
  item: Item
  className?: string
  density?: 'card' | 'detail'
}

/** Informational MRP printed on box — shown when reseller staff enables the storefront toggle. */
export default function MrpBehindBoxNote({ item, className, density = 'card' }: Props) {
  const mrp = getProductMrpBehindBox(item)
  if (mrp <= 0) return null
  return (
    <p
      className={cn(
        'font-medium tabular-nums text-slate-500',
        density === 'detail' ? 'text-xs' : 'text-[10px] sm:text-[11px]',
        className,
      )}
    >
      MRP (behind box): ₹{Math.round(mrp).toLocaleString('en-IN')}
    </p>
  )
}

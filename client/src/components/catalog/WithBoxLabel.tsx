'use client'

import { cn } from '@/lib/utils'

type Props = {
  className?: string
  density?: 'card' | 'detail' | 'shared'
}

/** Weight-only catalog — simple with-box label (no price chips). */
export default function WithBoxLabel({ className, density = 'card' }: Props) {
  return (
    <p
      className={cn(
        'font-medium text-[var(--color-jewelry-black,#1a1814)]/75',
        density === 'detail' ? 'text-sm' : 'text-[11px] sm:text-xs',
        className,
      )}
    >
      With box
    </p>
  )
}

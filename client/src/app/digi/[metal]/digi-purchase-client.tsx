'use client'

import { Suspense } from 'react'
import { Loader2 } from 'lucide-react'
import { DigiStoreApp } from '@/components/digi/DigiStoreApp'

export function DigiPurchaseClient({ metal }: { metal: 'gold' | 'silver' | 'all' }) {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[50vh] items-center justify-center">
          <Loader2 className="size-8 animate-spin text-[var(--color-jewelry-black,#1a1814)]/40" />
        </div>
      }
    >
      <DigiStoreApp metal={metal} />
    </Suspense>
  )
}

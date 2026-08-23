'use client'

import { Suspense } from 'react'
import { ResellerErpAccessGate } from '@/components/reseller/erp/ResellerErpShell'
import { ErpOperatorGate } from '@/components/reseller/erp/ErpOperatorLogin'
import { ErpShadowWorkspace } from '@/components/reseller/erp/ErpShadowWorkspace'

export default function ErpShadowPageClient() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[50vh] items-center justify-center text-[var(--color-jewelry-black,#1a1814)]/60">
          Loading…
        </div>
      }
    >
      <ResellerErpAccessGate>
        <ErpOperatorGate>
          <ErpShadowWorkspace />
        </ErpOperatorGate>
      </ResellerErpAccessGate>
    </Suspense>
  )
}

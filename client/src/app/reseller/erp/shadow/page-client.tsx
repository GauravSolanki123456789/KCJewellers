'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

/** Legacy URL — redirects to Jainav module inside ERP. */
export default function ErpShadowRedirectPageClient() {
  const router = useRouter()
  useEffect(() => {
    router.replace('/reseller/erp/jainav')
  }, [router])
  return (
    <div className="flex min-h-[50vh] items-center justify-center text-[var(--color-jewelry-black,#1a1814)]/60">
      Opening Jainav mode…
    </div>
  )
}

'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

/**
 * Redirect: Gold Lot Movements -> Metal Liabilities Ledger
 * Keeps backwards compatibility for existing links.
 */
export default function AdminMovementsPage() {
  const router = useRouter()
  useEffect(() => {
    router.replace('/admin/liabilities')
  }, [router])
  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center">
      <div className="text-slate-400">Redirecting to Metal Liabilities Ledger…</div>
    </div>
  )
}

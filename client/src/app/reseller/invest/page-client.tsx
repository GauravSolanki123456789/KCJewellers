'use client'

import { ResellerInvestPanel } from '@/components/reseller/ResellerInvestPanel'

export default function ResellerInvestPageClient() {
  return (
    <div className="min-h-screen bg-[var(--color-slate-900,#faf8f4)] px-3 py-6 sm:px-4 sm:py-10">
      <div className="mx-auto max-w-2xl">
        <h1 className="mb-6 text-xl font-bold text-[var(--color-jewelry-black,#1a1814)] sm:text-2xl">
          Invest — staff
        </h1>
        <ResellerInvestPanel />
      </div>
    </div>
  )
}

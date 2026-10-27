'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { AlertTriangle } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { CUSTOMER_TIER, type WholesaleUserFields } from '@/lib/customer-tier'
import { PROFILE_PATH } from '@/lib/routes'
import { isResellerModuleBlocked, type ResellerModuleAccess } from '@/lib/reseller-subscription'

function readAccess(user: unknown, key: 'reseller_website_subscription' | 'reseller_erp_subscription') {
  if (!user || typeof user !== 'object') return null
  const v = (user as Record<string, unknown>)[key]
  return v && typeof v === 'object' ? (v as ResellerModuleAccess) : null
}

export function ResellerSubscriptionBanner() {
  const auth = useAuth()
  const pathname = usePathname() || ''
  if (!auth.hasChecked || !auth.isAuthenticated || !auth.user) return null
  const user = auth.user as WholesaleUserFields
  if (String(user.customer_tier || '').toUpperCase() !== CUSTOMER_TIER.RESELLER) return null
  if (pathname.startsWith('/admin') || pathname.startsWith('/shared/')) return null

  const website = readAccess(auth.user, 'reseller_website_subscription')
  const erp = readAccess(auth.user, 'reseller_erp_subscription')
  const websiteBlocked = isResellerModuleBlocked(website)
  const erpBlocked = isResellerModuleBlocked(erp)
  if (!websiteBlocked && !erpBlocked) return null

  const bits: string[] = []
  if (websiteBlocked) bits.push(website?.headline || 'Website & catalogue expired')
  if (erpBlocked) bits.push(erp?.headline || 'ERP expired')

  return (
    <div className="sticky top-0 z-[45] border-b border-rose-700/20 bg-rose-50 px-3 py-2.5 text-[var(--color-jewelry-black,#1a1814)] sm:px-4">
      <div className="mx-auto flex max-w-6xl items-start gap-2.5 sm:items-center">
        <AlertTriangle className="mt-0.5 size-4 shrink-0 text-rose-700 sm:mt-0" aria-hidden />
        <p className="min-w-0 flex-1 text-[13px] font-medium leading-snug text-rose-950">
          {bits.join(' · ')}
          <span className="font-normal text-rose-900/80">
            {' '}
            — contact KC Jewellers to extend your dates.
          </span>
        </p>
        <Link
          href={PROFILE_PATH}
          className="shrink-0 text-[12px] font-semibold text-rose-800 underline-offset-2 hover:underline"
        >
          Profile
        </Link>
      </div>
    </div>
  )
}

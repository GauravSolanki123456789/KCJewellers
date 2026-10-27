'use client'

import { useAuth } from '@/hooks/useAuth'
import { useResellerBranding } from '@/context/ResellerBrandingContext'
import { CUSTOMER_TIER, type WholesaleUserFields } from '@/lib/customer-tier'
import { isCatalogAdminUser } from '@/lib/is-catalog-admin'
import {
  isResellerModuleBlocked,
  type ResellerModuleAccess,
} from '@/lib/reseller-subscription'

function asAccess(v: unknown): ResellerModuleAccess | null {
  if (!v || typeof v !== 'object') return null
  return v as ResellerModuleAccess
}

/** Catalogue / website block for this host or logged-in reseller. */
export function useResellerWebsiteAccessBlock(): Pick<
  ResellerModuleAccess,
  'hasAccess' | 'status' | 'headline' | 'detail'
> | null {
  const auth = useAuth()
  const branding = useResellerBranding()
  const hostSub = branding.websiteSubscription
  if (branding.customDomainHost && isResellerModuleBlocked(hostSub)) {
    return hostSub
  }

  if (!auth.hasChecked || !auth.isAuthenticated || !auth.user) return null
  if (isCatalogAdminUser(auth.user) && !branding.customDomainHost) return null

  const user = auth.user as WholesaleUserFields
  if (String(user.customer_tier || '').toUpperCase() !== CUSTOMER_TIER.RESELLER) return null
  const sub = asAccess(user.reseller_website_subscription)
  return isResellerModuleBlocked(sub) ? sub : null
}

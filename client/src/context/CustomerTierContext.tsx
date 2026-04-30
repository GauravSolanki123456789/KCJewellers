'use client'

import { createContext, useContext, useMemo, type ReactNode } from 'react'
import { useAuth } from '@/hooks/useAuth'
import {
  buildWholesalePricingInput,
  hasB2bWholesalePortalAccess,
  hasWholesaleCatalogAccess,
  normalizeCustomerTier,
  type CustomerTier,
  type WholesaleUserFields,
} from '@/lib/customer-tier'
import type { WholesalePricingInput } from '@/lib/pricing'

type CustomerTierContextValue = {
  customerTier: CustomerTier
  /** True when `/api/auth/current_user` has completed at least once */
  tierReady: boolean
  /** Wholesale catalogue pricing (includes `RESELLER`). */
  hasWholesaleAccess: boolean
  /** B2B portal: quick order, ledger, NEFT checkout — excludes `RESELLER`. */
  hasB2bPortalAccess: boolean
  wholesalePricing: WholesalePricingInput | null
}

const CustomerTierCtx = createContext<CustomerTierContextValue>({
  customerTier: 'B2C_CUSTOMER',
  tierReady: false,
  hasWholesaleAccess: false,
  hasB2bPortalAccess: false,
  wholesalePricing: null,
})

export function CustomerTierProvider({ children }: { children: ReactNode }) {
  const auth = useAuth()
  const user = auth.user as WholesaleUserFields | undefined

  const value = useMemo((): CustomerTierContextValue => {
    const tierReady = auth.hasChecked === true
    const customerTier = normalizeCustomerTier(user?.customer_tier)
    const u = user as (WholesaleUserFields & { email?: string | null }) | undefined
    const hasWholesale = hasWholesaleCatalogAccess(u)
    const hasB2bPortal = hasB2bWholesalePortalAccess(u)
    const wholesalePricing = buildWholesalePricingInput(u)
    return {
      customerTier,
      tierReady,
      hasWholesaleAccess: hasWholesale,
      hasB2bPortalAccess: hasB2bPortal,
      wholesalePricing,
    }
  }, [auth.hasChecked, user])

  return <CustomerTierCtx.Provider value={value}>{children}</CustomerTierCtx.Provider>
}

export function useCustomerTier() {
  return useContext(CustomerTierCtx)
}

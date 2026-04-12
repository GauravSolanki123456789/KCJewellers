'use client'

import { createContext, useContext, useMemo, type ReactNode } from 'react'
import { useAuth } from '@/hooks/useAuth'
import {
  buildWholesalePricingInput,
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
  hasWholesaleAccess: boolean
  wholesalePricing: WholesalePricingInput | null
}

const CustomerTierCtx = createContext<CustomerTierContextValue>({
  customerTier: 'B2C_CUSTOMER',
  tierReady: false,
  hasWholesaleAccess: false,
  wholesalePricing: null,
})

export function CustomerTierProvider({ children }: { children: ReactNode }) {
  const auth = useAuth()
  const user = auth.user as WholesaleUserFields | undefined

  const value = useMemo((): CustomerTierContextValue => {
    const tierReady = auth.hasChecked === true
    const customerTier = normalizeCustomerTier(user?.customer_tier)
    const hasWholesale = hasWholesaleCatalogAccess(user)
    const wholesalePricing = buildWholesalePricingInput(user)
    return {
      customerTier,
      tierReady,
      hasWholesaleAccess: hasWholesale,
      wholesalePricing,
    }
  }, [auth.hasChecked, user])

  return <CustomerTierCtx.Provider value={value}>{children}</CustomerTierCtx.Provider>
}

export function useCustomerTier() {
  return useContext(CustomerTierCtx)
}

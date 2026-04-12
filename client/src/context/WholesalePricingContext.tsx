'use client'

import { createContext, useContext, useMemo, type ReactNode } from 'react'
import { useAuth } from '@/hooks/useAuth'
import type { DiscountTier } from '@/lib/pricing'

export type WholesalePricingState = {
  /** True when logged-in user is B2B wholesale (storefront). */
  isWholesaleBuyer: boolean
  /** Tier applied to live rate + making charge math; null for retail. */
  discountTier: DiscountTier | null
  hasCheckedAuth: boolean
}

const Ctx = createContext<WholesalePricingState>({
  isWholesaleBuyer: false,
  discountTier: null,
  hasCheckedAuth: false,
})

export function WholesalePricingProvider({ children }: { children: ReactNode }) {
  const auth = useAuth()

  const value = useMemo((): WholesalePricingState => {
    const u = auth.user as
      | {
          role?: string
          is_b2b_wholesale?: boolean
          discount_tier?: { mc_discount_percent?: number; metal_markup_percent?: number }
        }
      | undefined

    const hasCheckedAuth = auth.hasChecked === true
    const role = String(u?.role || '')
    const isB2B =
      u?.is_b2b_wholesale === true ||
      role === 'B2B_WHOLESALE'

    if (!auth.isAuthenticated || !u || !isB2B) {
      return { isWholesaleBuyer: false, discountTier: null, hasCheckedAuth }
    }

    const dt = u.discount_tier
    const tier: DiscountTier = {
      mc_discount_percent: Number(dt?.mc_discount_percent ?? 0) || 0,
      metal_markup_percent: Number(dt?.metal_markup_percent ?? 0) || 0,
    }

    return {
      isWholesaleBuyer: true,
      discountTier: tier,
      hasCheckedAuth,
    }
  }, [auth.isAuthenticated, auth.user, auth.hasChecked])

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useWholesalePricing(): WholesalePricingState {
  return useContext(Ctx)
}

'use client'

import { createContext, useContext, useMemo, type ReactNode } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { useCustomerTier } from '@/context/CustomerTierContext'
import { CUSTOMER_TIER } from '@/lib/customer-tier'
import type { PublicResellerBranding } from '@/lib/reseller-branding-server'

type UserBranding = {
  business_name?: string | null
  logo_url?: string | null
}

export type EffectiveResellerBranding = {
  businessName: string
  logoUrl: string | null
  active: boolean
}

const Ctx = createContext<EffectiveResellerBranding>({
  businessName: 'KC Jewellers',
  logoUrl: null,
  active: false,
})

export function ResellerBrandingProvider({
  children,
  initialFromHost,
}: {
  children: ReactNode
  initialFromHost: PublicResellerBranding | null
}) {
  const auth = useAuth()
  const { customerTier } = useCustomerTier()
  const user = auth.user as UserBranding | undefined

  const value = useMemo((): EffectiveResellerBranding => {
    if (initialFromHost?.businessName || initialFromHost?.logoUrl) {
      return {
        businessName: initialFromHost.businessName || 'Partner',
        logoUrl: initialFromHost.logoUrl || null,
        active: true,
      }
    }
    if (customerTier === CUSTOMER_TIER.RESELLER && auth.isAuthenticated && user) {
      const bn = user.business_name?.trim()
      const logo = user.logo_url?.trim()
      if (bn || logo) {
        return {
          businessName: bn || 'Partner store',
          logoUrl: logo || null,
          active: true,
        }
      }
    }
    return {
      businessName: 'KC Jewellers',
      logoUrl: null,
      active: false,
    }
  }, [initialFromHost, customerTier, auth.isAuthenticated, user])

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useResellerBranding() {
  return useContext(Ctx)
}

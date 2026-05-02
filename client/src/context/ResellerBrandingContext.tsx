'use client'

import { createContext, useContext, useMemo, type ReactNode } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { useCustomerTier } from '@/context/CustomerTierContext'
import { CUSTOMER_TIER } from '@/lib/customer-tier'
import type { PublicResellerBranding } from '@/lib/reseller-branding-server'

type UserBranding = {
  business_name?: string | null
  logo_url?: string | null
  mobile_number?: string | null
}

export type EffectiveResellerBranding = {
  businessName: string
  logoUrl: string | null
  active: boolean
  /** True when Host is a reseller vanity domain (middleware `x-custom-domain`). */
  customDomainHost: boolean
  /** 10-digit local mobile for storefront WhatsApp orders (custom domain). */
  contactPhoneDigits: string | null
}

const defaultBranding: EffectiveResellerBranding = {
  businessName: 'KC Jewellers',
  logoUrl: null,
  active: false,
  customDomainHost: false,
  contactPhoneDigits: null,
}

const Ctx = createContext<EffectiveResellerBranding>(defaultBranding)

export function ResellerBrandingProvider({
  children,
  initialFromHost,
  customDomainHost,
}: {
  children: ReactNode
  initialFromHost: PublicResellerBranding | null
  /** From root layout: middleware signalled a non-default storefront host. */
  customDomainHost: boolean
}) {
  const auth = useAuth()
  const { customerTier } = useCustomerTier()
  const user = auth.user as UserBranding | undefined

  const value = useMemo((): EffectiveResellerBranding => {
    if (initialFromHost?.businessName || initialFromHost?.logoUrl || initialFromHost?.contactPhoneDigits) {
      return {
        businessName: initialFromHost.businessName || 'Partner',
        logoUrl: initialFromHost.logoUrl || null,
        active: true,
        customDomainHost,
        contactPhoneDigits: initialFromHost.contactPhoneDigits || null,
      }
    }
    if (customerTier === CUSTOMER_TIER.RESELLER && auth.isAuthenticated && user) {
      const bn = user.business_name?.trim()
      const logo = user.logo_url?.trim()
      const mob = String(user.mobile_number || '').replace(/\D/g, '')
      const contactPhoneDigits = mob.length >= 10 ? mob.slice(-10) : mob.length > 0 ? mob : null
      if (bn || logo) {
        return {
          businessName: bn || 'Partner store',
          logoUrl: logo || null,
          active: true,
          customDomainHost: false,
          contactPhoneDigits,
        }
      }
    }
    return {
      businessName: 'KC Jewellers',
      logoUrl: null,
      active: false,
      customDomainHost: false,
      contactPhoneDigits: null,
    }
  }, [initialFromHost, customDomainHost, customerTier, auth.isAuthenticated, user])

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useResellerBranding() {
  return useContext(Ctx)
}

import { applySlabMarginToBreakdown } from '@/lib/catalog-slab-pricing'
import {
  calculateBreakdown,
  type CatalogPricingOptions,
  type Item,
  type PriceBreakdown,
  type WholesalePricingInput,
} from '@/lib/pricing'

/** Apply Slab R storefront margin on reseller custom-domain catalog prices. */
export function withStorefrontCatalogMargin(
  breakdown: PriceBreakdown,
  customDomainHost: boolean,
  storefrontMarginPct: number,
): PriceBreakdown {
  if (!customDomainHost || storefrontMarginPct <= 0) return breakdown
  return applySlabMarginToBreakdown(breakdown, storefrontMarginPct)
}

export function withStorefrontCatalogTotal(
  total: number,
  customDomainHost: boolean,
  storefrontMarginPct: number,
): number {
  if (!customDomainHost || storefrontMarginPct <= 0) return total
  return applySlabMarginToBreakdown({ total, taxable: total }, storefrontMarginPct).total
}

export function calculateStorefrontBreakdown(
  item: Item,
  rates: unknown,
  gstRate: number | undefined,
  wholesale: WholesalePricingInput | null | undefined,
  pricingOptions: CatalogPricingOptions | undefined,
  customDomainHost: boolean,
  storefrontMarginPct: number,
): PriceBreakdown {
  return withStorefrontCatalogMargin(
    calculateBreakdown(item, rates, gstRate, wholesale ?? undefined, pricingOptions),
    customDomainHost,
    storefrontMarginPct,
  )
}

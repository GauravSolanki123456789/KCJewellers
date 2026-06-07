import { RATES_PATH, CATALOG_PATH } from '@/lib/routes'
import {
  resolveCatalogShareBrand,
  resolveCatalogShareOrigin,
  type CatalogShareAudienceContext,
} from '@/lib/catalog-share'

export type RatesShareContext = CatalogShareAudienceContext

/** Public rates page URL on the reseller vanity domain (or main site). */
export function buildRatesShareUrl(ctx: RatesShareContext): string {
  const origin = resolveCatalogShareOrigin(ctx).replace(/\/$/, '')
  return `${origin}${RATES_PATH}`
}

/** Catalogue home on the same origin as the rates link. */
export function buildStorefrontCatalogUrl(ctx: RatesShareContext): string {
  const origin = resolveCatalogShareOrigin(ctx).replace(/\/$/, '')
  return `${origin}${CATALOG_PATH}`
}

export function ratesShareWhatsAppMessage(ctx: RatesShareContext): string {
  const brand = resolveCatalogShareBrand(ctx)
  const ratesUrl = buildRatesShareUrl(ctx)
  const catalogUrl = buildStorefrontCatalogUrl(ctx)
  return (
    `*${brand} — Today Rates*\n\n` +
    `Gold & silver prices updated for today.\n\n` +
    `View rates: ${ratesUrl}\n` +
    `Browse jewellery: ${catalogUrl}`
  )
}

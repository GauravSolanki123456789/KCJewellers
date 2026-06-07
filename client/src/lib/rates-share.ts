import { CATALOG_PATH, RATES_PATH } from '@/lib/routes'
import {
  resolveCatalogShareBrand,
  resolveCatalogShareOrigin,
  type CatalogShareAudienceContext,
} from '@/lib/catalog-share'

export type RatesShareNumbers = {
  gold24_1g: number
  gold22_1g: number
  gold18_1g: number
  silver1g: number
}

function formatInr(n: number) {
  return `₹${Math.round(n).toLocaleString('en-IN')}`
}

/** Public rates page on reseller vanity domain or KC site. */
export function buildRatesShareUrl(ctx: CatalogShareAudienceContext): string {
  const origin = resolveCatalogShareOrigin(ctx)
  return `${origin.replace(/\/$/, '')}${RATES_PATH}`
}

/** Catalogue home on the same storefront origin. */
export function buildCatalogHomeShareUrl(ctx: CatalogShareAudienceContext): string {
  const origin = resolveCatalogShareOrigin(ctx)
  return `${origin.replace(/\/$/, '')}${CATALOG_PATH}`
}

/** WhatsApp message for reseller staff sharing today's bullion rates with customers. */
export function buildRatesShareMessage(
  ctx: CatalogShareAudienceContext,
  rates: RatesShareNumbers,
): string {
  const brand = resolveCatalogShareBrand(ctx)
  const ratesUrl = buildRatesShareUrl(ctx)
  const catalogUrl = buildCatalogHomeShareUrl(ctx)
  const lines = [
    `${brand} — Today Rates`,
    '',
    `Gold 24K (999): ${formatInr(rates.gold24_1g)}/g`,
    `Gold 22K (916): ${formatInr(rates.gold22_1g)}/g`,
    `Gold 18K (750): ${formatInr(rates.gold18_1g)}/g`,
    `Silver (999): ${formatInr(rates.silver1g)}/g`,
    '',
    `View rates: ${ratesUrl}`,
    `Browse jewellery: ${catalogUrl}`,
  ]
  return lines.join('\n')
}

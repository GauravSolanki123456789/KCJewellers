/** Hosts that use KC global rates (not a reseller vanity domain). */
export function isCanonicalPlatformHost(host: string): boolean {
  const h = host.trim().toLowerCase().split(':')[0]
  if (!h) return true
  if (h === 'localhost' || h === '127.0.0.1') return true
  if (h === 'kcjewellers.co.in' || h === 'www.kcjewellers.co.in') return true
  return false
}

/** Vanity domain for reseller rate/catalog API (?domain= / X-Storefront-Domain). */
export function getClientStorefrontDomain(): string | null {
  if (typeof window === 'undefined') return null
  const host = window.location.hostname.trim().toLowerCase()
  if (!host || isCanonicalPlatformHost(host)) return null
  return host.replace(/^www\./, '')
}

export function ratesApiQueryForStorefront(): string {
  const d = getClientStorefrontDomain()
  return d ? `?domain=${encodeURIComponent(d)}` : ''
}

/**
 * Skip Yahoo/socket ticks when the API is serving reseller-managed rates (site-wide override).
 * Pass `source` from GET /api/rates/display or /api/rates/live response.
 */
export function shouldSubscribeGlobalLiveRates(ratesSource?: string | null): boolean {
  if (ratesSource === 'reseller') return false
  return true
}

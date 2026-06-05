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

/** Reseller vanity domains use fixed staff rates — do not overwrite via global socket ticks. */
export function shouldSubscribeGlobalLiveRates(): boolean {
  return !getClientStorefrontDomain()
}

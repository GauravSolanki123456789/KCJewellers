import { headers } from 'next/headers'
import { isCanonicalPlatformHost } from '@/lib/storefront-domain'

/** Server: vanity host from middleware `x-custom-domain`. */
export async function getStorefrontDomainFromHeaders(): Promise<string | null> {
  const h = await headers()
  const raw = h.get('x-custom-domain')?.trim().toLowerCase()
  if (!raw) return null
  const host = raw.split(':')[0].replace(/^www\./, '')
  if (!host || isCanonicalPlatformHost(host)) return null
  return host
}

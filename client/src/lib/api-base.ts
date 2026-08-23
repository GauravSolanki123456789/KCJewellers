/** Public KC API origin (no trailing slash) — same host Express uses for /api/* routes. */
export function getKcApiBaseUrl(): string {
  const fromEnv = process.env.NEXT_PUBLIC_API_URL?.trim()
  if (fromEnv) return fromEnv.replace(/\/$/, '')
  if (typeof window !== 'undefined') return window.location.origin.replace(/\/$/, '')
  return 'http://localhost:4000'
}

export function kcPoshRfidInventoryUrl(): string {
  return `${getKcApiBaseUrl()}/api/external/posh-rfid/v1/inventory`
}

export function kcPoshRfidHealthUrl(): string {
  return `${getKcApiBaseUrl()}/api/external/posh-rfid/v1/health`
}

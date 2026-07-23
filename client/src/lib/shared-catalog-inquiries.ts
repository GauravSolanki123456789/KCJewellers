import { getClientStorefrontDomain } from '@/lib/storefront-domain'
import { normalizeStoredMobile } from '@/lib/international-mobile'
import type { CatalogInquiryLine } from '@/lib/catalog-inquiry-shared'
import axios from '@/lib/axios'

export type SharedCatalogInquiryLine = CatalogInquiryLine

export type SharedCatalogInquiryCustomer = {
  userId: number
  mobile: string
  name?: string
}

export type SharedCatalogInquiryPayload = {
  source: 'whatsapp' | 'pdf'
  lineCount: number
  totalPieces: number
  totalInr: number | null
  lines: SharedCatalogInquiryLine[]
  catalogUrl?: string
  customer: SharedCatalogInquiryCustomer
  clickId?: string
}

function getApiUrl(): string {
  const fromEnv = process.env.NEXT_PUBLIC_API_URL?.trim()
  if (fromEnv) return fromEnv.replace(/\/$/, '')
  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin.replace(/\/$/, '')
  }
  return 'http://localhost:4000'
}

function buildInquiryBody(payload: SharedCatalogInquiryPayload) {
  const mobile = normalizeStoredMobile(payload.customer.mobile)
  return {
    source: payload.source,
    lineCount: payload.lineCount,
    totalPieces: payload.totalPieces,
    totalInr: payload.totalInr,
    lines: payload.lines,
    catalogUrl: payload.catalogUrl,
    customerUserId: payload.customer.userId,
    customerMobile: mobile,
    customerName: payload.customer.name,
    clickId: payload.clickId,
  }
}

function inquiryHeaders(): Record<string, string> {
  const domain = getClientStorefrontDomain()
  return {
    'Content-Type': 'application/json',
    ...(domain ? { 'X-Storefront-Domain': domain } : {}),
  }
}

/**
 * Fire inquiry POST synchronously (keepalive fetch + sendBeacon fallback).
 * Must run in the same user-gesture tick as WhatsApp navigation on iOS.
 */
export function fireSharedCatalogInquiryLog(
  catalogUuid: string,
  payload: SharedCatalogInquiryPayload,
): boolean {
  const mobile = normalizeStoredMobile(payload.customer.mobile)
  if (mobile.length < 8 || !Number.isFinite(payload.customer.userId)) {
    console.warn('shared catalog inquiry log skipped: invalid customer identity')
    return false
  }

  const path = `/api/shared-catalog/${encodeURIComponent(catalogUuid)}/inquiry`
  const url = `${getApiUrl()}${path}`
  const body = buildInquiryBody(payload)
  const bodyStr = JSON.stringify(body)
  const headers = inquiryHeaders()

  try {
    void fetch(url, {
      method: 'POST',
      credentials: 'include',
      keepalive: true,
      headers,
      body: bodyStr,
    })
  } catch {
    /* fall through to beacon */
  }

  if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
    try {
      navigator.sendBeacon(url, new Blob([bodyStr], { type: 'application/json' }))
    } catch {
      /* ignore */
    }
  }

  return true
}

export async function logSharedCatalogInquiry(
  catalogUuid: string,
  payload: SharedCatalogInquiryPayload,
): Promise<{ success: boolean; id?: number }> {
  const mobile = normalizeStoredMobile(payload.customer.mobile)
  if (mobile.length < 8 || !Number.isFinite(payload.customer.userId)) {
    console.warn('shared catalog inquiry log skipped: invalid customer identity')
    return { success: false }
  }

  fireSharedCatalogInquiryLog(catalogUuid, payload)

  const path = `/api/shared-catalog/${encodeURIComponent(catalogUuid)}/inquiry`
  const body = buildInquiryBody(payload)

  try {
    const { data } = await axios.post<{ success?: boolean; id?: number }>(path, body, {
      withCredentials: true,
    })
    return { success: !!data?.success, id: data?.id }
  } catch (e) {
    console.warn('shared catalog inquiry log failed', e)
    return { success: false }
  }
}

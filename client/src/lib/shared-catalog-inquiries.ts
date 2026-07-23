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

function getApiUrl(): string {
  const fromEnv = process.env.NEXT_PUBLIC_API_URL?.trim()
  if (fromEnv) return fromEnv.replace(/\/$/, '')
  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin.replace(/\/$/, '')
  }
  return 'http://localhost:4000'
}

export async function logSharedCatalogInquiry(
  catalogUuid: string,
  payload: {
    source: 'whatsapp' | 'pdf'
    lineCount: number
    totalPieces: number
    totalInr: number | null
    lines: SharedCatalogInquiryLine[]
    catalogUrl?: string
    customer: SharedCatalogInquiryCustomer
    clickId?: string
  },
): Promise<{ success: boolean; id?: number }> {
  const mobile = normalizeStoredMobile(payload.customer.mobile)
  if (mobile.length < 8 || !Number.isFinite(payload.customer.userId)) {
    console.warn('shared catalog inquiry log skipped: invalid customer identity')
    return { success: false }
  }

  const body = {
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

  const path = `/api/shared-catalog/${encodeURIComponent(catalogUuid)}/inquiry`
  const domain = getClientStorefrontDomain()

  /** keepalive survives iOS same-tab navigation to wa.me (page unload). */
  try {
    const res = await fetch(`${getApiUrl()}${path}`, {
      method: 'POST',
      credentials: 'include',
      keepalive: true,
      headers: {
        'Content-Type': 'application/json',
        ...(domain ? { 'X-Storefront-Domain': domain } : {}),
      },
      body: JSON.stringify(body),
    })
    if (res.ok) {
      const data = (await res.json()) as { success?: boolean; id?: number }
      return { success: !!data?.success, id: data?.id }
    }
  } catch {
    /* fall through to axios */
  }

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

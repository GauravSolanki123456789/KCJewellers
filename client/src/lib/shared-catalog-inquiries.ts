import axios from '@/lib/axios'
import type { CatalogInquiryLine } from '@/lib/catalog-inquiry-shared'

export type SharedCatalogInquiryLine = CatalogInquiryLine

export type SharedCatalogInquiryCustomer = {
  userId: number
  mobile: string
  name?: string
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
  },
): Promise<{ success: boolean; id?: number }> {
  const mobile = String(payload.customer.mobile ?? '').replace(/\D/g, '').slice(-10)
  if (mobile.length !== 10 || !Number.isFinite(payload.customer.userId)) {
    console.warn('shared catalog inquiry log skipped: invalid customer identity')
    return { success: false }
  }
  try {
    const { data } = await axios.post<{ success?: boolean; id?: number }>(
      `/api/shared-catalog/${encodeURIComponent(catalogUuid)}/inquiry`,
      {
        source: payload.source,
        lineCount: payload.lineCount,
        totalPieces: payload.totalPieces,
        totalInr: payload.totalInr,
        lines: payload.lines,
        catalogUrl: payload.catalogUrl,
        customerUserId: payload.customer.userId,
        customerMobile: mobile,
        customerName: payload.customer.name,
      },
      { withCredentials: true },
    )
    return { success: !!data?.success, id: data?.id }
  } catch (e) {
    console.warn('shared catalog inquiry log failed', e)
    return { success: false }
  }
}

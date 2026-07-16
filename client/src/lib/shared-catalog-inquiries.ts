import axios from '@/lib/axios'
import type { CatalogInquiryLine } from '@/lib/catalog-inquiry-shared'

export type SharedCatalogInquiryLine = CatalogInquiryLine

export async function logSharedCatalogInquiry(
  catalogUuid: string,
  payload: {
    source: 'whatsapp' | 'pdf'
    lineCount: number
    totalPieces: number
    totalInr: number | null
    lines: SharedCatalogInquiryLine[]
    catalogUrl?: string
  },
): Promise<void> {
  try {
    await axios.post(`/api/shared-catalog/${encodeURIComponent(catalogUuid)}/inquiry`, payload, {
      withCredentials: true,
    })
  } catch (e) {
    console.warn('shared catalog inquiry log failed', e)
  }
}

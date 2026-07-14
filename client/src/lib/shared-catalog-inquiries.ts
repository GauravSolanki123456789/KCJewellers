import axios from '@/lib/axios'

export type SharedCatalogInquiryLine = {
  name?: string
  code?: string
  qty?: number
  unitInr?: number | null
  lineTotalInr?: number | null
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

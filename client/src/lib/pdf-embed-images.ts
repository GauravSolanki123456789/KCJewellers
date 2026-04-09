import type { Item } from '@/lib/pricing'
import { normalizeCatalogImageSrc } from '@/lib/normalize-image-url'

/** Item with optional inlined image for @react-pdf/renderer (data URL). */
export type ItemWithPdfImage = Item & { pdfImageSrc?: string }

async function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => resolve(reader.result as string)
    reader.onerror = () => reject(new Error('read failed'))
    reader.readAsDataURL(blob)
  })
}

/**
 * Fetch image via same-origin proxy → data URL so react-pdf can embed reliably.
 */
export async function fetchCatalogImageAsDataUrl(absoluteUrl: string): Promise<string | null> {
  const tryBlob = async (blob: Blob | null) => {
    if (!blob || !blob.size) return null
    return blobToDataUrl(blob)
  }

  const proxy = `/api/catalog-pdf-image?url=${encodeURIComponent(absoluteUrl)}`
  try {
    const res = await fetch(proxy, { method: 'GET', credentials: 'same-origin' })
    if (res.ok) {
      const dataUrl = await tryBlob(await res.blob())
      if (dataUrl) return dataUrl
    }
  } catch {
    /* fall through */
  }

  try {
    const res = await fetch(absoluteUrl, { mode: 'cors', credentials: 'omit' })
    if (!res.ok) return null
    return await tryBlob(await res.blob())
  } catch {
    return null
  }
}

/**
 * Resolve every product image to a data URL for PDF embedding (parallel, capped concurrency).
 */
export async function resolveItemsForPdf(items: Item[]): Promise<ItemWithPdfImage[]> {
  const concurrency = 5
  const out: ItemWithPdfImage[] = new Array(items.length)
  let i = 0

  async function worker() {
    for (;;) {
      const idx = i++
      if (idx >= items.length) return
      const item = items[idx]
      const normalized = normalizeCatalogImageSrc(item.image_url as string | undefined)
      if (!normalized) {
        out[idx] = { ...item }
        continue
      }
      const dataUrl = await fetchCatalogImageAsDataUrl(normalized)
      out[idx] = dataUrl ? { ...item, pdfImageSrc: dataUrl } : { ...item }
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => worker()))
  return out
}

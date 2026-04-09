import type { Item } from '@/lib/pricing'
import { normalizeCatalogImageSrc } from '@/lib/normalize-image-url'

/** Item with optional inlined image for @react-pdf/renderer (PNG data URL). */
export type ItemWithPdfImage = Item & { pdfImageSrc?: string }

/**
 * Decode image blob in the browser and re-encode as PNG. pdfkit/react-pdf often fails on WebP
 * and some JPEG variants; PNG is reliably embedded.
 */
async function imageBlobToPngDataUrl(blob: Blob): Promise<string | null> {
  if (typeof window === 'undefined' || typeof document === 'undefined') return null

  const objectUrl = URL.createObjectURL(blob)
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image()
      el.onload = () => resolve(el)
      el.onerror = () => reject(new Error('image decode'))
      el.src = objectUrl
    })

    const maxW = 900
    const maxH = 1120
    let w = img.naturalWidth || img.width
    let h = img.naturalHeight || img.height
    if (!w || !h) return null

    const scale = Math.min(1, maxW / w, maxH / h)
    w = Math.max(1, Math.round(w * scale))
    h = Math.max(1, Math.round(h * scale))

    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    ctx.drawImage(img, 0, 0, w, h)
    return canvas.toDataURL('image/png')
  } catch {
    return null
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}

/**
 * Fetch image via same-origin proxy → data URL so react-pdf can embed reliably.
 */
export async function fetchCatalogImageAsDataUrl(absoluteUrl: string): Promise<string | null> {
  const toPng = async (blob: Blob | null) => {
    if (!blob || !blob.size) return null
    const png = await imageBlobToPngDataUrl(blob)
    return png
  }

  const proxy = `/api/catalog-pdf-image?url=${encodeURIComponent(absoluteUrl)}`
  try {
    const res = await fetch(proxy, { method: 'GET', credentials: 'same-origin' })
    if (res.ok) {
      const png = await toPng(await res.blob())
      if (png) return png
    }
  } catch {
    /* fall through */
  }

  try {
    const res = await fetch(absoluteUrl, { mode: 'cors', credentials: 'omit' })
    if (!res.ok) return null
    return await toPng(await res.blob())
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

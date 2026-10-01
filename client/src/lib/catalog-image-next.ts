import { normalizeCatalogImageSrc } from '@/lib/normalize-image-url'

/**
 * Whether `next/image` should resize/cache this catalogue photo (API `/uploads/**` only).
 * External absolute URLs without our uploads path stay unoptimized.
 */
export function shouldOptimizeCatalogImage(src: string | null | undefined): boolean {
  const n = normalizeCatalogImageSrc(src ?? '')
  if (!n) return false
  try {
    const u = new URL(n)
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return false
    return /\/uploads\//i.test(u.pathname)
  } catch {
    return false
  }
}

/** Product grid / cards — retina-sharp at ~400px display without downloading 3K originals. */
export const CATALOG_CARD_IMAGE_QUALITY = 84

/** PDP hero — slightly higher for zoom; still served at `sizes`-appropriate width. */
export const CATALOG_PDP_IMAGE_QUALITY = 88

/**
 * Small thumbs (cart, admin lists) via the Next image optimizer.
 * Use with a plain `<img>` when `fill` layout is not needed.
 */
export function optimizedCatalogThumbSrc(
  src: string | null | undefined,
  width: number,
  quality: number = CATALOG_CARD_IMAGE_QUALITY,
): string {
  const n = normalizeCatalogImageSrc(src ?? '')
  if (!n) return ''
  if (!shouldOptimizeCatalogImage(n)) return n
  const w = Math.max(48, Math.min(640, Math.round(width)))
  const q = Math.max(60, Math.min(95, Math.round(quality)))
  return `/_next/image?url=${encodeURIComponent(n)}&w=${w}&q=${q}`
}

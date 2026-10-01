/**
 * When true, `next/image` should resize/compress remote catalogue uploads via `/_next/image`.
 * Falls back to full URL on error (see DualJewelleryProductImage).
 */
export function shouldOptimizeCatalogImage(src: string | null | undefined): boolean {
  const s = String(src ?? '').trim()
  if (!s || s.startsWith('data:') || s.startsWith('blob:')) return false
  if (s.includes('/uploads/')) return true
  return /^https?:\/\//i.test(s)
}

/** Quality tuned for jewellery detail on cards (optimizer serves WebP/AVIF at display size). */
export const CATALOG_CARD_IMAGE_QUALITY = 78

/** Slightly higher for PDP / lightbox zoom. */
export const CATALOG_PDP_IMAGE_QUALITY = 84

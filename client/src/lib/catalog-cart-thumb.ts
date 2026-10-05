import type { Item } from '@/lib/pricing'
import { catalogImageUrlAlternates, normalizeCatalogImageSrc } from '@/lib/normalize-image-url'
import {
  CATALOG_PDP_IMAGE_QUALITY,
  optimizedCatalogThumbSrc,
  shouldOptimizeCatalogImage,
} from '@/lib/catalog-image-next'

/** Primary photo for cart / toast (same rules as product cards). */
export function resolveCartItemImageRaw(item: Item | null | undefined): string {
  if (!item) return ''
  const primary = item.image_url || (item as { imageUrl?: string }).imageUrl
  const secondary = item.secondary_image_url
  const normalized =
    normalizeCatalogImageSrc(primary) ||
    normalizeCatalogImageSrc(secondary) ||
    ''
  return normalized
}

export function buildCartThumbSrcCandidates(rawNormalized: string, displayWidth = 192): string[] {
  const n = rawNormalized.trim()
  if (!n) return []
  const w = Math.max(96, Math.min(384, Math.round(displayWidth)))
  const optimized = optimizedCatalogThumbSrc(n, w, CATALOG_PDP_IMAGE_QUALITY)
  const out: string[] = []
  if (optimized && optimized !== n) out.push(optimized)
  out.push(n)
  for (const alt of catalogImageUrlAlternates(n)) {
    if (shouldOptimizeCatalogImage(alt)) {
      out.push(optimizedCatalogThumbSrc(alt, w, CATALOG_PDP_IMAGE_QUALITY))
    }
    out.push(alt)
  }
  return [...new Set(out.filter(Boolean))]
}

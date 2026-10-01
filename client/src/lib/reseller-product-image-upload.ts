import {
  RESELLER_PRODUCT_IMAGE_MAX_BYTES,
  RESELLER_PRODUCT_IMAGE_MAX_LABEL,
  RESELLER_PRODUCT_IMAGE_OPTIMIZE_ABOVE_BYTES,
  RESELLER_PRODUCT_IMAGE_STORE_TARGET_BYTES,
} from '@/lib/reseller-products'

const IMAGE_EXT = /\.(png|jpe?g|webp|gif)$/i

function isImageFile(file: File): boolean {
  if (file.type.startsWith('image/')) return true
  return IMAGE_EXT.test(file.name)
}

function isLosslessOrHeavySource(file: File): boolean {
  const t = (file.type || '').toLowerCase()
  const name = file.name.toLowerCase()
  return t === 'image/png' || name.endsWith('.png') || t === 'image/jpeg' || name.endsWith('.jpg') || name.endsWith('.jpeg')
}

function webpNameFrom(file: File): string {
  const base = file.name.replace(/\.[^.]+$/, '') || 'photo'
  return `${base}.webp`
}

async function canvasToWebpBlob(
  canvas: HTMLCanvasElement,
  quality: number,
): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob((b) => resolve(b), 'image/webp', quality)
  })
}

function shouldOptimizeForUpload(file: File): boolean {
  if (!isImageFile(file)) return false
  if (isLosslessOrHeavySource(file)) return true
  if (file.size > RESELLER_PRODUCT_IMAGE_OPTIMIZE_ABOVE_BYTES) return true
  const name = file.name.toLowerCase()
  if (name.endsWith('.webp') && file.size <= RESELLER_PRODUCT_IMAGE_STORE_TARGET_BYTES) return false
  return file.size > RESELLER_PRODUCT_IMAGE_STORE_TARGET_BYTES
}

/**
 * Studio / AI PNGs (often 10–30 MB) → high-quality WebP at full catalogue resolution.
 * Visually identical on product cards; much smaller on disk.
 */
export async function prepareResellerProductImageForUpload(file: File): Promise<File> {
  if (!isImageFile(file)) {
    if (file.size > RESELLER_PRODUCT_IMAGE_MAX_BYTES) {
      throw new Error(`${file.name} is too large (max ${RESELLER_PRODUCT_IMAGE_MAX_LABEL})`)
    }
    return file
  }

  if (file.size > RESELLER_PRODUCT_IMAGE_MAX_BYTES) {
    throw new Error(
      `${file.name} is too large (max ${RESELLER_PRODUCT_IMAGE_MAX_LABEL}). Split the batch or export a smaller master.`,
    )
  }

  if (!shouldOptimizeForUpload(file)) {
    return file
  }

  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file)
  } catch {
    throw new Error(`${file.name} could not be read as an image`)
  }

  const maxEdges = [4096, 3600, 3200, 2800, 2400]
  let bestUnderTarget: File | null = null
  let bestUnderMax: File | null = null

  for (const maxEdge of maxEdges) {
    let w = bitmap.width
    let h = bitmap.height
    if (Math.max(w, h) > maxEdge) {
      const scale = maxEdge / Math.max(w, h)
      w = Math.round(w * scale)
      h = Math.round(h * scale)
    }

    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) continue
    ctx.drawImage(bitmap, 0, 0, w, h)

    for (let q = 0.98; q >= 0.78; q -= 0.02) {
      const blob = await canvasToWebpBlob(canvas, q)
      if (!blob) continue
      const out = new File([blob], webpNameFrom(file), {
        type: 'image/webp',
        lastModified: file.lastModified,
      })
      if (blob.size <= RESELLER_PRODUCT_IMAGE_STORE_TARGET_BYTES) {
        bitmap.close()
        return out
      }
      if (!bestUnderTarget || blob.size < bestUnderTarget.size) {
        bestUnderTarget = out
      }
      if (blob.size <= RESELLER_PRODUCT_IMAGE_MAX_BYTES) {
        if (!bestUnderMax || blob.size < bestUnderMax.size) {
          bestUnderMax = out
        }
      }
    }
  }

  bitmap.close()

  if (bestUnderTarget) return bestUnderTarget
  if (bestUnderMax) return bestUnderMax

  throw new Error(
    `${file.name} could not be prepared for upload. Try re-exporting from Enhanced Pictures or contact support.`,
  )
}

export async function prepareResellerProductImagesForUpload(files: File[]): Promise<File[]> {
  return Promise.all(files.map((f) => prepareResellerProductImageForUpload(f)))
}

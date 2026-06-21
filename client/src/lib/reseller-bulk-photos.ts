import axios from '@/lib/axios'
import {
  RESELLER_PRODUCT_IMAGE_MAX_BYTES,
  RESELLER_PRODUCT_IMAGE_MAX_LABEL,
  submissionImageDiskKey,
  type ResellerProductSubmission,
} from '@/lib/reseller-products'

export type BulkPhotoKind = 'front' | 'back' | 'box'

export type BulkPhotoUploadResult = {
  matched: number
  skipped: number
  unmatched: string[]
  updated_ids: number[]
  errors: { file: string; error: string }[]
}

export function submissionPhotoFilenames(row: ResellerProductSubmission): {
  front: string
  back: string
  box: string
} | null {
  const key = submissionImageDiskKey(row)
  if (!key) return null
  return {
    front: `${key}.webp`,
    back: `${key}_secondary.webp`,
    box: `${key}_box.webp`,
  }
}

export function validateBulkPhotoFiles(files: File[]): string | null {
  if (!files.length) return 'Choose at least one image'
  for (const f of files) {
    if (f.size > RESELLER_PRODUCT_IMAGE_MAX_BYTES) {
      return `${f.name} is too large (max ${RESELLER_PRODUCT_IMAGE_MAX_LABEL})`
    }
  }
  return null
}

export async function uploadBatchPhotosBulk(
  batchId: string,
  photoType: BulkPhotoKind,
  files: File[],
): Promise<BulkPhotoUploadResult> {
  const err = validateBulkPhotoFiles(files)
  if (err) throw new Error(err)
  const fd = new FormData()
  fd.append('photoType', photoType)
  for (const f of files) {
    fd.append('images', f, f.name || 'photo.webp')
  }
  const res = await axios.post<BulkPhotoUploadResult>(
    `/api/reseller/product-batches/${encodeURIComponent(batchId)}/bulk-photos`,
    fd,
  )
  return res.data
}

export function bulkPhotoKindLabel(kind: BulkPhotoKind): string {
  switch (kind) {
    case 'front':
      return 'front'
    case 'back':
      return 'back'
    case 'box':
      return 'with-box'
    default:
      return kind
  }
}

import axios from '@/lib/axios'
import { prepareResellerProductImageForUpload } from '@/lib/reseller-product-image-upload'
import {
  submissionImageDiskKey,
  submissionWithBoxOnly,
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

/** Small batches avoid proxy timeouts while server converts large PNGs to WebP. */
const BULK_PHOTO_CHUNK_SIZE = 3
const BULK_PHOTO_TIMEOUT_MS = 180_000

export function submissionPhotoFilenames(row: ResellerProductSubmission): {
  front: string
  back: string
  box: string
  boxOnly: boolean
} | null {
  const key = submissionImageDiskKey(row)
  if (!key) return null
  const boxOnly = submissionWithBoxOnly(row)
  return {
    front: `${key}.webp`,
    back: `${key}_secondary.webp`,
    box: `${key}_box.webp`,
    boxOnly,
  }
}

export function validateBulkPhotoFiles(files: File[]): string | null {
  if (!files.length) return 'Choose at least one image'
  return null
}

function emptyBulkResult(): BulkPhotoUploadResult {
  return { matched: 0, skipped: 0, unmatched: [], updated_ids: [], errors: [] }
}

function mergeBulkResults(acc: BulkPhotoUploadResult, part: BulkPhotoUploadResult): BulkPhotoUploadResult {
  const idSet = new Set(acc.updated_ids)
  for (const id of part.updated_ids) idSet.add(id)
  return {
    matched: acc.matched + part.matched,
    skipped: acc.skipped + part.skipped,
    unmatched: [...acc.unmatched, ...part.unmatched],
    updated_ids: [...idSet],
    errors: [...acc.errors, ...part.errors],
  }
}

async function postBulkPhotoChunk(
  batchId: string,
  photoType: BulkPhotoKind,
  files: File[],
): Promise<BulkPhotoUploadResult> {
  const fd = new FormData()
  fd.append('photoType', photoType)
  for (const f of files) {
    fd.append('images', f, f.name || 'photo.webp')
  }
  const res = await axios.post<BulkPhotoUploadResult>(
    `/api/reseller/product-batches/${encodeURIComponent(batchId)}/bulk-photos`,
    fd,
    { timeout: BULK_PHOTO_TIMEOUT_MS },
  )
  return res.data
}

export type BulkPhotoUploadProgress = {
  phase: 'prepare' | 'upload'
  done: number
  total: number
}

export async function uploadBatchPhotosBulk(
  batchId: string,
  photoType: BulkPhotoKind,
  files: File[],
  onProgress?: (p: BulkPhotoUploadProgress) => void,
): Promise<BulkPhotoUploadResult> {
  const err = validateBulkPhotoFiles(files)
  if (err) throw new Error(err)

  let result = emptyBulkResult()
  const total = files.length
  let prepared = 0

  for (let i = 0; i < files.length; i += BULK_PHOTO_CHUNK_SIZE) {
    const rawChunk = files.slice(i, i + BULK_PHOTO_CHUNK_SIZE)
    const ready: File[] = []
    for (const f of rawChunk) {
      ready.push(await prepareResellerProductImageForUpload(f))
      prepared += 1
      onProgress?.({ phase: 'prepare', done: prepared, total })
    }
    try {
      const part = await postBulkPhotoChunk(batchId, photoType, ready)
      result = mergeBulkResults(result, part)
      onProgress?.({ phase: 'upload', done: Math.min(prepared, total), total })
    } catch (e: unknown) {
      const msg =
        e && typeof e === 'object' && 'response' in e
          ? (e as { response?: { data?: { error?: string } } }).response?.data?.error
          : null
      const isTimeout =
        e &&
        typeof e === 'object' &&
        'code' in e &&
        String((e as { code?: string }).code) === 'ECONNABORTED'
      for (const f of rawChunk) {
        result.errors.push({
          file: f.name,
          error: msg || (isTimeout ? 'Upload timed out — refresh to confirm photos, then retry any missing.' : 'Network error'),
        })
      }
      result.skipped += rawChunk.length
    }
  }

  return result
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

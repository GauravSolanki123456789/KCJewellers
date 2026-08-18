import axios from 'axios'

export type PricelistCategory = {
  id: number
  name: string
  slug: string
  sort_order?: number
  product_count?: number
  created_at?: string
  updated_at?: string
}

export type PricelistProduct = {
  id: number
  product_name: string
  product_slug: string
  avg_weight: number | null
  slab_rates: Record<string, number>
  image_url: string | null
  sort_order?: number
}

export type PricelistSubcategory = {
  id: number
  name: string
  slug: string
  sort_order?: number
  products: PricelistProduct[]
}

export type PricelistTreeCategory = {
  id: number
  name: string
  slug: string
  sort_order?: number
  subcategories: PricelistSubcategory[]
}

export type PricelistImportBatch = {
  id: string
  source_filename: string
  product_count: number
  created_at: string
}

export type PricelistBootstrap = {
  enabled: boolean
  categoriesCount: number
  slabKeys: string[]
}

export type PricelistPublicProduct = {
  id: number
  product_name: string
  product_slug: string
  avg_weight: number | null
  slab_rates: Record<string, number>
  selected_slab_rate: number | null
  image_url: string | null
  category_name: string
  subcategory_name: string
}

export type PricelistPublicResponse = {
  expired: boolean
  id: string
  expires_at: string
  selected_slab_key: string | null
  slab_keys_snapshot: string[]
  hide_prices?: boolean
  hide_pdf?: boolean
  owner_business_name: string | null
  owner_logo_url: string | null
  products: PricelistPublicProduct[]
}

export function formatSlabKeyLabel(key: string): string {
  const k = String(key || '').trim()
  if (!k) return 'PRICELISTSLAB'
  if (k.toLowerCase().startsWith('pricelistslab')) return k.toUpperCase()
  return `PRICELISTSLAB${k.toUpperCase()}`
}

export async function fetchPricelistBootstrap(): Promise<PricelistBootstrap> {
  const { data } = await axios.get<PricelistBootstrap>('/api/reseller/pricelist/bootstrap')
  return data
}

export async function fetchPricelistCategories(): Promise<PricelistCategory[]> {
  const { data } = await axios.get<{ categories?: PricelistCategory[] }>(
    '/api/reseller/pricelist/categories',
  )
  return data.categories ?? []
}

export async function createPricelistCategory(name: string): Promise<PricelistCategory> {
  const { data } = await axios.post<{ category: PricelistCategory }>(
    '/api/reseller/pricelist/categories',
    { name },
  )
  return data.category
}

export async function deletePricelistCategory(id: number): Promise<void> {
  await axios.delete(`/api/reseller/pricelist/categories/${id}`)
}

export async function fetchPricelistTree(): Promise<PricelistTreeCategory[]> {
  const { data } = await axios.get<{ tree?: PricelistTreeCategory[] }>(
    '/api/reseller/pricelist/tree',
  )
  return data.tree ?? []
}

export async function uploadPricelistExcelRows(
  categoryId: number,
  rows: Record<string, unknown>[],
  sourceFilename?: string,
): Promise<{
  success: boolean
  batch_id?: string
  source_filename?: string
  upserted?: number
  errors?: { row: number; error: string }[]
}> {
  const { data } = await axios.post(
    `/api/reseller/pricelist/categories/${categoryId}/upload-excel`,
    { rows, sourceFilename },
  )
  return data
}

export async function fetchPricelistImportBatches(
  categoryId: number,
): Promise<PricelistImportBatch[]> {
  const { data } = await axios.get<{ batches?: PricelistImportBatch[] }>(
    `/api/reseller/pricelist/categories/${categoryId}/batches`,
  )
  return data.batches ?? []
}

export async function deletePricelistImportBatch(
  categoryId: number,
  batchId: string,
): Promise<{ deletedProducts: number }> {
  const { data } = await axios.delete<{ deletedProducts: number }>(
    `/api/reseller/pricelist/categories/${categoryId}/batches/${batchId}`,
  )
  return data
}

export async function uploadPricelistProductPhoto(
  productId: number,
  file: File,
): Promise<{ image_url: string; product_slug: string; suggested_filename: string }> {
  const fd = new FormData()
  fd.append('image', file)
  const { data } = await axios.post(
    `/api/reseller/pricelist/products/${productId}/photo`,
    fd,
    { headers: { 'Content-Type': 'multipart/form-data' } },
  )
  return data
}

export async function uploadPricelistBulkPhotos(
  categoryId: number,
  files: File[],
  batchId?: string,
): Promise<{
  success: boolean
  matched?: { filename: string; product_slug: string; image_url: string }[]
  unmatched?: string[]
  errors?: { filename: string; error: string }[]
}> {
  const fd = new FormData()
  for (const f of files) fd.append('images', f)
  if (batchId) fd.append('batch_id', batchId)
  const { data } = await axios.post(
    `/api/reseller/pricelist/categories/${categoryId}/bulk-photos`,
    fd,
    { headers: { 'Content-Type': 'multipart/form-data' } },
  )
  return data
}

export async function createPricelistSharedLink(payload: {
  productIds: number[]
  selectedSlabKey?: string | null
  format?: 'temporary_web_link' | 'pdf'
  expiresHours?: number
}): Promise<{
  success: boolean
  shareUrl: string
  share_url?: string
  id: string
  expiresAt: string
  selectedSlabKey?: string | null
}> {
  const { data } = await axios.post('/api/reseller/pricelist/shared-links', payload)
  return {
    ...data,
    shareUrl: data.shareUrl || data.share_url || '',
  }
}

export async function fetchPublicPricelist(uuid: string): Promise<PricelistPublicResponse> {
  const api = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'
  const res = await fetch(`${api}/api/public/pricelist/${encodeURIComponent(uuid)}`, {
    cache: 'no-store',
  })
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string }
    throw new Error(err.error || 'Failed to load pricelist')
  }
  return res.json()
}

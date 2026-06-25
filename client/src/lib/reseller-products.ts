/**
 * Reseller product uploads — same ERP/sync field names as POST /api/sync/receive.
 * DB: `reseller_product_submissions`, live catalog: `web_products`.
 */
import type { Item } from '@/lib/pricing'

export type ResellerSubmissionStatus = 'draft' | 'pending' | 'approved' | 'rejected' | 'withdrawn'

export type ResellerProductBatch = {
  batch_id: string
  batch_label?: string | null
  created_at: string
  batch_submitted_at?: string | null
  product_count: number
  draft_count: number
  pending_count: number
  approved_count: number
  with_primary_image: number
  with_secondary_image: number
  /** Distinct StyleCode values in this batch (e.g. Necklace + Chain Pendant). */
  style_codes?: string[]
}

export type ResellerProductSubmission = {
  id: number
  submitted_by_user_id: number
  submission_status: ResellerSubmissionStatus
  batch_id?: string | null
  batch_label?: string | null
  batch_submitted_at?: string | null
  style_code?: string | null
  sku?: string | null
  barcode?: string | null
  product_name?: string | null
  size?: string | null
  net_weight?: number | string | null
  weight_display?: string | null
  gross_weight?: number | string | null
  purity?: string | null
  mc_rate?: number | string | null
  mc_type?: string | null
  metal_type?: string | null
  fixed_price?: number | string | null
  stone_charges?: number | string | null
  box_charges?: number | string | null
  wastage_pct?: number | string | null
  chain_weight?: number | string | null
  pendant_weight?: number | string | null
  earring_weight?: number | string | null
  quantity?: number | null
  design_group?: string | null
  attr_color?: string | null
  attr_stone?: string | null
  image_url?: string | null
  secondary_image_url?: string | null
  box_image_url?: string | null
  video_url?: string | null
  web_product_sku?: string | null
  review_notes?: string | null
  reviewed_at?: string | null
  created_at: string
  updated_at?: string
  submitter_business_name?: string | null
  submitter_email?: string | null
  reviewer_name?: string | null
}

/** Form / API payload — mirrors ERP sync JSON keys. */
export type ResellerProductPayload = {
  styleCode: string
  sku: string
  barcode?: string
  name: string
  size?: string
  netWeight?: number | string
  grossWeight?: number | string
  purity?: string
  mcRate?: number | string
  mcType?: string
  metalType: string
  fixedPrice?: number | string
  stoneCharges?: number | string
  boxCharges?: number | string
  quantity?: number
  itemCode?: string
  attrColor?: string
  attrStone?: string
  imageUrl?: string
  secondaryImageUrl?: string
}

export const RESELLER_PRODUCT_IMAGE_ACCEPT =
  'image/png,image/jpeg,image/jpg,image/webp,image/gif,.png,.jpg,.jpeg,.webp,.gif'

export const RESELLER_PRODUCT_VIDEO_ACCEPT =
  'video/mp4,video/webm,video/quicktime,.mp4,.webm,.mov'

export const RESELLER_PRODUCT_VIDEO_MAX_BYTES = 25 * 1024 * 1024
export const RESELLER_PRODUCT_VIDEO_MAX_LABEL = '25 MB'

export const RESELLER_PRODUCT_IMAGE_MAX_BYTES = 5 * 1024 * 1024
export const RESELLER_PRODUCT_IMAGE_MAX_LABEL = '5 MB'

export const RESELLER_EXCEL_ACCEPT =
  '.xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv'

export function submissionStatusLabel(status: ResellerSubmissionStatus): string {
  switch (status) {
    case 'draft':
      return 'Draft — add photos'
    case 'pending':
      return 'Awaiting KC review'
    case 'approved':
      return 'Live on KC site'
    case 'rejected':
      return 'Rejected'
    case 'withdrawn':
      return 'Withdrawn'
    default:
      return status
  }
}

export function submissionStatusTone(status: ResellerSubmissionStatus): string {
  switch (status) {
    case 'draft':
      return 'bg-sky-500/15 text-sky-800 border-sky-500/30'
    case 'pending':
      return 'bg-amber-500/15 text-amber-800 border-amber-500/30'
    case 'approved':
      return 'bg-emerald-500/15 text-emerald-700 border-emerald-500/30'
    case 'rejected':
      return 'bg-rose-500/15 text-rose-700 border-rose-500/30'
    case 'withdrawn':
      return 'bg-slate-500/15 text-slate-600 border-slate-500/30'
    default:
      return 'bg-slate-500/10 text-slate-600'
  }
}

export function submissionToCatalogItem(row: ResellerProductSubmission): Item {
  const net = row.net_weight != null ? Number(row.net_weight) : undefined
  const gross = row.gross_weight != null ? Number(row.gross_weight) : undefined
  const mc = row.mc_rate != null && String(row.mc_rate).trim() !== '' ? Number(row.mc_rate) : undefined
  return {
    barcode: row.barcode ?? undefined,
    sku: row.sku ?? undefined,
    item_name: row.product_name ?? undefined,
    metal_type: row.metal_type ?? 'silver',
    net_weight: Number.isFinite(net) ? net : undefined,
    gross_weight: Number.isFinite(gross) ? gross : undefined,
    weight_display: row.weight_display ?? undefined,
    purity: row.purity ?? undefined,
    mc_rate: Number.isFinite(mc) ? mc : undefined,
    mc_type: row.mc_type ?? (mc != null && mc > 0 ? 'PER_GRAM' : undefined),
    fixed_price: row.fixed_price != null ? Number(row.fixed_price) : undefined,
    stone_charges: row.stone_charges != null ? Number(row.stone_charges) : undefined,
    box_charges: row.box_charges != null ? Number(row.box_charges) : undefined,
    wastage_pct: row.wastage_pct != null ? Number(row.wastage_pct) : undefined,
    chain_weight: row.chain_weight != null ? Number(row.chain_weight) : undefined,
    pendant_weight: row.pendant_weight != null ? Number(row.pendant_weight) : undefined,
    earring_weight: row.earring_weight != null ? Number(row.earring_weight) : undefined,
    size: row.size != null && String(row.size).trim() !== '' ? String(row.size).trim() : undefined,
    design_group: row.design_group ?? undefined,
    gst_rate: 3,
  }
}

export function submissionToPayload(row: ResellerProductSubmission): ResellerProductPayload {
  return {
    styleCode: row.style_code || '',
    sku: row.sku || '',
    barcode: row.barcode || undefined,
    name: row.product_name || '',
    size: row.size || undefined,
    netWeight: row.net_weight ?? undefined,
    grossWeight: row.gross_weight ?? undefined,
    purity: row.purity || undefined,
    mcRate: row.mc_rate ?? undefined,
    mcType: row.mc_type || undefined,
    metalType: row.metal_type || 'silver',
    fixedPrice: row.fixed_price ?? undefined,
    stoneCharges: row.stone_charges ?? undefined,
    boxCharges: row.box_charges ?? undefined,
    quantity: row.quantity ?? undefined,
    itemCode: row.design_group || undefined,
    attrColor: row.attr_color || undefined,
    attrStone: row.attr_stone || undefined,
    imageUrl: row.image_url || undefined,
    secondaryImageUrl: row.secondary_image_url || undefined,
  }
}

export function emptyProductPayload(): ResellerProductPayload {
  return {
    styleCode: '',
    sku: '',
    barcode: '',
    name: '',
    metalType: 'gifting',
    fixedPrice: '',
    quantity: 1,
  }
}

export function productImageUrl(skuOrBarcode: string, apiBase?: string): string {
  const base = (apiBase || process.env.NEXT_PUBLIC_API_URL || '').replace(/\/$/, '')
  const code = String(skuOrBarcode || '').trim()
  if (!code) return ''
  return `${base}/uploads/web_products/${encodeURIComponent(code)}.webp`
}

/**
 * Unique catalog sku for reseller photos (subcategory + design_group + size).
 * Never fall back to Excel Barcode or subcategory SKU — those caused shared `mecca.webp` previews.
 */
export function submissionImageDiskKey(row: ResellerProductSubmission): string {
  return String(row.web_product_sku || '').trim()
}

/** Preview URL: explicit upload only, or file named after web_product_sku. */
export function submissionPreviewImageUrl(
  row: ResellerProductSubmission,
  apiBase?: string,
): string {
  const explicit = String(row.image_url || '').trim()
  if (explicit) return explicit
  const key = submissionImageDiskKey(row)
  return key ? productImageUrl(key, apiBase) : ''
}

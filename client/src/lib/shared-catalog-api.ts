import axios from '@/lib/axios'
import type { CatalogSlabKind, ResellerSlabSettings } from '@/lib/catalog-slab-pricing'

export type CreateSharedCatalogPayload = {
  selectedProductIds: string[]
  markupPercentage: number
  discountPercentage?: number
  format: 'temporary_web_link' | 'pdf'
  expiresAt?: string | null
  pricingSlab?: CatalogSlabKind
  wholesaleGoldRatePerG?: number | null
  wholesaleSilverRatePerG?: number | null
}

export type CreateSharedCatalogResponse =
  | {
      success: true
      format: 'temporary_web_link'
      id: string
      shareUrl: string
      expiresAt: string
      selectedProductIds: string[]
      markupPercentage: number
      discountPercentage?: number
      hidePrices?: boolean
      /** Snapshot: PDF shortlist hidden for this brochure's customers. */
      hidePdf?: boolean
      pricingSlab?: CatalogSlabKind
      wholesaleGoldRatePerG?: number | null
      wholesaleSilverRatePerG?: number | null
      slabSettingsSnapshot?: ResellerSlabSettings | null
    }
  | {
      success: true
      format: 'pdf'
      message?: string
    }

export async function createSharedCatalog(
  payload: CreateSharedCatalogPayload,
): Promise<CreateSharedCatalogResponse> {
  const { data } = await axios.post<CreateSharedCatalogResponse>(
    '/api/admin/shared-catalog',
    payload,
  )
  return data
}

export type SharedCatalogExpiryOption = {
  label: string
  hours: number
}

export type SharedCatalogExpiryOptionsResponse = {
  options: SharedCatalogExpiryOption[]
  maxExpiryDays: number
}

export async function fetchSharedCatalogExpiryOptions(): Promise<SharedCatalogExpiryOptionsResponse> {
  const { data } = await axios.get<SharedCatalogExpiryOptionsResponse>(
    '/api/shared-catalog/expiry-options',
  )
  return data
}

export type ActiveSharedCatalog = {
  id: string
  productCount: number
  expiresAt: string
  createdAt: string
  markupPercentage: number
  discountPercentage: number
  pricingSlab: string
}

export async function fetchActiveSharedCatalogs(): Promise<ActiveSharedCatalog[]> {
  const { data } = await axios.get<{ catalogs: ActiveSharedCatalog[] }>(
    '/api/reseller/shared-catalogs/active',
    { withCredentials: true },
  )
  return data.catalogs ?? []
}

export type AppendSharedCatalogResponse = {
  success: true
  id: string
  shareUrl: string
  addedCount: number
  productCount: number
  expiresAt: string
}

export async function appendToSharedCatalog(
  uuid: string,
  addProductIds: string[],
): Promise<AppendSharedCatalogResponse> {
  const { data } = await axios.patch<AppendSharedCatalogResponse>(
    `/api/admin/shared-catalog/${uuid}/products`,
    { addProductIds },
    { withCredentials: true },
  )
  return data
}

export type SharedCatalogPublicProduct = {
  id?: number | string
  sku?: string
  barcode?: string
  name?: string
  image_url?: string
  secondary_image_url?: string | null
  box_image_url?: string | null
  video_url?: string | null
  box_charges?: number
  net_weight?: number
  weight_display?: string | null
  gross_weight?: number
  wastage_pct?: number
  chain_weight?: number
  pendant_weight?: number
  earring_weight?: number
  purity?: number
  mc_rate?: number
  mc_type?: string
  fixed_price?: number
  stone_charges?: number
  metal_type?: string
  discount_percentage?: number
  style_name?: string
  gst_rate?: number
  size?: string | null
  design_group?: string | null
  subcategory_id?: number | string | null
  subcategory_name?: string | null
  subcategory_slug?: string | null
  subcategory_sort_order?: number | null
  [key: string]: unknown
}

export type SharedCatalogCreatorWholesale = {
  wholesale_markup_percent: number
  wholesale_making_charge_discount_percent: number
}

export type SharedCatalogSlabFields = {
  pricingSlab?: CatalogSlabKind
  slabSettingsSnapshot?: ResellerSlabSettings | null
  wholesaleGoldRatePerG?: number | null
  wholesaleSilverRatePerG?: number | null
}

export type SharedCatalogPublicResponse =
  | ({
      expired: true
      expiresAt: string
      markupPercentage: number
      discountPercentage?: number
      hidePrices?: boolean
      creatorWholesalePricing?: SharedCatalogCreatorWholesale | null
      products: SharedCatalogPublicProduct[]
      /** Site-wide gift GST toggle from `app_settings.gifting_gst_enabled`. */
      gifting_gst_enabled?: boolean
      /** When false, shared catalogue collects mobile without OTP. */
      shared_catalog_otp_enabled?: boolean
      /** Reseller turned OTP on but API key not saved yet — mobile-only until configured. */
      shared_catalog_otp_requested?: boolean
      shared_catalog_otp_configured?: boolean
    } & SharedCatalogSlabFields)
  | ({
      expired: false
      expiresAt: string
      createdAt?: string
      markupPercentage: number
      discountPercentage?: number
      /** Snapshot from `shared_catalogs.hide_prices` — weight-only brochure (no prices). */
      hidePrices?: boolean
      /** Snapshot from `shared_catalogs.hide_pdf` — customers can use WhatsApp text only. */
      hidePdf?: boolean
      creatorWholesalePricing?: SharedCatalogCreatorWholesale | null
      /** RESELLER creator mobile (10 digits) when set — share selection targets this WhatsApp. */
      selectionWhatsAppDigits?: string | null
      /** `users.customer_tier` of brochure creator (e.g. RESELLER); used for WhatsApp fallback messaging. */
      creatorCustomerTier?: string | null
      products: SharedCatalogPublicProduct[]
      /** Barcodes explicitly chosen when the link was created (before size-variant expansion). */
      selectedProductIds?: string[]
      rates: unknown[]
      /** Site-wide gift GST toggle from `app_settings.gifting_gst_enabled`. */
      gifting_gst_enabled?: boolean
      /** When false, shared catalogue collects mobile without OTP. */
      shared_catalog_otp_enabled?: boolean
      shared_catalog_otp_requested?: boolean
      shared_catalog_otp_configured?: boolean
  /** Palette for PDF / UX — stored as app_settings `kc_theme_id` or reseller profile. */
  kc_theme_id?: string | null
  /** True when prices use live rates frozen at link creation (not current ticker). */
  ratesFrozenAtShare?: boolean
    } & SharedCatalogSlabFields)
  | { error?: string }

export async function fetchSharedCatalogByUuid(
  uuid: string,
): Promise<SharedCatalogPublicResponse> {
  const { data } = await axios.get<SharedCatalogPublicResponse>(`/api/shared-catalog/${uuid}`)
  return data
}

/** Build slab pricing payload from shared catalogue API response. */
export function sharedCatalogSlabPayloadFromResponse(
  payload: SharedCatalogPublicResponse | null | undefined,
): import('@/lib/shared-catalog-pricing').SharedCatalogSlabPayload | null {
  if (!payload || typeof payload !== 'object' || !('pricingSlab' in payload)) return null
  const p = payload as SharedCatalogSlabFields
  if (!p.pricingSlab || p.pricingSlab === 'standard') return null
  return {
    pricingSlab: p.pricingSlab,
    slabSettingsSnapshot: p.slabSettingsSnapshot ?? null,
    wholesaleGoldRatePerG: p.wholesaleGoldRatePerG ?? null,
    wholesaleSilverRatePerG: p.wholesaleSilverRatePerG ?? null,
  }
}

/** Gift-item GST toggle from shared-catalog API (`app_settings.gifting_gst_enabled`). */
export function sharedCatalogGiftingGstEnabled(
  payload: SharedCatalogPublicResponse | null | undefined,
): boolean {
  if (!payload || typeof payload !== 'object') return true
  if ('gifting_gst_enabled' in payload) return payload.gifting_gst_enabled !== false
  return true
}

import axios from '@/lib/axios'

export type CreateSharedCatalogPayload = {
  selectedProductIds: string[]
  markupPercentage: number
  format: 'temporary_web_link' | 'pdf'
  expiresAt?: string | null
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

export type SharedCatalogPublicProduct = {
  id?: number | string
  sku?: string
  barcode?: string
  name?: string
  image_url?: string
  net_weight?: number
  gross_weight?: number
  purity?: number
  mc_rate?: number
  fixed_price?: number
  stone_charges?: number
  metal_type?: string
  discount_percentage?: number
  style_name?: string
  [key: string]: unknown
}

export type SharedCatalogCreatorWholesale = {
  wholesale_markup_percent: number
  wholesale_making_charge_discount_percent: number
}

export type SharedCatalogPublicResponse =
  | {
      expired: true
      expiresAt: string
      markupPercentage: number
      creatorWholesalePricing?: SharedCatalogCreatorWholesale | null
      products: SharedCatalogPublicProduct[]
    }
  | {
      expired: false
      expiresAt: string
      createdAt?: string
      markupPercentage: number
      creatorWholesalePricing?: SharedCatalogCreatorWholesale | null
      /** RESELLER creator mobile (10 digits) when set — share selection targets this WhatsApp. */
      selectionWhatsAppDigits?: string | null
      /** `users.customer_tier` of brochure creator (e.g. RESELLER); used for WhatsApp fallback messaging. */
      creatorCustomerTier?: string | null
      products: SharedCatalogPublicProduct[]
      rates: unknown[]
    }
  | { error?: string }

export async function fetchSharedCatalogByUuid(
  uuid: string,
): Promise<SharedCatalogPublicResponse> {
  const { data } = await axios.get<SharedCatalogPublicResponse>(`/api/shared-catalog/${uuid}`)
  return data
}

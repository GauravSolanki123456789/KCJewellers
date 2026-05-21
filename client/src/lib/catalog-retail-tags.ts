/**
 * Retail presentation tags on `web_subcategories` — consistent keys across admin, API, and storefront.
 * ERP Style Code / SKU Code sync is unchanged; these fields are admin-managed only.
 */

/** `web_subcategories.audience` — lowercase snake-free single words */
export const CATALOG_AUDIENCE = {
  WOMEN: 'women',
  MEN: 'men',
  KIDS: 'kids',
  UNISEX: 'unisex',
} as const

export type CatalogAudience = (typeof CATALOG_AUDIENCE)[keyof typeof CATALOG_AUDIENCE]

/** `web_subcategories.product_type` */
export const CATALOG_PRODUCT_TYPE = {
  NECKLACE: 'necklace',
  BANGLE: 'bangle',
  BRACELET: 'bracelet',
  RING: 'ring',
  PENDANT: 'pendant',
  PENDANT_SET: 'pendant_set',
  EARRING: 'earring',
  CHAIN: 'chain',
  SET: 'set',
  KADA: 'kada',
  OTHER: 'other',
} as const

export type CatalogProductType =
  (typeof CATALOG_PRODUCT_TYPE)[keyof typeof CATALOG_PRODUCT_TYPE]

/** Shop-for pill on the catalogue — `all` is UI-only (not stored in DB). */
export type CatalogShopForKey = 'all' | CatalogAudience

export const CATALOG_SHOP_FOR_TABS: {
  key: CatalogShopForKey
  label: string
  shortLabel: string
}[] = [
  { key: 'all', label: 'All', shortLabel: 'All' },
  { key: CATALOG_AUDIENCE.WOMEN, label: 'Women', shortLabel: 'Women' },
  { key: CATALOG_AUDIENCE.MEN, label: 'Men', shortLabel: 'Men' },
  { key: CATALOG_AUDIENCE.KIDS, label: 'Kids', shortLabel: 'Kids' },
]

export const CATALOG_AUDIENCE_OPTIONS: { value: CatalogAudience | ''; label: string }[] = [
  { value: '', label: 'Not set' },
  { value: CATALOG_AUDIENCE.WOMEN, label: 'Women' },
  { value: CATALOG_AUDIENCE.MEN, label: 'Men' },
  { value: CATALOG_AUDIENCE.KIDS, label: 'Kids' },
  { value: CATALOG_AUDIENCE.UNISEX, label: 'Unisex' },
]

export const CATALOG_PRODUCT_TYPE_OPTIONS: { value: CatalogProductType | ''; label: string }[] = [
  { value: '', label: 'Not set' },
  { value: CATALOG_PRODUCT_TYPE.NECKLACE, label: 'Necklace' },
  { value: CATALOG_PRODUCT_TYPE.BANGLE, label: 'Bangle' },
  { value: CATALOG_PRODUCT_TYPE.BRACELET, label: 'Bracelet' },
  { value: CATALOG_PRODUCT_TYPE.RING, label: 'Ring' },
  { value: CATALOG_PRODUCT_TYPE.PENDANT, label: 'Pendant' },
  { value: CATALOG_PRODUCT_TYPE.PENDANT_SET, label: 'Pendant set' },
  { value: CATALOG_PRODUCT_TYPE.EARRING, label: 'Earring / Tops' },
  { value: CATALOG_PRODUCT_TYPE.CHAIN, label: 'Chain' },
  { value: CATALOG_PRODUCT_TYPE.KADA, label: 'Kada / Flexi' },
  { value: CATALOG_PRODUCT_TYPE.SET, label: 'Set' },
  { value: CATALOG_PRODUCT_TYPE.OTHER, label: 'Other' },
]

const VALID_AUDIENCES = new Set<string>(Object.values(CATALOG_AUDIENCE))
const VALID_PRODUCT_TYPES = new Set<string>(Object.values(CATALOG_PRODUCT_TYPE))

export function normalizeCatalogAudience(raw: unknown): CatalogAudience | null {
  const v = String(raw ?? '')
    .trim()
    .toLowerCase()
  if (!v || !VALID_AUDIENCES.has(v)) return null
  return v as CatalogAudience
}

export function normalizeCatalogProductType(raw: unknown): CatalogProductType | null {
  const v = String(raw ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
  if (!v || !VALID_PRODUCT_TYPES.has(v)) return null
  return v as CatalogProductType
}

export function catalogAudienceLabel(audience: CatalogAudience | null | undefined): string {
  if (!audience) return ''
  const row = CATALOG_AUDIENCE_OPTIONS.find((o) => o.value === audience)
  return row?.label ?? audience
}

export function catalogProductTypeLabel(type: CatalogProductType | null | undefined): string {
  if (!type) return ''
  const row = CATALOG_PRODUCT_TYPE_OPTIONS.find((o) => o.value === type)
  return row?.label ?? type.replace(/_/g, ' ')
}

export type CatalogTaggedSubcategory = {
  audience?: string | null
  product_type?: string | null
}

/** Whether a subcategory row passes the active shop-for filter. */
export function subcategoryMatchesShopFor(
  sub: CatalogTaggedSubcategory,
  shopFor: CatalogShopForKey,
): boolean {
  if (shopFor === 'all') return true
  const aud = normalizeCatalogAudience(sub.audience)
  if (!aud) return true
  if (aud === CATALOG_AUDIENCE.UNISEX) return true
  return aud === shopFor
}

export function subcategoryMatchesProductType(
  sub: CatalogTaggedSubcategory,
  productType: CatalogProductType | null | undefined,
): boolean {
  if (!productType) return true
  const pt = normalizeCatalogProductType(sub.product_type)
  return pt === productType
}

export function parseShopForParam(raw: string | null | undefined): CatalogShopForKey {
  const v = String(raw ?? '')
    .trim()
    .toLowerCase()
  if (v === CATALOG_AUDIENCE.WOMEN) return CATALOG_AUDIENCE.WOMEN
  if (v === CATALOG_AUDIENCE.MEN) return CATALOG_AUDIENCE.MEN
  if (v === CATALOG_AUDIENCE.KIDS) return CATALOG_AUDIENCE.KIDS
  return 'all'
}

export function parseProductTypeParam(raw: string | null | undefined): CatalogProductType | null {
  return normalizeCatalogProductType(raw)
}

/** Quick discovery links in SmartSearch — href uses catalog query params. */
export const CATALOG_DISCOVERY_CHIPS: {
  shopFor: CatalogShopForKey
  productType: CatalogProductType
  label: string
  hint: string
}[] = [
  {
    shopFor: CATALOG_AUDIENCE.WOMEN,
    productType: CATALOG_PRODUCT_TYPE.NECKLACE,
    label: 'Women · Necklaces',
    hint: 'All collections',
  },
  {
    shopFor: CATALOG_AUDIENCE.WOMEN,
    productType: CATALOG_PRODUCT_TYPE.BANGLE,
    label: 'Women · Bangles',
    hint: 'All collections',
  },
  {
    shopFor: CATALOG_AUDIENCE.WOMEN,
    productType: CATALOG_PRODUCT_TYPE.EARRING,
    label: 'Women · Earrings',
    hint: 'Tops & studs',
  },
  {
    shopFor: CATALOG_AUDIENCE.MEN,
    productType: CATALOG_PRODUCT_TYPE.CHAIN,
    label: 'Men · Chains',
    hint: 'Bracelets & chains',
  },
  {
    shopFor: CATALOG_AUDIENCE.KIDS,
    productType: CATALOG_PRODUCT_TYPE.PENDANT,
    label: 'Kids · Pendants',
    hint: 'Lightweight pieces',
  },
]

export function buildCatalogShopHref(
  shopFor: CatalogShopForKey,
  productType?: CatalogProductType | null,
  metal?: 'gold' | 'silver' | 'diamond',
): string {
  const params = new URLSearchParams()
  if (shopFor !== 'all') params.set('shop_for', shopFor)
  if (productType) params.set('product_type', productType)
  if (metal) params.set('metal', metal)
  const q = params.toString()
  return q ? `/catalog?${q}` : '/catalog'
}

/** Filter catalogue tree by shop-for + optional product type (after metal filter). */
export function filterCatalogTreeByRetailTags<
  T extends {
    subcategories: (CatalogTaggedSubcategory & { products: unknown[] })[]
  },
>(categories: T[], shopFor: CatalogShopForKey, productType?: CatalogProductType | null): T[] {
  return categories
    .map((cat) => ({
      ...cat,
      subcategories: cat.subcategories.filter(
        (sub) =>
          subcategoryMatchesShopFor(sub, shopFor) &&
          subcategoryMatchesProductType(sub, productType),
      ),
    }))
    .filter((cat) => cat.subcategories.length > 0)
}

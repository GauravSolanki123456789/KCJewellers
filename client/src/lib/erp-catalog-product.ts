import type { ErpBillLine } from '@/components/reseller/erp/erp-ui'

export type DesignCatalogSize = {
  size_label: string
  net_weight?: number | null
  gross_weight?: number | null
  mc_rate?: number | null
  mc_type?: string | null
  wastage_pct?: number | null
  purity?: number | null
  fixed_price?: number | null
  box_charges?: number | null
  stone_charges?: number | null
}

export type DesignCatalogProduct = {
  name: string
  image_url?: string | null
  mc_rate?: number | null
  mc_type?: string | null
  wastage_pct?: number | null
  purity?: number | null
  metal_type?: string | null
  fixed_price?: number | null
  net_weight?: number | null
  sizes?: DesignCatalogSize[]
  box_options?: { label: string; box_charges: number; fixed_price?: number | null }[]
  finish_options?: { label: string; stone_charges: number; fixed_price?: number | null }[]
  default_finish?: string | null
  stone_charges?: number | null
}

export function findCatalogProduct(
  catalog: DesignCatalogProduct[] | undefined,
  name: string,
): DesignCatalogProduct | null {
  const q = name.trim().toUpperCase()
  if (!q || !catalog?.length) return null
  return catalog.find((p) => p.name.trim().toUpperCase() === q) ?? null
}

export function patchLineFromCatalogProduct(
  line: ErpBillLine,
  product: DesignCatalogProduct,
): Partial<ErpBillLine> {
  const patch: Partial<ErpBillLine> = {
    name: product.name,
    imageUrl: product.image_url ?? line.imageUrl ?? null,
    mc_rate: product.mc_rate ?? line.mc_rate,
    mc_type: product.mc_type ?? line.mc_type,
    wastage_pct: product.wastage_pct ?? line.wastage_pct,
    purity: product.purity ?? line.purity,
    metal_type: product.metal_type ?? line.metal_type ?? 'silver',
    fixed_price: product.fixed_price ?? line.fixed_price,
    designSizeOptions: (product.sizes || []).map((s) => ({
      size_label: s.size_label,
      fixed_price_mrp: s.fixed_price ?? null,
    })),
    designBoxOptions: product.box_options?.length ? product.box_options : undefined,
    designFinishOptions: product.finish_options?.length ? product.finish_options : undefined,
    size: null,
    weightGm: null,
    box_charges: 0,
    stone_charges: product.stone_charges ?? 0,
  }

  if (product.sizes?.length === 1) {
    const s = product.sizes[0]
    patch.size = s.size_label
    if (s.net_weight != null) patch.weightGm = s.net_weight
    if (s.gross_weight != null) patch.gross_weight = s.gross_weight
    if (s.mc_rate != null) patch.mc_rate = s.mc_rate
    if (s.mc_type) patch.mc_type = s.mc_type
    if (s.wastage_pct != null) patch.wastage_pct = s.wastage_pct
    if (s.purity != null) patch.purity = s.purity
    if (s.fixed_price != null) patch.fixed_price = s.fixed_price
  }

  return patch
}

/** Where focus should go after picking a catalogue product. */
export function nextFieldAfterCatalogProduct(product: DesignCatalogProduct): keyof ErpBillLine {
  if ((product.sizes?.length || 0) > 1) return 'size'
  return nextFieldAfterCatalogSize(product)
}

export function nextFieldAfterCatalogSize(product: DesignCatalogProduct): keyof ErpBillLine {
  if ((product.finish_options?.length || 0) >= 2) return 'stone_charges'
  if ((product.box_options?.length || 0) >= 2) return 'box_charges'
  return 'weightGm'
}

export function patchLineFromCatalogSize(
  line: ErpBillLine,
  product: DesignCatalogProduct,
  sizeLabel: string,
): Partial<ErpBillLine> {
  const hit = product.sizes?.find((s) => s.size_label === sizeLabel)
  if (!hit) return { size: sizeLabel || null }
  return {
    size: sizeLabel,
    weightGm: hit.net_weight ?? line.weightGm,
    gross_weight: hit.gross_weight ?? line.gross_weight,
    mc_rate: hit.mc_rate ?? line.mc_rate,
    mc_type: hit.mc_type ?? line.mc_type,
    wastage_pct: hit.wastage_pct ?? line.wastage_pct,
    purity: hit.purity ?? line.purity,
    fixed_price: hit.fixed_price ?? line.fixed_price,
  }
}

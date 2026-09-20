import { isGiftingItem, type Item } from '@/lib/pricing'
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

/** Live catalogue wins; stored names kept only if they appear in live data for this style+SKU. */
export function mergeCatalogProductsForStyleSku(
  stored: DesignCatalogProduct[],
  live: DesignCatalogProduct[],
): DesignCatalogProduct[] {
  if (!live.length) return stored
  if (!stored.length) return live
  const liveKeys = new Set(live.map((p) => p.name.trim().toUpperCase()))
  const fromStored = stored.filter((p) => liveKeys.has(p.name.trim().toUpperCase()))
  const seen = new Set<string>()
  const out: DesignCatalogProduct[] = []
  for (const p of [...live, ...fromStored]) {
    const key = p.name.trim().toUpperCase()
    if (!key || seen.has(key)) continue
    seen.add(key)
    out.push(p)
  }
  return out
}

export function catalogProductUsesMrpPricing(product: DesignCatalogProduct): boolean {
  const mt = String(product.metal_type || '').toLowerCase()
  if (isGiftingItem({ metal_type: mt } as Item)) return true
  const hasWeight =
    (product.net_weight ?? 0) > 0 ||
    (product.sizes || []).some((s) => (s.net_weight ?? 0) > 0)
  if (hasWeight && mt.startsWith('silver')) return false
  return (product.fixed_price ?? 0) > 0
}

export function findCatalogProduct(
  catalog: DesignCatalogProduct[] | undefined,
  name: string,
): DesignCatalogProduct | null {
  const q = name.trim().toUpperCase()
  if (!q || !catalog?.length) return null
  return catalog.find((p) => p.name.trim().toUpperCase() === q) ?? null
}

function isGoldStockLine(line: ErpBillLine): boolean {
  if (line.stock_piece_id != null) return true
  const metal = String(line.metal_type || '').toLowerCase()
  return metal.startsWith('gold') && !line.manualEntry
}

function shouldKeepCatalogWeights(line: ErpBillLine, mrpMode: boolean): boolean {
  if (isGoldStockLine(line)) return true
  if (mrpMode) return true
  return false
}

export function patchLineFromCatalogProduct(
  line: ErpBillLine,
  product: DesignCatalogProduct,
): Partial<ErpBillLine> {
  const mrpMode = catalogProductUsesMrpPricing(product)
  const patch: Partial<ErpBillLine> = {
    name: product.name,
    imageUrl: product.image_url ?? line.imageUrl ?? null,
    mc_rate: product.mc_rate ?? line.mc_rate,
    mc_type: product.mc_type ?? line.mc_type,
    wastage_pct: product.wastage_pct ?? line.wastage_pct,
    purity: product.purity ?? line.purity,
    metal_type: product.metal_type ?? line.metal_type ?? 'silver',
    fixed_price: product.fixed_price ?? line.fixed_price,
    designSizeOptions: (product.sizes || []).length
      ? (product.sizes || []).map((s) => ({
          size_label: s.size_label,
          fixed_price_mrp: s.fixed_price ?? null,
        }))
      : undefined,
    designBoxOptions: (product.box_options?.length || 0) >= 2 ? product.box_options : undefined,
    designFinishOptions:
      (product.finish_options?.length || 0) >= 2 ? product.finish_options : undefined,
    size: null,
    /** Weight stays blank for silver weight-based lines so the cashier enters net wt. */
    weightGm: null,
    originalWeightGm: null,
    gross_weight: null,
    box_charges:
      (product.box_options?.length || 0) >= 2 ? null : (product.box_options?.[0]?.box_charges ?? 0),
    packaging_label: (product.box_options?.length || 0) >= 2 ? null : undefined,
    finish_label: (product.finish_options?.length || 0) >= 2 ? null : undefined,
    stone_charges: product.stone_charges ?? 0,
    mrpMode: mrpMode || undefined,
  }

  const multiFinish = (product.finish_options?.length || 0) >= 2
  if (multiFinish) {
    patch.fixed_price = null
    patch.unitInr = null
    patch.mrpListPrice = null
    patch.mrpMode = true
  }

  if (product.sizes?.length === 1) {
    const s = product.sizes[0]
    patch.size = s.size_label
    if (shouldKeepCatalogWeights(line, mrpMode) && s.net_weight != null) {
      patch.weightGm = s.net_weight
      patch.originalWeightGm = s.net_weight
    }
    if (shouldKeepCatalogWeights(line, mrpMode) && s.gross_weight != null) {
      patch.gross_weight = s.gross_weight
    }
    if (s.mc_rate != null) patch.mc_rate = s.mc_rate
    if (s.mc_type) patch.mc_type = s.mc_type
    if (s.wastage_pct != null) patch.wastage_pct = s.wastage_pct
    if (s.purity != null) patch.purity = s.purity
    if (s.fixed_price != null) {
      patch.fixed_price = s.fixed_price
      patch.mrpListPrice = s.fixed_price
      patch.mrpMode = true
    }
  }

  if (product.finish_options?.length === 1) {
    const f = product.finish_options[0]
    patch.stone_charges = f.stone_charges ?? 0
    patch.finish_label = f.label
    if (f.fixed_price != null) {
      patch.mrpListPrice = f.fixed_price
      patch.mrpMode = true
    }
  }

  if (product.box_options?.length === 1) {
    const b = product.box_options[0]
    patch.box_charges = b.box_charges ?? 0
    patch.packaging_label = b.label
  }

  if (patch.mrpMode && patch.fixed_price != null && patch.mrpListPrice == null) {
    patch.mrpListPrice = Number(patch.fixed_price)
  }

  return patch
}

/** Where focus should go after picking a catalogue product. */
export function nextFieldAfterCatalogProduct(product: DesignCatalogProduct): keyof ErpBillLine {
  if ((product.sizes?.length || 0) > 1) return 'size'
  return nextFieldAfterCatalogSize(product)
}

export function findDesignOptionLabel<T extends { label: string }>(
  options: T[] | undefined,
  label: string,
): T | undefined {
  const q = label.trim().toUpperCase()
  if (!q || !options?.length) return undefined
  return options.find((o) => o.label.trim().toUpperCase() === q)
}

export function nextFieldAfterCatalogSize(product: DesignCatalogProduct): keyof ErpBillLine {
  if (catalogProductUsesMrpPricing(product)) {
    if ((product.finish_options?.length || 0) >= 2) return 'stone_charges'
    if ((product.box_options?.length || 0) >= 2) return 'box_charges'
    return 'qty'
  }
  if ((product.finish_options?.length || 0) >= 2) return 'stone_charges'
  return 'weightGm'
}

export function patchLineFromCatalogSize(
  line: ErpBillLine,
  product: DesignCatalogProduct,
  sizeLabel: string,
): Partial<ErpBillLine> {
  const hit = product.sizes?.find((s) => s.size_label === sizeLabel)
  if (!hit) return { size: sizeLabel || null }
  const mrp = catalogProductUsesMrpPricing(product)
  const keepWt = shouldKeepCatalogWeights(line, mrp)
  return {
    size: sizeLabel,
    weightGm: keepWt ? (hit.net_weight ?? line.weightGm) : null,
    originalWeightGm: keepWt ? (hit.net_weight ?? line.originalWeightGm) : null,
    gross_weight: keepWt ? (hit.gross_weight ?? line.gross_weight) : null,
    mc_rate: hit.mc_rate ?? line.mc_rate,
    mc_type: hit.mc_type ?? line.mc_type,
    wastage_pct: hit.wastage_pct ?? line.wastage_pct,
    purity: hit.purity ?? line.purity,
    fixed_price: hit.fixed_price ?? line.fixed_price,
    box_charges: hit.box_charges ?? line.box_charges,
    ...(mrp && hit.fixed_price != null
      ? { mrpListPrice: hit.fixed_price, mrpMode: true as const }
      : {}),
  }
}

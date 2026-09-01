import type { GstInvoiceItem } from '@/components/reseller/erp/ErpGstInvoiceItemsPanel'
import type { ErpBillLine } from '@/components/reseller/erp/erp-ui'
import { applyPieceSlabToLine, type ErpRateSlab } from '@/lib/erp-billing-pricing'

/** Scanner shortcut keys in billing → invoice item category */
export type BillingManualCategory = 'articles' | 'jewellery' | 'bullion'

const CATEGORY_LABELS: Record<BillingManualCategory, string[]> = {
  articles: ['SILVER ARTICLES', 'SILVER ARTICLE'],
  jewellery: ['SILVER JEWELLERY', 'SILVER JEWELRY'],
  bullion: ['SILVER BAR', 'GRAINS', 'SILVER BULLION'],
}

export const BILLING_SCAN_SHORTCUTS: Record<string, BillingManualCategory> = {
  A: 'articles',
  S: 'jewellery',
  B: 'bullion',
}

export function resolveBillingScanShortcut(code: string): BillingManualCategory | null {
  const key = code.trim().toUpperCase()
  if (key.length !== 1) return null
  return BILLING_SCAN_SHORTCUTS[key] ?? null
}

export function findInvoiceItemForCategory(
  category: BillingManualCategory,
  items: GstInvoiceItem[],
): GstInvoiceItem | null {
  const labels = CATEGORY_LABELS[category].map((x) => x.toUpperCase())
  for (const label of labels) {
    const hit = items.find((it) => it.name.trim().toUpperCase() === label)
    if (hit) return hit
  }
  for (const label of labels) {
    const hit = items.find((it) => it.name.trim().toUpperCase().includes(label.split(' ')[0]!))
    if (hit) return hit
  }
  return null
}

export function createManualBillLine(
  category: BillingManualCategory,
  invoiceItem: GstInvoiceItem,
  slab: ErpRateSlab = 'R',
): ErpBillLine {
  const lineId = `manual-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const base: ErpBillLine = {
    name: invoiceItem.name,
    code: lineId,
    barcode: '',
    sku: undefined,
    style_code: undefined,
    size: null,
    qty: 1,
    originalWeightGm: null,
    weightGm: null,
    gross_weight: null,
    bag_wt: null,
    bags: null,
    purity: null,
    wastage_pct: null,
    ratePerGram: null,
    mc_rate: null,
    mc_type: null,
    box_charges: 0,
    stone_charges: 0,
    metal_type: 'silver',
    fixed_price: null,
    stock_piece_id: null,
    lineTotalInr: null,
    invoice_item_name: invoiceItem.name,
    hsn_code: invoiceItem.hsn,
    manualEntry: true,
    manualCategory: category,
  }
  return applyPieceSlabToLine(base, slab)
}

/** Tab order for manual entry rows after SKU is chosen */
export const MANUAL_ENTRY_FIELD_ORDER: (keyof ErpBillLine)[] = [
  'style_code',
  'sku',
  'weightGm',
  'gross_weight',
  'bags',
  'bag_wt',
  'purity',
  'wastage_pct',
  'mc_rate',
  'qty',
  'box_charges',
  'stone_charges',
]

export function nextManualEntryField(current: keyof ErpBillLine): keyof ErpBillLine | null {
  const idx = MANUAL_ENTRY_FIELD_ORDER.indexOf(current)
  if (idx < 0 || idx >= MANUAL_ENTRY_FIELD_ORDER.length - 1) return null
  return MANUAL_ENTRY_FIELD_ORDER[idx + 1] ?? null
}

export type DesignBillingStyle = {
  style_code: string
  skus: { sku: string; product_name?: string | null }[]
}

export function filterStylesForCategory(
  catalog: DesignBillingStyle[],
  query: string,
): DesignBillingStyle[] {
  const q = query.trim().toUpperCase()
  if (!q) return catalog
  return catalog.filter((s) => s.style_code.toUpperCase().includes(q))
}

export function filterSkusForStyle(
  catalog: DesignBillingStyle[],
  styleCode: string,
  query: string,
): string[] {
  const style = catalog.find((s) => s.style_code.toUpperCase() === styleCode.trim().toUpperCase())
  if (!style) return []
  const q = query.trim().toUpperCase()
  const skus = style.skus.map((s) => s.sku)
  if (!q) return skus
  return skus.filter((sku) => sku.toUpperCase().includes(q))
}

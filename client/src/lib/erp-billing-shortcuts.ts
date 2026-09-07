import type { GstInvoiceItem } from '@/components/reseller/erp/ErpGstInvoiceItemsPanel'
import type { ErpBillLine } from '@/components/reseller/erp/erp-ui'
import { applyPieceSlabToLine, type ErpRateSlab } from '@/lib/erp-billing-pricing'

/** Scanner shortcut keys in billing → invoice item category */
export type BillingManualCategory = 'articles' | 'jewellery' | 'bullion' | 'gift'

const CATEGORY_LABELS: Record<BillingManualCategory, string[]> = {
  articles: ['SILVER ARTICLES', 'SILVER ARTICLE'],
  jewellery: ['SILVER JEWELLERY', 'SILVER JEWELRY'],
  bullion: ['SILVER BAR', 'GRAINS', 'SILVER BULLION'],
  gift: ['GIFT ITEMS', 'GIFT ITEM'],
}

export const BILLING_SCAN_SHORTCUTS: Record<string, BillingManualCategory> = {
  A: 'articles',
  S: 'jewellery',
  B: 'bullion',
  G: 'gift',
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
  const isGiftOrMrp = category === 'gift' || !!invoiceItem.mrp
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
    unitInr: null,
    stock_piece_id: null,
    lineTotalInr: null,
    invoice_item_name: invoiceItem.name,
    hsn_code: invoiceItem.hsn,
    manualEntry: true,
    manualEntryOpen: true,
    manualCategory: category,
    mrpMode: isGiftOrMrp ? true : undefined,
  }
  if (isGiftOrMrp) return base
  return applyPieceSlabToLine(base, slab)
}

/** Gift flow: SKU → Style → Product → Size → PCS */
export const GIFT_ENTRY_FIELD_ORDER: (keyof ErpBillLine)[] = [
  'sku',
  'style_code',
  'name',
  'size',
  'qty',
]

/** A/S/B flow: SKU → Style → weights / rates → PCS */
export const MANUAL_ENTRY_FIELD_ORDER: (keyof ErpBillLine)[] = [
  'sku',
  'style_code',
  'weightGm',
  'gross_weight',
  'bags',
  'bag_wt',
  'purity',
  'wastage_pct',
  'ratePerGram',
  'mc_rate',
  'mc_type',
  'qty',
  'box_charges',
  'stone_charges',
]

export type DesignBillingProduct = {
  name: string
  image_url?: string | null
}

export type DesignBillingSku = {
  sku: string
  product_name?: string | null
  product_names?: DesignBillingProduct[]
  image_url?: string | null
}

export type DesignBillingStyle = {
  style_code: string
  skus: DesignBillingSku[]
}

export type FlatBillingSku = {
  sku: string
  style_code: string
  product_name?: string | null
  product_names?: DesignBillingProduct[]
  image_url?: string | null
}

function skuKey(sku: string): string {
  return sku.trim().toUpperCase()
}

/** Unique SKUs across styles — one L_STAND even if it exists under two styles. */
export function uniqueSkusFromCatalog(catalog: DesignBillingStyle[]): FlatBillingSku[] {
  const bySku = new Map<string, FlatBillingSku>()
  for (const s of catalog) {
    for (const sk of s.skus) {
      const key = skuKey(sk.sku)
      if (!key) continue
      const incoming: FlatBillingSku = {
        sku: sk.sku.trim(),
        style_code: s.style_code,
        product_name: sk.product_name,
        product_names: sk.product_names,
        image_url: sk.image_url,
      }
      const existing = bySku.get(key)
      if (!existing) {
        bySku.set(key, incoming)
        continue
      }
      const incomingScore = (incoming.product_names?.length ?? 0) + (incoming.product_name ? 1 : 0)
      const existingScore = (existing.product_names?.length ?? 0) + (existing.product_name ? 1 : 0)
      if (incomingScore > existingScore) bySku.set(key, incoming)
    }
  }
  return [...bySku.values()].sort((a, b) => a.sku.localeCompare(b.sku))
}

export function flatSkusFromCatalog(catalog: DesignBillingStyle[]): FlatBillingSku[] {
  return uniqueSkusFromCatalog(catalog)
}

export function findStylesForSku(catalog: DesignBillingStyle[], sku: string): string[] {
  const q = skuKey(sku)
  const styles: string[] = []
  const seen = new Set<string>()
  for (const s of catalog) {
    if (!s.skus.some((sk) => skuKey(sk.sku) === q)) continue
    const code = s.style_code.trim()
    const k = code.toUpperCase()
    if (seen.has(k)) continue
    seen.add(k)
    styles.push(code)
  }
  return styles
}

export function findStyleForSku(catalog: DesignBillingStyle[], sku: string): string | null {
  const unique = uniqueSkusFromCatalog(catalog)
  const hit = unique.find((x) => skuKey(x.sku) === skuKey(sku))
  if (hit) return hit.style_code
  const styles = findStylesForSku(catalog, sku)
  return styles[0] ?? null
}

export function findSkuEntry(catalog: DesignBillingStyle[], sku: string): FlatBillingSku | null {
  return uniqueSkusFromCatalog(catalog).find((x) => skuKey(x.sku) === skuKey(sku)) ?? null
}

export function productNamesForSku(catalog: DesignBillingStyle[], sku: string): DesignBillingProduct[] {
  const entry = findSkuEntry(catalog, sku)
  if (entry?.product_names?.length) return entry.product_names
  const out: DesignBillingProduct[] = []
  const seen = new Set<string>()
  for (const s of catalog) {
    for (const sk of s.skus) {
      if (skuKey(sk.sku) !== skuKey(sku)) continue
      for (const p of sk.product_names || []) {
        const k = p.name.trim().toUpperCase()
        if (!k || seen.has(k)) continue
        seen.add(k)
        out.push(p)
      }
      if (sk.product_name) {
        const k = sk.product_name.trim().toUpperCase()
        if (k && !seen.has(k)) {
          seen.add(k)
          out.push({ name: sk.product_name, image_url: sk.image_url })
        }
      }
    }
  }
  return out
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
  const unique = uniqueSkusFromCatalog(catalog)
  const style = styleCode.trim().toUpperCase()
  const scoped = style
    ? unique.filter((x) => x.style_code.toUpperCase() === style)
    : unique
  const source = scoped.length ? scoped : unique
  const q = query.trim().toUpperCase()
  const skus = source.map((s) => s.sku)
  if (!q) return skus
  return skus.filter((sku) => sku.toUpperCase().includes(q))
}

export function uniqueSkuNames(skus: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of skus) {
    const k = skuKey(raw)
    if (!k || seen.has(k)) continue
    seen.add(k)
    out.push(raw.trim())
  }
  return out
}

export function isGiftManualLine(line: ErpBillLine): boolean {
  return line.manualCategory === 'gift' || !!line.mrpMode
}

export function entryFieldOrderForLine(line: ErpBillLine): (keyof ErpBillLine)[] {
  return isGiftManualLine(line) ? GIFT_ENTRY_FIELD_ORDER : MANUAL_ENTRY_FIELD_ORDER
}

export function nextManualEntryField(
  current: keyof ErpBillLine,
  line?: ErpBillLine,
): keyof ErpBillLine | null {
  const order = line ? entryFieldOrderForLine(line) : MANUAL_ENTRY_FIELD_ORDER
  const idx = order.indexOf(current)
  if (idx < 0 || idx >= order.length - 1) return null
  return order[idx + 1] ?? null
}

export function firstManualEntryField(line: ErpBillLine): keyof ErpBillLine {
  return entryFieldOrderForLine(line)[0] ?? 'sku'
}

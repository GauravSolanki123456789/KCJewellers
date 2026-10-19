/** How auto-generated ERP stock barcodes pick their prefix (before `-` + random 5 digits). */

export type StockBarcodePrefixSource = 'product_name' | 'sku' | 'style_code'

export const DEFAULT_STOCK_BARCODE_PREFIX: StockBarcodePrefixSource = 'product_name'

export const STOCK_BARCODE_PREFIX_OPTIONS: {
  value: StockBarcodePrefixSource
  label: string
  hint: string
  example: string
}[] = [
  {
    value: 'product_name',
    label: 'Product name',
    hint: 'Uses the product name from Excel (e.g. PCPBRG-00001).',
    example: 'PCPBRG-00001-48291',
  },
  {
    value: 'sku',
    label: 'SKU',
    hint: 'Uses the SKU column from Excel.',
    example: 'AIRBRACELET-48291',
  },
  {
    value: 'style_code',
    label: 'Style code',
    hint: 'Uses the style code column (e.g. PCST).',
    example: 'PCST-48291',
  },
]

export function normalizeStockBarcodePrefix(raw: unknown): StockBarcodePrefixSource {
  const v = String(raw || '').trim().toLowerCase()
  if (v === 'sku' || v === 'style_code' || v === 'style' || v === 'stylecode') {
    return v === 'sku' ? 'sku' : 'style_code'
  }
  return 'product_name'
}

/** How auto-generated ERP stock barcodes pick their prefix (before `-` + random 5 digits). */

export type StockBarcodePrefixSource = 'product_name' | 'sku' | 'style_code' | 'none'

export const DEFAULT_STOCK_BARCODE_PREFIX: StockBarcodePrefixSource = 'product_name'

export const DEFAULT_STOCK_BARCODE_RANDOM = true

export const DEFAULT_STOCK_BARCODE_DIGIT_COUNT = 5

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
  {
    value: 'none',
    label: 'None',
    hint: 'Digits only — length set below (random or sequence).',
    example: '7678978',
  },
]

export function normalizeStockBarcodePrefix(raw: unknown): StockBarcodePrefixSource {
  const v = String(raw || '').trim().toLowerCase()
  if (v === 'sku') return 'sku'
  if (v === 'style_code' || v === 'style' || v === 'stylecode') return 'style_code'
  if (v === 'none' || v === 'digits' || v === 'numeric') return 'none'
  return 'product_name'
}

export function normalizeStockBarcodeDigitCount(raw: unknown): number {
  const n = parseInt(String(raw ?? ''), 10)
  if (!Number.isFinite(n)) return DEFAULT_STOCK_BARCODE_DIGIT_COUNT
  return Math.min(12, Math.max(4, n))
}

export function normalizeStockBarcodeRandom(raw: unknown): boolean {
  if (raw === false || raw === 0 || raw === '0' || String(raw).toLowerCase() === 'false') return false
  if (raw === true || raw === 1 || raw === '1' || String(raw).toLowerCase() === 'true') return true
  return DEFAULT_STOCK_BARCODE_RANDOM
}

export type StockBarcodeGenerationSettings = {
  prefixSource: StockBarcodePrefixSource
  randomEnabled: boolean
  digitCount: number
}

export function parseStockBarcodeSettings(settings: {
  stockBarcodePrefix?: unknown
  stockBarcodeRandomEnabled?: unknown
  stockBarcodeDigitCount?: unknown
} | null | undefined): StockBarcodeGenerationSettings {
  return {
    prefixSource: normalizeStockBarcodePrefix(settings?.stockBarcodePrefix),
    randomEnabled: normalizeStockBarcodeRandom(settings?.stockBarcodeRandomEnabled),
    digitCount: normalizeStockBarcodeDigitCount(settings?.stockBarcodeDigitCount),
  }
}

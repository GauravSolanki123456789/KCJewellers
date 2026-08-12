/**
 * Editable ERP stock piece rows — mirrors Excel column names for individual barcoded items.
 */
import type { ErpStockPiece } from '@/components/reseller/erp/erp-ui'

export type StockEditableField =
  | 'barcode'
  | 'sku'
  | 'style_code'
  | 'product_name'
  | 'size'
  | 'avg_weight'
  | 'purity'
  | 'wastage_pct'
  | 'mc_rate'
  | 'mc_type'
  | 'pcs'
  | 'box_charges'
  | 'stone_charges'
  | 'metal_type'
  | 'item_code'
  | 'image_url'
  | 'attr_color'
  | 'attr_stone'
  | 'fixed_price'
  | 'gross_weight'
  | 'chain_wt_only'
  | 'pendant_wt_only'
  | 'earring_wt_only'
  | 'bags'
  | 'bag_wt'

/** Fields that accept live weight from the connected scale (Enter to commit & next row). */
export const SCALE_CAPTURE_FIELDS: StockEditableField[] = [
  'avg_weight',
  'gross_weight',
  'chain_wt_only',
  'pendant_wt_only',
  'earring_wt_only',
]

export type StockRowDraft = {
  id: number
  status: string
  values: Record<StockEditableField, string>
}

export const STOCK_EDITOR_COLUMNS: {
  key: StockEditableField
  label: string
  shortLabel?: string
  type?: 'text' | 'number'
  scaleCapture?: boolean
}[] = [
  { key: 'barcode', label: 'Barcode', type: 'text' },
  { key: 'sku', label: 'SKU', type: 'text' },
  { key: 'style_code', label: 'StyleCode', shortLabel: 'Style', type: 'text' },
  { key: 'product_name', label: 'ProductName', shortLabel: 'Product', type: 'text' },
  { key: 'size', label: 'Size', type: 'text' },
  { key: 'avg_weight', label: 'AvgWeight', shortLabel: 'Wt (g)', type: 'number', scaleCapture: true },
  { key: 'purity', label: 'Purity', type: 'number' },
  { key: 'wastage_pct', label: 'Wastage(%)', shortLabel: 'Wast %', type: 'number' },
  { key: 'mc_rate', label: 'MCRate', shortLabel: 'MC', type: 'number' },
  { key: 'mc_type', label: 'MCType', type: 'text' },
  { key: 'pcs', label: 'PCS', type: 'number' },
  { key: 'box_charges', label: 'BoxCharges', type: 'number' },
  { key: 'stone_charges', label: 'StoneCharges', type: 'number' },
  { key: 'metal_type', label: 'MetalType', shortLabel: 'Metal', type: 'text' },
  { key: 'item_code', label: 'ItemCode', type: 'text' },
  { key: 'image_url', label: 'ImageUrl', type: 'text' },
  { key: 'attr_color', label: 'Attr:Color', type: 'text' },
  { key: 'attr_stone', label: 'Attr:Stone', type: 'text' },
  { key: 'fixed_price', label: 'FixedPrice', type: 'number' },
  { key: 'gross_weight', label: 'Gross', shortLabel: 'Gross', type: 'number', scaleCapture: true },
  { key: 'chain_wt_only', label: 'ChainWtOnly', shortLabel: 'Chain', type: 'number', scaleCapture: true },
  { key: 'pendant_wt_only', label: 'PendantWtOnly', shortLabel: 'Pendant', type: 'number', scaleCapture: true },
  { key: 'earring_wt_only', label: 'EarringWtOnly', shortLabel: 'Earring', type: 'number', scaleCapture: true },
  { key: 'bags', label: 'Bags', type: 'text' },
  { key: 'bag_wt', label: 'BagWt', shortLabel: 'Bag Wt', type: 'number' },
]

function fieldToString(val: unknown): string {
  if (val == null || val === '') return ''
  return String(val)
}

export function pieceToRowDraft(p: ErpStockPiece): StockRowDraft {
  return {
    id: p.id,
    status: p.status || 'in_stock',
    values: {
      barcode: fieldToString(p.barcode),
      sku: fieldToString(p.sku),
      style_code: fieldToString(p.style_code),
      product_name: fieldToString(p.product_name),
      size: fieldToString(p.size),
      avg_weight: fieldToString(p.avg_weight),
      purity: fieldToString(p.purity),
      wastage_pct: fieldToString(p.wastage_pct),
      mc_rate: fieldToString(p.mc_rate),
      mc_type: fieldToString(p.mc_type),
      pcs: fieldToString(p.pcs ?? 1),
      box_charges: fieldToString(p.box_charges),
      stone_charges: fieldToString(p.stone_charges),
      metal_type: fieldToString(p.metal_type),
      item_code: fieldToString(p.item_code),
      image_url: fieldToString(p.image_url),
      attr_color: fieldToString(p.attr_color),
      attr_stone: fieldToString(p.attr_stone),
      fixed_price: fieldToString(p.fixed_price),
      gross_weight: fieldToString(p.gross_weight),
      chain_wt_only: fieldToString(p.chain_wt_only),
      pendant_wt_only: fieldToString(p.pendant_wt_only),
      earring_wt_only: fieldToString(p.earring_wt_only),
      bags: fieldToString(p.bags),
      bag_wt: fieldToString(p.bag_wt),
    },
  }
}

export function rowDraftToApiPayload(d: StockRowDraft): Record<string, unknown> {
  const v = d.values
  const num = (k: StockEditableField) => {
    const n = Number(v[k])
    return v[k] === '' || !Number.isFinite(n) ? null : n
  }
  return {
    id: d.id,
    barcode: v.barcode.trim() || null,
    sku: v.sku.trim() || null,
    style_code: v.style_code.trim() || null,
    product_name: v.product_name.trim() || null,
    size: v.size.trim() || null,
    avg_weight: num('avg_weight'),
    purity: num('purity'),
    wastage_pct: num('wastage_pct'),
    mc_rate: num('mc_rate'),
    mc_type: v.mc_type.trim() || null,
    pcs: num('pcs') ?? 1,
    box_charges: num('box_charges'),
    stone_charges: num('stone_charges'),
    metal_type: v.metal_type.trim() || null,
    item_code: v.item_code.trim() || null,
    image_url: v.image_url.trim() || null,
    attr_color: v.attr_color.trim() || null,
    attr_stone: v.attr_stone.trim() || null,
    fixed_price: num('fixed_price'),
    gross_weight: num('gross_weight'),
    chain_wt_only: num('chain_wt_only'),
    pendant_wt_only: num('pendant_wt_only'),
    earring_wt_only: num('earring_wt_only'),
    bags: v.bags.trim() || null,
    bag_wt: num('bag_wt'),
  }
}

export function draftsEqual(a: StockRowDraft, b: StockRowDraft): boolean {
  return JSON.stringify(a.values) === JSON.stringify(b.values)
}

/** Parse uploaded workbook first sheet to row objects keyed by header. */
export function parseStockExcelRows(buffer: ArrayBuffer): Record<string, unknown>[] {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const XLSX = require('xlsx') as typeof import('xlsx')
  const wb = XLSX.read(buffer, { type: 'array' })
  const sheet = wb.Sheets[wb.SheetNames[0]]
  return XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: null })
}

/** Map PRN {{variables}} to ERP product columns (Excel upload / editor). */
export const LABEL_VAR_TO_ERP_COLUMN: Record<string, string> = {
  barcode: 'Barcode',
  sku: 'SKU',
  style_code: 'StyleCode',
  item_code: 'ItemCode',
  product_name: 'ProductName',
  avg_weight: 'Wt (g) / AvgWeight',
  net_weight: 'Wt (g) / AvgWeight',
  gross_weight: 'Gross (falls back to Wt (g) if empty)',
  company_code: 'Hardware → company code (e.g. BMS925)',
  metal_type: 'MetalType',
  pcs: 'PCS',
  bags: 'Bags',
}

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
  | 'stone_wt'
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
  | 'mc_rate_slab_r'
  | 'mc_rate_slab_w'
  | 'mc_rate_slab_f'
  | 'metal_slab_r_pct'
  | 'metal_slab_w_pct'
  | 'metal_slab_f_pct'

/** Fields that accept live weight from the connected scale (Enter to commit & next row). */
export const SCALE_CAPTURE_FIELDS: StockEditableField[] = [
  'avg_weight',
  'gross_weight',
  'bag_wt',
  'chain_wt_only',
  'pendant_wt_only',
  'earring_wt_only',
]

export type StockRowDraft = {
  id: number
  status: string
  rfid_tag?: string | null
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
  { key: 'gross_weight', label: 'Gross', shortLabel: 'Gross', type: 'number', scaleCapture: true },
  { key: 'bag_wt', label: 'BagWt', shortLabel: 'Bag Wt', type: 'number', scaleCapture: true },
  { key: 'purity', label: 'Purity', type: 'number' },
  { key: 'wastage_pct', label: 'Wastage(%)', shortLabel: 'Wast %', type: 'number' },
  { key: 'mc_rate', label: 'MCRate', shortLabel: 'MC', type: 'number' },
  { key: 'mc_rate_slab_r', label: 'MCRateSlabR', shortLabel: 'MC R', type: 'number' },
  { key: 'mc_rate_slab_w', label: 'MCRateSlabW', shortLabel: 'MC W', type: 'number' },
  { key: 'mc_rate_slab_f', label: 'MCRateSlabF', shortLabel: 'MC F', type: 'number' },
  { key: 'metal_slab_r_pct', label: 'MetalSlabR%', shortLabel: 'Met R%', type: 'number' },
  { key: 'metal_slab_w_pct', label: 'MetalSlabW%', shortLabel: 'Met W%', type: 'number' },
  { key: 'metal_slab_f_pct', label: 'MetalSlabF%', shortLabel: 'Met F%', type: 'number' },
  { key: 'mc_type', label: 'MCType', type: 'text' },
  { key: 'pcs', label: 'PCS', type: 'number' },
  { key: 'box_charges', label: 'BoxCharges', type: 'number' },
  { key: 'stone_charges', label: 'StoneCharges', type: 'number' },
  { key: 'stone_wt', label: 'StoneWt', shortLabel: 'Stone Wt', type: 'number' },
  { key: 'metal_type', label: 'MetalType', shortLabel: 'Metal', type: 'text' },
  { key: 'item_code', label: 'ItemCode', type: 'text' },
  { key: 'image_url', label: 'Image', type: 'text' },
  { key: 'attr_color', label: 'Attr:Color', type: 'text' },
  { key: 'attr_stone', label: 'Attr:Stone', type: 'text' },
  { key: 'fixed_price', label: 'FixedPrice', type: 'number' },
  { key: 'chain_wt_only', label: 'ChainWtOnly', shortLabel: 'Chain', type: 'number', scaleCapture: true },
  { key: 'pendant_wt_only', label: 'PendantWtOnly', shortLabel: 'Pendant', type: 'number', scaleCapture: true },
  { key: 'earring_wt_only', label: 'EarringWtOnly', shortLabel: 'Earring', type: 'number', scaleCapture: true },
  { key: 'bags', label: 'Bags', type: 'text' },
]

function fieldToString(val: unknown): string {
  if (val == null || val === '') return ''
  return String(val)
}

export function pieceToRowDraft(p: ErpStockPiece): StockRowDraft {
  return {
    id: p.id,
    status: p.status || 'in_stock',
    rfid_tag: p.rfid_tag ?? null,
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
      mc_rate_slab_r: fieldToString(p.mc_rate_slab_r),
      mc_rate_slab_w: fieldToString(p.mc_rate_slab_w),
      mc_rate_slab_f: fieldToString(p.mc_rate_slab_f),
      metal_slab_r_pct: fieldToString(p.metal_slab_r_pct),
      metal_slab_w_pct: fieldToString(p.metal_slab_w_pct),
      metal_slab_f_pct: fieldToString(p.metal_slab_f_pct),
      mc_type: fieldToString(p.mc_type),
      pcs: fieldToString(p.pcs ?? 1),
      box_charges: fieldToString(p.box_charges),
      stone_charges: fieldToString(p.stone_charges),
      stone_wt: fieldToString(p.stone_wt),
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
  const payload: Record<string, unknown> = {
    barcode: v.barcode.trim() || null,
    sku: v.sku.trim() || null,
    style_code: v.style_code.trim() || null,
    product_name: v.product_name.trim() || null,
    size: v.size.trim() || null,
    avg_weight: num('avg_weight'),
    purity: num('purity'),
    wastage_pct: num('wastage_pct'),
    mc_rate: num('mc_rate'),
    mc_rate_slab_r: num('mc_rate_slab_r'),
    mc_rate_slab_w: num('mc_rate_slab_w'),
    mc_rate_slab_f: num('mc_rate_slab_f'),
    metal_slab_r_pct: num('metal_slab_r_pct'),
    metal_slab_w_pct: num('metal_slab_w_pct'),
    metal_slab_f_pct: num('metal_slab_f_pct'),
    mc_type: v.mc_type.trim() || null,
    pcs: num('pcs') ?? 1,
    box_charges: num('box_charges'),
    stone_charges: num('stone_charges'),
    stone_wt: num('stone_wt'),
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
  if (d.id > 0) payload.id = d.id
  return payload
}

export function draftsEqual(a: StockRowDraft, b: StockRowDraft): boolean {
  return JSON.stringify(a.values) === JSON.stringify(b.values)
}

export function emptyStockRowDraft(tempId: number): StockRowDraft {
  const values = Object.fromEntries(
    STOCK_EDITOR_COLUMNS.map((c) => [c.key, '']),
  ) as Record<StockEditableField, string>
  values.pcs = '1'
  return { id: tempId, status: 'in_stock', rfid_tag: null, values }
}

export function isNewStockRowDraft(row: StockRowDraft): boolean {
  return row.id <= 0
}

function parseNum(raw: string | undefined): number | null {
  const v = raw?.trim()
  if (!v) return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

/** Net weight = gross − bag/cover − stone (when gross is set). */
export function computeNetWeightFromValues(values: Record<StockEditableField, string>): string | null {
  const gross = parseNum(values.gross_weight)
  if (gross == null) return null
  const stone = parseNum(values.stone_wt) ?? 0
  const bag = parseNum(values.bag_wt) ?? 0
  const net = gross - bag - stone
  if (!Number.isFinite(net) || net < 0) return null
  return net.toFixed(3)
}

const NET_WEIGHT_TRIGGER_FIELDS: StockEditableField[] = ['gross_weight', 'stone_wt', 'bag_wt']

export function shouldRecalcNetWeight(field: StockEditableField): boolean {
  return NET_WEIGHT_TRIGGER_FIELDS.includes(field)
}

/** Bag wt = gross − net − stone (when net and gross are both set). */
export function computeBagWtFromValues(values: Record<StockEditableField, string>): string | null {
  const gross = parseNum(values.gross_weight)
  const net = parseNum(values.avg_weight)
  if (gross == null || net == null) return null
  const stone = parseNum(values.stone_wt) ?? 0
  const bag = gross - net - stone
  if (!Number.isFinite(bag) || bag < 0) return null
  return bag.toFixed(3)
}

const BAG_WT_TRIGGER_FIELDS: StockEditableField[] = ['avg_weight', 'gross_weight', 'stone_wt']

export function shouldRecalcBagWt(field: StockEditableField): boolean {
  return BAG_WT_TRIGGER_FIELDS.includes(field)
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
  bag_wt: 'Bag Wt',
  box_name: 'Box label (e.g. DOLLAR BOX-1) — empty if no box',
  box_code: 'Box code',
  box_label: 'Box label',
  floor_name: 'Floor name',
  floor_code: 'Floor code',
}

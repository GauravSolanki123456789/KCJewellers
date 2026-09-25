import type { ErpStockPiece } from '@/components/reseller/erp/erp-ui'

export type TagEditFieldKey =
  | 'status'
  | 'barcode'
  | 'sku'
  | 'style_code'
  | 'product_name'
  | 'size'
  | 'avg_weight'
  | 'gross_weight'
  | 'bag_wt'
  | 'purity'
  | 'wastage_pct'
  | 'mc_rate'
  | 'mc_rate_slab_r'
  | 'mc_rate_slab_w'
  | 'mc_rate_slab_f'
  | 'metal_slab_r_pct'
  | 'metal_slab_w_pct'
  | 'metal_slab_f_pct'
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
  | 'chain_wt_only'
  | 'pendant_wt_only'
  | 'earring_wt_only'
  | 'bags'
  | 'rfid_tag'

export type TagEditFieldDef = {
  key: TagEditFieldKey
  label: string
  kind: 'text' | 'number' | 'status'
}

/** Display order — matches stock / label columns. */
export const TAG_EDIT_FIELD_DEFS: TagEditFieldDef[] = [
  { key: 'status', label: 'Status', kind: 'status' },
  { key: 'barcode', label: 'Barcode', kind: 'text' },
  { key: 'sku', label: 'SKU', kind: 'text' },
  { key: 'style_code', label: 'Style', kind: 'text' },
  { key: 'product_name', label: 'Product', kind: 'text' },
  { key: 'size', label: 'Size', kind: 'text' },
  { key: 'avg_weight', label: 'Wt (g)', kind: 'number' },
  { key: 'gross_weight', label: 'Gross', kind: 'number' },
  { key: 'bag_wt', label: 'Bag Wt', kind: 'number' },
  { key: 'purity', label: 'Purity', kind: 'number' },
  { key: 'wastage_pct', label: 'Wast %', kind: 'number' },
  { key: 'mc_rate', label: 'MC', kind: 'number' },
  { key: 'mc_rate_slab_r', label: 'MC R', kind: 'number' },
  { key: 'mc_rate_slab_w', label: 'MC W', kind: 'number' },
  { key: 'mc_rate_slab_f', label: 'MC F', kind: 'number' },
  { key: 'metal_slab_r_pct', label: 'Met R%', kind: 'number' },
  { key: 'metal_slab_w_pct', label: 'Met W%', kind: 'number' },
  { key: 'metal_slab_f_pct', label: 'Met F%', kind: 'number' },
  { key: 'mc_type', label: 'MCType', kind: 'text' },
  { key: 'pcs', label: 'PCS', kind: 'number' },
  { key: 'box_charges', label: 'BoxCharges', kind: 'number' },
  { key: 'stone_charges', label: 'StoneCharges', kind: 'number' },
  { key: 'stone_wt', label: 'Stone Wt', kind: 'number' },
  { key: 'metal_type', label: 'Metal', kind: 'text' },
  { key: 'item_code', label: 'ItemCode', kind: 'text' },
  { key: 'image_url', label: 'Image', kind: 'text' },
  { key: 'attr_color', label: 'Attr:Color', kind: 'text' },
  { key: 'attr_stone', label: 'Attr:Stone', kind: 'text' },
  { key: 'fixed_price', label: 'FixedPrice', kind: 'number' },
  { key: 'chain_wt_only', label: 'Chain', kind: 'number' },
  { key: 'pendant_wt_only', label: 'Pendant', kind: 'number' },
  { key: 'earring_wt_only', label: 'Earring', kind: 'number' },
  { key: 'bags', label: 'Bags', kind: 'text' },
  { key: 'rfid_tag', label: 'Tag', kind: 'text' },
]

const NUMERIC_KEYS = new Set<TagEditFieldKey>(
  TAG_EDIT_FIELD_DEFS.filter((d) => d.kind === 'number').map((d) => d.key),
)

function rawPieceValue(piece: ErpStockPiece, key: TagEditFieldKey): unknown {
  return (piece as Record<string, unknown>)[key]
}

export function tagFieldHasStoredValue(piece: ErpStockPiece, key: TagEditFieldKey): boolean {
  const v = rawPieceValue(piece, key)
  if (v === null || v === undefined) return false
  if (typeof v === 'string') return v.trim() !== ''
  if (typeof v === 'number') return Number.isFinite(v)
  return true
}

export function visibleTagEditFields(piece: ErpStockPiece): TagEditFieldDef[] {
  return TAG_EDIT_FIELD_DEFS.filter((d) => tagFieldHasStoredValue(piece, d.key))
}

export function tagEditFormFromPiece(piece: ErpStockPiece, keys: TagEditFieldKey[]): Record<string, string> {
  const out: Record<string, string> = {}
  for (const key of keys) {
    const v = rawPieceValue(piece, key)
    if (v === null || v === undefined) {
      out[key] = ''
    } else {
      out[key] = String(v)
    }
  }
  return out
}

function parseNum(raw: string): number | null {
  const t = raw.trim()
  if (!t) return null
  const n = Number(t.replace(/,/g, ''))
  return Number.isFinite(n) ? n : null
}

function parseIntQty(raw: string): number | null {
  const t = raw.trim()
  if (!t) return null
  const n = parseInt(t, 10)
  return Number.isFinite(n) && n > 0 ? n : null
}

/** Build API patch from visible form fields (numeric coercion). */
export function buildTagEditUpdatePayload(
  form: Record<string, string>,
  keys: TagEditFieldKey[],
): Record<string, unknown> {
  const patch: Record<string, unknown> = {}
  for (const key of keys) {
    const raw = form[key] ?? ''
    if (key === 'status') {
      const s = String(raw).trim()
      if (s) patch.status = s
      continue
    }
    if (key === 'pcs') {
      const n = parseIntQty(raw)
      if (n != null) patch.pcs = n
      continue
    }
    if (NUMERIC_KEYS.has(key)) {
      const n = parseNum(raw)
      patch[key] = n
      continue
    }
    const s = String(raw).trim()
    patch[key] = s || null
  }
  return patch
}

export const TAG_EDIT_STATUS_OPTIONS = [
  'in_stock',
  'sold',
  'reserved',
  'cancelled',
  'lane',
  'shadow_sold',
] as const

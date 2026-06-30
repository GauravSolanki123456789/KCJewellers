/**
 * Editable Excel-like batch row fields — mirrors ERP / Excel column names for PUT updates.
 */
import { calculateBreakdown, isFixedPriceCatalogItem, type Item } from '@/lib/pricing'
import type { ResellerProductPayload, ResellerProductSubmission } from '@/lib/reseller-products'
import { submissionToCatalogItem, submissionToPayload } from '@/lib/reseller-products'

export type BatchEditableField =
  | 'product_name'
  | 'net_weight'
  | 'purity'
  | 'wastage_pct'
  | 'mc_rate'
  | 'mc_type'
  | 'fixed_price'
  | 'metal_type'
  | 'size'
  | 'stone_charges'
  | 'box_charges'

export type BatchRowDraft = {
  id: number
  /** Display + edit values keyed by BatchEditableField */
  values: Record<BatchEditableField, string>
}

export const MC_TYPE_OPTIONS = [
  { value: 'MC/GM', label: 'MC/GM (per gram)' },
  { value: 'MC/PC', label: 'MC/PC (per piece)' },
] as const

export const BATCH_EDITOR_COLUMNS: {
  key: BatchEditableField
  label: string
  shortLabel?: string
  type?: 'text' | 'number' | 'mc_type' | 'metal'
  excelHint?: string
}[] = [
  { key: 'product_name', label: 'ProductName', shortLabel: 'Product', type: 'text' },
  { key: 'size', label: 'Size', type: 'text' },
  { key: 'net_weight', label: 'AvgWeight', shortLabel: 'Wt (g)', type: 'number', excelHint: 'g' },
  { key: 'purity', label: 'Purity', type: 'text' },
  { key: 'wastage_pct', label: 'Wastage(%)', shortLabel: 'Wast %', type: 'number' },
  { key: 'mc_rate', label: 'MCRate', shortLabel: 'MC ₹', type: 'number' },
  { key: 'mc_type', label: 'MCType', type: 'mc_type' },
  { key: 'fixed_price', label: 'FixedPrice', shortLabel: 'Fixed ₹', type: 'number' },
  { key: 'metal_type', label: 'MetalType', shortLabel: 'Metal', type: 'metal' },
]

export function normalizeMcTypeInput(raw: string): string {
  const t = String(raw || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '')
  if (t === 'MC/PC' || t === 'MCPC' || t === 'PER_PIECE' || t === 'PIECE') return 'MC/PC'
  if (t === 'MC/GM' || t === 'MCGM' || t === 'PER_GRAM' || t === 'PERGRAM') return 'MC/GM'
  return String(raw || '').trim().toUpperCase() || 'MC/GM'
}

function fieldToString(val: unknown): string {
  if (val == null || val === '') return ''
  return String(val)
}

export function submissionToRowDraft(row: ResellerProductSubmission): BatchRowDraft {
  return {
    id: row.id,
    values: {
      product_name: fieldToString(row.product_name),
      net_weight: fieldToString(row.net_weight),
      purity: fieldToString(row.purity),
      wastage_pct: fieldToString(row.wastage_pct),
      mc_rate: fieldToString(row.mc_rate),
      mc_type: normalizeMcTypeInput(fieldToString(row.mc_type) || 'MC/GM'),
      fixed_price: fieldToString(row.fixed_price),
      metal_type: fieldToString(row.metal_type || 'silver'),
      size: fieldToString(row.size),
      stone_charges: fieldToString(row.stone_charges),
      box_charges: fieldToString(row.box_charges),
    },
  }
}

export function rowDraftToApiPayload(
  draft: BatchRowDraft,
  original: ResellerProductSubmission,
): ResellerProductPayload & { wastage?: number | string; wastage_pct?: number | string } {
  const base = submissionToPayload(original)
  const v = draft.values
  return {
    ...base,
    name: v.product_name.trim() || base.name,
    size: v.size.trim() || undefined,
    netWeight: v.net_weight.trim() === '' ? undefined : v.net_weight.trim(),
    purity: v.purity.trim() || undefined,
    mcRate: v.mc_rate.trim() === '' ? undefined : v.mc_rate.trim(),
    mcType: normalizeMcTypeInput(v.mc_type),
    fixedPrice: v.fixed_price.trim() === '' ? undefined : v.fixed_price.trim(),
    metalType: v.metal_type.trim() || base.metalType,
    stoneCharges: v.stone_charges.trim() === '' ? undefined : v.stone_charges.trim(),
    boxCharges: v.box_charges.trim() === '' ? undefined : v.box_charges.trim(),
    wastage: v.wastage_pct.trim() === '' ? undefined : v.wastage_pct.trim(),
    wastage_pct: v.wastage_pct.trim() === '' ? undefined : v.wastage_pct.trim(),
    'Wastage(%)': v.wastage_pct.trim() === '' ? undefined : v.wastage_pct.trim(),
  }
}

export function draftToCatalogItem(
  draft: BatchRowDraft,
  original: ResellerProductSubmission,
): Item {
  const payload = rowDraftToApiPayload(draft, original)
  const merged: ResellerProductSubmission = {
    ...original,
    product_name: payload.name,
    size: payload.size ?? null,
    net_weight: payload.netWeight ?? null,
    purity: payload.purity ?? null,
    wastage_pct: payload.wastage_pct ?? null,
    mc_rate: payload.mcRate ?? null,
    mc_type: payload.mcType ?? null,
    fixed_price: payload.fixedPrice ?? null,
    metal_type: payload.metalType ?? null,
    stone_charges: payload.stoneCharges ?? null,
    box_charges: payload.boxCharges ?? null,
  }
  return submissionToCatalogItem(merged)
}

export function estimateRowPriceInr(
  draft: BatchRowDraft,
  original: ResellerProductSubmission,
  rates: unknown,
): number | null {
  const item = draftToCatalogItem(draft, original)
  if (isFixedPriceCatalogItem(item)) {
    const fp = Number(item.fixed_price ?? 0)
    if (!Number.isFinite(fp) || fp <= 0) return null
    return Math.round(fp * 1.03)
  }
  const mt = String(item.metal_type || '').toLowerCase()
  if (!mt.startsWith('gold') && !mt.startsWith('silver')) return null
  const net = Number(item.net_weight ?? 0)
  if (!Number.isFinite(net) || net <= 0) return null
  const b = calculateBreakdown(item, rates, 3)
  return Math.round(b.total)
}

export function draftsEqual(a: BatchRowDraft, b: BatchRowDraft): boolean {
  if (a.id !== b.id) return false
  for (const col of BATCH_EDITOR_COLUMNS) {
    const key = col.key
    if ((a.values[key] ?? '') !== (b.values[key] ?? '')) return false
  }
  return true
}

export function applyColumnValue(
  drafts: BatchRowDraft[],
  field: BatchEditableField,
  value: string,
  rowIds?: Set<number>,
): BatchRowDraft[] {
  const normalized =
    field === 'mc_type' ? normalizeMcTypeInput(value) : value
  return drafts.map((d) => {
    if (rowIds && !rowIds.has(d.id)) return d
    return {
      ...d,
      values: { ...d.values, [field]: normalized },
    }
  })
}

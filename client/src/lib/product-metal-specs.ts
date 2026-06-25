import {
  calculateBreakdown,
  getCustomerDisplayWeightLabel,
  isFixedPriceCatalogItem,
  resolveProductWastagePercent,
  snapWastagePercent,
  type Item,
  type PriceBreakdown,
} from '@/lib/pricing'

export type ProductSpecLine = { label: string; value: string }

export type ComponentWeightPart = {
  key: string
  label: string
  value: string
}

export type ProductCardMetalExtras = {
  wastage: ProductSpecLine | null
  hasComponentWeights: boolean
  componentParts: ComponentWeightPart[]
  componentSummary: string | null
}

export { snapWastagePercent }

export function formatWastagePercentLabel(pct: number): string {
  const snapped = snapWastagePercent(pct)
  if (Number.isInteger(snapped)) return `${snapped}%`
  return `${snapped.toFixed(2).replace(/\.?0+$/, '')}%`
}

function formatGm(n: number): string {
  return `${Number(n).toFixed(3).replace(/\.?0+$/, '')} gm`
}

function formatGmShort(n: number): string {
  const s = Number(n).toFixed(3).replace(/\.?0+$/, '')
  return `${s} gm`
}

function formatInr(n: number): string {
  return `₹${Math.round(n).toLocaleString('en-IN')}`
}

const COMPONENT_FIELDS: { key: 'chain_weight' | 'pendant_weight' | 'earring_weight'; label: string; short: string }[] = [
  { key: 'chain_weight', label: 'Chain weight', short: 'Chain' },
  { key: 'pendant_weight', label: 'Pendant weight', short: 'Pendant' },
  { key: 'earring_weight', label: 'Earring weight', short: 'Earring' },
]

/** Chain / pendant / earring weights from Excel optional columns. */
export function getComponentWeightLines(item: Item | null | undefined): ProductSpecLine[] {
  if (!item) return []
  const lines: ProductSpecLine[] = []
  for (const { key, label } of COMPONENT_FIELDS) {
    const n = Number(item[key] ?? 0)
    if (n > 0) lines.push({ label, value: formatGm(n) })
  }
  return lines
}

export function getComponentWeightParts(item: Item | null | undefined): ComponentWeightPart[] {
  if (!item) return []
  const parts: ComponentWeightPart[] = []
  for (const { key, label, short } of COMPONENT_FIELDS) {
    const n = Number(item[key] ?? 0)
    if (n > 0) {
      parts.push({ key, label: short, value: formatGmShort(n) })
    }
  }
  return parts
}

/** One compact line for catalogue cards: "Chain 5 gm · Pendant 1.09 gm · Earring 1.99 gm" */
export function getComponentWeightSummary(item: Item | null | undefined): string | null {
  const parts = getComponentWeightParts(item)
  if (!parts.length) return null
  return parts.map((p) => `${p.label} ${p.value}`).join(' · ')
}

export function formatComponentWeightText(item: Item | null | undefined): string | null {
  return getComponentWeightSummary(item)
}

export function shouldShowWastageForItem(item: Item | null | undefined): boolean {
  if (!item || isFixedPriceCatalogItem(item)) return false
  const mt = String(item.metal_type || '').toLowerCase()
  return mt.startsWith('gold') || mt.startsWith('silver') || mt.startsWith('diamond')
}

export function getWastageSpecLine(
  item: Item | null | undefined,
  breakdown?: PriceBreakdown | null,
): ProductSpecLine | null {
  if (!shouldShowWastageForItem(item)) return null
  const rawPct = breakdown?.wastage_pct ?? resolveProductWastagePercent(item ?? {})
  const pct = snapWastagePercent(rawPct)
  const amount = breakdown?.wastage_amount
  if (!pct || pct <= 0 || amount == null || amount <= 0) return null
  return {
    label: `Wastage (${formatWastagePercentLabel(pct).replace(/%$/, '')}%)`,
    value: formatInr(amount),
  }
}

export function getBillableWeightSpecLine(
  item: Item | null | undefined,
  breakdown?: PriceBreakdown | null,
): ProductSpecLine | null {
  if (!shouldShowWastageForItem(item)) return null
  const bill = breakdown?.billable_weight_gm
  if (bill == null || bill <= 0) return null
  const net = breakdown?.net_weight
  if (net != null && Math.abs(bill - net) < 0.0005) return null
  return { label: 'Billable weight', value: formatGm(bill) }
}

function resolveBreakdown(
  item: Item,
  rates?: unknown,
  breakdown?: PriceBreakdown | null,
): PriceBreakdown | null {
  if (breakdown) return breakdown
  if (rates != null && !isFixedPriceCatalogItem(item)) {
    return calculateBreakdown(item, rates, item.gst_rate ?? 3)
  }
  return null
}

/** Structured extras for product cards and shared catalogue (compact). */
export function getProductCardMetalExtras(
  item: Item | null | undefined,
  rates?: unknown,
  breakdown?: PriceBreakdown | null,
): ProductCardMetalExtras {
  if (!item) {
    return { wastage: null, hasComponentWeights: false, componentParts: [], componentSummary: null }
  }
  const b = resolveBreakdown(item, rates, breakdown)
  const componentParts = getComponentWeightParts(item)
  return {
    wastage: getWastageSpecLine(item, b),
    hasComponentWeights: componentParts.length > 0,
    componentParts,
    componentSummary: getComponentWeightSummary(item),
  }
}

/** Extra catalogue lines: wastage + component weights (not gift items). */
export function getProductMetalSpecLines(
  item: Item | null | undefined,
  rates?: unknown,
  breakdown?: PriceBreakdown | null,
): ProductSpecLine[] {
  if (!item) return []
  const extras = getProductCardMetalExtras(item, rates, breakdown)
  const lines: ProductSpecLine[] = []
  if (extras.wastage) lines.push(extras.wastage)
  lines.push(...getComponentWeightLines(item))
  return lines
}

/** Single-line summary for WhatsApp / PDF footers. */
export function formatProductMetalSpecSummary(
  item: Item | null | undefined,
  rates?: unknown,
  breakdown?: PriceBreakdown | null,
): string | null {
  if (!item) return null
  const extras = getProductCardMetalExtras(item, rates, breakdown)
  const parts: string[] = []
  const wt = getCustomerDisplayWeightLabel(item)
  if (wt) parts.push(`Weight: ${wt}`)
  if (extras.wastage) parts.push(`${extras.wastage.label}: ${extras.wastage.value}`)
  if (extras.componentSummary) parts.push(extras.componentSummary)
  return parts.length ? parts.join(' · ') : null
}

export function formatSharedCatalogWeightBlock(
  item: Item | null | undefined,
  rates?: unknown,
  breakdown?: PriceBreakdown | null,
): string | null {
  const wt = getCustomerDisplayWeightLabel(item)
  const extras = getProductCardMetalExtras(item, rates, breakdown)
  if (!wt && !extras.wastage && !extras.componentSummary) return null
  const lines = [
    wt ? `Weight · ${wt}` : null,
    extras.wastage ? `${extras.wastage.label} · ${extras.wastage.value}` : null,
    extras.componentSummary,
  ].filter(Boolean) as string[]
  return lines.join('\n')
}

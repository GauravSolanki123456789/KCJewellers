import {
  calculateBreakdown,
  getCustomerDisplayWeightLabel,
  isFixedPriceCatalogItem,
  resolveProductWastagePercent,
  type Item,
  type PriceBreakdown,
} from '@/lib/pricing'

export type ProductSpecLine = { label: string; value: string }

function formatGm(n: number): string {
  return `${Number(n).toFixed(3).replace(/\.?0+$/, '')} gm`
}

function formatInr(n: number): string {
  return `₹${Math.round(n).toLocaleString('en-IN')}`
}

/** Chain / pendant / earring weights from Excel optional columns. */
export function getComponentWeightLines(item: Item | null | undefined): ProductSpecLine[] {
  if (!item) return []
  const lines: ProductSpecLine[] = []
  const chain = Number(item.chain_weight ?? 0)
  const pendant = Number(item.pendant_weight ?? 0)
  const earring = Number(item.earring_weight ?? 0)
  if (chain > 0) lines.push({ label: 'Chain weight', value: formatGm(chain) })
  if (pendant > 0) lines.push({ label: 'Pendant weight', value: formatGm(pendant) })
  if (earring > 0) lines.push({ label: 'Earring weight', value: formatGm(earring) })
  return lines
}

export function formatComponentWeightText(item: Item | null | undefined): string | null {
  const lines = getComponentWeightLines(item)
  if (!lines.length) return null
  return lines.map((l) => `${l.label}: ${l.value}`).join(' · ')
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
  const pct = breakdown?.wastage_pct ?? resolveProductWastagePercent(item ?? {})
  const amount = breakdown?.wastage_amount
  if (!pct || pct <= 0 || amount == null || amount <= 0) return null
  return {
    label: `Wastage (${pct}%)`,
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

/** Extra catalogue lines: wastage + component weights (not gift items). */
export function getProductMetalSpecLines(
  item: Item | null | undefined,
  rates?: unknown,
  breakdown?: PriceBreakdown | null,
): ProductSpecLine[] {
  if (!item) return []
  const b =
    breakdown ??
    (rates != null && !isFixedPriceCatalogItem(item)
      ? calculateBreakdown(item, rates, item.gst_rate ?? 3)
      : null)
  const lines: ProductSpecLine[] = []
  const wastage = getWastageSpecLine(item, b)
  if (wastage) lines.push(wastage)
  lines.push(...getComponentWeightLines(item))
  return lines
}

/** Single-line summary for WhatsApp / PDF footers. */
export function formatProductMetalSpecSummary(
  item: Item | null | undefined,
  rates?: unknown,
  breakdown?: PriceBreakdown | null,
): string | null {
  const parts: string[] = []
  const wt = getCustomerDisplayWeightLabel(item)
  if (wt) parts.push(`Weight: ${wt}`)
  for (const line of getProductMetalSpecLines(item, rates, breakdown)) {
    parts.push(`${line.label}: ${line.value}`)
  }
  return parts.length ? parts.join(' · ') : null
}

export function formatSharedCatalogWeightBlock(
  item: Item | null | undefined,
  rates?: unknown,
  breakdown?: PriceBreakdown | null,
): string | null {
  const wt = getCustomerDisplayWeightLabel(item)
  const extras = getProductMetalSpecLines(item, rates, breakdown)
  if (!wt && !extras.length) return null
  const lines = [wt ? `Weight · ${wt}` : null, ...extras.map((e) => `${e.label} · ${e.value}`)].filter(
    Boolean,
  ) as string[]
  return lines.join('\n')
}

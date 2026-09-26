import type { ErpBillLine } from '@/components/reseller/erp/erp-ui'
import { mcSlabFieldForBillingSlab, type ErpRateSlab } from '@/lib/erp-billing-pricing'
import { billingShowsMcSlabRColumn, readMetalSlabPct } from '@/lib/erp-metal-slab-field'

export type BillTableColDef = { key: string; label: string; w?: string; edit?: boolean }

function displayText(raw: string | number | null | undefined): string {
  const s = String(raw ?? '').trim()
  if (!s || s === '—' || s === '-') return ''
  return s
}

/** Whether a collapsed table column should show for this line (any non-empty display value). */
export function collapsedBillColumnHasData(
  line: ErpBillLine,
  key: string,
  rateSlab: ErpRateSlab,
  cellText: (line: ErpBillLine, key: string) => string | number,
): boolean {
  if (key === 'amount') {
    const n = Number(line.lineTotalInr)
    return Number.isFinite(n) && n > 0
  }
  if (key === 'mc_rate_slab_r') {
    if (!billingShowsMcSlabRColumn(rateSlab)) return false
    const slabKey = mcSlabFieldForBillingSlab(rateSlab)
    const v = line[slabKey]
    return v != null && displayText(v) !== ''
  }
  if (key === 'metal_slab_pct') {
    return readMetalSlabPct(line, rateSlab) !== ''
  }
  if (key === 'box_charges') {
    const v = cellText(line, key)
    const n = Number(v)
    return displayText(v) !== '' && Number.isFinite(n) && n !== 0
  }
  if (key === 'stone_charges') {
    const v = cellText(line, key)
    const n = Number(v)
    return displayText(v) !== '' && Number.isFinite(n) && n !== 0
  }
  if (key === 'fixed_price' || key === 'fixed_price_r') {
    const v = cellText(line, key)
    return displayText(v) !== '' && Number(v) > 0
  }
  if (key === 'wastage_pct') {
    const v = cellText(line, key)
    const n = Number(v)
    return displayText(v) !== '' && Number.isFinite(n) && n !== 0
  }
  if (key === 'qty') {
    const v = cellText(line, key)
    const n = Number(v)
    return Number.isFinite(n) && n > 0 && !(line.manualCategory === 'gift' && n === 0)
  }
  const text = displayText(cellText(line, key))
  return text !== ''
}

/** Collapsed scan table: only columns used by at least one non-expanded line; amount always kept. */
export function visibleCollapsedBillTableCols(
  lines: ErpBillLine[],
  allCols: BillTableColDef[],
  rateSlab: ErpRateSlab,
  cellText: (line: ErpBillLine, key: string) => string | number,
): BillTableColDef[] {
  const collapsedLines = lines.filter((l) => !(l.manualEntry && l.manualEntryOpen))
  if (!collapsedLines.length) return allCols

  return allCols.filter((col) => {
    if (col.key === 'amount') return true
    return collapsedLines.some((line) =>
      collapsedBillColumnHasData(line, col.key, rateSlab, cellText),
    )
  })
}

export function equalCollapsedColWidthPct(colCount: number): string {
  if (colCount <= 0) return 'auto'
  return `${(100 / colCount).toFixed(2)}%`
}

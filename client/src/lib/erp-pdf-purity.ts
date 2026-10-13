import type { ErpBillLine } from '@/components/reseller/erp/erp-ui'

/** Display purity on bill / estimate PDFs (80, 92.5, 925, etc.). */
export function formatErpPdfPurity(purity: number | string | null | undefined): string {
  if (purity == null || purity === '') return ''
  const n = Number(purity)
  if (!Number.isFinite(n)) return String(purity).trim()
  if (n >= 100) return String(n / 10)
  if (n <= 99.9 && n >= 10) return String(n)
  return String(n)
}

function linePurityKey(line: ErpBillLine): string {
  return formatErpPdfPurity(line.purity)
}

/**
 * Per-line purity for tax invoice PDFs: use line purity when set; otherwise if every line
 * with the same invoice item name shares one purity, show that value.
 */
export function billLinePdfPurityText(line: ErpBillLine, allLines: ErpBillLine[]): string {
  const direct = linePurityKey(line)
  if (direct) return direct
  const itemKey = String(line.invoice_item_name || '').trim().toLowerCase()
  if (!itemKey) return ''
  const group = allLines.filter(
    (l) => String(l.invoice_item_name || '').trim().toLowerCase() === itemKey,
  )
  const keys = group.map((l) => linePurityKey(l)).filter(Boolean)
  if (!keys.length) return ''
  const first = keys[0]
  return keys.every((k) => k === first) ? first : ''
}

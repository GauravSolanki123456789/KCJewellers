import type { ErpBillLine } from '@/components/reseller/erp/erp-ui'

export function defaultInvoiceItemName(metalType?: string | null, productName?: string | null): string {
  const m = (metalType || '').toLowerCase()
  if (m.includes('gold')) return 'GOLD JEWELLERY'
  if (m.includes('silver') && m.includes('bullion')) return 'SILVER BULLION'
  if (m.includes('silver')) return 'SILVER JEWELLERY'
  if (m.includes('platinum')) return 'PLATINUM JEWELLERY'
  if (m.includes('diamond') || m.includes('fancy')) return 'FANCY JEWELLERY'
  const name = (productName || '').toLowerCase()
  if (name.includes('silver')) return 'SILVER JEWELLERY'
  if (name.includes('gold')) return 'GOLD JEWELLERY'
  return 'JEWELLERY'
}

export function defaultHsnCode(metalType?: string | null): string {
  const m = (metalType || '').toLowerCase()
  if (m.includes('gold')) return '711319'
  if (m.includes('bullion')) return '710692'
  return '711311'
}

/** Group bill lines by invoice item + HSN for tax invoice table rows. */
export function groupInvoiceLinesForTax(lines: ErpBillLine[]): ErpBillLine[] {
  const map = new Map<string, ErpBillLine>()
  for (const line of lines) {
    const itemName = (line.invoice_item_name || line.name || 'JEWELLERY').trim().toUpperCase()
    const hsn = (line.hsn_code || defaultHsnCode(line.metal_type)).trim()
    const purityKey = line.purity != null ? String(line.purity) : ''
    const rateKey = line.ratePerGram != null && !line.rateLocked ? String(line.ratePerGram) : ''
    const key = `${itemName}|${hsn}|${purityKey}|${rateKey}`
    const existing = map.get(key)
    if (existing) {
      existing.qty = (Number(existing.qty) || 1) + (Number(line.qty) || 1)
      existing.weightGm = (Number(existing.weightGm) || 0) + (Number(line.weightGm) || 0)
      existing.lineTotalInr = (Number(existing.lineTotalInr) || 0) + (Number(line.lineTotalInr) || 0)
    } else {
      map.set(key, {
        ...line,
        invoice_item_name: itemName,
        hsn_code: hsn,
        name: itemName,
        qty: line.qty ?? 1,
        weightGm: line.weightGm ?? 0,
        lineTotalInr: line.lineTotalInr ?? 0,
      })
    }
  }
  return Array.from(map.values())
}

/** Marlecha challan — one row per invoice item + HSN (merge all lines in category). */
export function isMrpInvoiceLine(
  line: ErpBillLine,
  mrpItemNames?: Set<string> | null,
): boolean {
  if (line.mrpMode || line.manualCategory === 'gift') return true
  const name = (line.invoice_item_name || line.name || '').trim().toUpperCase()
  return !!mrpItemNames?.has(name)
}

export function groupMarlechaInvoiceLines(
  lines: ErpBillLine[],
  mrpItemNames?: Set<string> | null,
): ErpBillLine[] {
  const map = new Map<string, ErpBillLine>()
  for (const line of lines) {
    const itemName = (line.invoice_item_name || line.name || 'JEWELLERY').trim().toUpperCase()
    const hsn = (line.hsn_code || defaultHsnCode(line.metal_type)).trim()
    const mrp = isMrpInvoiceLine(line, mrpItemNames)
    const key = `${itemName}|${hsn}|${mrp ? 'MRP' : 'WT'}`
    const existing = map.get(key)
    if (existing) {
      existing.qty = (Number(existing.qty) || 1) + (Number(line.qty) || 1)
      if (!mrp) {
        existing.weightGm = (Number(existing.weightGm) || 0) + (Number(line.weightGm) || 0)
        existing.gross_weight =
          (Number(existing.gross_weight) || Number(existing.weightGm) || 0) +
          (Number(line.gross_weight) || Number(line.weightGm) || 0)
      }
      existing.lineTotalInr = (Number(existing.lineTotalInr) || 0) + (Number(line.lineTotalInr) || 0)
    } else {
      map.set(key, {
        ...line,
        invoice_item_name: itemName,
        hsn_code: hsn,
        name: itemName,
        qty: line.qty ?? 1,
        weightGm: mrp ? null : line.weightGm ?? 0,
        gross_weight: mrp ? null : line.gross_weight ?? line.weightGm ?? 0,
        lineTotalInr: line.lineTotalInr ?? 0,
        mrpMode: mrp || undefined,
      })
    }
  }
  return Array.from(map.values())
}

export type SoldBillConflict = {
  barcode: string
  source?: string
  sold_bill?: {
    bill_id?: number
    bill_number?: string
    customer_name?: string | null
    mobile?: string | null
    address?: string | null
    bill_date?: string | null
    created_at?: string | null
    total_inr?: number | null
    status?: string | null
  } | null
}

export function formatSoldStockMessage(conflicts: SoldBillConflict[]): string {
  if (!conflicts.length) return 'This item is already sold.'
  const lines = conflicts.map((c) => {
    const b = c.sold_bill
    if (!b) return `${c.barcode}: already sold`
    const parts = [
      b.bill_number ? `Bill ${b.bill_number}` : null,
      b.customer_name ? `Customer: ${b.customer_name}` : null,
      b.mobile ? `Mob: ${b.mobile}` : null,
      b.address ? `Address: ${b.address}` : null,
      b.total_inr != null ? `Amount: ₹${Math.round(b.total_inr).toLocaleString('en-IN')}` : null,
    ].filter(Boolean)
    return `${c.barcode} — ${parts.join(' · ')}`
  })
  return `Stock already sold:\n${lines.join('\n')}`
}

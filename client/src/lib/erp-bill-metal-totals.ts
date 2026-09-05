import type { ErpBill, ErpBillLine } from '@/components/reseller/erp/erp-ui'

export type BillMetalTotals = {
  goldWeightGm: number
  silverWeightGm: number
  goldValueInr: number
  silverValueInr: number
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

function isGoldLine(line: ErpBillLine): boolean {
  return String(line.metal_type || '').toLowerCase().includes('gold')
}

function lineValueInr(line: ErpBillLine): number {
  const direct = Number(line.lineTotalInr)
  if (Number.isFinite(direct) && direct > 0) return direct
  const unit = Number(line.unitInr) || 0
  const qty = Number(line.qty) || 1
  return unit * qty
}

/** Sum gold/silver weight and line value for official GST bills in the current list. */
export function summarizeBillsMetalTotals(bills: ErpBill[]): BillMetalTotals {
  let goldWeightGm = 0
  let silverWeightGm = 0
  let goldValueInr = 0
  let silverValueInr = 0

  for (const bill of bills) {
    if (String(bill.status || '').toLowerCase() === 'cancelled') continue
    for (const line of bill.lines || []) {
      const wt = Number(line.weightGm) || 0
      const val = lineValueInr(line)
      if (isGoldLine(line)) {
        goldWeightGm += wt
        goldValueInr += val
      } else {
        silverWeightGm += wt
        silverValueInr += val
      }
    }
  }

  return {
    goldWeightGm: round3(goldWeightGm),
    silverWeightGm: round3(silverWeightGm),
    goldValueInr: round2(goldValueInr),
    silverValueInr: round2(silverValueInr),
  }
}

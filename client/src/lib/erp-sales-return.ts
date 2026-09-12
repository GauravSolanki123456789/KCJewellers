import type { ErpBill, ErpBillLine } from '@/components/reseller/erp/erp-ui'
import type { ErpBillSession } from '@/lib/erp-bill-session'
import {
  computeLineBreakdown,
  isPiecePricedBillLine,
  parseSlabSettingsFromUser,
  perGramToDisplayRates,
  type ErpRateSlab,
} from '@/lib/erp-billing-pricing'
import type { ResellerSlabSettings } from '@/lib/catalog-slab-pricing'

export type ReturnLine = ErpBillLine & {
  source_bill_id: number
  source_bill_number: string
  source_line_key: string
  originalTotalInr: number
  originalRatePerGram: number | null
}

export type ReturnTotals = {
  count: number
  weightGm: number
  taxable: number
  gst: number
  cgst: number
  sgst: number
  net: number
}

export function salesReturnLineKey(billId: number, line: ErpBillLine, index: number): string {
  const code = String(line.barcode || line.code || line.sku || '').trim().toLowerCase()
  return `${billId}:${code || 'line'}:${index}`
}

export function billLinesForReturn(bill: ErpBill): ReturnLine[] {
  const number = bill.bill_number
  return (bill.lines || []).map((line, index) => {
    const originalTotalInr = Number(line.lineTotalInr) || 0
    return {
      ...line,
      source_bill_id: bill.id,
      source_bill_number: number,
      source_line_key: salesReturnLineKey(bill.id, line, index),
      originalTotalInr,
      originalRatePerGram: line.ratePerGram ?? null,
    }
  })
}

function sessionFromBill(bill: ErpBill | undefined): ErpBillSession {
  return (bill?.session && typeof bill.session === 'object' ? bill.session : {}) as ErpBillSession
}

export function billedMetalRatePerG(line: ReturnLine, bill?: ErpBill): number {
  if (Number(line.originalRatePerGram) > 0) return Number(line.originalRatePerGram)
  const session = sessionFromBill(bill)
  const metal = String(line.metal_type || '').toLowerCase()
  if (metal.startsWith('gold')) return Number(session.goldPerG) || 0
  return Number(session.silverPerG) || 0
}

export function uniqueBilledRates(lines: ReturnLine[], billById: Map<number, ErpBill>): { gold: number[]; silver: number[] } {
  const gold = new Set<number>()
  const silver = new Set<number>()
  for (const line of lines) {
    const rate = billedMetalRatePerG(line, billById.get(line.source_bill_id))
    if (!(rate > 0)) continue
    const metal = String(line.metal_type || '').toLowerCase()
    if (metal.startsWith('gold')) gold.add(Math.round(rate * 1000) / 1000)
    else silver.add(Math.round(rate * 1000) / 1000)
  }
  return { gold: [...gold], silver: [...silver] }
}

function returnLineHasWeight(line: ReturnLine): boolean {
  return (Number(line.weightGm) || Number(line.originalWeightGm) || 0) > 0
}

export function recalcReturnLine(
  line: ReturnLine,
  bill: ErpBill | undefined,
  slabSettings: ResellerSlabSettings,
  mode: 'original' | 'custom',
  customGoldPerG = 0,
  customSilverPerG = 0,
): ReturnLine {
  if (mode === 'original') {
    return {
      ...line,
      ratePerGram: line.originalRatePerGram,
      lineTotalInr: line.originalTotalInr,
    }
  }

  if (isPiecePricedBillLine(line) && !returnLineHasWeight(line)) {
    return { ...line, lineTotalInr: line.originalTotalInr }
  }

  const session = sessionFromBill(bill)
  const slab = (session.rateSlab || 'R') as ErpRateSlab
  const metal = String(line.metal_type || '').toLowerCase()
  const goldPerG = customGoldPerG > 0 ? customGoldPerG : Number(session.goldPerG) || 0
  const silverPerG = customSilverPerG > 0 ? customSilverPerG : Number(session.silverPerG) || billedMetalRatePerG(line, bill)
  const ratePerGram = metal.startsWith('gold') ? goldPerG : silverPerG
  const next: ReturnLine = {
    ...line,
    rateLocked: false,
    mrpMode: false,
    manualCategory: line.manualCategory === 'gift' ? undefined : line.manualCategory,
    ratePerGram: ratePerGram > 0 ? ratePerGram : line.ratePerGram,
  }
  const rates = perGramToDisplayRates(goldPerG, silverPerG)
  const bd = computeLineBreakdown(
    next,
    rates,
    slab,
    slabSettings,
    session.wholesaleGold,
    session.wholesaleSilver,
    goldPerG,
    silverPerG,
  )
  let total = Math.round((Number(bd.total) || 0) * 100) / 100
  const oldRate = billedMetalRatePerG(line, bill)
  const rateChanged = oldRate > 0 && ratePerGram > 0 && Math.abs(ratePerGram - oldRate) > 0.0001
  if (rateChanged && (total <= 0 || Math.abs(total - line.originalTotalInr) < 0.51)) {
    total = Math.round(line.originalTotalInr * (ratePerGram / oldRate) * 100) / 100
  }
  return { ...next, lineTotalInr: total }
}

export function applyExtrasToReturnLine(
  line: ReturnLine,
  extras: { box?: number; stone?: number; amount?: number },
): ReturnLine {
  const box = Number(extras.box) || 0
  const stone = Number(extras.stone) || 0
  const amount = Number(extras.amount) || 0
  return {
    ...line,
    box_charges: (Number(line.box_charges) || 0) + box,
    stone_charges: (Number(line.stone_charges) || 0) + stone,
    lineTotalInr: Math.round(((Number(line.lineTotalInr) || 0) + amount + box + stone) * 100) / 100,
  }
}

export function computeReturnTotals(lines: ReturnLine[]): ReturnTotals {
  let weightGm = 0
  let net = 0
  for (const line of lines) {
    weightGm += Number(line.weightGm) || Number(line.originalWeightGm) || 0
    net += Number(line.lineTotalInr) || 0
  }
  net = Math.round(net * 100) / 100
  const taxable = net > 0 ? Math.round((net / 1.03) * 100) / 100 : 0
  const gst = Math.round((net - taxable) * 100) / 100
  return {
    count: lines.length,
    weightGm: Math.round(weightGm * 1000) / 1000,
    taxable,
    gst,
    cgst: Math.round((gst / 2) * 100) / 100,
    sgst: Math.round((gst / 2) * 100) / 100,
    net,
  }
}

export function parseReturnSlabSettings(raw: unknown): ResellerSlabSettings {
  return parseSlabSettingsFromUser(raw)
}

export function formatReturnWeight(gm: number | null | undefined): string {
  const n = Number(gm) || 0
  if (n <= 0) return '—'
  return `${n.toFixed(3)} g`
}

export function sourceBillsUseLaneLedger(bills: ErpBill[]): boolean {
  return bills.some((bill) => {
    const session = sessionFromBill(bill) as ErpBillSession & {
      payment_method?: string
      collected_amount_inr?: number
      ledgerScope?: string
    }
    if (String(session.ledgerScope || '').toLowerCase() === 'lane') return true
    const pay = String(session.paymentMethod || session.payment_method || '').trim().toLowerCase()
    if (pay !== 'cash') return false
    const collected = session.collectedAmountInr ?? session.collected_amount_inr
    if (collected == null || String(collected).trim() === '') return false
    const n = Number(collected)
    return Number.isFinite(n) && n >= 0
  })
}

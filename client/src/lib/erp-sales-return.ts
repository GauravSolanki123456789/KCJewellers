import type { ErpBill, ErpBillLine } from '@/components/reseller/erp/erp-ui'
import type { ErpBillSession } from '@/lib/erp-bill-session'
import {
  applyPiecePricedLineCalc,
  applyPieceSlabToLine,
  computeLineBreakdown,
  erpSlabToKind,
  isPiecePricedBillLine,
  lineHasPieceSlabFields,
  parseSlabSettingsFromUser,
  perGramToDisplayRates,
  resolveErpSilverMetalRatePerG,
  type ErpRateSlab,
} from '@/lib/erp-billing-pricing'
import { tierSettingsForSlab, type ResellerSlabSettings } from '@/lib/catalog-slab-pricing'
import {
  pieceSlabBillableWeight,
  pieceSlabMetalFraction,
} from '@/lib/erp-piece-slab-pricing'
import type { PriceBreakdown } from '@/lib/pricing'

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

function pricingSessionFromBill(bill: ErpBill | undefined): ErpBillSession {
  return sessionFromBill(bill)
}

export function returnLineMetSlabDisplay(
  line: ErpBillLine,
  slab: ErpRateSlab,
): { label: string; value: string } {
  if (lineHasPieceSlabFields(line)) {
    const frac = pieceSlabMetalFraction(line, slab)
    const pct = Math.round(frac * 10000) / 100
    return { label: `Met ${slab}%`, value: pct >= 99.99 ? '100' : String(pct) }
  }
  const purity = line.purity
  return { label: 'Purity', value: purity == null ? '' : String(purity) }
}

export type ReturnLineExportRow = {
  line: ReturnLine
  breakdown: PriceBreakdown
  netWt: number
  billWt: number
  metSlabPct: number | null
  metalRate: number
}

export function enrichReturnBillLinesForExport(
  bill: ErpBill,
  slabSettingsRaw?: unknown,
): ReturnLineExportRow[] {
  const slabSettings = parseReturnSlabSettings(slabSettingsRaw)
  const session = pricingSessionFromBill(bill) as ErpBillSession & {
    rateMode?: string
    customGoldPerG?: number | null
    customSilverPerG?: number | null
  }
  const slab = (session.rateSlab || 'R') as ErpRateSlab
  const useCustom = session.rateMode === 'custom'
  const customGold = Number(session.customGoldPerG) || 0
  const customSilver = Number(session.customSilverPerG) || 0
  const goldPerG =
    useCustom && customGold > 0 ? customGold : Number(session.goldPerG) || 0
  const silverPerG =
    useCustom && customSilver > 0
      ? customSilver
      : Number(session.silverPerG) || 0
  const rates =
    useCustom && (customGold > 0 || customSilver > 0)
      ? perGramToDisplayRates(goldPerG, silverPerG)
      : session.displayRates ?? perGramToDisplayRates(goldPerG, silverPerG)
  const goldSlabRShowMc = session.goldSlabRShowMc !== false

  return (bill.lines || []).map((rawLine) => {
    const line = rawLine as ReturnLine
    const withOriginal: ReturnLine = {
      ...line,
      originalWeightGm: line.originalWeightGm ?? line.weightGm ?? 0,
    }
    const slabLine = applyPieceSlabToLine(withOriginal, slab)
    const bd = computeLineBreakdown(
      slabLine,
      rates,
      slab,
      slabSettings,
      session.wholesaleGold,
      session.wholesaleSilver,
      goldPerG,
      silverPerG,
      goldSlabRShowMc,
    )
    const netWt = Number(withOriginal.originalWeightGm ?? withOriginal.weightGm) || 0
    const billWt = lineHasPieceSlabFields(withOriginal)
      ? pieceSlabBillableWeight(withOriginal, slab)
      : Number(slabLine.weightGm) || netWt
    const metSlabPct = lineHasPieceSlabFields(withOriginal)
      ? Math.round(pieceSlabMetalFraction(withOriginal, slab) * 10000) / 100
      : null
    const metal = String(line.metal_type || '').toLowerCase()
    let metalRate = Number(bd.rate_per_gram) || Number(line.ratePerGram) || 0
    if (!metalRate && metal.startsWith('silver') && lineHasPieceSlabFields(slabLine)) {
      const tier = tierSettingsForSlab(slabSettings, erpSlabToKind(slab), line.metal_type)
      const silverOffset =
        slab === 'R' ? Math.max(0, Number(tier.silver_rate_offset_per_g) || 0) : 0
      metalRate = resolveErpSilverMetalRatePerG(
        slab,
        silverPerG,
        session.wholesaleSilver,
        silverOffset,
      )
    } else if (!metalRate) {
      metalRate = metal.startsWith('gold') ? goldPerG : silverPerG
    }
    return { line, breakdown: bd, netWt, billWt, metSlabPct, metalRate }
  })
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

  if (isPiecePricedBillLine(line)) {
    if (!returnLineHasWeight(line)) {
      return { ...line, lineTotalInr: line.originalTotalInr }
    }
    return { ...line, ...applyPiecePricedLineCalc(line) } as ReturnLine
  }

  const session = pricingSessionFromBill(bill)
  const slab = (session.rateSlab || 'R') as ErpRateSlab
  const goldPerG = customGoldPerG > 0 ? customGoldPerG : Number(session.goldPerG) || 0
  const silverPerG =
    customSilverPerG > 0
      ? customSilverPerG
      : Number(session.silverPerG) || billedMetalRatePerG(line, bill)
  const withOriginal: ReturnLine = {
    ...line,
    originalWeightGm: line.originalWeightGm ?? line.weightGm ?? 0,
    rateLocked: false,
    mrpMode: false,
    manualCategory: line.manualCategory === 'gift' ? undefined : line.manualCategory,
  }
  const slabLine = applyPieceSlabToLine(withOriginal, slab)
  const rates =
    customGoldPerG > 0 || customSilverPerG > 0
      ? perGramToDisplayRates(goldPerG, silverPerG)
      : session.displayRates ?? perGramToDisplayRates(goldPerG, silverPerG)
  const goldSlabRShowMc = session.goldSlabRShowMc !== false
  const bd = computeLineBreakdown(
    slabLine,
    rates,
    slab,
    slabSettings,
    session.wholesaleGold,
    session.wholesaleSilver,
    goldPerG,
    silverPerG,
    goldSlabRShowMc,
  )
  const total = Math.round((Number(bd.total) || 0) * 100) / 100
  const metal = String(line.metal_type || '').toLowerCase()
  let ratePerGram = line.ratePerGram
  if (!line.rateLocked) {
    if (lineHasPieceSlabFields(slabLine) && metal.startsWith('silver')) {
      const tier = tierSettingsForSlab(slabSettings, erpSlabToKind(slab), line.metal_type)
      const silverOffset =
        slab === 'R' ? Math.max(0, Number(tier.silver_rate_offset_per_g) || 0) : 0
      ratePerGram = resolveErpSilverMetalRatePerG(
        slab,
        silverPerG,
        session.wholesaleSilver,
        silverOffset,
      )
    } else {
      ratePerGram = metal.startsWith('gold') ? goldPerG : silverPerG
    }
  }
  return {
    ...withOriginal,
    ...slabLine,
    lineTotalInr: total,
    originalWeightGm: withOriginal.originalWeightGm,
    ratePerGram: Number(ratePerGram) > 0 ? ratePerGram : line.ratePerGram,
  } as ReturnLine
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

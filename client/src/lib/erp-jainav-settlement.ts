import type { ErpBillLine } from '@/components/reseller/erp/erp-ui'
import { computeLineBreakdown, type ErpRateSlab } from '@/lib/erp-billing-pricing'
import type { ResellerSlabSettings } from '@/lib/catalog-slab-pricing'
import {
  erpLineNetWeightGm,
  lineHasMetalSlabPctInput,
  readMetalSlabPct,
} from '@/lib/erp-metal-slab-field'
import { pieceSlabBillableWeight } from '@/lib/erp-piece-slab-pricing'

export type JainavSettlementDraft = {
  metalReceivedGm: number | null
  adjustMcAgainstMetal: boolean
  mcMetalRatePerG: number | null
  settleRemainingInCash: boolean
  settlementRatePerG: number | null
  cashPaidNowInr: number | null
}

export type JainavSettlementTotals = {
  totalMetalOwedGm: number
  totalMcOwedInr: number
  metalBalanceAfterReceivedGm: number
  metalBalanceAfterMcGm: number
  finalMetalBalanceGm: number
  finalCashBalanceInr: number
  cashBalanceAfterPaidInr: number
}

export function jainavLineMetalOwedGm(line: ErpBillLine, slab: ErpRateSlab): number {
  const net = erpLineNetWeightGm(line, slab)
  if (net <= 0) return 0
  const ui = readMetalSlabPct(line, slab)
  if (ui !== '' && Number(ui) > 0) {
    return pieceSlabBillableWeight(line, slab)
  }
  if (lineHasMetalSlabPctInput(line, slab)) {
    return pieceSlabBillableWeight(line, slab)
  }
  return Math.round(net * 1000) / 1000
}

export function jainavLineMcOwedInr(
  line: ErpBillLine,
  displayRates: unknown,
  slab: ErpRateSlab,
  slabSettings: ResellerSlabSettings,
  wholesaleGold?: number | null,
  wholesaleSilver?: number | null,
  goldPerG = 0,
  silverPerG = 0,
  goldSlabRShowMc = true,
  gstEnabled = true,
): number {
  const bd = computeLineBreakdown(
    line,
    displayRates,
    slab,
    slabSettings,
    wholesaleGold,
    wholesaleSilver,
    goldPerG,
    silverPerG,
    goldSlabRShowMc,
    { gstEnabled },
  )
  return Math.round(Number(bd.mc) || 0)
}

export function sumJainavMetalOwedGm(lines: ErpBillLine[], slab: ErpRateSlab): number {
  const sum = lines.reduce((s, l) => s + jainavLineMetalOwedGm(l, slab), 0)
  return Math.round(sum * 1000) / 1000
}

export function sumJainavMcOwedInr(
  lines: ErpBillLine[],
  displayRates: unknown,
  slab: ErpRateSlab,
  slabSettings: ResellerSlabSettings,
  wholesaleGold?: number | null,
  wholesaleSilver?: number | null,
  goldPerG = 0,
  silverPerG = 0,
  goldSlabRShowMc = true,
  gstEnabled = true,
): number {
  return lines.reduce(
    (s, l) =>
      s +
      jainavLineMcOwedInr(
        l,
        displayRates,
        slab,
        slabSettings,
        wholesaleGold,
        wholesaleSilver,
        goldPerG,
        silverPerG,
        goldSlabRShowMc,
        gstEnabled,
      ),
    0,
  )
}

export function computeJainavSettlementTotals(
  totalMetalOwedGm: number,
  totalMcOwedInr: number,
  draft: JainavSettlementDraft,
): JainavSettlementTotals {
  const received = Math.max(0, Number(draft.metalReceivedGm) || 0)
  const metalBalanceAfterReceivedGm =
    Math.round((received - totalMetalOwedGm) * 1000) / 1000

  let metalBalanceAfterMcGm = metalBalanceAfterReceivedGm
  const mcRate = Number(draft.mcMetalRatePerG)
  if (draft.adjustMcAgainstMetal && mcRate > 0 && totalMcOwedInr > 0) {
    const mcAsMetal = totalMcOwedInr / mcRate
    metalBalanceAfterMcGm =
      Math.round((metalBalanceAfterReceivedGm - mcAsMetal) * 1000) / 1000
  }

  let finalMetalBalanceGm = metalBalanceAfterMcGm
  let finalCashBalanceInr = 0
  const settleRate = Number(draft.settlementRatePerG)
  if (draft.settleRemainingInCash && settleRate > 0 && metalBalanceAfterMcGm !== 0) {
    finalCashBalanceInr = Math.round(metalBalanceAfterMcGm * settleRate * 100) / 100
    finalMetalBalanceGm = 0
  } else {
    finalMetalBalanceGm = metalBalanceAfterMcGm
  }

  const paidNow = Math.max(0, Number(draft.cashPaidNowInr) || 0)
  const cashBalanceAfterPaidInr = Math.round((finalCashBalanceInr - paidNow) * 100) / 100

  return {
    totalMetalOwedGm,
    totalMcOwedInr,
    metalBalanceAfterReceivedGm,
    metalBalanceAfterMcGm,
    finalMetalBalanceGm,
    finalCashBalanceInr,
    cashBalanceAfterPaidInr,
  }
}

export function defaultJainavSettlementDraft(silverRatePerG?: number | null): JainavSettlementDraft {
  const rate = silverRatePerG != null && Number(silverRatePerG) > 0 ? Number(silverRatePerG) : null
  return {
    metalReceivedGm: null,
    adjustMcAgainstMetal: false,
    mcMetalRatePerG: rate,
    settleRemainingInCash: false,
    settlementRatePerG: rate,
    cashPaidNowInr: null,
  }
}

export type JainavSettlementSessionPayload = JainavSettlementDraft &
  JainavSettlementTotals & {
    savedAt?: string
  }

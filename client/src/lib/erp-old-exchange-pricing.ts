import type { ErpBillLine } from '@/components/reseller/erp/erp-ui'
import type { ErpRateSlab } from '@/lib/erp-billing-pricing'
import type { ResellerSlabSettings } from '@/lib/catalog-slab-pricing'
import type { PriceBreakdown } from '@/lib/pricing'

/** Extra markdown on silver ₹/g for old metal (after slab R offset). */
export const OLD_EXCHANGE_RATE_EXTRA_PCT = 3

export function isOldExchangeManualLine(line: ErpBillLine): boolean {
  return !!line.manualEntry && line.manualCategory === 'old'
}

export function defaultOldExchangeRatePerG(
  silverPerG: number,
  slab: ErpRateSlab,
  slabSettings: ResellerSlabSettings,
): number {
  const offset =
    slab === 'R' ? Math.max(0, Number(slabSettings.slab_r?.silver_rate_offset_per_g) || 0) : 0
  const afterSlab = Math.max(0, (Number(silverPerG) || 0) - offset)
  const afterOld = afterSlab * (1 - OLD_EXCHANGE_RATE_EXTRA_PCT / 100)
  return Math.round(afterOld * 100) / 100
}

export function deriveOldExchangeGrossWeight(line: ErpBillLine): number | null {
  const weight = Number(line.weightGm ?? line.originalWeightGm)
  if (!Number.isFinite(weight) || weight < 0) return null
  const dust = Number(line.oldDustStoneGm ?? 0)
  const dustAmt = Number.isFinite(dust) && dust > 0 ? dust : 0
  return Math.max(0, Math.round((weight - dustAmt) * 1000) / 1000)
}

export function deriveOldExchangeGrossPatch(
  line: ErpBillLine,
  patch: Partial<ErpBillLine> = {},
): Partial<ErpBillLine> {
  const merged = { ...line, ...patch }
  const gross = deriveOldExchangeGrossWeight(merged)
  if (gross == null) return patch
  return { ...patch, gross_weight: gross }
}

export function computeOldExchangeGrossAmount(line: ErpBillLine): number {
  const grossWt =
    deriveOldExchangeGrossWeight(line) ??
    (Number(line.gross_weight) > 0 ? Number(line.gross_weight) : 0)
  const pct = Number(line.oldExchangePct)
  const rate = Number(line.ratePerGram)
  if (grossWt <= 0 || !Number.isFinite(pct) || pct <= 0 || !Number.isFinite(rate) || rate <= 0) {
    return 0
  }
  return Math.round(grossWt * (pct / 100) * rate * 100) / 100
}

export function computeOldExchangeLineTotalInr(line: ErpBillLine): number {
  const amt = computeOldExchangeGrossAmount(line)
  return amt > 0 ? -amt : 0
}

export function computeOldExchangeBreakdown(line: ErpBillLine): PriceBreakdown {
  const total = computeOldExchangeLineTotalInr(line)
  const credit = Math.abs(total)
  return {
    metal: 0,
    mc: 0,
    stone: 0,
    cgst: 0,
    sgst: 0,
    taxable: -credit,
    total,
  }
}

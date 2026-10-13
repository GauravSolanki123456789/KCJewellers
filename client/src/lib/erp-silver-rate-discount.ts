/** Reseller option: silver ₹/g on entry → rate ÷ 103 × 100 (e.g. 226 → 219.42). */
export const MINUS_THREE_PCT_SILVER_DIVISOR = 103

export function applyMinusThreePctSilverRateInput(rate: number): number {
  if (!Number.isFinite(rate) || rate <= 0) return rate
  return Math.round((rate / MINUS_THREE_PCT_SILVER_DIVISOR) * 100 * 100) / 100
}

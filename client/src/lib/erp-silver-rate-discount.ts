/** Reseller option: entered silver ₹/g is reduced by 3% before billing (226 → 219.22). */
export const MINUS_THREE_PCT_SILVER_FACTOR = 0.97

export function applyMinusThreePctSilverRateInput(rate: number): number {
  if (!Number.isFinite(rate) || rate <= 0) return rate
  return Math.round(rate * MINUS_THREE_PCT_SILVER_FACTOR * 1000) / 1000
}

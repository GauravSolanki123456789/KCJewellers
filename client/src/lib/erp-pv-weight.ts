/** Purchase vouchers store kg internally; staff UI works in grams. */

export function pvKgToGrams(kg: number | null | undefined): number {
  const n = Number(kg)
  if (!Number.isFinite(n) || n <= 0) return 0
  return Math.round(n * 1000 * 1000) / 1000
}

export function pvGramsToKg(grams: number | null | undefined): number | null {
  const n = Number(grams)
  if (!Number.isFinite(n) || n <= 0) return null
  return Math.round((n / 1000) * 1000000) / 1000000
}

export function formatPvGrams(gm: number | null | undefined): string {
  const n = Number(gm)
  const v = Number.isFinite(n) ? Math.round(n * 1000) / 1000 : 0
  return `${v.toLocaleString('en-IN', { maximumFractionDigits: 3, minimumFractionDigits: 0 })} g`
}

export function formatPvWeightGrams(kg: number | null | undefined): string {
  return formatPvGrams(pvKgToGrams(kg))
}

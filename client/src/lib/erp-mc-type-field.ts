/** Billing grid MC type — strict mc/gm vs mc/pc. */
export const ERP_MC_TYPE_OPTIONS = [
  { value: 'mc/gm', label: 'mc/gm' },
  { value: 'mc/pc', label: 'mc/pc' },
] as const

export function normalizeMcTypeInput(raw: unknown): string | null {
  const t = String(raw ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '')
  if (!t) return null
  if (t.includes('/pc') || t.includes('perpc') || t.includes('mcpc') || t.includes('piece')) {
    return 'mc/pc'
  }
  if (t.includes('/gm') || t.includes('pergm') || t.includes('mcgm') || t === 'mc') {
    return 'mc/gm'
  }
  return 'mc/gm'
}

export function isMcTypeSelected(raw: unknown): boolean {
  return normalizeMcTypeInput(raw) != null
}

export function isMcPerGmBillingType(mcType: string | null | undefined): boolean {
  return normalizeMcTypeInput(mcType) === 'mc/gm'
}

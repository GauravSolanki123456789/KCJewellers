export const PV_CATEGORY_OPTIONS = [
  { value: 'metal', label: 'Metal' },
  { value: 'item', label: 'Item' },
  { value: 'repair', label: 'Repair' },
  { value: 'return', label: 'Return' },
  { value: 'sample', label: 'Sample' },
  { value: 'non_metal', label: 'Non metal' },
] as const

export type PvCategoryValue = (typeof PV_CATEGORY_OPTIONS)[number]['value']

export function formatPvCategoryLabel(raw?: string | null): string {
  const s = String(raw || '')
    .trim()
    .toLowerCase()
  const hit = PV_CATEGORY_OPTIONS.find((o) => o.value === s)
  if (hit) return hit.label
  if (s === 'nonmetal') return 'Non metal'
  return s ? s.replace(/_/g, ' ') : ''
}

export type DesignStyleGroupInput = {
  id?: number
  style_code: string
  metal_type?: string | null
  skus?: { metal_type?: string | null }[]
}

export const DESIGN_METAL_TYPE_OPTIONS = [
  'Gold',
  'Silver',
  'Gift Items',
  'Diamond',
  'Platinum',
  'Other',
] as const

export type DesignMetalType = (typeof DESIGN_METAL_TYPE_OPTIONS)[number]

export function inferDesignStyleMetalType(style: {
  style_code?: string
  metal_type?: string | null
  skus?: { metal_type?: string | null }[]
}): DesignMetalType {
  /** SKU metal (e.g. silver gift articles) wins over style label "Gift Items". */
  for (const sk of style.skus || []) {
    const mt = String(sk.metal_type || '').toLowerCase().trim()
    if (!mt) continue
    if (mt.startsWith('gold')) return 'Gold'
    if (mt.startsWith('silver')) return 'Silver'
    if (mt.includes('diamond')) return 'Diamond'
    if (mt.includes('platinum')) return 'Platinum'
  }
  const explicit = String(style.metal_type || '').trim()
  if (explicit) {
    const norm = normalizeDesignMetalType(explicit)
    if (norm) return norm
  }
  for (const sk of style.skus || []) {
    const mt = String(sk.metal_type || '').toLowerCase().trim()
    if (!mt) continue
    if (mt.includes('gift') || mt.includes('plated')) return 'Gift Items'
    const norm = normalizeDesignMetalType(mt)
    if (norm) return norm
  }
  const code = String(style.style_code || '').toUpperCase()
  if (code.includes('GIFT') || code.includes('PLATED')) return 'Gift Items'
  if (code.includes('GOLD') || code === '916') return 'Gold'
  if (code.includes('SILVER')) return 'Silver'
  return 'Other'
}

export function normalizeDesignMetalType(raw: string): DesignMetalType | null {
  const t = raw.trim().toLowerCase()
  if (!t) return null
  if (t.startsWith('gold') || t === '916') return 'Gold'
  if (t.startsWith('silver')) return 'Silver'
  if (t.includes('diamond')) return 'Diamond'
  if (t.includes('platinum')) return 'Platinum'
  if (t.includes('gift') || t.includes('plated')) return 'Gift Items'
  if (t === 'other') return 'Other'
  return 'Other'
}

export function groupDesignStylesByMetalType<T extends DesignStyleGroupInput & { id: number }>(
  tree: T[],
): { metalType: DesignMetalType; styles: T[] }[] {
  const buckets = new Map<DesignMetalType, T[]>()
  for (const opt of DESIGN_METAL_TYPE_OPTIONS) buckets.set(opt, [])
  for (const s of tree) {
    const mt = inferDesignStyleMetalType(s)
    buckets.get(mt)!.push(s)
  }
  return DESIGN_METAL_TYPE_OPTIONS.map((metalType) => ({
    metalType,
    styles: (buckets.get(metalType) || []).sort((a, b) => a.style_code.localeCompare(b.style_code)),
  })).filter((g) => g.styles.length > 0)
}

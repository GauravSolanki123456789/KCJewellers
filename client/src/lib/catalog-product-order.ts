/**
 * Catalogue product ordering — admin `design_group_order` on web_subcategories,
 * with new (unsaved) design groups first by recency, then saved order, then size / updated_at within group.
 */

export type CatalogProductOrderFields = {
  design_group?: string | null
  size?: string | null
  updated_at?: string | Date | null
  id?: number | string | null
}

function productUpdatedMs(p: CatalogProductOrderFields): number {
  const t = p.updated_at != null ? new Date(p.updated_at as string).getTime() : 0
  return Number.isFinite(t) ? t : 0
}

function compareCatalogSizeLabel(a: unknown, b: unknown): number {
  const sa = String(a ?? '').trim()
  const sb = String(b ?? '').trim()
  return sa.localeCompare(sb, undefined, { numeric: true, sensitivity: 'base' })
}

function normalizeSavedOrder(saved: string[] | null | undefined): string[] {
  return [...new Set((saved ?? []).map((s) => String(s).trim()).filter(Boolean))]
}

function findDesignGroupKey(groupKeys: string[], savedKey: string): string | null {
  const want = String(savedKey).trim().toLowerCase()
  if (!want) return null
  return groupKeys.find((k) => k.toLowerCase() === want) ?? null
}

/** Unknown design groups first (newest first), then admin-saved order, then any remainder A–Z. */
export function mergeDesignGroupOrderWithRecency(
  saved: string[] | null | undefined,
  discovered: string[],
  products: CatalogProductOrderFields[],
): string[] {
  const disc = [...new Set(discovered.map((s) => String(s).trim()).filter(Boolean))]
  const savedClean = normalizeSavedOrder(saved)
  const savedLower = new Set(savedClean.map((s) => s.toLowerCase()))

  const maxUpdatedByGroup = new Map<string, number>()
  for (const p of products) {
    const dg = String(p.design_group ?? '').trim()
    if (!dg) continue
    const t = productUpdatedMs(p)
    const prev = maxUpdatedByGroup.get(dg) ?? 0
    if (t > prev) maxUpdatedByGroup.set(dg, t)
  }

  const unknown = disc
    .filter((g) => !savedLower.has(g.toLowerCase()))
    .sort(
      (a, b) =>
        (maxUpdatedByGroup.get(b) ?? 0) - (maxUpdatedByGroup.get(a) ?? 0) ||
        a.localeCompare(b, undefined, { sensitivity: 'base' }),
    )

  const seen = new Set<string>()
  const out: string[] = []
  for (const g of unknown) {
    const key = g.toLowerCase()
    if (!seen.has(key)) {
      out.push(g)
      seen.add(key)
    }
  }
  for (const savedKey of savedClean) {
    const match = disc.find((g) => g.toLowerCase() === savedKey.toLowerCase())
    if (match && !seen.has(match.toLowerCase())) {
      out.push(match)
      seen.add(match.toLowerCase())
    }
  }
  for (const g of disc.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))) {
    if (!seen.has(g.toLowerCase())) {
      out.push(g)
      seen.add(g.toLowerCase())
    }
  }
  return out
}

function sortWithinDesignGroup<T extends CatalogProductOrderFields>(list: T[]): T[] {
  return [...list].sort((a, b) => {
    const sizeCmp = compareCatalogSizeLabel(a.size, b.size)
    if (sizeCmp !== 0) return sizeCmp
    const tb = productUpdatedMs(b) - productUpdatedMs(a)
    if (tb !== 0) return tb
    return Number(a.id ?? 0) - Number(b.id ?? 0)
  })
}

/** Sort products within one SKU/subcategory (storefront grid + shared brochure per SKU). */
export function sortCatalogProductsByDesignGroupOrder<T extends CatalogProductOrderFields>(
  products: T[],
  designGroupOrder: string[] | null | undefined,
): T[] {
  if (!products.length) return products

  const saved = normalizeSavedOrder(designGroupOrder)
  const savedLower = new Set(saved.map((s) => s.toLowerCase()))
  const byGroup = new Map<string, T[]>()
  const noGroup: T[] = []

  for (const p of products) {
    const dg = String(p.design_group ?? '').trim()
    if (!dg) {
      noGroup.push(p)
      continue
    }
    const bucket = byGroup.get(dg) ?? []
    bucket.push(p)
    byGroup.set(dg, bucket)
  }

  const groupKeys = [...byGroup.keys()]
  const maxUpdatedByGroup = (dg: string) =>
    Math.max(...(byGroup.get(dg) ?? []).map(productUpdatedMs), 0)

  const unknownGroups = groupKeys
    .filter((dg) => !savedLower.has(dg.toLowerCase()))
    .sort(
      (a, b) =>
        maxUpdatedByGroup(b) - maxUpdatedByGroup(a) ||
        a.localeCompare(b, undefined, { sensitivity: 'base' }),
    )

  const orderedGroupKeys = [...unknownGroups]
  const seenGroups = new Set(orderedGroupKeys.map((g) => g.toLowerCase()))
  for (const savedKey of saved) {
    const match = findDesignGroupKey(groupKeys, savedKey)
    if (match && !seenGroups.has(match.toLowerCase())) {
      orderedGroupKeys.push(match)
      seenGroups.add(match.toLowerCase())
    }
  }
  for (const dg of groupKeys.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))) {
    if (!seenGroups.has(dg.toLowerCase())) {
      orderedGroupKeys.push(dg)
      seenGroups.add(dg.toLowerCase())
    }
  }

  const out: T[] = []
  for (const dg of orderedGroupKeys) {
    out.push(...sortWithinDesignGroup(byGroup.get(dg) ?? []))
  }
  out.push(...sortWithinDesignGroup(noGroup))
  return out
}

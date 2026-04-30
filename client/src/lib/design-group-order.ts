/**
 * Merge persisted design_group order with groups present on products.
 * Uses saved order first, then appends any missing groups alphabetically.
 */
export function mergeDesignGroupOrder(
  saved: string[] | null | undefined,
  discovered: string[],
): string[] {
  const disc = [...new Set(discovered.map((s) => String(s).trim()).filter(Boolean))]
  const savedClean = [
    ...new Set(
      (saved ?? []).map((s) => String(s).trim()).filter(Boolean),
    ),
  ]
  const seen = new Set<string>()
  const out: string[] = []
  for (const k of savedClean) {
    if (disc.includes(k) && !seen.has(k)) {
      out.push(k)
      seen.add(k)
    }
  }
  for (const k of disc.sort((a, b) => a.localeCompare(b))) {
    if (!seen.has(k)) {
      out.push(k)
      seen.add(k)
    }
  }
  return out
}

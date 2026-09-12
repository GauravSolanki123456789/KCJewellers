/** Client-side gap-fill for SCB auto numbers when API is unavailable. */
export function nextScbBillNumberFromList(billNumbers: string[]): string {
  const used = new Set<number>()
  const re = /^SCB(\d+)$/i
  for (const bn of billNumbers) {
    const m = re.exec(String(bn || '').trim().toUpperCase())
    if (m) used.add(parseInt(m[1], 10))
  }
  let n = 1
  while (used.has(n)) n += 1
  const maxUsed = used.size ? Math.max(...used) : 0
  const width = Math.max(3, String(maxUsed + 1).length)
  return `SCB${String(n).padStart(width, '0')}`
}

/** Suggest next manual prefix number (e.g. SA1362 → SA1363). */
export function suggestManualBillNumberFromList(billNumbers: string[]): string | null {
  const autoPrefixes = new Set(['SCB', 'ESTIMATE', 'CREDIT', 'ORDER', 'SSR', 'DN'])
  const prefixMap = new Map<string, Set<number>>()
  for (const bn of billNumbers) {
    const m = /^([A-Z]+)(\d+)$/.exec(String(bn || '').trim().toUpperCase())
    if (!m || autoPrefixes.has(m[1])) continue
    const p = m[1]
    const num = parseInt(m[2], 10)
    if (!Number.isFinite(num)) continue
    if (!prefixMap.has(p)) prefixMap.set(p, new Set())
    prefixMap.get(p)!.add(num)
  }
  const prefixes = [...prefixMap.keys()].sort()
  if (!prefixes.length) return null
  const prefix = prefixes[prefixes.length - 1]
  const used = prefixMap.get(prefix) || new Set()
  let n = 1
  while (used.has(n)) n += 1
  const maxUsed = used.size ? Math.max(...used) : 0
  const width = Math.max(3, String(maxUsed).length)
  return `${prefix}${String(n).padStart(width, '0')}`
}

export function nextPrefixedBillNumberFromList(billNumbers: string[], prefix: string): string {
  const used = new Set<number>()
  const re = new RegExp(`^${prefix}(\\d+)$`, 'i')
  for (const bn of billNumbers) {
    const m = re.exec(String(bn || '').trim().toUpperCase())
    if (m) used.add(parseInt(m[1], 10))
  }
  let n = 1
  while (used.has(n)) n += 1
  const maxUsed = used.size ? Math.max(...used) : 0
  const width = Math.max(3, String(maxUsed + 1).length)
  return `${prefix}${String(n).padStart(width, '0')}`
}

export function nextSsrNumberFromList(billNumbers: string[]): string {
  return nextPrefixedBillNumberFromList(billNumbers, 'SSR')
}

export function nextDnNumberFromList(billNumbers: string[]): string {
  return nextPrefixedBillNumberFromList(billNumbers, 'DN')
}

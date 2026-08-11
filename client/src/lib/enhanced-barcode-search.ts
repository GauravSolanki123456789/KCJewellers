import type { EnhancedBarcodeHint } from '@/lib/reseller-enhanced-pictures'

/** Compact key for fuzzy prefix matching (sfidol028-006 → sfidol028006). */
export function compactSearchKey(raw: string): string {
  return String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/[\s_\-./\\]+/g, '')
}

export function normalizeBarcodeStem(raw: string): string {
  return String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/_+/g, '-')
}

/** Parse emerald-idol QR / label text into a barcode stem (e.g. sfidol028-006). */
export function parseProductCodeFromScan(raw: string): string | null {
  const t = String(raw || '').trim()
  if (!t) return null

  if (/^https?:\/\//i.test(t)) {
    try {
      const u = new URL(t)
      for (const key of ['code', 'sku', 'barcode', 'item', 'id']) {
        const v = u.searchParams.get(key)
        if (v) {
          const parsed = parseProductCodeFromScan(v)
          if (parsed) return parsed
        }
      }
      const pathMatch = u.pathname.match(/SFIDOL[\s\-_]*(\d+)[\s\-_]*([A-Z0-9]+)?/i)
      if (pathMatch) {
        return parseProductCodeFromScan(pathMatch[0])
      }
    } catch {
      /* ignore malformed URL */
    }
  }

  const sfidol = t.match(/SFIDOL[\s\-_]*(\d{2,4})[\s\-_]*([A-Z0-9]+)?/i)
  if (sfidol) {
    const suffix = sfidol[2] ? `-${sfidol[2].toUpperCase()}` : ''
    return normalizeBarcodeStem(`SFIDOL${sfidol[1]}${suffix}`)
  }

  const cleaned = normalizeBarcodeStem(t)
  if (/^sfidol[\d\-a-z]+$/i.test(cleaned)) return cleaned

  return null
}

function hintSearchFields(h: EnhancedBarcodeHint): string[] {
  return [
    h.stem,
    h.barcode,
    h.web_product_sku,
    h.item_code,
    h.product_name,
    h.front_filename,
    h.back_filename,
  ]
    .map((x) => String(x || '').trim())
    .filter(Boolean)
}

export function scoreBarcodeHint(h: EnhancedBarcodeHint, query: string): number {
  const q = String(query || '').trim()
  if (!q) return 0

  const cq = compactSearchKey(q)
  const ql = q.toLowerCase()
  if (!cq && !ql) return 0

  let best = 0
  for (const field of hintSearchFields(h)) {
    const fl = field.toLowerCase()
    const cf = compactSearchKey(field)

    if (fl === ql || cf === cq) {
      best = Math.max(best, 1000)
      continue
    }
    if (cf.startsWith(cq) && cq.length >= 3) {
      best = Math.max(best, 920 - Math.min(80, cf.length - cq.length))
      continue
    }
    if (fl.startsWith(ql)) {
      best = Math.max(best, 880 - Math.min(60, fl.length - ql.length))
      continue
    }
    if (cq.length >= 3 && cf.includes(cq)) {
      const idx = cf.indexOf(cq)
      best = Math.max(best, 700 - idx)
      continue
    }
    if (fl.includes(ql)) {
      best = Math.max(best, 550 - fl.indexOf(ql))
    }
  }
  return best
}

export function sortBarcodeHints(hints: EnhancedBarcodeHint[], query: string): EnhancedBarcodeHint[] {
  const q = String(query || '').trim()
  if (!q) return hints

  const minScore = q.length >= 2 ? 1 : 0
  return [...hints]
    .map((h) => ({ h, score: scoreBarcodeHint(h, q) }))
    .filter(({ score }) => score >= minScore)
    .sort((a, b) => b.score - a.score || (a.h.stem || '').localeCompare(b.h.stem || ''))
    .map(({ h }) => h)
}

export function hintDisplayCode(h: EnhancedBarcodeHint): string {
  return (
    h.item_code ||
    h.barcode ||
    h.web_product_sku ||
    h.stem ||
    h.product_name ||
    ''
  )
}

export function findBestHintMatch(
  hints: EnhancedBarcodeHint[],
  query: string,
): EnhancedBarcodeHint | null {
  const sorted = sortBarcodeHints(hints, query)
  if (!sorted.length) return null
  const topScore = scoreBarcodeHint(sorted[0], query)
  if (topScore >= 880) return sorted[0]
  const cq = compactSearchKey(query)
  if (cq.length >= 6 && topScore >= 700) return sorted[0]
  return null
}

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

/** Extract SFIDOL code from emerald-idol QR, label, or USB scanner payloads. */
export function parseProductCodeFromScan(raw: string): string | null {
  let t = String(raw || '').trim()
  if (!t) return null

  // USB / Bluetooth scanners often append CR/LF or GS separators.
  t = t.replace(/[\r\n\u0000-\u001f]+/g, ' ').trim()
  // Tab- or space-delimited batch: "SFIDOL028-006  GANESH  78.00  4.82  TSKU-..."
  const firstToken = t.split(/[\t ]+/).find(Boolean)
  if (firstToken && /^SFIDOL/i.test(firstToken)) {
    const fromToken = parseProductCodeFromScan(firstToken)
    if (fromToken) return fromToken
  }

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

  // Label text embedded in QR payload: "Code: SFIDOL028 - 006"
  const codeLabel = t.match(/Code\s*:?\s*(SFIDOL[\s\-_0-9A-Z]+)/i)
  if (codeLabel) {
    const parsed = parseProductCodeFromScan(codeLabel[1])
    if (parsed) return parsed
  }

  // Pipe / semicolon delimited payloads from some label printers
  for (const part of t.split(/[|;]+/)) {
    const p = part.trim()
    if (/^SFIDOL/i.test(p)) {
      const parsed = parseProductCodeFromScan(p)
      if (parsed) return parsed
    }
  }

  // JSON-ish payloads: {"code":"SFIDOL028-006"} or {"sku":"..."}
  if (t.startsWith('{') && t.endsWith('}')) {
    try {
      const obj = JSON.parse(t) as Record<string, unknown>
      for (const key of ['code', 'sku', 'barcode', 'item_code', 'itemCode', 'product_code']) {
        const v = obj[key]
        if (typeof v === 'string') {
          const parsed = parseProductCodeFromScan(v)
          if (parsed) return parsed
        }
      }
    } catch {
      /* not JSON */
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

const CANVAS_LABEL_SUFFIX_RE = /-(POLISHED|ANTIQUE|MATTE|SECONDARY|BOX|FRONT|BACK)$/i

function normalizeSfidolCode(raw: string): string {
  return String(raw || '')
    .toUpperCase()
    .replace(/[\s_]+/g, '-')
    .replace(/--+/g, '-')
    .replace(CANVAS_LABEL_SUFFIX_RE, '')
}

export function sanitizeCanvasLabel(raw: string): string {
  const t = String(raw || '').trim()
  if (!t) return ''

  const sfidol = t.match(/SFIDOL[\s\-_0-9A-Z]+/i)
  if (sfidol) return normalizeSfidolCode(sfidol[0])

  let upper = t.toUpperCase()
  upper = upper.replace(CANVAS_LABEL_SUFFIX_RE, '')
  const embedded = upper.match(/SFIDOL[\d\-A-Z]+/)
  if (embedded) return normalizeSfidolCode(embedded[0])
  return upper
}

/** Clean SKU/code for bottom canvas text — never filename suffixes like -POLISHED. */
export function canvasLabelFromHint(h: EnhancedBarcodeHint): string {
  const sku = String(h.web_product_sku || h.item_code || '').trim()
  if (/^SFIDOL/i.test(sku)) return sanitizeCanvasLabel(sku)
  const fromBarcode = sanitizeCanvasLabel(h.barcode || '')
  if (/^SFIDOL/i.test(fromBarcode)) return fromBarcode
  const stem = sanitizeCanvasLabel(h.stem || '')
  if (/^SFIDOL/i.test(stem)) return stem
  return sanitizeCanvasLabel(hintDisplayCode(h))
}

export function canvasLabelFromStem(stem: string, hints: EnhancedBarcodeHint[] = []): string {
  const normalized = normalizeBarcodeStem(stem)
  if (!normalized) return ''
  const match = findBestHintMatch(hints, normalized) || findBestHintMatch(hints, stem)
  if (match) return canvasLabelFromHint(match)
  return sanitizeCanvasLabel(normalized)
}

export function hintDisplayCode(h: EnhancedBarcodeHint): string {
  const sku = String(h.web_product_sku || h.item_code || '').trim()
  if (/^SFIDOL/i.test(sku)) return sku.toUpperCase()
  const barcode = sanitizeCanvasLabel(h.barcode || '')
  if (/^SFIDOL/i.test(barcode)) return barcode
  return (
    h.item_code ||
    h.web_product_sku ||
    sanitizeCanvasLabel(h.barcode || '') ||
    sanitizeCanvasLabel(h.stem || '') ||
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

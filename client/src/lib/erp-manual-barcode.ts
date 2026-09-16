const STORAGE_KEY = 'kc-erp-manual-barcodes-v1'

function loadUsed(): Set<string> {
  if (typeof window === 'undefined') return new Set()
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const list = raw ? (JSON.parse(raw) as string[]) : []
    return new Set(list.filter(Boolean))
  } catch {
    return new Set()
  }
}

function saveUsed(used: Set<string>) {
  if (typeof window === 'undefined') return
  localStorage.setItem(STORAGE_KEY, JSON.stringify([...used].slice(-5000)))
}

function randomDigits(length: number): string {
  let out = ''
  for (let i = 0; i < length; i += 1) {
    out += String(Math.floor(Math.random() * 10))
  }
  if (out[0] === '0') out = `${Math.floor(Math.random() * 9) + 1}${out.slice(1)}`
  return out
}

/** Generate a neat numeric manual barcode (6 digits, then 7, 8… when exhausted). */
export function generateManualBarcode(extraUsed: Iterable<string> = []): string {
  const used = loadUsed()
  for (const code of extraUsed) {
    const c = String(code || '').trim()
    if (c) used.add(c)
  }
  for (let len = 6; len <= 10; len += 1) {
    for (let attempt = 0; attempt < 500; attempt += 1) {
      const candidate = randomDigits(len)
      if (!used.has(candidate)) {
        used.add(candidate)
        saveUsed(used)
        return candidate
      }
    }
  }
  const fallback = randomDigits(10)
  used.add(fallback)
  saveUsed(used)
  return fallback
}

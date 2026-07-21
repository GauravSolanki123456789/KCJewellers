/** Helvetica in @react-pdf lacks ₹ and Unicode minus — normalize for reliable PDF output. */
export function sanitizePdfText(raw: string | null | undefined): string {
  if (!raw) return ''
  return String(raw)
    .replace(/\u2212/g, '-')
    .replace(/\u2013/g, '-')
    .replace(/\u2014/g, '-')
    .replace(/₹/g, 'Rs.')
}

/** Strip "Weight:" / "Weight ·" prefix — column header already says Weight. */
export function stripPdfWeightPrefix(raw: string | null | undefined): string | null {
  if (!raw) return null
  const t = String(raw)
    .trim()
    .replace(/^Weight:\s*/i, '')
    .replace(/^Weight\s*[·•]\s*/i, '')
    .trim()
  return t || null
}

export function isPdfWeightOnlySpec(raw: string | null | undefined): boolean {
  if (!raw) return false
  return /^Weight:\s*/i.test(String(raw).trim())
}

/** Bare weight for table cells, e.g. `65.00 gm`. */
export function pdfTableWeightText(
  weightText: string | null | undefined,
  specText: string | null | undefined,
): string {
  const fromWeight = stripPdfWeightPrefix(weightText)
  if (fromWeight) return sanitizePdfText(fromWeight)
  if (specText && isPdfWeightOnlySpec(specText)) {
    const fromSpec = stripPdfWeightPrefix(specText)
    if (fromSpec) return sanitizePdfText(fromSpec)
  }
  if (specText?.trim()) return sanitizePdfText(specText)
  return '—'
}

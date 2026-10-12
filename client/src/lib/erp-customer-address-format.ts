function normalizeLineEndings(raw: string): string {
  return String(raw || '')
    .replace(/\\n/g, '\n')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
}

/** Split a single-line comma-separated address into up to three lines. */
export function formatAddressToThreeLines(raw: string | null | undefined): string {
  const t = normalizeLineEndings(String(raw || '')).trim()
  if (!t) return ''

  const byNl = t
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean)
  if (byNl.length >= 2) {
    if (byNl.length === 3) return byNl.join('\n')
    if (byNl.length === 2) return byNl.join('\n')
    return [byNl[0], byNl.slice(1, -1).join(', '), byNl[byNl.length - 1]].join('\n')
  }

  const parts = t
    .split(/,\s*/)
    .map((s) => s.trim())
    .filter(Boolean)
  if (parts.length <= 1) return t
  if (parts.length === 2) return parts.join('\n')
  if (parts.length === 3) return parts.join('\n')
  return [parts[0], parts.slice(1, -1).join(', '), parts[parts.length - 1]].join('\n')
}

/**
 * CRM / PDF storage: keep explicit user line breaks; only auto-split comma-separated single lines.
 */
export function normalizeAddressField(raw: string | null | undefined): string {
  const t = normalizeLineEndings(String(raw ?? '')).trim()
  if (!t) return ''

  const explicitLines = t
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)

  if (explicitLines.length >= 2) {
    return explicitLines.slice(0, 3).join('\n')
  }

  return formatAddressToThreeLines(t)
}

export function splitAddressLines(raw: string | null | undefined): string[] {
  const formatted = normalizeAddressField(raw)
  if (!formatted) return []
  return formatted
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean)
}

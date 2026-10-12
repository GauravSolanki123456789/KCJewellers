/** Normalize CRM / GST addresses to up to three printable lines (newline-separated). */
export function formatAddressToThreeLines(raw: string | null | undefined): string {
  const t = String(raw || '').trim()
  if (!t) return ''

  const byNl = t
    .split(/\r?\n/)
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

export function splitAddressLines(raw: string | null | undefined): string[] {
  const formatted = formatAddressToThreeLines(raw)
  if (!formatted) return []
  return formatted
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean)
}

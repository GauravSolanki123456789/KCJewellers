/** Map template key/label to the default Style · background colour swatch. */
export function normalizeBackgroundPreset(raw?: string | null): string {
  const bg = String(raw || 'charcoal').trim().toLowerCase()
  if (bg === 'navy') return 'blue'
  return bg
}

/** Map template key/label to the default Style · background colour swatch. */
export function defaultBackgroundForTemplate(
  templateKey?: string | null,
  templateLabel?: string | null,
  varietyKey?: string | null,
  varietyLabel?: string | null,
): string {
  const combined = `${templateKey || ''} ${templateLabel || ''} ${varietyKey || ''} ${varietyLabel || ''}`.toLowerCase()
  if (/\bwhite\b/.test(combined) || combined.includes('white-layout')) return 'white'
  if (/\bblue\b/.test(combined) || /\bnavy\b/.test(combined)) return 'blue'
  // Black Layout + emerald idols (and all Black Layout templates) → Navy studio reference look
  if (/\bblack\b/.test(combined) || combined.includes('black-layout') || combined.includes('black_layout')) {
    return 'blue'
  }
  if (/\bemerald\b/.test(combined)) return 'emerald'
  if (/\bcream\b/.test(combined) || /\bivory\b/.test(combined)) return 'cream'
  if (/\bred\b/.test(combined) || /\bburgundy\b/.test(combined)) return 'red'
  return 'charcoal'
}

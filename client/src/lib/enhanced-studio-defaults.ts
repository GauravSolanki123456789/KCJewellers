/** Map template key/label to the default Style · background colour swatch. */
export function defaultBackgroundForTemplate(
  templateKey?: string | null,
  templateLabel?: string | null,
): string {
  const combined = `${templateKey || ''} ${templateLabel || ''}`.toLowerCase()
  if (/\bwhite\b/.test(combined) || combined.includes('white-layout')) return 'white'
  if (/\bblue\b/.test(combined) || /\bnavy\b/.test(combined)) return 'blue'
  if (/\bblack\b/.test(combined)) return 'black'
  if (/\bemerald\b/.test(combined)) return 'emerald'
  if (/\bcream\b/.test(combined) || /\bivory\b/.test(combined)) return 'cream'
  if (/\bred\b/.test(combined) || /\bburgundy\b/.test(combined)) return 'red'
  return 'charcoal'
}

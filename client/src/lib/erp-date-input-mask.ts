/** Live dd/mm/yyyy mask — digits only while typing; validates on blur. */

export function digitsFromDateInput(raw: string): string {
  return String(raw || '').replace(/\D/g, '').slice(0, 8)
}

export function maskDdMmYyyyFromDigits(digits: string): string {
  const d = digitsFromDateInput(digits)
  if (d.length <= 2) return d
  if (d.length <= 4) return `${d.slice(0, 2)}/${d.slice(2)}`
  return `${d.slice(0, 2)}/${d.slice(2, 4)}/${d.slice(4)}`
}

/** Map caret position in masked string after reformat from digit-only edit. */
export function caretAfterMaskEdit(prevMasked: string, nextMasked: string, prevCaret: number): number {
  const digitsBefore = digitsFromDateInput(prevMasked.slice(0, Math.max(0, prevCaret))).length
  let seen = 0
  for (let i = 0; i < nextMasked.length; i += 1) {
    if (/\d/.test(nextMasked[i]!)) {
      seen += 1
      if (seen >= digitsBefore) return i + 1
    }
  }
  return nextMasked.length
}

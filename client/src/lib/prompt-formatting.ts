/** Normalize line endings — preserve intentional structure for AI prompts. */
export function normalizePromptNewlines(text: string | null | undefined): string {
  return String(text ?? '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
}

const SECTION_MARKERS = [
  'STRICT PRODUCT PRESERVATION:',
  'Preserve 100%:',
  'SCENE:',
  'QUALITY:',
  'BACKGROUND DETAILS:',
  'TEXT AREA:',
  'NEGATIVE PROMPT:',
  'Camera:',
  'Lighting should resemble luxury premium brand photography:',
]

/** Repair prompts that lost line breaks (common paste / old saves). */
export function repairPromptFormatting(text: string | null | undefined): string {
  let s = normalizePromptNewlines(text).trim()
  if (!s) return ''

  const newlineCount = (s.match(/\n/g) || []).length
  if (newlineCount >= 8) return s

  for (const marker of SECTION_MARKERS) {
    const escaped = marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    s = s.replace(new RegExp(`(?<!\\n)${escaped}`, 'g'), `\n\n${marker}`)
  }

  s = s.replace(/:([A-Z])/g, ':\n$1')

  s = s.replace(/•\s*/g, '\n• ')
  s = s.replace(/(?<!\\n)(No [a-z])/gi, '\n$1')
  s = s.replace(/\n{3,}/g, '\n\n').trim()
  return s
}

/** Split embedded NEGATIVE PROMPT block from master prompt into separate fields. */
export function splitMasterAndNegative(
  promptText: string,
  negativePrompt: string,
): { promptText: string; negativePrompt: string } {
  let master = repairPromptFormatting(promptText)
  let neg = repairPromptFormatting(negativePrompt)

  const re = /\n\nNEGATIVE PROMPT:\s*\n/i
  const match = master.match(re)
  if (match && match.index != null) {
    const idx = match.index
    const embedded = master.slice(idx + match[0].length).trim()
    master = master.slice(0, idx).trim()
    if (embedded && (!neg || neg.length < 10)) neg = embedded
  }

  return { promptText: master, negativePrompt: neg }
}

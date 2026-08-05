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

/** Remove embedded sample image data URIs from pasted prompts. */
export function stripSampleImgMarkers(text: string | null | undefined): string {
  return String(text ?? '')
    .replace(/\[SampleImg:\s*data:image[^\]]*\]/gi, '')
    .replace(/\[SampleImg:[^\]]*\]/gi, '')
}

/** Normalize line endings and strip sample markers — never restructure user text. */
export function normalizePromptText(text: string | null | undefined): string {
  return stripSampleImgMarkers(normalizePromptNewlines(text)).trim()
}

/** Remove blank / whitespace-only lines only — used by "Fix line breaks". */
export function removeEmptyPromptLines(text: string | null | undefined): string {
  return normalizePromptNewlines(text)
    .split('\n')
    .filter((line) => line.trim() !== '')
    .join('\n')
}

/**
 * Repair prompts that lost line breaks (legacy single-line saves).
 * Not used on save/load — only for optional recovery of mashed text.
 */
export function repairPromptFormatting(text: string | null | undefined): string {
  let s = normalizePromptText(text)
  if (!s) return ''

  const newlineCount = (s.match(/\n/g) || []).length
  if (newlineCount >= 8) return s

  for (const marker of SECTION_MARKERS) {
    const escaped = marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    s = s.replace(new RegExp(`(?<!\\n)${escaped}`, 'g'), `\n\n${marker}`)
  }

  s = s.replace(/([a-z])([A-Z])/g, '$1\n$2')
  s = s.replace(/:([A-Z])/g, ':\n$1')
  s = s.replace(/•\s*/g, '\n• ')
  s = s.replace(/(?<!\\n)(No [a-z])/gi, '\n$1')
  s = s.replace(/\n{3,}/g, '\n\n').trim()
  return s
}

/** Split workflow highlights pasted as one mashed line (e.g. PreservationProfessional…). */
export function parseWorkflowHighlightsText(raw: string | null | undefined): string[] {
  const trimmed = String(raw ?? '').trim()
  if (!trimmed) return []
  try {
    const parsed = JSON.parse(trimmed)
    if (Array.isArray(parsed)) {
      return parsed.map((x) => String(x).trim()).filter(Boolean)
    }
  } catch {
    /* plain text */
  }
  let text = trimmed
  if (!text.includes('\n')) {
    text = text
      .replace(/(\d+%)/g, '$1\n')
      .replace(/([a-z])([A-Z])/g, '$1\n$2')
      .replace(/(Preservation)(Professional)/gi, '$1\n$2')
      .replace(/(Lighting)(High)/gi, '$1\n$2')
      .replace(/(Textures)(Cinematic)/gi, '$1\n$2')
      .replace(/(Backgrounds)(AI)/gi, '$1\n$2')
  }
  return text
    .split(/\r?\n/)
    .map((x) => x.replace(/^[-•*]\s*/, '').trim())
    .filter(Boolean)
}

const EMBEDDED_NEGATIVE_RE = /\n+NEGATIVE PROMPT:\s*(?:\n|$)/i

/** Split embedded NEGATIVE PROMPT block from master prompt into separate fields. */
export function splitMasterAndNegative(
  promptText: string,
  negativePrompt: string,
): { promptText: string; negativePrompt: string } {
  let master = normalizePromptText(promptText)
  let neg = normalizePromptText(negativePrompt)

  const match = master.match(EMBEDDED_NEGATIVE_RE)
  if (match && match.index != null) {
    const idx = match.index
    const embedded = master.slice(idx + match[0].length).trim()
    master = master.slice(0, idx).trim()
    if (embedded && (!neg || neg.length < 10)) neg = embedded
  }

  return { promptText: master, negativePrompt: neg }
}

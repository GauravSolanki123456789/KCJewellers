import { DEFAULT_LABEL_PRN_3ACROSS } from '@/lib/erp-print-templates'

const TSPL_LAYOUT_DIRECTIVE_RE =
  /^(COLUMNS|COLUMN_PITCH|COLUMN_GAP|LABEL_WIDTH|LABEL_HEIGHT|DPI)\b/i
const TSPL_DRAW_CMD_RE =
  /^(TEXT|BARCODE|QRCODE|BITMAP|PUTBMP|BOX|BAR|BLOCK|CIRCLE|ELLIPSE|ERASE|DMATRIX|PDF417|AZTEC|CODABLOCK|MAXICODE|TLC39)\b/i
const TSPL_HEADER_CMD_RE =
  /^(SIZE|GAP|DIRECTION|REFERENCE|OFFSET|SET|CODEPAGE|CLS|SPEED|DENSITY|SHIFT)\b/i

function tsplDotsPerMm(dpi: number) {
  if (Number.isFinite(dpi) && dpi >= 150) return dpi / 25.4
  return 8
}

function parseTsplLengthToDots(raw: string, dpi: number) {
  const s = String(raw || '').trim()
  const mm = s.match(/^(-?[\d.]+)\s*mm$/i)
  if (mm) {
    const v = parseFloat(mm[1])
    if (!Number.isFinite(v)) return null
    return Math.round(v * tsplDotsPerMm(dpi))
  }
  const n = Number(s)
  return Number.isFinite(n) ? Math.round(n) : null
}

function labelWidthMmFromTspl(tspl: string) {
  const m = String(tspl || '').match(/^SIZE\s+([\d.]+)\s*mm\s*,\s*([\d.]+)\s*mm/im)
  if (!m) return null
  const w = parseFloat(m[1])
  return Number.isFinite(w) ? w : null
}

function isTsplLayoutDirective(line: string) {
  return TSPL_LAYOUT_DIRECTIVE_RE.test(String(line || '').trim())
}

function stripTsplLayoutDirectives(tspl: string) {
  return String(tspl || '')
    .split('\n')
    .filter((line) => !isTsplLayoutDirective(line))
    .join('\n')
}

function columnPitchDotsFromSheet(tspl: string, columns: number, dpi: number) {
  const cols = Math.max(1, columns || 1)
  const widthMm = labelWidthMmFromTspl(tspl)
  if (widthMm && cols > 0) {
    return Math.round((widthMm / cols) * tsplDotsPerMm(dpi))
  }
  return Math.round(34.67 * tsplDotsPerMm(dpi))
}

export type TsplMultiColumnLayout = {
  columns: number
  columnPitchDots: number
  dpi: number
}

export function parseTsplMultiColumnLayout(tspl: string): TsplMultiColumnLayout {
  const lines = String(tspl || '').split('\n')
  let columns = 1
  let columnPitchDots = 0
  let dpi = 203
  for (const line of lines) {
    const t = line.trim()
    const col = t.match(/^COLUMNS\s+(\d+)/i)
    if (col) {
      const n = parseInt(col[1], 10)
      if (Number.isFinite(n) && n > 0) columns = Math.min(12, n)
      continue
    }
    const dpiM = t.match(/^DPI\s+(\d+)/i)
    if (dpiM) {
      const n = parseInt(dpiM[1], 10)
      if (Number.isFinite(n) && n >= 150) dpi = n
      continue
    }
    const pitch = t.match(/^COLUMN_PITCH\s+(.+)$/i)
    if (pitch) {
      const dots = parseTsplLengthToDots(pitch[1], dpi)
      if (dots != null) columnPitchDots = dots
    }
  }
  if (columns <= 1) return { columns: 1, columnPitchDots: 0, dpi }
  if (!(columnPitchDots > 0)) {
    columnPitchDots = columnPitchDotsFromSheet(tspl, columns, dpi)
  }
  return { columns, columnPitchDots, dpi }
}

function shiftTsplDrawX(body: string, dxDots: number) {
  const dx = Math.round(Number(dxDots) || 0)
  if (!dx) return body
  return String(body || '')
    .split('\n')
    .map((line) => {
      const t = line.trim()
      if (!TSPL_DRAW_CMD_RE.test(t)) return line
      return line.replace(/^(\s*[A-Z]+)(\s+)(-?\d+)(\s*,)/i, (_, cmd, sp, x, comma) => {
        return `${cmd}${sp}${Number(x) + dx}${comma}`
      })
    })
    .join('\n')
}

function splitTsplLabelParts(tspl: string) {
  const lines = String(tspl || '').split('\n')
  const header: string[] = []
  const body: string[] = []
  const trailer: string[] = []
  let seenDraw = false
  for (const line of lines) {
    const t = line.trim()
    if (!t) {
      if (seenDraw) body.push(line)
      else header.push(line)
      continue
    }
    if (isTsplLayoutDirective(t)) continue
    if (/^PRINT\b/i.test(t)) {
      trailer.push(line)
      continue
    }
    if (!seenDraw && (TSPL_HEADER_CMD_RE.test(t) || /^REM\b/i.test(t))) {
      header.push(line)
      continue
    }
    seenDraw = true
    if (/^CLS\b/i.test(t)) continue
    body.push(line)
  }
  if (!trailer.length) trailer.push('PRINT 1,1')
  return {
    header: header.join('\n').trim(),
    body: body.join('\n').trim(),
    trailer: trailer.join('\n').trim(),
  }
}

export function composeTsplMultiColumnRow(tsplList: string[], layout: TsplMultiColumnLayout) {
  const list = (tsplList || []).filter(Boolean)
  if (!list.length) return ''
  const cols = Math.max(1, layout?.columns || 1)
  let pitch = Math.max(0, Number(layout?.columnPitchDots) || 0)
  if (cols > 1 && !pitch) {
    pitch = columnPitchDotsFromSheet(list[0], cols, layout?.dpi || 203)
  }
  const first = splitTsplLabelParts(list[0])
  if (cols <= 1 || !pitch) {
    return stripTsplLayoutDirectives(list[0]).trim()
  }
  const bodies = list.slice(0, cols).map((tspl, idx) => {
    const parts = splitTsplLabelParts(tspl)
    return shiftTsplDrawX(parts.body, idx * pitch)
  })
  return [first.header, 'CLS', ...bodies, first.trailer].filter(Boolean).join('\n').trim()
}

export function tsplLooksThreeAcrossCell(tspl: string) {
  const s = String(tspl || '')
  return (
    /SIZE\s+104\s*mm\s*,\s*22\s*mm/i.test(s) ||
    /\bCOLUMNS\s+3\b/i.test(s) ||
    /TEXT\s+3\s*,\s*4\b/i.test(s)
  )
}

export type TsplPrintJob = { tspl: string; barcodes: string[]; pieceCount?: number }

/** Merge single-tag jobs into one physical row when the server sent separate PRINT cycles. */
export function coalesceTsplJobsIntoRows(
  jobs: TsplPrintJob[],
  templateSource = DEFAULT_LABEL_PRN_3ACROSS,
): TsplPrintJob[] {
  if (jobs.length <= 1) return jobs
  if (jobs.some((j) => (j.pieceCount ?? 1) > 1)) return jobs
  if (!jobs.every((j) => tsplLooksThreeAcrossCell(j.tspl))) return jobs

  const layout = parseTsplMultiColumnLayout(templateSource)
  const cols = Math.max(1, layout.columns)
  if (cols <= 1) return jobs

  const out: TsplPrintJob[] = []
  for (let i = 0; i < jobs.length; i += cols) {
    const row = jobs.slice(i, i + cols)
    out.push({
      tspl: composeTsplMultiColumnRow(
        row.map((j) => j.tspl),
        layout,
      ),
      barcodes: row.flatMap((j) => j.barcodes),
      pieceCount: row.length,
    })
  }
  return out
}

/** ROL Excel — weight-range (existing) and size / product (Subhyog-style) rows. */

export const ROL_EXCEL_HEADERS = [
  'Style',
  'SKU',
  'Product Name',
  'Weight range',
  'Size',
  'Available',
  'ROL set',
  'Required',
  'Available WT',
  'ROL WT set',
  'RequiredWT',
] as const

export type RolExcelSizeRow = {
  style_code: string
  sku: string
  product_name: string
  size: string
  rol_wt_g: number
  rol_qty: number
}

export type RolExcelWeightRow = {
  style_code: string
  sku: string
  weight_range_label: string
  target_weight_g: number
  min_weight_g: number
  max_weight_g: number
  rol_qty: number
}

function cellStr(v: unknown): string {
  if (v == null) return ''
  return String(v).trim()
}

export function normalizeRolSize(raw: unknown): string {
  const t = cellStr(raw)
  if (!t) return ''
  const n = Number(t)
  if (Number.isFinite(n) && t !== '') return String(n)
  return t
}

function headerKey(k: string): string {
  return k.toLowerCase().replace(/[^a-z0-9]+/g, '')
}

function pick(row: Record<string, unknown>, aliases: string[]): unknown {
  const map = new Map<string, unknown>()
  for (const [k, v] of Object.entries(row)) map.set(headerKey(k), v)
  for (const a of aliases) {
    if (map.has(a) && map.get(a) != null && cellStr(map.get(a)) !== '') return map.get(a)
  }
  for (const a of aliases) {
    if (map.has(a)) return map.get(a)
  }
  return ''
}

function num(v: unknown): number {
  const n = Number(String(v ?? '').replace(/,/g, '').trim())
  return Number.isFinite(n) ? n : 0
}

/** Parse `50.000 g (45.000–54.000 g)` or `50 (45-54)`. */
export function parseWeightRangeLabel(label: string): {
  target: number
  min: number
  max: number
} | null {
  const s = String(label || '').trim()
  if (!s) return null
  const m = s.match(
    /([\d.]+)\s*g?\s*\(\s*([\d.]+)\s*[–\-]\s*([\d.]+)/i,
  )
  if (m) {
    const target = Number(m[1])
    const min = Number(m[2])
    const max = Number(m[3])
    if ([target, min, max].every(Number.isFinite)) return { target, min, max }
  }
  const n = Number(s.replace(/[^\d.]/g, ''))
  if (Number.isFinite(n) && n > 0) return { target: n, min: n, max: n }
  return null
}

export function parseRolExcelBuffer(buffer: ArrayBuffer): {
  sizeRows: RolExcelSizeRow[]
  weightRows: RolExcelWeightRow[]
} {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const XLSX = require('xlsx') as typeof import('xlsx')
  const wb = XLSX.read(buffer, { type: 'array' })
  const sheet = wb.Sheets[wb.SheetNames[0]]
  const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' })
  const sizeRows: RolExcelSizeRow[] = []
  const weightRows: RolExcelWeightRow[] = []
  const sizeSeen = new Set<string>()
  const weightSeen = new Set<string>()

  for (const row of raw) {
    const style_code = cellStr(pick(row, ['style', 'stylecode'])).toUpperCase()
    const sku = cellStr(pick(row, ['sku'])).toUpperCase()
    if (!style_code || !sku) continue
    const product_name = cellStr(pick(row, ['productname', 'product', 'itemcode', 'item']))
    const size = normalizeRolSize(pick(row, ['size']))
    const rangeLabel = cellStr(pick(row, ['weightrange', 'range', 'label']))
    const rolQty = Math.max(0, Math.round(num(pick(row, ['rolset', 'rol', 'rolqty']))))
    const rolWt = num(pick(row, ['rolwtset', 'rolwt', 'rolweight', 'targetwt']))

    const parsedRange = parseWeightRangeLabel(rangeLabel)
    if (parsedRange && (rolQty > 0 || rangeLabel)) {
      const key = `${style_code}::${sku}::${parsedRange.target}`
      if (!weightSeen.has(key)) {
        weightSeen.add(key)
        weightRows.push({
          style_code,
          sku,
          weight_range_label: rangeLabel,
          target_weight_g: parsedRange.target,
          min_weight_g: parsedRange.min,
          max_weight_g: parsedRange.max,
          rol_qty: rolQty,
        })
      }
    }

    if (size || product_name || rolWt > 0) {
      const key = `${style_code}::${sku}::${product_name.toUpperCase()}::${size}`
      if (!sizeSeen.has(key)) {
        sizeSeen.add(key)
        sizeRows.push({
          style_code,
          sku,
          product_name,
          size,
          rol_wt_g: rolWt,
          rol_qty: rolQty,
        })
      }
    }
  }

  return { sizeRows, weightRows }
}

export type RolExcelBuilderBlock = {
  style_code: string
  sku: string
  product_name: string
  sizes: string
  rol_wt_g: string
  rowCount: string
}

export function downloadRolExcelTemplate(filename = 'rol-template.xlsx') {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const XLSX = require('xlsx') as typeof import('xlsx')
  const rows = [
    {
      Style: 'BABY BRACELET',
      SKU: 'SACHIN',
      'Product Name': 'SCHBR0001-120',
      'Weight range': '',
      Size: '5',
      Available: '',
      'ROL set': '',
      Required: '',
      'Available WT': '',
      'ROL WT set': 750,
      RequiredWT: '',
    },
  ]
  const ws = XLSX.utils.json_to_sheet(rows, { header: [...ROL_EXCEL_HEADERS] })
  ws['!cols'] = ROL_EXCEL_HEADERS.map((h) => ({ wch: Math.max(12, h.length + 2) }))
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'ROL')
  const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer
  triggerXlsxDownload(buf, filename)
}

export function downloadRolExcelFromBlocks(blocks: RolExcelBuilderBlock[], filename: string) {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const XLSX = require('xlsx') as typeof import('xlsx')
  const rows: Record<string, string | number>[] = []
  for (const b of blocks) {
    const style = b.style_code.trim().toUpperCase()
    const sku = b.sku.trim().toUpperCase()
    const product = b.product_name.trim()
    const rolWt = num(b.rol_wt_g)
    const sizes = b.sizes
      .split(/[,;/]+/)
      .map((s) => normalizeRolSize(s))
      .filter(Boolean)
    const n = Math.max(1, Math.min(500, parseInt(b.rowCount, 10) || 1))
    if (sizes.length) {
      for (const size of sizes) {
        rows.push({
          Style: style,
          SKU: sku,
          'Product Name': product,
          'Weight range': '',
          Size: size,
          Available: '',
          'ROL set': '',
          Required: '',
          'Available WT': '',
          'ROL WT set': rolWt || '',
          RequiredWT: '',
        })
      }
    } else {
      for (let i = 0; i < n; i++) {
        rows.push({
          Style: style,
          SKU: sku,
          'Product Name': product,
          'Weight range': '',
          Size: '',
          Available: '',
          'ROL set': '',
          Required: '',
          'Available WT': '',
          'ROL WT set': rolWt || '',
          RequiredWT: '',
        })
      }
    }
  }
  const ws = XLSX.utils.json_to_sheet(rows.length ? rows : [{ Style: '' }], {
    header: [...ROL_EXCEL_HEADERS],
  })
  ws['!cols'] = ROL_EXCEL_HEADERS.map((h) => ({ wch: Math.max(12, h.length + 2) }))
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'ROL')
  const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer
  triggerXlsxDownload(buf, filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`)
}

export type RolExportRow = {
  Style: string
  SKU: string
  'Product Name'?: string
  'Weight range'?: string
  Size?: string
  Available?: number | ''
  'ROL set'?: number | ''
  Required?: number | ''
  'Available WT'?: number | ''
  'ROL WT set'?: number | ''
  RequiredWT?: number | ''
}

export function downloadRolReportWorkbook(rows: RolExportRow[], filename: string, mode: 'weight' | 'size' | 'both') {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const XLSX = require('xlsx') as typeof import('xlsx')
  const headers =
    mode === 'weight'
      ? (['Style', 'SKU', 'Weight range', 'Available', 'ROL set', 'Required'] as const)
      : mode === 'size'
        ? ([
            'Style',
            'SKU',
            'Product Name',
            'Size',
            'Available WT',
            'ROL WT set',
            'RequiredWT',
          ] as const)
        : ROL_EXCEL_HEADERS
  const ws = XLSX.utils.json_to_sheet(rows.length ? rows : [{ Style: '' }], {
    header: [...headers],
  })
  ws['!cols'] = headers.map((h) => ({ wch: Math.max(12, h.length + 2) }))
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'ROL')
  const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer
  triggerXlsxDownload(buf, filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`)
}

function triggerXlsxDownload(buf: ArrayBuffer, filename: string) {
  const blob = new Blob([buf], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

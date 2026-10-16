import { fetchCatalogImageAsDataUrl } from '@/lib/pdf-embed-images'
import { normalizeCatalogImageSrc } from '@/lib/normalize-image-url'

export type OrderTakingExcelLine = {
  barcode?: string | null
  style_code?: string | null
  sku?: string | null
  product_name?: string | null
  item_code?: string | null
  attributes?: string | null
  size?: string | null
  weight_gm?: number | null
  qty: number
  remarks?: string | null
  image_url?: string | null
}

export type OrderTakingExcelPayload = {
  customerName: string
  dateIso: string
  lines: OrderTakingExcelLine[]
}

function dataUrlToUint8(dataUrl: string): Uint8Array {
  const b64 = dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

function safeFilePart(v: string): string {
  return String(v || '')
    .trim()
    .replace(/[^\w]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40) || 'Customer'
}

function formatWeight(n: number | null | undefined): string | number {
  if (n == null || !Number.isFinite(Number(n))) return ''
  return Math.round(Number(n) * 1000) / 1000
}

/**
 * B2B-style Excel: one row per scanned piece, large embedded photo
 * so staff can recognise the item from the picture.
 */
export async function downloadOrderTakingExcel(payload: OrderTakingExcelPayload): Promise<void> {
  const excelMod = (await import('exceljs')) as unknown as {
    default?: { Workbook: new () => import('exceljs').Workbook }
    Workbook?: new () => import('exceljs').Workbook
  }
  const ExcelJS = excelMod.default ?? excelMod
  if (!ExcelJS.Workbook) throw new Error('Excel library failed to load')
  const wb = new ExcelJS.Workbook()
  wb.creator = 'KC Jewellers ERP'
  const ws = wb.addWorksheet('B2B Selection', {
    views: [{ showGridLines: false }],
    properties: { defaultRowHeight: 18 },
  })

  ws.mergeCells('A1:J1')
  ws.getCell('A1').value = 'B2B Wholesale Selection'
  ws.getCell('A1').font = { bold: true, size: 16, color: { argb: 'FF1A1814' } }
  ws.getCell('A1').alignment = { vertical: 'middle', horizontal: 'left' }
  ws.getRow(1).height = 24

  ws.mergeCells('A2:J2')
  ws.getCell('A2').value = `Customer: ${payload.customerName || '—'}    Date: ${payload.dateIso}`
  ws.getCell('A2').font = { size: 11, color: { argb: 'FF1A1814' } }
  ws.getRow(2).height = 20

  const headers = [
    'S.No',
    'Image',
    'Style Code',
    'SKU',
    'Item',
    'Attributes',
    'Size',
    'Weight (g)',
    'Qty',
    'Remarks',
  ]
  const headerRow = ws.getRow(4)
  headers.forEach((h, i) => {
    const cell = headerRow.getCell(i + 1)
    cell.value = h
    cell.font = { bold: true, size: 11, color: { argb: 'FF1A1814' } }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8E4DF' } }
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }
    cell.border = {
      top: { style: 'thin', color: { argb: 'FFD4CFC7' } },
      left: { style: 'thin', color: { argb: 'FFD4CFC7' } },
      bottom: { style: 'thin', color: { argb: 'FFD4CFC7' } },
      right: { style: 'thin', color: { argb: 'FFD4CFC7' } },
    }
  })
  headerRow.height = 22

  ws.columns = [
    { key: 'sno', width: 8 },
    { key: 'image', width: 22 },
    { key: 'style', width: 16 },
    { key: 'sku', width: 18 },
    { key: 'item', width: 22 },
    { key: 'attr', width: 16 },
    { key: 'size', width: 10 },
    { key: 'wt', width: 12 },
    { key: 'qty', width: 8 },
    { key: 'remarks', width: 18 },
  ]

  const PHOTO = 118
  for (let i = 0; i < payload.lines.length; i++) {
    const line = payload.lines[i]
    const excelRow = 5 + i
    const row = ws.getRow(excelRow)
    row.height = 96
    const values = [
      i + 1,
      '',
      line.style_code || '',
      line.sku || '',
      line.product_name || line.item_code || '',
      line.attributes || '',
      line.size || '',
      formatWeight(line.weight_gm),
      line.qty || 1,
      line.remarks || '',
    ]
    values.forEach((v, colIdx) => {
      const cell = row.getCell(colIdx + 1)
      cell.value = v
      cell.font = { size: 11, color: { argb: 'FF1A1814' } }
      cell.alignment = {
        vertical: 'middle',
        horizontal: colIdx === 0 || colIdx === 7 || colIdx === 8 ? 'center' : 'left',
        wrapText: true,
      }
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFE8E4DF' } },
        left: { style: 'thin', color: { argb: 'FFE8E4DF' } },
        bottom: { style: 'thin', color: { argb: 'FFE8E4DF' } },
        right: { style: 'thin', color: { argb: 'FFE8E4DF' } },
      }
    })

    const src = normalizeCatalogImageSrc(line.image_url)
    if (!src) continue
    try {
      const dataUrl = await fetchCatalogImageAsDataUrl(src)
      if (!dataUrl) continue
      const imageId = wb.addImage({
        buffer: dataUrlToUint8(dataUrl) as unknown as ArrayBuffer,
        extension: 'png',
      })
      ws.addImage(imageId, {
        tl: { col: 1.08, row: excelRow - 1 + 0.08 },
        ext: { width: PHOTO, height: PHOTO },
        editAs: 'oneCell',
      })
    } catch {
      /* skip missing photo */
    }
  }

  const buf = await wb.xlsx.writeBuffer()
  const blob = new Blob([buf], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `Order_Taking_${safeFilePart(payload.customerName)}_${payload.dateIso}.xlsx`
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 30_000)
}

import axios from '@/lib/axios'
import type { ErpStockPiece } from '@/components/reseller/erp/erp-ui'

export type TagLabelPrintResult = {
  barcode: string
  piece_id?: number
  printed: boolean
  error?: string
  tspl?: string
}

export type TagLabelPrintResponse = {
  success: boolean
  results: TagLabelPrintResult[]
  printerConfigured: boolean
}

export function piecesToLabelRows(pieces: ErpStockPiece[]) {
  return pieces.map((p) => ({
    id: p.id,
    barcode: p.barcode,
    product_name: p.product_name,
    item_code: p.item_code,
    avg_weight: p.avg_weight,
    gross_weight: p.gross_weight,
    pcs: p.pcs ?? 1,
    metal_type: p.metal_type,
    bags: p.bags,
    bag_wt: p.bag_wt,
  }))
}

export async function printTagLabelsApi(opts: {
  pieceIds?: number[]
  barcodes?: string[]
}): Promise<TagLabelPrintResponse> {
  const res = await axios.post<TagLabelPrintResponse>('/api/reseller/erp/print/barcodes', {
    piece_ids: opts.pieceIds?.length ? opts.pieceIds : undefined,
    barcodes: opts.barcodes?.length ? opts.barcodes : undefined,
  })
  return res.data
}

export function downloadTsplLabels(results: TagLabelPrintResult[]) {
  for (const r of results) {
    if (!r.tspl) continue
    const blob = new Blob([r.tspl], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${r.barcode.replace(/[^\w.-]+/g, '_')}.tspl`
    a.click()
    URL.revokeObjectURL(url)
  }
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function labelBlock(p: ErpStockPiece, companyCode: string) {
  const barcode = escapeHtml(p.barcode || '')
  const style = escapeHtml(p.product_name || p.item_code || '')
  const material = escapeHtml((p.metal_type || 'SILVER').toUpperCase())
  const wt = p.avg_weight != null ? Number(p.avg_weight).toFixed(3) : '0.000'
  const gross = p.gross_weight != null ? Number(p.gross_weight).toFixed(3) : ''
  const pcs = p.pcs ?? 1
  const bags = p.bags ? escapeHtml(String(p.bags)) : ''
  const bagWt = p.bag_wt != null ? Number(p.bag_wt).toFixed(3) : ''
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${encodeURIComponent(p.barcode || '')}`

  return `
    <section class="label">
      <div class="left">
        <img src="${qrUrl}" alt="QR ${barcode}" width="72" height="72" />
        <img src="${qrUrl}" alt="" width="56" height="56" class="qr2" />
      </div>
      <div class="right">
        <div class="barcode">${barcode}</div>
        <div class="meta">${material}</div>
        <div class="meta">${escapeHtml(companyCode)}</div>
      </div>
      <div class="bottom">
        <div class="style">${style}</div>
        <div class="detail">WT: ${wt}${gross ? ` · G: ${gross}` : ''}${bagWt ? ` · Bag: ${bagWt}g` : ''}</div>
        <div class="detail">Pcs: ${pcs}${bags ? ` · ${bags}` : ''}</div>
      </div>
    </section>
  `
}

/** Open a print dialog with jewellery tag labels (100×50 mm). */
export function openBrowserTagLabelPrint(pieces: ErpStockPiece[], companyCode = 'KC925') {
  if (!pieces.length || typeof window === 'undefined') return
  const labels = pieces.map((p) => labelBlock(p, companyCode)).join('')
  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"/><title>Print labels</title>
<style>
  @page { size: 100mm 50mm; margin: 2mm; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: Arial, Helvetica, sans-serif; color: #111; }
  .label {
    width: 96mm; height: 46mm; padding: 2mm 3mm;
    page-break-after: always; display: grid;
    grid-template-columns: 78px 1fr;
    grid-template-rows: auto auto;
    gap: 2mm 3mm;
    border: 0.2mm dashed #ccc;
  }
  .label:last-child { page-break-after: auto; }
  .left { grid-row: 1 / 3; display: flex; flex-direction: column; gap: 4px; align-items: flex-start; }
  .qr2 { opacity: 0.95; }
  .barcode { font-size: 13pt; font-weight: 700; letter-spacing: 0.02em; word-break: break-all; }
  .meta { font-size: 9pt; line-height: 1.25; }
  .bottom { grid-column: 1 / 3; border-top: 0.2mm solid #ddd; padding-top: 2mm; }
  .style { font-size: 11pt; font-weight: 700; line-height: 1.2; margin-bottom: 1mm; }
  .detail { font-size: 9pt; line-height: 1.3; }
  @media print {
    .label { border: none; }
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  }
</style></head><body>${labels}
<script>window.onload=function(){setTimeout(function(){window.print();},300);};</script>
</body></html>`

  const win = window.open('', '_blank', 'noopener,noreferrer,width=900,height=700')
  if (!win) {
    alert('Pop-up blocked — allow pop-ups to print labels from the browser.')
    return
  }
  win.document.open()
  win.document.write(html)
  win.document.close()
}

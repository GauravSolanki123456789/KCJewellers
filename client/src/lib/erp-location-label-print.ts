/** Browser print for floor / box QR labels on A4 — works with any connected printer. */

export type LocationLabelRow = {
  location_name: string
  location_code: string
  qr_payload: string
  location_type?: 'floor' | 'box'
  floor_name?: string
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function labelPage(label: LocationLabelRow) {
  const name = escapeHtml(label.location_name || '')
  const code = escapeHtml(label.location_code || '')
  const kind = label.location_type === 'box' ? 'BOX' : 'FLOOR'
  const floorLine =
    label.location_type === 'box' && label.floor_name
      ? `<p class="floor">Floor: ${escapeHtml(label.floor_name)}</p>`
      : ''
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=512x512&data=${encodeURIComponent(label.qr_payload || code)}`

  return `
    <section class="sheet">
      <div class="card">
        <p class="kind">${kind}</p>
        <h1 class="name">${name}</h1>
        <p class="code">${code}</p>
        ${floorLine}
        <div class="qr-wrap">
          <img src="${qrUrl}" alt="QR ${code}" width="280" height="280" />
        </div>
        <p class="hint">Scan to find location in ERP</p>
      </div>
    </section>
  `
}

/** Open print dialog with one label per A4 page — QR sized for easy scanning. */
export function openBrowserLocationLabelPrint(labels: LocationLabelRow[]) {
  if (!labels.length || typeof window === 'undefined') return
  const pages = labels.map((l) => labelPage(l)).join('')
  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"/><title>Print location QR</title>
<style>
  @page { size: A4 portrait; margin: 12mm; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: Arial, Helvetica, sans-serif; color: #111; background: #fff; }
  .sheet {
    width: 100%;
    min-height: calc(297mm - 24mm);
    display: flex;
    align-items: center;
    justify-content: center;
    page-break-after: always;
    padding: 8mm 0;
  }
  .sheet:last-child { page-break-after: auto; }
  .card {
    text-align: center;
    width: 100%;
    max-width: 160mm;
    padding: 10mm 8mm;
    border: 0.4mm solid #ccc;
    border-radius: 4mm;
  }
  .kind {
    margin: 0 0 4mm;
    font-size: 14pt;
    font-weight: 700;
    letter-spacing: 0.12em;
    color: #2d6a4f;
  }
  .name {
    margin: 0 0 3mm;
    font-size: 28pt;
    font-weight: 800;
    line-height: 1.15;
    word-break: break-word;
  }
  .code {
    margin: 0 0 6mm;
    font-size: 18pt;
    font-weight: 600;
    font-family: ui-monospace, monospace;
    letter-spacing: 0.04em;
  }
  .floor {
    margin: -2mm 0 6mm;
    font-size: 13pt;
    color: #444;
  }
  .qr-wrap {
    display: flex;
    justify-content: center;
    margin: 4mm 0 6mm;
  }
  .qr-wrap img {
    width: 72mm;
    height: 72mm;
    object-fit: contain;
  }
  .hint {
    margin: 0;
    font-size: 11pt;
    color: #666;
  }
  @media print {
    .card { border-color: #999; }
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  }
</style></head><body>${pages}
<script>window.onload=function(){setTimeout(function(){window.print();},350);};</script>
</body></html>`

  const win = window.open('', '_blank', 'noopener,noreferrer,width=900,height=700')
  if (!win) {
    alert('Pop-up blocked — allow pop-ups to print QR labels from the browser.')
    return
  }
  win.document.open()
  win.document.write(html)
  win.document.close()
}

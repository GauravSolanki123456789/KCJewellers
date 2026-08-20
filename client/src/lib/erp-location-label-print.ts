/** Download floor / box QR code images — one PNG per location. */

export type LocationLabelRow = {
  location_name: string
  location_code: string
  qr_payload: string
  location_type?: 'floor' | 'box'
  floor_name?: string
}

function sanitizeFilename(s: string): string {
  return String(s || 'location')
    .trim()
    .replace(/[^\w.-]+/g, '_')
    .replace(/_+/g, '_')
    .slice(0, 64)
}

function qrImageUrl(payload: string): string {
  return `https://api.qrserver.com/v1/create-qr-code/?size=800x800&data=${encodeURIComponent(payload)}`
}

async function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  try {
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
  } finally {
    URL.revokeObjectURL(url)
  }
}

/** Download QR PNG(s) for each floor/box — no print dialog. */
export async function downloadLocationQrImages(labels: LocationLabelRow[]): Promise<number> {
  if (!labels.length || typeof window === 'undefined') return 0

  let count = 0
  for (const label of labels) {
    const kind = label.location_type === 'box' ? 'box' : 'floor'
    const code = sanitizeFilename(label.location_code || label.location_name)
    const filename = `${kind}-${code}-qr.png`
    const url = qrImageUrl(label.qr_payload || label.location_code || '')

    try {
      const res = await fetch(url)
      if (!res.ok) continue
      const blob = await res.blob()
      await downloadBlob(blob, filename)
      count += 1
      if (labels.length > 1) {
        await new Promise((r) => setTimeout(r, 350))
      }
    } catch {
      /* skip failed label */
    }
  }
  return count
}

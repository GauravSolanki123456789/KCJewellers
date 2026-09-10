/** Resolve a QR code image data URI for e-invoice PDF embedding. */
import QRCode from 'qrcode'

function findStringField(obj: unknown, names: string[], depth = 0): string | null {
  if (!obj || typeof obj !== 'object' || depth > 8) return null
  const rec = obj as Record<string, unknown>
  const want = names.map((n) => n.toLowerCase())
  for (const [key, val] of Object.entries(rec)) {
    if (typeof val === 'string' && val.trim() && want.includes(key.toLowerCase())) {
      return val.trim()
    }
  }
  for (const val of Object.values(rec)) {
    if (val && typeof val === 'object') {
      const hit = findStringField(val, names, depth + 1)
      if (hit) return hit
    }
  }
  return null
}

async function generateLocalQrDataUri(text: string): Promise<string | null> {
  const payload = String(text || '').trim()
  if (!payload) return null
  try {
    return await QRCode.toDataURL(payload, {
      errorCorrectionLevel: 'M',
      margin: 1,
      width: 280,
      color: { dark: '#000000', light: '#ffffff' },
    })
  } catch {
    return null
  }
}

export async function resolveEinvoiceQrImageSrc(params: {
  irn?: string | null
  signedQr?: string | null
  complianceResponse?: unknown
}): Promise<string | null> {
  const response = params.complianceResponse
  const signedFromResponse = findStringField(response, [
    'SignedQRCode',
    'signedQRCode',
    'SignedQrCode',
    'QRCode',
    'QrCode',
  ])
  const signedQr = String(params.signedQr || signedFromResponse || '').trim()

  if (signedQr.startsWith('data:image')) return signedQr

  const looksLikePngBase64 =
    signedQr.length > 200 &&
    /^[A-Za-z0-9+/=\s]+$/.test(signedQr) &&
    !signedQr.includes('.')

  if (looksLikePngBase64) {
    return `data:image/png;base64,${signedQr.replace(/\s+/g, '')}`
  }

  const qrUrl = findStringField(response, [
    'SignedQrCodeImgUrl',
    'QrCodeUrl',
    'QRCodeUrl',
    'QrCodeImageUrl',
  ])
  if (qrUrl && /^https?:\/\//i.test(qrUrl)) {
    try {
      const res = await fetch(qrUrl)
      if (res.ok) {
        const blob = await res.blob()
        if (blob.type.startsWith('image')) return await blobToDataUri(blob)
      }
    } catch {
      /* fall through to local QR */
    }
  } else if (qrUrl && qrUrl.startsWith('/')) {
    try {
      const res = await fetch(`https://my.gstzen.in${qrUrl}`)
      if (res.ok) {
        const blob = await res.blob()
        if (blob.type.startsWith('image')) return await blobToDataUri(blob)
      }
    } catch {
      /* fall through */
    }
  }

  const qrText = signedQr || String(params.irn || '').trim()
  if (!qrText) return null

  const local = await generateLocalQrDataUri(qrText)
  if (local) return local

  return fetchQrDataUri(qrText)
}

async function fetchQrDataUri(text: string): Promise<string | null> {
  const payload = encodeURIComponent(text)
  const urls = [
    `https://quickchart.io/qr?size=280&margin=1&text=${payload}`,
    `https://api.qrserver.com/v1/create-qr-code/?size=280x280&data=${payload}`,
  ]
  for (const url of urls) {
    try {
      const res = await fetch(url)
      if (!res.ok) continue
      const blob = await res.blob()
      return await blobToDataUri(blob)
    } catch {
      /* try next provider */
    }
  }
  return null
}

function blobToDataUri(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

export type ErpSettingsBundle = {
  gst?: {
    gstin?: string
    legalName?: string
    placeOfSupply?: string
    address?: string
    phone?: string
    email?: string
    invoiceTemplate?: string
  }
  bank?: {
    bankName?: string
    accountName?: string
    accountNo?: string
    ifsc?: string
    branch?: string
  }
  taxInvoiceTemplate?: import('@/lib/erp-tax-invoice-template').ErpTaxInvoiceTemplateConfig
  einvoiceTaxInvoiceTemplate?: import('@/lib/erp-tax-invoice-template').ErpTaxInvoiceTemplateConfig
}

export async function loadErpSettingsBundle(): Promise<ErpSettingsBundle> {
  try {
    const axios = (await import('@/lib/axios')).default
    const res = await axios.get<{ settings: ErpSettingsBundle }>('/api/reseller/erp/settings')
    return res.data.settings || {}
  } catch {
    return {}
  }
}

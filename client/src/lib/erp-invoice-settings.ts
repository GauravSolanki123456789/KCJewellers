/** Resolve a QR code image data URI for e-invoice PDF embedding. */
export async function resolveEinvoiceQrImageSrc(params: {
  irn?: string | null
  complianceResponse?: unknown
}): Promise<string | null> {
  const response = params.complianceResponse as Record<string, unknown> | null | undefined
  const nested = response?.data as Record<string, unknown> | undefined

  const signedQr =
    (response?.SignedQRCode as string | undefined) ||
    (response?.signedQRCode as string | undefined) ||
    (nested?.SignedQRCode as string | undefined) ||
    (response?.QrCodeImage as string | undefined) ||
    (nested?.QrCodeImage as string | undefined)

  if (signedQr && typeof signedQr === 'string') {
    const trimmed = signedQr.trim()
    if (trimmed.startsWith('data:image')) return trimmed
    if (/^[A-Za-z0-9+/=]+$/.test(trimmed.slice(0, 80))) {
      return `data:image/png;base64,${trimmed}`
    }
  }

  const qrUrl =
    (response?.QrCodeUrl as string | undefined) ||
    (response?.QRCodeUrl as string | undefined) ||
    (nested?.QrCodeUrl as string | undefined)

  if (qrUrl && typeof qrUrl === 'string' && qrUrl.startsWith('http')) {
    try {
      const res = await fetch(qrUrl)
      if (!res.ok) return null
      const blob = await res.blob()
      return await blobToDataUri(blob)
    } catch {
      return null
    }
  }

  const irn = params.irn?.trim()
  if (!irn) return null

  try {
    const url = `https://quickchart.io/qr?size=200&margin=1&text=${encodeURIComponent(irn)}`
    const res = await fetch(url)
    if (!res.ok) return null
    const blob = await res.blob()
    return await blobToDataUri(blob)
  } catch {
    return null
  }
}

function blobToDataUri(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

import type { ErpSalesInvoiceTemplateConfig } from '@/lib/erp-sales-invoice-template'

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
  salesInvoiceTemplate?: ErpSalesInvoiceTemplateConfig | null
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

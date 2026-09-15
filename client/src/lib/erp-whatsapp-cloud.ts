import axios from '@/lib/axios'

export type WhatsAppCloudStatus = {
  configured: boolean
  displayNumber?: string | null
  phoneNumberId?: string | null
  verifiedName?: string | null
  wabaId?: string | null
  setupMode?: string | null
  coexistenceActive?: boolean
  embeddedSignupAvailable?: boolean
  documentTemplateName?: string | null
  sendMode?:
    | 'cloud_api'
    | 'cloud_api_coexistence'
    | 'setup_embedded_signup'
    | 'setup_manual'
}

export type WhatsAppEmbeddedSignupConfig = {
  available: boolean
  appId?: string | null
  configId?: string | null
  featureType?: string
}

export function normalizeErpMobile10(raw: string | null | undefined): string {
  const d = String(raw || '').replace(/\D/g, '')
  if (d.length === 10) return d
  if (d.length === 12 && d.startsWith('91')) return d.slice(2)
  if (d.length === 11 && d.startsWith('0')) return d.slice(1)
  return d.slice(0, 10)
}

export async function fetchWhatsAppCloudStatus(): Promise<WhatsAppCloudStatus> {
  try {
    const res = await axios.get<WhatsAppCloudStatus>('/api/reseller/erp/whatsapp/status')
    return {
      configured: !!res.data.configured,
      displayNumber: res.data.displayNumber,
      phoneNumberId: res.data.phoneNumberId,
      verifiedName: res.data.verifiedName,
      wabaId: res.data.wabaId,
      setupMode: res.data.setupMode,
      coexistenceActive: res.data.coexistenceActive,
      embeddedSignupAvailable: res.data.embeddedSignupAvailable,
      documentTemplateName: res.data.documentTemplateName,
      sendMode: res.data.sendMode,
    }
  } catch {
    return { configured: false }
  }
}

export async function fetchWhatsAppEmbeddedSignupConfig(): Promise<WhatsAppEmbeddedSignupConfig> {
  try {
    const res = await axios.get<WhatsAppEmbeddedSignupConfig>(
      '/api/reseller/erp/whatsapp/embedded-signup/config',
    )
    return res.data
  } catch {
    return { available: false }
  }
}

export async function completeWhatsAppEmbeddedSignup(payload: {
  code: string
  phoneNumberId: string
  wabaId?: string
  event?: string
}): Promise<{ success: boolean; displayNumber?: string | null; coexistenceActive?: boolean }> {
  const res = await axios.post('/api/reseller/erp/whatsapp/embedded-signup/complete', payload)
  return res.data
}

export async function sendPdfViaWhatsAppCloud(opts: {
  blob: Blob
  filename: string
  mobile: string
  caption: string
}): Promise<{ deliveryMode?: 'session' | 'template' }> {
  const mob = normalizeErpMobile10(opts.mobile)
  if (mob.length !== 10) throw new Error('Valid 10-digit customer mobile required')
  const form = new FormData()
  form.append('pdf', opts.blob, opts.filename || 'document.pdf')
  form.append('mobile', mob)
  form.append('caption', opts.caption)
  form.append('filename', opts.filename || 'document.pdf')
  const res = await axios.post<{ deliveryMode?: 'session' | 'template' }>(
    '/api/reseller/erp/whatsapp/send-document',
    form,
    {
      headers: { 'Content-Type': 'multipart/form-data' },
    },
  )
  return res.data
}

/** User-facing hint when Cloud API is not configured yet. */
export function whatsAppSetupHint(status: WhatsAppCloudStatus): string {
  if (status.configured) {
    if (status.coexistenceActive) {
      return `Sending from ${status.displayNumber || 'your shop number'} via WhatsApp Business + Cloud API — no app opens.`
    }
    return `Sending from ${status.displayNumber || 'your shop number'} — no app opens.`
  }
  if (status.embeddedSignupAvailable) {
    return 'Connect your WhatsApp Business app once in ERP → Integrations. After that, Send PDF works with one click — your phone app stays active.'
  }
  return 'Set up WhatsApp Cloud API once in ERP → Integrations → WhatsApp Business. Then Send PDF works with one click from your shop number.'
}

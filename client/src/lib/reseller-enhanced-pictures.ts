import axios from 'axios'

export const CANVAS_ASPECTS = ['1:1', '3:4', '4:5', '9:16', '16:9'] as const
export type CanvasAspect = (typeof CANVAS_ASPECTS)[number]

export type EnhancedPictureTemplate = {
  key: string
  label: string
  description: string
  showcase?: EnhancedTemplateShowcase
}

export type EnhancedTemplateShowcase = {
  template_key: string
  workflow_highlights: string[]
  system_resolutions: string
  system_ratios: string
  sample_label: string
  output_label: string
  output_subtitle: string
  footer_note: string
}

export type EnhancedPicturePrompt = {
  id: number
  reseller_user_id: number
  template_key: string
  name: string
  prompt_text: string
  negative_prompt?: string | null
  is_active: boolean
  is_test: boolean
  test_source_image_url?: string | null
  test_result_image_url?: string | null
  created_at?: string
  updated_at?: string
}

export type EnhancedCreditPlan = {
  id?: number
  name: string
  credits: number
  price_inr: number
  sort_order?: number
  is_active?: boolean
}

export type EnhancedAiSettings = {
  provider: 'gemini' | 'replicate'
  gemini_model: string
  replicate_model: string
  gemini_api_key_configured: boolean
  replicate_api_token_configured: boolean
  gemini_api_key_masked: string | null
  replicate_api_token_masked: string | null
  gemini_model_presets: string[]
  replicate_model_presets: string[]
  server_gemini_configured: boolean
  server_replicate_configured: boolean
}

export const GEMINI_MODEL_PRESETS = [
  'gemini-3.1-flash-lite-image',
  'gemini-2.5-flash-image',
  'gemini-2.5-flash-image-preview',
] as const

export const REPLICATE_MODEL_PRESETS = [
  'black-forest-labs/flux-kontext-pro',
  'google/nano-banana',
  'black-forest-labs/flux-1.1-pro',
] as const

export type EnhancedBarcodeHint = {
  id: number
  barcode?: string | null
  web_product_sku?: string | null
  stem: string
  front_filename: string | null
  back_filename: string | null
  has_front: boolean
  has_back: boolean
  submission_status: string
  batch_id?: string | null
}

export type EnhancedGenerateResult = {
  success: boolean
  job: {
    id: number
    result_image_url?: string | null
    source_image_url?: string | null
    barcode_stem?: string | null
    photo_type?: string
    status?: string
  }
  result_image_url: string
  download_filename?: string
  credits?: number
  attach?: {
    attached: boolean
    submissionId?: number
    sku?: string
    url?: string
    reason?: string
    status?: string
  } | null
}

function apiBase() {
  return process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'
}

export async function fetchEnhancedStatus() {
  const res = await axios.get<{
    enabled: boolean
    templates: EnhancedPictureTemplate[]
    aspects: string[]
    active_prompt: { id: number; template_key: string; name: string } | null
    credits: number
    razorpay_enabled: boolean
    payment_qr_url: string | null
    bank_details: string | null
    plans: EnhancedCreditPlan[]
    ai_settings?: {
      provider: 'gemini' | 'replicate'
      gemini_model: string
      replicate_model: string
    } | null
  }>(`${apiBase()}/api/reseller/enhanced-pictures/status`, { withCredentials: true })
  return res.data
}

export async function fetchBarcodeHints() {
  const res = await axios.get<{ hints: EnhancedBarcodeHint[] }>(
    `${apiBase()}/api/reseller/enhanced-pictures/barcode-hints`,
    { withCredentials: true },
  )
  return res.data.hints
}

export async function generateEnhancedPicture(opts: {
  image: File
  templateKey?: string
  barcodeStem?: string
  photoType?: 'front' | 'back'
  aspectRatio?: string
  canvasText?: string
}) {
  const fd = new FormData()
  fd.append('image', opts.image)
  fd.append('template_key', opts.templateKey || 'idols')
  fd.append('photo_type', opts.photoType || 'front')
  fd.append('aspect_ratio', opts.aspectRatio || '1:1')
  if (opts.canvasText) fd.append('canvas_text', opts.canvasText)
  if (opts.barcodeStem) fd.append('barcode_stem', opts.barcodeStem)
  const res = await axios.post<EnhancedGenerateResult>(
    `${apiBase()}/api/reseller/enhanced-pictures/generate`,
    fd,
    { withCredentials: true, timeout: 200000 },
  )
  return res.data
}

export async function attachEnhancedPicture(opts: {
  jobId: number
  barcodeStem: string
  photoType?: 'front' | 'back'
}) {
  const res = await axios.post(
    `${apiBase()}/api/reseller/enhanced-pictures/attach`,
    {
      job_id: opts.jobId,
      barcode_stem: opts.barcodeStem,
      photo_type: opts.photoType || 'front',
    },
    { withCredentials: true },
  )
  return res.data as {
    success: boolean
    attach: EnhancedGenerateResult['attach']
    download_filename?: string
  }
}

export function enhancedPicturesZipUrl() {
  return `${apiBase()}/api/reseller/enhanced-pictures/download-zip`
}

export async function createEnhancedTopupOrder(planId: number) {
  const res = await axios.post(
    `${apiBase()}/api/reseller/enhanced-pictures/topup/create-order`,
    { plan_id: planId },
    { withCredentials: true },
  )
  return res.data as {
    razorpay_order_id: string
    amount: number
    currency: string
    key_id: string
    plan: { id: number; name: string; credits: number; price_inr: number }
  }
}

export async function verifyEnhancedTopup(opts: {
  planId: number
  razorpay_order_id: string
  razorpay_payment_id: string
  razorpay_signature: string
}) {
  const res = await axios.post(
    `${apiBase()}/api/reseller/enhanced-pictures/topup/verify`,
    {
      plan_id: opts.planId,
      razorpay_order_id: opts.razorpay_order_id,
      razorpay_payment_id: opts.razorpay_payment_id,
      razorpay_signature: opts.razorpay_signature,
    },
    { withCredentials: true },
  )
  return res.data as { success: boolean; credits: number; added: number }
}

export async function fetchAdminEnhancedPrompts(userId: number) {
  const res = await axios.get<{
    user: {
      id: number
      email: string | null
      business_name: string | null
      reseller_enhanced_pictures_enabled: boolean
      credits: number
      razorpay_enabled: boolean
      payment_qr_url: string | null
      bank_details: string | null
    }
    ai_settings: EnhancedAiSettings
    templates: EnhancedPictureTemplate[]
    aspects: string[]
    prompts: EnhancedPicturePrompt[]
    plans: EnhancedCreditPlan[]
  }>(`${apiBase()}/api/admin/users/${userId}/enhanced-picture-prompts`, {
    withCredentials: true,
  })
  return res.data
}

export async function patchAdminEnhancedTemplateShowcase(
  userId: number,
  body: {
    template_key?: string
    workflow_highlights?: string[] | string
    system_resolutions?: string
    system_ratios?: string
    sample_label?: string
    output_label?: string
    output_subtitle?: string
    footer_note?: string
  },
) {
  const res = await axios.patch<{ success: boolean; showcase: EnhancedTemplateShowcase }>(
    `${apiBase()}/api/admin/users/${userId}/enhanced-picture-template-settings`,
    body,
    { withCredentials: true },
  )
  return res.data.showcase
}

export async function patchAdminEnhancedAiSettings(
  userId: number,
  body: {
    provider?: 'gemini' | 'replicate'
    gemini_model?: string
    replicate_model?: string
    gemini_api_key?: string
    replicate_api_token?: string
    clear_gemini_api_key?: boolean
    clear_replicate_api_token?: boolean
  },
) {
  const res = await axios.patch<{ success: boolean; ai_settings: EnhancedAiSettings }>(
    `${apiBase()}/api/admin/users/${userId}/enhanced-picture-ai-settings`,
    body,
    { withCredentials: true },
  )
  return res.data.ai_settings
}

export async function createAdminEnhancedTemplate(
  userId: number,
  body: { label: string; description?: string; template_key?: string },
) {
  const res = await axios.post<{
    success: boolean
    template: {
      key: string
      label: string
      description: string
      showcase: EnhancedTemplateShowcase
      prompt: EnhancedPicturePrompt
    }
  }>(`${apiBase()}/api/admin/users/${userId}/enhanced-picture-templates`, body, {
    withCredentials: true,
  })
  return res.data.template
}

export async function patchAdminEnhancedPrompt(
  id: number,
  body: Partial<{ name: string; prompt_text: string; negative_prompt: string }>,
) {
  const res = await axios.patch<{ prompt: EnhancedPicturePrompt }>(
    `${apiBase()}/api/admin/enhanced-picture-prompts/${id}`,
    body,
    { withCredentials: true },
  )
  return res.data.prompt
}

export async function activateAdminEnhancedPrompt(id: number) {
  const res = await axios.post<{ prompt: EnhancedPicturePrompt }>(
    `${apiBase()}/api/admin/enhanced-picture-prompts/${id}/activate`,
    {},
    { withCredentials: true },
  )
  return res.data.prompt
}

export async function deleteAdminEnhancedPrompt(id: number) {
  await axios.delete(`${apiBase()}/api/admin/enhanced-picture-prompts/${id}`, {
    withCredentials: true,
  })
}

export async function testGenerateAdminEnhanced(opts: {
  userId: number
  image: File
  promptText: string
  negativePrompt?: string
  name?: string
  promptId?: number | null
  saveAsNew?: boolean
  templateKey?: string
  aspectRatio?: string
  canvasText?: string
  aiProvider?: 'gemini' | 'replicate'
  geminiModel?: string
  geminiApiKey?: string
  replicateModel?: string
  replicateApiToken?: string
}) {
  const fd = new FormData()
  fd.append('image', opts.image)
  fd.append('prompt_text', opts.promptText)
  if (opts.negativePrompt != null) fd.append('negative_prompt', opts.negativePrompt)
  if (opts.name) fd.append('name', opts.name)
  if (opts.promptId) fd.append('prompt_id', String(opts.promptId))
  if (opts.saveAsNew) fd.append('save_as_new', '1')
  fd.append('template_key', opts.templateKey || 'idols')
  fd.append('aspect_ratio', opts.aspectRatio || '1:1')
  if (opts.canvasText) fd.append('canvas_text', opts.canvasText)
  if (opts.aiProvider) fd.append('ai_provider', opts.aiProvider)
  if (opts.geminiModel) fd.append('gemini_model', opts.geminiModel)
  if (opts.geminiApiKey) fd.append('gemini_api_key', opts.geminiApiKey)
  if (opts.replicateModel) fd.append('replicate_model', opts.replicateModel)
  if (opts.replicateApiToken) fd.append('replicate_api_token', opts.replicateApiToken)
  const res = await axios.post<{
    success: boolean
    source_image_url: string
    result_image_url: string
    ai_provider?: string
    ai_model?: string
    prompt: EnhancedPicturePrompt
  }>(`${apiBase()}/api/admin/users/${opts.userId}/enhanced-pictures/test-generate`, fd, {
    withCredentials: true,
    timeout: 200000,
  })
  return res.data
}

export async function adminSetEnhancedCredits(
  userId: number,
  body: { credits?: number; add?: number; note?: string },
) {
  const res = await axios.patch<{ credits: number }>(
    `${apiBase()}/api/admin/users/${userId}/enhanced-picture-credits`,
    body,
    { withCredentials: true },
  )
  return res.data.credits
}

export async function adminSaveEnhancedPlans(userId: number, plans: EnhancedCreditPlan[]) {
  const res = await axios.put<{ plans: EnhancedCreditPlan[] }>(
    `${apiBase()}/api/admin/users/${userId}/enhanced-picture-plans`,
    { plans },
    { withCredentials: true },
  )
  return res.data.plans
}

export async function adminSaveEnhancedPayment(
  userId: number,
  opts: {
    razorpayEnabled: boolean
    bankDetails: string
    qrFile?: File | null
    clearQr?: boolean
  },
) {
  const fd = new FormData()
  fd.append('razorpay_enabled', opts.razorpayEnabled ? '1' : '0')
  fd.append('bank_details', opts.bankDetails || '')
  if (opts.clearQr) fd.append('clear_qr', '1')
  if (opts.qrFile) fd.append('image', opts.qrFile)
  const res = await axios.put<{
    success: boolean
    payment?: {
      credits?: number
      razorpay_enabled?: boolean
      payment_qr_url?: string | null
      bank_details?: string | null
    }
  }>(`${apiBase()}/api/admin/users/${userId}/enhanced-picture-payment`, fd, {
    withCredentials: true,
  })
  return res.data
}

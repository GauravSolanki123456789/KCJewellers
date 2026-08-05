import axios from 'axios'

export const CANVAS_ASPECTS = ['1:1', '3:4', '4:5', '9:16', '16:9'] as const
export type CanvasAspect = (typeof CANVAS_ASPECTS)[number]

export type EnhancedPictureTemplate = {
  key: string
  label: string
  description: string
  is_enabled?: boolean
  showcase?: EnhancedTemplateShowcase
  varieties?: EnhancedPictureVariety[]
  /** Alias for varieties — sub-templates under this template */
  subtemplates?: EnhancedPictureVariety[]
}

export type EnhancedPictureVariety = {
  id?: number
  template_key?: string
  variety_key: string
  variety_label: string
  variety_description?: string
  sample_source_image_url?: string | null
  sample_result_image_url?: string | null
  is_enabled?: boolean
  sort_order?: number
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
  sample_source_image_url?: string | null
  sample_result_image_url?: string | null
}

export type EnhancedPicturePrompt = {
  id: number
  reseller_user_id: number
  template_key: string
  variety_key?: string | null
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
  gemini_batch_enabled?: boolean
  /** 4-step cutout → lock → composite → upscale pipeline */
  studio_pipeline_enabled?: boolean
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
  product_name?: string | null
  item_code?: string | null
  stem: string
  front_filename: string | null
  back_filename: string | null
  has_front: boolean
  has_back: boolean
  submission_status: string
  batch_id?: string | null
  mrp_rate_behind_box?: number | null
  show_mrp_field?: boolean
}

export type EnhancedProductLookup = {
  found: boolean
  product: {
    id: number
    barcode?: string | null
    web_product_sku?: string | null
    product_name?: string | null
    item_code?: string | null
    stem: string
    mrp_rate_behind_box?: number | null
    show_mrp_field?: boolean
    has_front?: boolean
    has_back?: boolean
    submission_status?: string
  } | null
}

export type EnhancedGenerateResult = {
  success: boolean
  async?: boolean
  message?: string
  batch?: { name?: string; state?: string }
  job: {
    id: number
    result_image_url?: string | null
    source_image_url?: string | null
    barcode_stem?: string | null
    photo_type?: string
    status?: string
    generation_mode?: string
    batch_state?: string | null
    error_message?: string | null
  }
  result_image_url?: string
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

export async function fetchEnhancedBootstrap(opts?: { jobLimit?: number; includeHints?: boolean }) {
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
      gemini_batch_enabled?: boolean
    } | null
    jobs: EnhancedRecentJob[]
    hints: EnhancedBarcodeHint[]
  }>(`${apiBase()}/api/reseller/enhanced-pictures/bootstrap`, {
    params: {
      job_limit: opts?.jobLimit ?? 15,
      hints: opts?.includeHints === false ? '0' : '1',
    },
    withCredentials: true,
  })
  return res.data
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
      gemini_batch_enabled?: boolean
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

export async function fetchProductLookup(stem: string) {
  const res = await axios.get<EnhancedProductLookup>(
    `${apiBase()}/api/reseller/enhanced-pictures/product-lookup`,
    { params: { stem }, withCredentials: true },
  )
  return res.data
}

export type EnhancedJobStatus = {
  job: {
    id: number
    status: string
    result_image_url?: string | null
    download_filename?: string | null
    error_message?: string | null
    generation_mode?: string
    batch_state?: string | null
    batch_submitted_at?: string | null
    batch_completed_at?: string | null
  }
}

export type EnhancedRecentJob = {
  id: number
  status: string
  template_key: string
  barcode_stem?: string | null
  photo_type: string
  generation_mode?: string
  batch_state?: string | null
  result_image_url?: string | null
  source_image_url?: string | null
  download_filename?: string | null
  error_message?: string | null
  attached_sku?: string | null
  attached_submission_id?: number | null
  created_at: string
  batch_submitted_at?: string | null
  batch_completed_at?: string | null
}

export async function fetchEnhancedJobs(limit = 30) {
  const res = await axios.get<{ jobs: EnhancedRecentJob[] }>(
    `${apiBase()}/api/reseller/enhanced-pictures/jobs`,
    { params: { limit }, withCredentials: true },
  )
  return res.data.jobs
}

export async function cancelEnhancedJob(jobId: number) {
  const res = await axios.post<{
    success: boolean
    job: EnhancedRecentJob
    credits?: number
    message?: string
  }>(`${apiBase()}/api/reseller/enhanced-pictures/jobs/${jobId}/cancel`, {}, { withCredentials: true })
  return res.data
}

export async function deleteEnhancedJob(jobId: number) {
  const res = await axios.delete<{ success: boolean; removed: boolean; credits?: number }>(
    `${apiBase()}/api/reseller/enhanced-pictures/jobs/${jobId}`,
    { withCredentials: true },
  )
  return res.data
}

export async function fetchEnhancedJobStatus(jobId: number) {
  const res = await axios.get<EnhancedJobStatus>(
    `${apiBase()}/api/reseller/enhanced-pictures/jobs/${jobId}`,
    { withCredentials: true },
  )
  return res.data.job
}

export async function generateEnhancedPicture(opts: {
  image: File
  templateKey?: string
  varietyKey?: string
  barcodeStem?: string
  photoType?: 'front' | 'back'
  aspectRatio?: string
  canvasText?: string
  /** fast = sync (~30–90s). batch = economy queue (minutes, ~50% cost). */
  generationMode?: 'fast' | 'batch'
}) {
  const fd = new FormData()
  fd.append('image', opts.image)
  fd.append('template_key', opts.templateKey || 'idols')
  fd.append('generation_mode', opts.generationMode || 'fast')
  if (opts.varietyKey) fd.append('variety_key', opts.varietyKey)
  fd.append('photo_type', opts.photoType || 'front')
  fd.append('aspect_ratio', opts.aspectRatio || '1:1')
  if (opts.canvasText) fd.append('canvas_text', opts.canvasText)
  if (opts.barcodeStem) fd.append('barcode_stem', opts.barcodeStem)
  const res = await axios.post<EnhancedGenerateResult>(
    `${apiBase()}/api/reseller/enhanced-pictures/generate`,
    fd,
    { withCredentials: true, timeout: 360000 },
  )
  return res.data
}

export async function attachEnhancedPicture(opts: {
  jobId: number
  barcodeStem: string
  photoType?: 'front' | 'back'
  mrpRateBehindBox?: number | string | null
}) {
  const res = await axios.post(
    `${apiBase()}/api/reseller/enhanced-pictures/attach`,
    {
      job_id: opts.jobId,
      barcode_stem: opts.barcodeStem,
      photo_type: opts.photoType || 'front',
      mrp_rate_behind_box: opts.mrpRateBehindBox ?? undefined,
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
    sample_source_image_url?: string | null
    sample_result_image_url?: string | null
    is_enabled?: boolean
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
    gemini_batch_enabled?: boolean
    studio_pipeline_enabled?: boolean
  },
) {
  const res = await axios.patch<{ success: boolean; ai_settings: EnhancedAiSettings }>(
    `${apiBase()}/api/admin/users/${userId}/enhanced-picture-ai-settings`,
    body,
    { withCredentials: true },
  )
  return res.data.ai_settings
}

export async function deleteAdminEnhancedTemplate(userId: number, templateKey: string) {
  const res = await axios.delete<{ success: boolean; deleted: string }>(
    `${apiBase()}/api/admin/users/${userId}/enhanced-picture-templates/${encodeURIComponent(templateKey)}`,
    { withCredentials: true },
  )
  return res.data
}

export async function saveAdminEnhancedPromptLab(
  userId: number,
  body: {
    template_key: string
    variety_key?: string | null
    prompt_id?: number | null
    name: string
    prompt_text: string
    negative_prompt?: string
    workflow_highlights?: string[] | string
    system_resolutions?: string
    system_ratios?: string
    sample_label?: string
    output_label?: string
    output_subtitle?: string
    footer_note?: string
    template_enabled?: boolean
    activate?: boolean
  },
) {
  const res = await axios.post<{
    success: boolean
    prompt: EnhancedPicturePrompt
    template_key: string
    variety_key: string | null
    template_enabled: boolean
  }>(`${apiBase()}/api/admin/users/${userId}/enhanced-picture-lab/save`, body, {
    withCredentials: true,
  })
  return res.data
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

export async function createAdminEnhancedVariety(
  userId: number,
  body: {
    template_key: string
    variety_label: string
    variety_key?: string
    variety_description?: string
    sort_order?: number
  },
) {
  const res = await axios.post<{ success: boolean; variety: EnhancedPictureVariety }>(
    `${apiBase()}/api/admin/users/${userId}/enhanced-picture-varieties`,
    body,
    { withCredentials: true },
  )
  return res.data.variety
}

export async function patchAdminEnhancedVariety(
  id: number,
  body: Partial<{
    variety_label: string
    variety_description: string
    is_enabled: boolean
    sample_source_image_url: string | null
    sample_result_image_url: string | null
    sort_order: number
  }>,
) {
  const res = await axios.patch<{ success: boolean; variety: EnhancedPictureVariety }>(
    `${apiBase()}/api/admin/enhanced-picture-varieties/${id}`,
    body,
    { withCredentials: true },
  )
  return res.data.variety
}

export async function deleteAdminEnhancedVariety(id: number) {
  await axios.delete(`${apiBase()}/api/admin/enhanced-picture-varieties/${id}`, {
    withCredentials: true,
  })
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
  varietyKey?: string
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
  if (opts.varietyKey) fd.append('variety_key', opts.varietyKey)
  const res = await axios.post<{
    success: boolean
    source_image_url: string
    result_image_url: string
    ai_provider?: string
    ai_model?: string
    prompt: EnhancedPicturePrompt
  }>(`${apiBase()}/api/admin/users/${opts.userId}/enhanced-pictures/test-generate`, fd, {
    withCredentials: true,
    timeout: 360000,
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

import axios from 'axios'

export type EnhancedPictureTemplate = {
  key: string
  label: string
  description: string
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
    active_prompt: { id: number; template_key: string; name: string } | null
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
}) {
  const fd = new FormData()
  fd.append('image', opts.image)
  fd.append('template_key', opts.templateKey || 'idols')
  fd.append('photo_type', opts.photoType || 'front')
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

export async function fetchAdminEnhancedPrompts(userId: number) {
  const res = await axios.get<{
    user: {
      id: number
      email: string | null
      business_name: string | null
      reseller_enhanced_pictures_enabled: boolean
    }
    templates: EnhancedPictureTemplate[]
    prompts: EnhancedPicturePrompt[]
  }>(`${apiBase()}/api/admin/users/${userId}/enhanced-picture-prompts`, {
    withCredentials: true,
  })
  return res.data
}

export async function createAdminEnhancedPrompt(
  userId: number,
  body: {
    name: string
    prompt_text: string
    negative_prompt?: string
    template_key?: string
  },
) {
  const res = await axios.post<{ prompt: EnhancedPicturePrompt }>(
    `${apiBase()}/api/admin/users/${userId}/enhanced-picture-prompts`,
    body,
    { withCredentials: true },
  )
  return res.data.prompt
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
}) {
  const fd = new FormData()
  fd.append('image', opts.image)
  fd.append('prompt_text', opts.promptText)
  if (opts.negativePrompt != null) fd.append('negative_prompt', opts.negativePrompt)
  if (opts.name) fd.append('name', opts.name)
  if (opts.promptId) fd.append('prompt_id', String(opts.promptId))
  if (opts.saveAsNew) fd.append('save_as_new', '1')
  fd.append('template_key', opts.templateKey || 'idols')
  const res = await axios.post<{
    success: boolean
    source_image_url: string
    result_image_url: string
    prompt: EnhancedPicturePrompt
  }>(`${apiBase()}/api/admin/users/${opts.userId}/enhanced-pictures/test-generate`, fd, {
    withCredentials: true,
    timeout: 200000,
  })
  return res.data
}

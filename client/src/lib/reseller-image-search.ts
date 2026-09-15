import axios from '@/lib/axios'

export type ImageSearchMatch = {
  score: number
  id: number
  sku: string
  barcode: string
  name: string
  design_group?: string | null
  size?: string | null
  net_weight?: number | null
  subcategory_name?: string | null
  style_name?: string | null
  image_url?: string | null
  make_to_order_only?: boolean
}

export async function fetchImageSearchStatus(): Promise<{ enabled: boolean }> {
  const res = await axios.get<{ enabled?: boolean }>('/api/reseller/image-search/status')
  return { enabled: !!res.data.enabled }
}

export async function matchProductByImage(file: File): Promise<{
  analysis: string
  code_hints: string[]
  matches: ImageSearchMatch[]
}> {
  const form = new FormData()
  form.append('image', file)
  const res = await axios.post<{
    analysis?: string
    code_hints?: string[]
    matches?: ImageSearchMatch[]
  }>('/api/reseller/image-search/match', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
  return {
    analysis: res.data.analysis || '',
    code_hints: res.data.code_hints || [],
    matches: res.data.matches || [],
  }
}

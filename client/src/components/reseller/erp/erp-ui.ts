export const erpInputCls =
  'min-h-[44px] w-full rounded-xl border border-[var(--color-slate-700,#e8e4df)] bg-white px-3 text-sm text-[var(--color-jewelry-black,#1a1814)] outline-none focus:border-[var(--kc-accent,#c41e3a)]/50'

export const erpBtnPrimary =
  'inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-[var(--kc-accent,#c41e3a)] px-4 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-60'

export const erpBtnGhost =
  'inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-[var(--color-slate-700,#e8e4df)] bg-white px-4 text-sm font-semibold text-[var(--color-jewelry-black,#1a1814)]'

export const erpCardCls =
  'rounded-2xl border border-[var(--color-slate-700,#e8e4df)] bg-white p-4 shadow-sm'

export type ErpProductHit = {
  id?: number
  barcode?: string | null
  sku?: string | null
  style_code?: string | null
  name?: string | null
  product_name?: string | null
  size?: string | null
  image_url?: string | null
  net_weight?: number | null
  gross_weight?: number | null
  purity?: number | null
  wastage_pct?: number | null
  metal_type?: string | null
  mc_rate?: number | null
  mc_type?: string | null
  pcs?: number | null
  box_charges?: number | null
  stone_charges?: number | null
  item_code?: string | null
  attr_color?: string | null
  attr_stone?: string | null
  fixed_price?: number | null
}

export type ErpStockPiece = {
  id: number
  batch_id?: string | null
  barcode: string
  sku?: string | null
  style_code?: string | null
  product_name?: string | null
  size?: string | null
  avg_weight?: number | null
  purity?: number | null
  wastage_pct?: number | null
  mc_rate?: number | null
  mc_type?: string | null
  pcs?: number
  box_charges?: number | null
  stone_charges?: number | null
  metal_type?: string | null
  item_code?: string | null
  image_url?: string | null
  attr_color?: string | null
  attr_stone?: string | null
  fixed_price?: number | null
  status: string
  sold_bill_id?: number | null
}

export type ErpBillLine = {
  name: string
  code?: string
  barcode?: string
  sku?: string
  style_code?: string
  size?: string | null
  qty: number
  unitInr?: number | null
  lineTotalInr?: number | null
  weightGm?: number | null
  purity?: number | null
  wastage_pct?: number | null
  ratePerGram?: number | null
  /** When true, Rate column stays empty (rate unfix). */
  rateLocked?: boolean
  mc_rate?: number | null
  mc_type?: string | null
  box_charges?: number | null
  stone_charges?: number | null
  metal_type?: string | null
  item_code?: string | null
  imageUrl?: string | null
  fixed_price?: number | null
  stock_piece_id?: number | null
  availability?: string | null
}

export type ErpBill = {
  id: number
  bill_number: string
  bill_type: string
  customer_id?: number | null
  customer_name?: string | null
  total_inr: number
  status: string
  bill_date?: string | null
  notes?: string | null
  lines?: ErpBillLine[]
  session?: import('@/lib/erp-bill-session').ErpBillSession | null
  created_at?: string | null
  updated_at?: string | null
}

export type ErpCustomer = {
  id: number
  name: string
  mobile?: string | null
  email?: string | null
  gstin?: string | null
  address?: string | null
  birthdate?: string | null
  anniversary_date?: string | null
  notes?: string | null
}

export type ErpStockItem = {
  id: number
  product_barcode?: string | null
  product_sku?: string | null
  product_name?: string | null
  reorder_level: number
  current_qty: number
  below_rol?: boolean
}

export function erpErr(e: unknown): string {
  return (e as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Something went wrong'
}

export const erpInputCls =
  'min-h-[44px] w-full rounded-xl border border-[var(--color-slate-700,#e8e4df)] bg-white px-3 text-sm text-[var(--color-jewelry-black,#1a1814)] outline-none focus:border-[var(--kc-accent,#c41e3a)]/50'

export const erpBtnPrimary =
  'inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-[var(--kc-accent,#c41e3a)] px-4 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-60'

export const erpBtnGhost =
  'inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-[var(--color-slate-700,#e8e4df)] bg-white px-4 text-sm font-semibold text-[var(--color-jewelry-black,#1a1814)]'

export const erpCardCls =
  'rounded-2xl border border-[var(--color-slate-700,#e8e4df)] bg-white p-4 shadow-sm'

export type ErpProductHit = {
  barcode?: string | null
  sku?: string | null
  name?: string | null
  image_url?: string | null
  net_weight?: number | null
  gross_weight?: number | null
  metal_type?: string | null
  mc_rate?: number | null
  mc_type?: string | null
  fixed_price?: number | null
}

export type ErpBillLine = {
  name: string
  code?: string
  qty: number
  unitInr?: number | null
  lineTotalInr?: number | null
  weightGm?: number | null
  imageUrl?: string | null
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

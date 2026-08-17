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
  stone_wt?: number | null
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
  stone_wt?: number | null
  metal_type?: string | null
  item_code?: string | null
  image_url?: string | null
  attr_color?: string | null
  attr_stone?: string | null
  fixed_price?: number | null
  gross_weight?: number | null
  chain_wt_only?: number | null
  pendant_wt_only?: number | null
  earring_wt_only?: number | null
  bags?: string | null
  bag_wt?: number | null
  status: string
  sold_bill_id?: number | null
  rfid_tag?: string | null
}

export type ErpOrderLineStatus = 'in_shop' | 'on_hold' | 'with_karigar' | 'returned' | 'completed'

export type ErpOrderMedia = {
  imageUrls: string[]
  voiceNoteUrl?: string | null
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
  stone_wt?: number | null
  metal_type?: string | null
  item_code?: string | null
  imageUrl?: string | null
  fixed_price?: number | null
  stock_piece_id?: number | null
  /** Slab R gold — show computed MC (₹) instead of per-g MC rate in grid. */
  displayMcInr?: number | null
  /** Slab R gold — hide wastage % in customer-facing grid. */
  displayWastagePct?: number | null
  /** Slab R gold — MC before catalog MC discount (₹). */
  displayMcBeforeDiscount?: number | null
  /** Slab R gold — catalog MC discount % applied. */
  displayMcDiscountPct?: number | null
  availability?: string | null
  /** Invoice line label e.g. SILVER JEWELLERY */
  invoice_item_name?: string | null
  /** HSN code for tax invoice */
  hsn_code?: string | null
  /** Per-line karigar tracking (orders only) */
  lineKey?: string
  lineStatus?: ErpOrderLineStatus
  karigarId?: number | null
  karigarName?: string | null
  workDescription?: string | null
  imageUrls?: string[]
  voiceNoteUrl?: string | null
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
  order_media?: ErpOrderMedia | null
  session?: import('@/lib/erp-bill-session').ErpBillSession | null
  compliance?: {
    einvoice?: {
      irn?: string | null
      ack_no?: string | null
      ack_date?: string | null
      status?: string
      sandbox?: boolean
      response?: unknown
    }
    eway?: { ewb_no?: string | null; status?: string; sandbox?: boolean; pdf_url?: string | null }
  } | null
  created_at?: string | null
  updated_at?: string | null
}

export type ErpCustomer = {
  id: number
  name: string
  mobile?: string | null
  email?: string | null
  gstin?: string | null
  pan?: string | null
  address?: string | null
  birthdate?: string | null
  anniversary_date?: string | null
  notes?: string | null
}

export type ErpKarigar = {
  id: number
  name: string
  mobile?: string | null
  specialty?: string | null
  address?: string | null
  notes?: string | null
  is_active: boolean
  created_at?: string | null
  updated_at?: string | null
}

export type ErpOrderJobHistoryEvent = {
  at: string
  action: string
  karigar_id?: number | null
  karigar_name?: string | null
  notes?: string | null
  line_key?: string | null
  line_name?: string | null
}

export type ErpOrderJobStatus = 'in_shop' | 'with_karigar' | 'returned' | 'completed' | 'cancelled'

export type ErpOrderJob = {
  id: number
  bill_id: number
  current_karigar_id?: number | null
  current_karigar_name?: string | null
  status: ErpOrderJobStatus
  work_description?: string | null
  due_date?: string | null
  history: ErpOrderJobHistoryEvent[]
  bill_number?: string | null
  customer_name?: string | null
  total_inr?: number | null
  bill_status?: string | null
  bill_date?: string | null
  notes?: string | null
  lines?: ErpBillLine[]
  order_media?: ErpOrderMedia | null
  created_at?: string | null
  updated_at?: string | null
}

export type ErpLedgerEntry = {
  id: number
  entry_date: string
  entry_type: string
  amount_inr: number
  customer_id?: number | null
  customer_name?: string | null
  bill_id?: number | null
  bill_number?: string | null
  payment_mode: string
  reference_no?: string | null
  bank_name?: string | null
  counterparty_name?: string | null
  narration?: string | null
  is_suspense: boolean
  resolved_at?: string | null
  import_batch_id?: number | null
  created_at?: string | null
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

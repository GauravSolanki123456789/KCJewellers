'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import axios from '@/lib/axios'
import { useAuth } from '@/hooks/useAuth'
import { type WholesaleUserFields } from '@/lib/customer-tier'
import {
  applyPiecePricedLineCalc,
  applyPieceSlabToLine,
  computeLineBreakdown,
  displayRatesToPerGram,
  isPiecePricedBillLine,
  lineHasPieceSlabFields,
  parseRateSlabFromNotes,
  parseSlabSettingsFromUser,
  perGramToDisplayRates,
  resolveErpSilverMetalRatePerG,
  type ErpRateSlab,
} from '@/lib/erp-billing-pricing'
import { billingMcDisplay, billingMcDiscountHint, billingWastageDisplay, computeBillingDiscountSummary, isGoldSlabRLine } from '@/lib/erp-billing-display'
import { cachedGet } from '@/lib/api-get-cache'
import { applyRatesUnfixed, buildErpBillSession, type ErpBillSession } from '@/lib/erp-bill-session'
import {
  hasValidGstin,
  previewLedgerLane,
  shouldRouteSaleToShadow,
  type ErpPaymentMethod,
} from '@/lib/erp-ledger-routing'
import { deriveEstimateStatus } from '@/lib/erp-estimate-status'
import { formatErpDateDdMmYyyy, toIsoDateInput } from '@/lib/erp-date-format'
import { formatErpInr, resellerErpModulePath } from '@/lib/reseller-erp-modules'
import { ratesApiQueryForStorefront } from '@/lib/storefront-domain'
import { shareErpQuotePdf } from '@/components/reseller/erp/ErpQuotePdfShare'
import { ErpBillSavedModal, ErpLedgerBillSavedDialog, ErpSaveBillConfirmDialog } from '@/components/reseller/erp/ErpBillSavedModal'
import { ErpCameraScannerModal } from '@/components/reseller/erp/ErpCameraScannerModal'
import { useErpWorkstationSelection } from '@/components/reseller/erp/ErpWorkstationBar'
import PdfShareSheet from '@/components/shared-catalog/PdfShareSheet'
import type { PdfShareSheetPayload } from '@/lib/pdf-share'
import { buildErpSalesPdfPayload } from '@/lib/erp-sales-pdf'
import { migratePrintFormats } from '@/lib/erp-print-templates'
import {
  normalizeQuoteOutputMode,
  printErpEstimateThermal,
  resolveQuoteOutputMode,
  resolveQuoteOutputModeForSlab,
  type ErpQuoteOutputMode,
} from '@/lib/erp-quote-output'
import {
  defaultHsnCode,
  defaultInvoiceItemName,
  formatSoldStockMessage,
  type SoldBillConflict,
} from '@/lib/erp-invoice-defaults'
import {
  createManualBillLine,
  findInvoiceItemForCategory,
  findStyleForSku,
  firstManualEntryField,
  isGiftManualLine,
  resolveBillingScanShortcut,
  uniqueSkusFromCatalog,
  type DesignBillingStyle,
} from '@/lib/erp-billing-shortcuts'
import { fetchGstInvoiceItems, type GstInvoiceItem, mrpInvoiceItemNames } from '@/components/reseller/erp/ErpGstInvoiceItemsPanel'
import { nextBillTableField } from '@/lib/erp-billing-table-nav'
import { applyGiftMrpForSlabChange, giftMrpSlabPrice } from '@/lib/erp-gift-mrp-pricing'
import { ErpBillingStackedRow } from '@/components/reseller/erp/ErpBillingStackedRow'
import { resolveCustomerPlaceOfSupply } from '@/lib/erp-place-of-supply'
import { ErpDateInput } from '@/components/reseller/erp/ErpDateInput'
import {
  ErpBillingStyleSkuCell,
  styleOptionsForCatalog,
} from '@/components/reseller/erp/ErpBillingStyleSkuCell'
import {
  erpBtnGhost,
  erpBtnPrimary,
  erpCardCls,
  erpErr,
  erpInputCls,
  normalizeErpCustomerSlab,
  type ErpBill,
  type ErpBillLine,
  type ErpCustomer,
  type ErpProductHit,
} from '@/components/reseller/erp/erp-ui'
import {
  Camera,
  ChevronDown,
  ChevronUp,
  FileText,
  Loader2,
  Plus,
  Receipt,
  Search,
  UserPlus,
  X,
} from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

const BILLING_DRAFT_KEY = 'kc-erp-billing-draft-v1'

type BillingDraft = {
  customerId: number | null
  customerName: string
  mobile: string
  address: string
  customerPan: string
  customerGst: string
  rateSlab: ErpRateSlab
  lines: ErpBillLine[]
  wholesaleGold: number | null
  wholesaleSilver: number | null
  goldPerG: number
  silverPerG: number
  displayRates?: unknown
  advancePaidInr: string
  collectedAmountInr: string
  paymentMethod: ErpPaymentMethod
  cashAmountInr: string
  onlineAmountInr: string
  editingBillId?: number | null
  editingBillNumber?: string | null
  editingBillType?: string | null
  editingBillStatus?: string | null
}

type BillTableCol = { key: string; label: string; w: string; edit?: boolean }

const TABLE_COLS: BillTableCol[] = [
  { key: 'barcode', label: 'Barcode', w: 'w-[7%]' },
  { key: 'sku', label: 'SKU', w: 'w-[6%]' },
  { key: 'style_code', label: 'Style', w: 'w-[7%]' },
  { key: 'name', label: 'Product', w: 'w-[8%]' },
  { key: 'invoice_item_name', label: 'Inv.item', w: 'w-[7%]', edit: true },
  { key: 'hsn_code', label: 'HSN', w: 'w-[4.5%]', edit: true },
  { key: 'size', label: 'Size', w: 'w-[5.5%]', edit: true },
  { key: 'weightGm', label: 'NetWt', w: 'w-[4.5%]', edit: true },
  { key: 'gross_weight', label: 'Gross', w: 'w-[4.5%]', edit: true },
  { key: 'bags', label: 'Bags', w: 'w-[3.5%]', edit: true },
  { key: 'bag_wt', label: 'BagWt', w: 'w-[4%]', edit: true },
  { key: 'purity', label: 'Purity', w: 'w-[4%]', edit: true },
  { key: 'wastage_pct', label: 'Wast%', w: 'w-[3.5%]', edit: true },
  { key: 'ratePerGram', label: 'Rate', w: 'w-[4.5%]', edit: true },
  { key: 'mc_rate', label: 'MC', w: 'w-[4%]', edit: true },
  { key: 'mc_type', label: 'MCType', w: 'w-[4.5%]', edit: true },
  { key: 'qty', label: 'PCS', w: 'w-[3.5%]', edit: true },
  { key: 'box_charges', label: 'Box', w: 'w-[3.5%]', edit: true },
  { key: 'stone_charges', label: 'Stone', w: 'w-[3.5%]', edit: true },
  { key: 'metal_type', label: 'Metal', w: 'w-[4.5%]' },
  { key: 'fixed_price', label: 'Fixed', w: 'w-[4.5%]', edit: true },
  { key: 'amount', label: 'Amt', w: 'w-[6%]' },
]


const MANUAL_EXTRA_COLS: BillTableCol[] = []

const NUMERIC_EDIT_KEYS: (keyof ErpBillLine)[] = [
  'weightGm',
  'gross_weight',
  'bag_wt',
  'bags',
  'purity',
  'wastage_pct',
  'ratePerGram',
  'mc_rate',
  'qty',
  'box_charges',
  'stone_charges',
  'fixed_price',
]

function isPartialDecimalInput(v: string): boolean {
  return v === '' || v === '.' || /^-?\d*\.?\d*$/.test(v)
}

function parseNumericCellValue(v: string): number | null {
  if (v === '' || v === '.' || v === '-') return null
  const n = parseFloat(v)
  return Number.isFinite(n) ? n : null
}

function productToLine(p: ErpProductHit, code: string, slab: ErpRateSlab = 'R'): ErpBillLine {
  const wt = p.net_weight ?? p.gross_weight ?? null
  const metal = (p.metal_type || 'silver').toLowerCase()
  const base: ErpBillLine = {
    name: p.product_name || p.name || code,
    code,
    barcode: p.barcode || code,
    sku: p.sku || undefined,
    style_code: p.style_code || undefined,
    size: p.size ?? null,
    qty: p.pcs ?? 1,
    originalWeightGm: wt,
    weightGm: wt,
    gross_weight: p.gross_weight ?? null,
    bag_wt: p.bag_wt ?? null,
    bags: p.bags ?? null,
    purity: p.purity ?? (metal.includes('silver') ? 925 : null),
    wastage_pct: p.wastage_pct ?? null,
    ratePerGram: null,
    mc_rate: p.mc_rate ?? null,
    mc_type: p.mc_type ?? null,
    mc_rate_slab_r: p.mc_rate_slab_r ?? null,
    mc_rate_slab_w: p.mc_rate_slab_w ?? null,
    mc_rate_slab_f: p.mc_rate_slab_f ?? null,
    metal_slab_r_pct: p.metal_slab_r_pct ?? null,
    metal_slab_w_pct: p.metal_slab_w_pct ?? null,
    metal_slab_f_pct: p.metal_slab_f_pct ?? null,
    box_charges: p.box_charges ?? 0,
    stone_charges: p.stone_charges ?? 0,
    stone_wt: p.stone_wt ?? null,
    metal_type: p.metal_type || 'silver',
    item_code: p.item_code ?? undefined,
    imageUrl: p.image_url ?? null,
    fixed_price: p.fixed_price ?? null,
    stock_piece_id: p.id,
    availability: null,
    lineTotalInr: null,
    invoice_item_name: (p as ErpProductHit & { invoice_item_name?: string }).invoice_item_name
      || defaultInvoiceItemName(metal, p.product_name || p.name),
    hsn_code: (p as ErpProductHit & { hsn_code?: string }).hsn_code || defaultHsnCode(metal),
  }
  return applyPieceSlabToLine(base, slab)
}

function loadDraft(): Partial<BillingDraft> | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(BILLING_DRAFT_KEY)
    return raw ? (JSON.parse(raw) as Partial<BillingDraft>) : null
  } catch {
    return null
  }
}

function saveDraft(draft: BillingDraft) {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(BILLING_DRAFT_KEY, JSON.stringify(draft))
  } catch {
    /* ignore */
  }
}

function clearDraftStorage() {
  if (typeof window === 'undefined') return
  localStorage.removeItem(BILLING_DRAFT_KEY)
}

export function ErpBillingWorkspace() {
  const auth = useAuth()
  const router = useRouter()
  const searchParams = useSearchParams()
  const editIdParam = searchParams.get('edit')
  const brandLabel = useMemo(() => {
    const name = auth.user && (auth.user as WholesaleUserFields).business_name
    return typeof name === 'string' && name.trim() ? name.trim() : 'Our store'
  }, [auth.user])

  const slabSettings = useMemo(
    () =>
      parseSlabSettingsFromUser(
        auth.user && (auth.user as WholesaleUserFields).reseller_slab_settings,
      ),
    [auth.user],
  )

  const [customers, setCustomers] = useState<ErpCustomer[]>([])
  const [customerQ, setCustomerQ] = useState('')
  const [customerId, setCustomerId] = useState<number | null>(null)
  const [customerName, setCustomerName] = useState('')
  const [mobile, setMobile] = useState('')
  const [address, setAddress] = useState('')
  const [customerPan, setCustomerPan] = useState('')
  const [customerGst, setCustomerGst] = useState('')
  const [placeOfSupply, setPlaceOfSupply] = useState('')
  const [defaultPlaceOfSupply, setDefaultPlaceOfSupply] = useState('')
  const [rateSlab, setRateSlab] = useState<ErpRateSlab>('R')
  const [lines, setLines] = useState<ErpBillLine[]>([])
  const [displayRates, setDisplayRates] = useState<unknown>([])
  const [goldPerG, setGoldPerG] = useState(0)
  const [silverPerG, setSilverPerG] = useState(0)
  const [wholesaleGold, setWholesaleGold] = useState<number | null>(null)
  const [wholesaleSilver, setWholesaleSilver] = useState<number | null>(null)
  const [showRateEdit, setShowRateEdit] = useState(false)
  const [showWholesaleModal, setShowWholesaleModal] = useState(false)
  const [pendingSlab, setPendingSlab] = useState<ErpRateSlab | null>(null)
  const [editGold, setEditGold] = useState('')
  const [editSilver, setEditSilver] = useState('')
  const [modalWhGold, setModalWhGold] = useState('')
  const [modalWhSilver, setModalWhSilver] = useState('')
  const [scanCode, setScanCode] = useState('')
  const [scanBusy, setScanBusy] = useState(false)
  const [cameraOpen, setCameraOpen] = useState(false)
  const [saveBusy, setSaveBusy] = useState(false)
  const [customerSaveBusy, setCustomerSaveBusy] = useState(false)
  const [customerMoreOpen, setCustomerMoreOpen] = useState(false)
  const [customerBirthdate, setCustomerBirthdate] = useState('')
  const [customerAnniversary, setCustomerAnniversary] = useState('')
  const [customerNotes, setCustomerNotes] = useState('')
  const [hydrated, setHydrated] = useState(false)
  const [editingBillId, setEditingBillId] = useState<number | null>(null)
  const [editingBillNumber, setEditingBillNumber] = useState<string | null>(null)
  const [editingBillType, setEditingBillType] = useState<string | null>(null)
  const [editingBillStatus, setEditingBillStatus] = useState<string | null>(null)
  const [advancePaidInr, setAdvancePaidInr] = useState('')
  const [collectedAmountInr, setCollectedAmountInr] = useState('')
  const [paymentMethod, setPaymentMethod] = useState<ErpPaymentMethod>('bank')
  const [cashAmountInr, setCashAmountInr] = useState('')
  const [onlineAmountInr, setOnlineAmountInr] = useState('')
  const [selectedCustomer, setSelectedCustomer] = useState<ErpCustomer | null>(null)
  const [customerPickIdx, setCustomerPickIdx] = useState(-1)
  const [duplicateHighlights, setDuplicateHighlights] = useState<Set<number>>(() => new Set())
  const [duplicateScanMsg, setDuplicateScanMsg] = useState<string | null>(null)
  const [scanErrorMsg, setScanErrorMsg] = useState<string | null>(null)
  const [pdfShareOpen, setPdfShareOpen] = useState(false)
  const [pdfSharePayload, setPdfSharePayload] = useState<PdfShareSheetPayload | null>(null)
  const [saveConfirmOpen, setSaveConfirmOpen] = useState(false)
  const [savedBillOpen, setSavedBillOpen] = useState(false)
  const [savedBill, setSavedBill] = useState<ErpBill | null>(null)
  const [savedPdfPayload, setSavedPdfPayload] = useState<PdfShareSheetPayload | null>(null)
  const [ledgerSavedOpen, setLedgerSavedOpen] = useState(false)
  const [ledgerSavedMeta, setLedgerSavedMeta] = useState<{
    billNumber: string
    lane: 'hitesh' | 'jainav'
  } | null>(null)
  const [soldStockOpen, setSoldStockOpen] = useState(false)
  const [soldStockMessage, setSoldStockMessage] = useState('')
  const scanRef = useRef<HTMLInputElement>(null)
  const rowRefs = useRef<(HTMLTableRowElement | null)[]>([])
  const duplicateBannerRef = useRef<HTMLDivElement>(null)
  const billLoadGen = useRef(0)
  const suppressEditLoadRef = useRef(false)
  /** Prevents re-fetching the same estimate when slab/rates recalc changes loadBillForEdit identity. */
  const loadedEditBillRef = useRef<number | null>(null)
  const loadBillForEditRef = useRef<(id: number) => Promise<void>>(async () => {})
  const [workstation] = useErpWorkstationSelection()
  const [shopQuoteOutputMode, setShopQuoteOutputMode] = useState<ErpQuoteOutputMode>('pdf')
  const [goldSlabRShowMc, setGoldSlabRShowMc] = useState(true)
  const [pdfLayoutMode, setPdfLayoutMode] = useState<'detailed' | 'summary'>('detailed')
  const [quoteOutputOverride, setQuoteOutputOverride] = useState<ErpQuoteOutputMode | null>(null)
  const [quoteMenuOpen, setQuoteMenuOpen] = useState(false)
  const [gstInvoiceItems, setGstInvoiceItems] = useState<GstInvoiceItem[]>([])
  const [billingCatalogs, setBillingCatalogs] = useState<Record<string, DesignBillingStyle[]>>({})
  const [manualFocus, setManualFocus] = useState<{ lineKey: string; field: keyof ErpBillLine } | null>(null)
  const [manualEditingCell, setManualEditingCell] = useState<string | null>(null)
  const [cellDrafts, setCellDrafts] = useState<Record<string, string>>({})
  const cellDraftsRef = useRef<Record<string, string>>({})
  cellDraftsRef.current = cellDrafts
  const manualCellRefs = useRef<Record<string, HTMLInputElement | null>>({})

  const quoteOutputMode = useMemo(
    () =>
      resolveQuoteOutputModeForSlab(
        rateSlab,
        workstation.quoteOutputMode,
        shopQuoteOutputMode,
        quoteOutputOverride,
      ),
    [rateSlab, workstation.quoteOutputMode, shopQuoteOutputMode, quoteOutputOverride],
  )

  const generateQuoteButtonLabel = useMemo(() => {
    const prefix = editingBillId ? 'Update & ' : 'Generate '
    if (quoteOutputMode === 'epson') return `${prefix}Epson estimate`
    if (quoteOutputMode === 'both') return `${prefix}quote (PDF + Epson)`
    return `${prefix}PDF estimate`
  }, [editingBillId, quoteOutputMode])

  const tableCols = useMemo(() => TABLE_COLS, [])

  useEffect(() => {
    void fetchGstInvoiceItems().then(setGstInvoiceItems)
  }, [])

  useEffect(() => {
    if (!manualFocus) return
    const refKey = `${manualFocus.lineKey}-${String(manualFocus.field)}`
    const t = window.setTimeout(() => manualCellRefs.current[refKey]?.focus(), 40)
    return () => window.clearTimeout(t)
  }, [manualFocus])

  const loadBillingCatalog = useCallback(async (invoiceItemName: string) => {
    const res = await axios.get<{ styles: DesignBillingStyle[] }>(
      '/api/reseller/erp/design-master/billing-catalog',
      { params: { invoice_item: invoiceItemName } },
    )
    return res.data.styles || []
  }, [])

  const focusManualCell = useCallback((lineKey: string, field: keyof ErpBillLine) => {
    setManualFocus({ lineKey, field })
  }, [])

  const recalcLine = useCallback(
    (
      line: ErpBillLine,
      opts?: {
        slab?: ErpRateSlab
        rates?: unknown
        goldPerG?: number
        silverPerG?: number
        goldSlabRShowMc?: boolean
        wholesaleGold?: number | null
        wholesaleSilver?: number | null
      },
    ): ErpBillLine => {
      if (isPiecePricedBillLine(line)) {
        return applyPiecePricedLineCalc(line)
      }
      const slab = opts?.slab ?? rateSlab
      const rates = opts?.rates ?? displayRates
      const g = opts?.goldPerG ?? goldPerG
      const s = opts?.silverPerG ?? silverPerG
      const mcMode = opts?.goldSlabRShowMc ?? goldSlabRShowMc
      const whGold = opts?.wholesaleGold !== undefined ? opts.wholesaleGold : wholesaleGold
      const whSilver = opts?.wholesaleSilver !== undefined ? opts.wholesaleSilver : wholesaleSilver
      const withOriginal = {
        ...line,
        originalWeightGm: line.originalWeightGm ?? line.weightGm,
      }
      const slabLine = applyPieceSlabToLine(withOriginal, slab)
      const bd = computeLineBreakdown(
        slabLine,
        rates,
        slab,
        slabSettings,
        whGold,
        whSilver,
        g,
        s,
        mcMode,
      )
      const next: ErpBillLine = {
        ...slabLine,
        lineTotalInr: bd.total,
        originalWeightGm: withOriginal.originalWeightGm,
      }
      const isGoldSlabR =
        slab === 'R' && String(line.metal_type || '').toLowerCase().startsWith('gold')
      if (isGoldSlabR && mcMode !== false) {
        next.displayWastagePct = 0
        next.displayMcInr = bd.mc > 0 ? bd.mc : null
        next.displayMcBeforeDiscount =
          bd.mc_before_discount != null && bd.mc_before_discount > bd.mc
            ? bd.mc_before_discount
            : null
        next.displayMcDiscountPct = bd.mc_discount_pct ?? null
      } else if (isGoldSlabR) {
        next.displayWastagePct = line.wastage_pct ?? bd.wastage_pct ?? null
        next.displayMcInr = null
        next.displayMcBeforeDiscount = null
        next.displayMcDiscountPct = null
      } else {
        next.displayWastagePct = null
        next.displayMcInr = null
        next.displayMcBeforeDiscount = null
        next.displayMcDiscountPct = null
      }
      if (!line.rateLocked) {
        if (lineHasPieceSlabFields(slabLine) && String(line.metal_type || '').toLowerCase().startsWith('silver')) {
          const silverOffset =
            slab === 'R'
              ? Math.max(0, Number(slabSettings.slab_r?.silver_rate_offset_per_g) || 0)
              : 0
          next.ratePerGram = resolveErpSilverMetalRatePerG(
            slab,
            s,
            wholesaleSilver,
            silverOffset,
          )
        } else {
        const r = bd.rate_per_gram
        next.ratePerGram =
          r != null && Number.isFinite(r) ? Math.round(r * 100) / 100 : null
        }
      }
      return next
    },
    [displayRates, rateSlab, slabSettings, wholesaleGold, wholesaleSilver, goldPerG, silverPerG, goldSlabRShowMc],
  )

  const transitionLinesForSlab = useCallback(
    (
      list: ErpBillLine[],
      nextSlab: ErpRateSlab,
      ratesOverride?: unknown,
      goldOverride?: number,
      silverOverride?: number,
    ): ErpBillLine[] =>
      list.map((line) => {
        const withGift = applyGiftMrpForSlabChange(line, nextSlab, slabSettings)
        const cleared: ErpBillLine = {
          ...withGift,
          rateLocked: false,
          ratePerGram: null,
          displayMcInr: null,
          displayWastagePct: null,
          displayMcBeforeDiscount: null,
          displayMcDiscountPct: null,
        }
        return recalcLine(cleared, {
          slab: nextSlab,
          rates: ratesOverride,
          goldPerG: goldOverride,
          silverPerG: silverOverride,
        })
      }),
    [recalcLine, slabSettings],
  )

  const recalcAll = useCallback(
    (list: ErpBillLine[]) => list.map((line) => recalcLine(line)),
    [recalcLine],
  )

  const loadDisplayRates = useCallback(async () => {
    const url = `/api/rates/display${ratesApiQueryForStorefront()}`
    const res = await cachedGet(url, () =>
      axios.get<{ rates?: unknown }>(url),
    )
    const rates = res.data.rates ?? res.data
    setDisplayRates(rates)
    const pg = displayRatesToPerGram(rates)
    setGoldPerG(pg.gold)
    setSilverPerG(pg.silver)
    setEditGold(String(pg.gold || ''))
    setEditSilver(String(pg.silver || ''))
    return rates
  }, [])

  useEffect(() => {
    void loadDisplayRates()
    void axios
      .get<{ settings?: { printFormats?: unknown; gst?: { placeOfSupply?: string } } }>(
        '/api/reseller/erp/settings',
      )
      .then((res) => {
        const pf = migratePrintFormats(
          res.data.settings?.printFormats as Parameters<typeof migratePrintFormats>[0],
        )
        setShopQuoteOutputMode(normalizeQuoteOutputMode(pf.defaultQuoteOutputMode))
        setGoldSlabRShowMc(pf.goldSlabRShowMc !== false)
        const pos = String(res.data.settings?.gst?.placeOfSupply || '').trim()
        if (pos) {
          setDefaultPlaceOfSupply(pos)
          setPlaceOfSupply((cur) => cur || pos)
        }
      })
      .catch(() => {})
  }, [loadDisplayRates])

  useEffect(() => {
    if (duplicateScanMsg || scanErrorMsg) duplicateBannerRef.current?.focus()
  }, [duplicateScanMsg, scanErrorMsg])

  useEffect(() => {
    const d = loadDraft()
    if (d && !editIdParam) {
      if (d.customerId != null) setCustomerId(d.customerId)
      if (d.customerName) setCustomerName(d.customerName)
      if (d.mobile) setMobile(d.mobile)
      if (d.address) setAddress(d.address)
      if (d.customerPan) setCustomerPan(d.customerPan)
      if (d.customerGst) setCustomerGst(d.customerGst)
      if (d.rateSlab) setRateSlab(d.rateSlab)
      if (d.lines?.length) setLines(d.lines)
      if (d.wholesaleGold != null) setWholesaleGold(d.wholesaleGold)
      if (d.wholesaleSilver != null) setWholesaleSilver(d.wholesaleSilver)
      if (d.goldPerG) setGoldPerG(d.goldPerG)
      if (d.silverPerG) setSilverPerG(d.silverPerG)
      if (d.displayRates) setDisplayRates(d.displayRates)
      if (d.advancePaidInr != null) setAdvancePaidInr(d.advancePaidInr)
      if (d.collectedAmountInr != null) setCollectedAmountInr(d.collectedAmountInr)
      if (d.paymentMethod) setPaymentMethod(d.paymentMethod)
      if (d.cashAmountInr != null) setCashAmountInr(d.cashAmountInr)
      if (d.onlineAmountInr != null) setOnlineAmountInr(d.onlineAmountInr)
      if (d.editingBillId != null) setEditingBillId(d.editingBillId)
      if (d.editingBillNumber) setEditingBillNumber(d.editingBillNumber)
      if (d.editingBillType) setEditingBillType(d.editingBillType)
      if (d.editingBillStatus) setEditingBillStatus(d.editingBillStatus)
    }
    setHydrated(true)
  }, [editIdParam])

  const loadBillForEdit = useCallback(
    async (id: number) => {
      const gen = billLoadGen.current
      const res = await cachedGet(`/api/reseller/erp/bills/${id}`, () =>
        axios.get<{ bill: ErpBill }>(`/api/reseller/erp/bills/${id}`),
        5000,
      )
      if (gen !== billLoadGen.current || suppressEditLoadRef.current) return
      const bill = res.data.bill
      const billType = String(bill.bill_type || '').toLowerCase()
      if (billType === 'estimate' && String(bill.status || '').toLowerCase() === 'billed') {
        alert('This estimation is already billed and cannot be edited.')
        router.replace(resellerErpModulePath('estimations'))
        return
      }
      const session = (bill.session || {}) as ErpBillSession
      const restoredSlab =
        session.rateSlab || parseRateSlabFromNotes(bill.notes) || 'R'
      setEditingBillId(bill.id)
      setEditingBillNumber(bill.bill_number)
      setEditingBillType(billType)
      setEditingBillStatus(bill.status || 'draft')
      setCustomerId(bill.customer_id ?? null)
      setCustomerName(bill.customer_name || '')
      setMobile(session.mobile || '')
      setAddress(session.address || '')
      setCustomerPan(session.pan || '')
      setCustomerGst(session.customerGst || '')
      setPlaceOfSupply(session.placeOfSupply || defaultPlaceOfSupply || '')
      setRateSlab(restoredSlab)
      if (session.wholesaleGold != null) setWholesaleGold(session.wholesaleGold)
      if (session.wholesaleSilver != null) setWholesaleSilver(session.wholesaleSilver)
      if (session.goldPerG) {
        setGoldPerG(session.goldPerG)
        setSilverPerG(session.silverPerG ?? 0)
      }
      if (session.displayRates) setDisplayRates(session.displayRates)
      else if (session.goldPerG) {
        setDisplayRates(perGramToDisplayRates(session.goldPerG, session.silverPerG ?? 0))
      }
      setAdvancePaidInr(session.advancePaidInr ? String(session.advancePaidInr) : '')
      setCollectedAmountInr(
        session.collectedAmountInr != null ? String(session.collectedAmountInr) : '',
      )
      setPaymentMethod(session.paymentMethod || 'bank')
      setCashAmountInr(session.cashAmountInr != null ? String(session.cashAmountInr) : '')
      setOnlineAmountInr(session.onlineAmountInr != null ? String(session.onlineAmountInr) : '')
      if (session.goldSlabRShowMc === false) setGoldSlabRShowMc(false)
      const loadedLines = applyRatesUnfixed(bill.lines || [], session.ratesUnfixed)
      const mcMode = session.goldSlabRShowMc === false ? false : goldSlabRShowMc
      const recalcedLines = loadedLines.map((l) =>
        recalcLine(l, { slab: restoredSlab, goldSlabRShowMc: mcMode }),
      )
      setLines(recalcedLines)
      saveDraft({
        customerId: bill.customer_id ?? null,
        customerName: bill.customer_name || '',
        mobile: session.mobile || '',
        address: session.address || '',
        customerPan: session.pan || '',
        customerGst: session.customerGst || '',
        rateSlab: restoredSlab,
        lines: recalcedLines,
        wholesaleGold: session.wholesaleGold ?? null,
        wholesaleSilver: session.wholesaleSilver ?? null,
        goldPerG: session.goldPerG ?? goldPerG,
        silverPerG: session.silverPerG ?? silverPerG,
        displayRates: session.displayRates ?? displayRates,
        advancePaidInr: session.advancePaidInr != null ? String(session.advancePaidInr) : '',
        collectedAmountInr:
          session.collectedAmountInr != null ? String(session.collectedAmountInr) : '',
        paymentMethod: session.paymentMethod || 'bank',
        cashAmountInr: session.cashAmountInr != null ? String(session.cashAmountInr) : '',
        onlineAmountInr: session.onlineAmountInr != null ? String(session.onlineAmountInr) : '',
        editingBillId: bill.id,
        editingBillNumber: bill.bill_number,
        editingBillType: bill.bill_type,
        editingBillStatus: bill.status,
      })
    },
    [router, recalcLine, goldPerG, silverPerG, displayRates],
  )

  loadBillForEditRef.current = loadBillForEdit

  useEffect(() => {
    if (!hydrated) return
    if (!editIdParam) {
      suppressEditLoadRef.current = false
      loadedEditBillRef.current = null
      return
    }
    if (suppressEditLoadRef.current) return
    const id = parseInt(editIdParam, 10)
    if (!Number.isFinite(id)) return
    if (loadedEditBillRef.current === id) return
    loadedEditBillRef.current = id
    void loadBillForEditRef.current(id).catch((e) => alert(erpErr(e)))
  }, [hydrated, editIdParam])

  useEffect(() => {
    if (!hydrated) return
    saveDraft({
      customerId,
      customerName,
      mobile,
      address,
      customerPan,
      customerGst,
      rateSlab,
      lines,
      wholesaleGold,
      wholesaleSilver,
      goldPerG,
      silverPerG,
      displayRates,
      advancePaidInr,
      collectedAmountInr,
      paymentMethod,
      cashAmountInr,
      onlineAmountInr,
      editingBillId,
      editingBillNumber,
      editingBillType,
      editingBillStatus,
    })
  }, [hydrated, customerId, customerName, mobile, address, customerPan, customerGst, rateSlab, lines, wholesaleGold, wholesaleSilver, goldPerG, silverPerG, displayRates, advancePaidInr, collectedAmountInr, paymentMethod, cashAmountInr, onlineAmountInr, editingBillId, editingBillNumber, editingBillType, editingBillStatus])

  useEffect(() => {
    if (!hydrated || !displayRates) return
    setLines((prev) => recalcAll(prev))
  }, [displayRates, rateSlab, wholesaleGold, wholesaleSilver, slabSettings, hydrated, recalcAll])

  const loadCustomers = useCallback(async (q: string) => {
    const params = q.trim() ? { q: q.trim() } : {}
    const cacheKey = `/api/reseller/erp/customers?${JSON.stringify(params)}`
    const res = await cachedGet(cacheKey, () =>
      axios.get<{ customers: ErpCustomer[] }>('/api/reseller/erp/customers', { params }),
      30000,
    )
    setCustomers(res.data.customers || [])
  }, [])

  useEffect(() => {
    const t = setTimeout(() => void loadCustomers(customerQ), 250)
    return () => clearTimeout(t)
  }, [customerQ, loadCustomers])

  const selectCustomer = (c: ErpCustomer) => {
    setCustomerId(c.id)
    setCustomerName(c.name)
    setMobile(c.mobile || '')
    setAddress(c.address || '')
    setCustomerGst(c.gstin || '')
    setCustomerPan(c.pan || '')
    setPlaceOfSupply(
      resolveCustomerPlaceOfSupply({
        customerState: c.state,
        customerGstin: c.gstin,
        resellerDefault: defaultPlaceOfSupply,
      }),
    )
    setSelectedCustomer(c)
    setCustomerBirthdate(toIsoDateInput(c.birthdate))
    setCustomerAnniversary(toIsoDateInput(c.anniversary_date))
    setCustomerNotes(c.notes || '')
    setCustomerQ('')
    setCustomerPickIdx(-1)
    const assigned = normalizeErpCustomerSlab(c.rate_slab)
    setRateSlab(assigned)
    setLines((prev) => (prev.length ? transitionLinesForSlab(prev, assigned) : prev))
    requestAnimationFrame(() => scanRef.current?.focus())
  }

  const saveCustomerQuick = async () => {
    const name = (customerName || customerQ).trim()
    if (!name) {
      alert('Enter a customer name to save.')
      return
    }
    setCustomerSaveBusy(true)
    try {
      const payload = {
        name,
        mobile: mobile.trim() || undefined,
        address: address.trim() || undefined,
        pan: customerPan.trim() || undefined,
        gstin: customerGst.trim() || undefined,
        birthdate: customerBirthdate.trim() || undefined,
        anniversary_date: customerAnniversary.trim() || undefined,
        notes: customerNotes.trim() || undefined,
        rate_slab: rateSlab,
      }
      const res = customerId
        ? await axios.put<{ success: boolean; customer: ErpCustomer }>(
            `/api/reseller/erp/customers/${customerId}`,
            payload,
          )
        : await axios.post<{ success: boolean; customer: ErpCustomer }>(
            '/api/reseller/erp/customers',
            payload,
          )
      selectCustomer(res.data.customer)
    } catch (e) {
      alert(erpErr(e))
    } finally {
      setCustomerSaveBusy(false)
    }
  }

  const onCustomerKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    const list = customers.slice(0, 8)
    if (e.key === 'Enter') {
      e.preventDefault()
      if (customerQ.trim() && list.length > 0) {
        const idx = customerPickIdx >= 0 && customerPickIdx < list.length ? customerPickIdx : 0
        selectCustomer(list[idx]!)
        return
      }
      requestAnimationFrame(() => scanRef.current?.focus())
      return
    }
    if (!customerQ.trim() || !list.length) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setCustomerPickIdx((i) => Math.min(i + 1, list.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setCustomerPickIdx((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Escape') {
      setCustomerPickIdx(-1)
      setCustomerQ('')
    }
  }

  const clearDuplicateState = () => {
    setDuplicateHighlights(new Set())
    setDuplicateScanMsg(null)
    setScanErrorMsg(null)
  }

  const scrollToDuplicateRow = (idx: number) => {
    setDuplicateHighlights((prev) => {
      const next = new Set(prev)
      next.add(idx)
      return next
    })
    const row = rowRefs.current[idx]
    row?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  const dismissScanBanner = () => {
    setDuplicateScanMsg(null)
    setScanErrorMsg(null)
    scanRef.current?.focus()
  }

  const scanWithCode = async (rawCode: string) => {
    const code = rawCode.trim()
    if (!code || scanBusy) return

    const shortcut = resolveBillingScanShortcut(code)
      if (shortcut) {
      const invoiceItem = findInvoiceItemForCategory(shortcut, gstInvoiceItems)
      if (!invoiceItem) {
        setScanErrorMsg('Configure invoice item categories in GST settings first (A / S / B / G shortcuts).')
        setScanCode('')
        scanRef.current?.focus()
        return
      }
      setScanBusy(true)
      setScanErrorMsg(null)
      try {
        if (!billingCatalogs[invoiceItem.name]) {
          const catalog = await loadBillingCatalog(invoiceItem.name)
          setBillingCatalogs((prev) => ({ ...prev, [invoiceItem.name]: catalog }))
        }
        const rates =
          Array.isArray(displayRates) && displayRates.length
            ? displayRates
            : await loadDisplayRates()
        const pg = displayRatesToPerGram(rates)
        const line = recalcLine(createManualBillLine(shortcut, invoiceItem, rateSlab), {
          rates,
          goldPerG: pg.gold,
          silverPerG: pg.silver,
        })
        setLines((prev) => [...prev, line])
        setScanCode('')
        const lineKey = line.code || `manual-${Date.now()}`
        focusManualCell(lineKey, firstManualEntryField(line))
      } catch (e) {
        setScanErrorMsg(erpErr(e))
        setScanCode('')
        scanRef.current?.focus()
      } finally {
        setScanBusy(false)
      }
      return
    }

    const dupIdx = lines.findIndex(
      (l) => (l.barcode || '').trim().toLowerCase() === code.toLowerCase(),
    )
    if (dupIdx >= 0) {
      scrollToDuplicateRow(dupIdx)
      setDuplicateScanMsg(`This barcode is already in the list (${code}).`)
      setScanCode('')
      scanRef.current?.focus()
      return
    }

    setScanBusy(true)
    try {
      const res = await axios.get<{ product: ErpProductHit; availability?: { label: string } }>(
        '/api/reseller/erp/products/lookup',
        { params: { code } },
      )
      let line = productToLine(res.data.product, code, rateSlab)
      if (res.data.availability?.label) line.availability = res.data.availability.label
      const mrpNames = mrpInvoiceItemNames(gstInvoiceItems)
      if (mrpNames.has(String(line.invoice_item_name || line.name || '').trim().toUpperCase())) {
        line = { ...line, mrpMode: true }
      }
      line = recalcLine(line)
      setLines((prev) => [...prev, line])
      setScanCode('')
      scanRef.current?.focus()
    } catch (e) {
      const err = e as {
        response?: {
          status?: number
          data?: { error?: string; conflicts?: SoldBillConflict[]; sold_bill?: SoldBillConflict['sold_bill'] }
        }
      }
      if (err.response?.status === 409) {
        const conflicts = err.response.data?.conflicts
        const msg = conflicts?.length
          ? formatSoldStockMessage(conflicts)
          : err.response.data?.error || 'This item is already sold.'
        setSoldStockMessage(msg)
        setSoldStockOpen(true)
        setScanErrorMsg(null)
      } else {
      setScanErrorMsg(erpErr(e))
      }
      setScanCode('')
      scanRef.current?.focus()
    } finally {
      setScanBusy(false)
    }
  }

  const scan = async () => scanWithCode(scanCode)

  const updateLine = (idx: number, patch: Partial<ErpBillLine>) => {
    setLines((prev) =>
      prev.map((l, i) => {
        if (i !== idx) return l
        const weightPatch =
          'gross_weight' in patch || 'bag_wt' in patch || 'bags' in patch
            ? applyManualWeightPatch(l, patch)
            : patch
        return recalcLine({ ...l, ...weightPatch })
      }),
    )
  }

  const applyManualWeightPatch = (line: ErpBillLine, patch: Partial<ErpBillLine>): Partial<ErpBillLine> => {
    const merged = { ...line, ...patch }
    const gross = merged.gross_weight
    if (gross != null && Number.isFinite(Number(gross))) {
      const stone =
        merged.stone_wt != null && Number.isFinite(Number(merged.stone_wt)) ? Number(merged.stone_wt) : 0
      const bagCount =
        merged.bags != null && String(merged.bags).trim() !== '' && Number.isFinite(Number(merged.bags))
          ? Math.max(0, Number(merged.bags))
          : 0
      const bagUnitWt =
        merged.bag_wt != null && Number.isFinite(Number(merged.bag_wt)) ? Number(merged.bag_wt) : 0
      let bagDeduction = 0
      if (bagCount > 0 && bagUnitWt > 0) {
        bagDeduction = bagCount * bagUnitWt
      } else if (bagUnitWt > 0) {
        bagDeduction = bagUnitWt
      }
      const net = Number(gross) - bagDeduction - stone
      if (Number.isFinite(net) && net >= 0) {
        return { ...patch, weightGm: Math.round(net * 1000) / 1000 }
      }
    }
    return patch
  }

  const updateManualLine = (idx: number, patch: Partial<ErpBillLine>) => {
    setLines((prev) =>
      prev.map((l, i) => {
        if (i !== idx) return l
        const weightPatch =
          l.manualEntry &&
          ('gross_weight' in patch || 'bag_wt' in patch || 'bags' in patch)
            ? applyManualWeightPatch(l, patch)
            : patch
        return recalcLine({ ...l, ...weightPatch })
      }),
    )
  }

  const applyDesignDefaults = useCallback(
    async (lineIdx: number, styleCode: string, sku: string, afterApply?: () => void) => {
      try {
        const res = await axios.get<{ defaults: Record<string, unknown> | null }>(
          '/api/reseller/erp/design-master/lookup',
          { params: { style_code: styleCode, sku } },
        )
        const d = res.data.defaults
        let catalogProducts: { name: string; image_url?: string | null }[] = []
        try {
          const cat = await axios.get<{ products: { name: string; image_url?: string | null }[] }>(
            '/api/reseller/erp/design-master/catalog-products',
            { params: { style_code: styleCode, sku } },
          )
          catalogProducts = cat.data.products || []
        } catch {
          catalogProducts = []
        }
        if (!d) {
          setLines((prev) =>
            prev.map((l, i) => {
              if (i !== lineIdx) return l
              const gift = isGiftManualLine(l)
              const keepName = String(l.name || '').trim()
              const name =
                gift && (!keepName || keepName.toUpperCase() === sku.toUpperCase()) ? '' : gift ? keepName : sku
              return recalcLine({
                ...l,
                style_code: styleCode,
                sku,
                name,
                designProductOptions: catalogProducts,
              })
            }),
          )
          afterApply?.()
          return
        }
        const storedNames = Array.isArray((d as { product_names?: unknown }).product_names)
          ? ((d as { product_names: { name: string; image_url?: string | null }[] }).product_names)
          : []
        const mergedProducts = (() => {
          const seen = new Set<string>()
          const out: { name: string; image_url?: string | null }[] = []
          for (const p of [...storedNames, ...catalogProducts]) {
            const key = String(p.name || '').trim().toUpperCase()
            if (!key || seen.has(key)) continue
            seen.add(key)
            out.push({ name: p.name.trim(), image_url: p.image_url ?? null })
          }
          return out
        })()
        setLines((prev) =>
          prev.map((l, i) => {
            if (i !== lineIdx) return l
            const num = (k: string) => {
              const v = d[k]
              if (v == null || v === '') return null
              const n = Number(v)
              return Number.isFinite(n) ? n : null
            }
            const sizeVariants = Array.isArray((d as { size_variants?: unknown }).size_variants)
              ? ((d as { size_variants: { size_label: string; fixed_price_mrp: number | null }[] }).size_variants)
              : undefined
            const isGift =
              l.manualCategory === 'gift' ||
              String(d.invoice_item_name || '').toUpperCase().includes('GIFT') ||
              isGiftManualLine(l)
            const keepName = String(l.name || '').trim()
            const skuUpper = sku.toUpperCase()
            const productName = isGift
              ? keepName && keepName.toUpperCase() !== skuUpper
                ? keepName
                : ''
              : String(d.product_name || l.name || sku)
            let fixedPrice = num('fixed_price') ?? l.fixed_price
            let mrpList: number | null = null
            if (isGift && fixedPrice != null && fixedPrice > 0) {
              mrpList = fixedPrice
              fixedPrice = giftMrpSlabPrice(fixedPrice, rateSlab, slabSettings)
            }
            return recalcLine({
              ...l,
              style_code: styleCode,
              sku,
              name: productName,
              purity: num('purity') ?? l.purity,
              metal_type: String(d.metal_type || l.metal_type || 'silver'),
              wastage_pct: num('wastage_pct') ?? l.wastage_pct,
              mc_rate: num('mc_rate') ?? l.mc_rate,
              mc_type: (d.mc_type as string) ?? l.mc_type,
              mc_rate_slab_r: num('mc_rate_slab_r') ?? l.mc_rate_slab_r,
              mc_rate_slab_w: num('mc_rate_slab_w') ?? l.mc_rate_slab_w,
              mc_rate_slab_f: num('mc_rate_slab_f') ?? l.mc_rate_slab_f,
              metal_slab_r_pct: num('metal_slab_r_pct') ?? l.metal_slab_r_pct,
              metal_slab_w_pct: num('metal_slab_w_pct') ?? l.metal_slab_w_pct,
              metal_slab_f_pct: num('metal_slab_f_pct') ?? l.metal_slab_f_pct,
              invoice_item_name: (d.invoice_item_name as string) || l.invoice_item_name,
              hsn_code: (d.hsn_code as string) || l.hsn_code,
              designSizeOptions: sizeVariants,
              designProductOptions: mergedProducts,
              mrpMode: isGift ? true : l.mrpMode,
              mrpListPrice: mrpList ?? l.mrpListPrice,
              fixed_price: fixedPrice,
              unitInr: isGift && fixedPrice ? fixedPrice : l.unitInr,
            })
          }),
        )
        afterApply?.()
      } catch {
        setLines((prev) =>
          prev.map((l, i) => {
            if (i !== lineIdx) return l
            const gift = isGiftManualLine(l)
            const keepName = String(l.name || '').trim()
            return recalcLine({
              ...l,
              style_code: styleCode,
              sku,
              name: gift && (!keepName || keepName.toUpperCase() === sku.toUpperCase()) ? '' : gift ? keepName : sku,
            })
          }),
        )
        afterApply?.()
      }
    },
    [recalcLine, rateSlab, slabSettings],
  )

  const unlockLineRates = (list: ErpBillLine[]) =>
    list.map((l) => ({ ...l, rateLocked: false }))

  const onSlabChange = (next: ErpRateSlab) => {
    if (next === 'W' || next === 'F') {
      const hasWh =
        (wholesaleGold != null && wholesaleGold > 0) ||
        (wholesaleSilver != null && wholesaleSilver > 0)
      if (hasWh) {
        setRateSlab(next)
        setLines((prev) => transitionLinesForSlab(prev, next))
        return
      }
      setPendingSlab(next)
      setModalWhGold(wholesaleGold != null ? String(wholesaleGold) : '')
      setModalWhSilver(wholesaleSilver != null ? String(wholesaleSilver) : '')
      setShowWholesaleModal(true)
      return
    }
    void loadDisplayRates().then((rates) => {
      const pg = displayRatesToPerGram(rates)
      setRateSlab(next)
      setLines((prev) => transitionLinesForSlab(prev, next, rates, pg.gold, pg.silver))
    })
  }

  const openEditWholesale = () => {
    setPendingSlab(null)
    setModalWhGold(wholesaleGold != null ? String(wholesaleGold) : '')
    setModalWhSilver(wholesaleSilver != null ? String(wholesaleSilver) : '')
    setShowWholesaleModal(true)
  }

  const applyWholesaleSlab = () => {
    const gRaw = modalWhGold.trim()
    const sRaw = modalWhSilver.trim()
    const g = gRaw ? Number(gRaw) : null
    const s = sRaw ? Number(sRaw) : null
    const hasGold = g != null && Number.isFinite(g) && g > 0
    const hasSilver = s != null && Number.isFinite(s) && s > 0
    if (!hasGold && !hasSilver) {
      alert('Enter wholesale gold or silver ₹/g')
      return
    }
    if (gRaw && !hasGold) {
      alert('Enter a valid gold ₹/g')
      return
    }
    if (sRaw && !hasSilver) {
      alert('Enter a valid silver ₹/g')
      return
    }
    const gVal = hasGold ? g : wholesaleGold
    const sVal = hasSilver ? s : wholesaleSilver
    if (hasGold) setWholesaleGold(g)
    if (hasSilver) setWholesaleSilver(s)
    const nextSlab = pendingSlab ?? rateSlab
    if (pendingSlab) setRateSlab(pendingSlab)
    setLines((prev) =>
      prev.map((line) => {
        const withGift = applyGiftMrpForSlabChange(line, nextSlab, slabSettings)
        return recalcLine(
          {
            ...withGift,
            rateLocked: false,
            ratePerGram: null,
            displayMcInr: null,
            displayWastagePct: null,
            displayMcBeforeDiscount: null,
            displayMcDiscountPct: null,
          },
          { slab: nextSlab, wholesaleGold: gVal, wholesaleSilver: sVal },
        )
      }),
    )
    setShowWholesaleModal(false)
    setPendingSlab(null)
  }

  const applyRateEdit = () => {
    const g = Number(editGold)
    const s = Number(editSilver)
    if (!Number.isFinite(g) || g <= 0 || !Number.isFinite(s) || s <= 0) {
      alert('Enter valid gold and silver rates')
      return
    }
    setGoldPerG(g)
    setSilverPerG(s)
    setDisplayRates(perGramToDisplayRates(g, s))
    setLines((prev) => unlockLineRates(prev))
    setShowRateEdit(false)
  }

  const rateUnfix = () => {
    setLines((prev) => prev.map((l) => ({ ...l, ratePerGram: null, rateLocked: true })))
  }

  const ratesUnfixed = useMemo(
    () => lines.length > 0 && lines.every((l) => l.rateLocked),
    [lines],
  )

  const totals = useMemo(() => {
    let taxable = 0
    let gst = 0
    let net = 0
    let weight = 0
    for (const l of lines) {
      const bd = computeLineBreakdown(l, displayRates, rateSlab, slabSettings, wholesaleGold, wholesaleSilver, goldPerG, silverPerG, goldSlabRShowMc)
      taxable += bd.taxable
      gst += (bd.cgst || 0) + (bd.sgst || 0)
      net += bd.total
      weight += Number(l.weightGm) || 0
    }
    return { subtotal: taxable, gst, net, weight, count: lines.length }
  }, [lines, displayRates, rateSlab, slabSettings, wholesaleGold, wholesaleSilver, goldPerG, silverPerG])

  const resetBill = () => {
    billLoadGen.current += 1
    suppressEditLoadRef.current = true
    loadedEditBillRef.current = null
    clearDuplicateState()
    setLines([])
    setScanCode('')
    setCustomerQ('')
    setCustomerId(null)
    setCustomerName('')
    setMobile('')
    setAddress('')
    setCustomerPan('')
    setCustomerGst('')
    setPlaceOfSupply(defaultPlaceOfSupply)
    setSelectedCustomer(null)
    setRateSlab('R')
    setWholesaleGold(null)
    setWholesaleSilver(null)
    setEditingBillId(null)
    setEditingBillNumber(null)
    setEditingBillType(null)
    setEditingBillStatus(null)
    setAdvancePaidInr('')
    setCollectedAmountInr('')
    setPaymentMethod('bank')
    setCashAmountInr('')
    setOnlineAmountInr('')
    clearDraftStorage()
    void loadDisplayRates()
    router.replace(resellerErpModulePath('billing'))
  }

  const parsedAdvance = Math.max(0, parseFloat(advancePaidInr) || 0)
  const parsedCollected =
    collectedAmountInr.trim() !== '' && Number.isFinite(parseFloat(collectedAmountInr))
      ? parseFloat(collectedAmountInr)
      : null
  const discountSummary = useMemo(
    () =>
      computeBillingDiscountSummary({
        netTotal: totals.net,
        collectedAmount: parsedCollected,
        lines,
      }),
    [totals.net, parsedCollected, lines],
  )
  const balanceDue = Math.max(0, totals.net - parsedAdvance)
  const isOfficialGstBill = !shouldRouteSaleToShadow({
    customerGst,
    paymentMethod,
    collectedAmountInr: parsedCollected,
  })
  const previewLane = previewLedgerLane(paymentMethod, collectedAmountInr)

  const buildPayload = (
    billType: 'sale' | 'estimate',
    status: string,
    extra?: { bill_number?: string; placeOfSupply?: string },
  ) => ({
    bill_type: billType,
    customer_id: customerId,
    customer_name: customerName,
    total_inr: totals.net,
    status,
    ...(extra?.bill_number ? { bill_number: extra.bill_number } : {}),
    notes: address ? `Rate slab ${rateSlab} · ${address}` : `Rate slab ${rateSlab}`,
    lines: lines.map((l) => ({ ...l, lineTotalInr: l.lineTotalInr ?? 0 })),
    session: buildErpBillSession({
      rateSlab,
      wholesaleGold,
      wholesaleSilver,
      goldPerG,
      silverPerG,
      displayRates,
      mobile,
      address,
      lines,
      advancePaidInr: parsedAdvance,
      pan: customerPan,
      customerGst,
      placeOfSupply: extra?.placeOfSupply ?? placeOfSupply,
      collectedAmountInr: parsedCollected,
      paymentMethod,
      cashAmountInr:
        paymentMethod === 'mixed' && cashAmountInr.trim() !== '' ? Number(cashAmountInr) : null,
      onlineAmountInr:
        paymentMethod === 'mixed' && onlineAmountInr.trim() !== '' ? Number(onlineAmountInr) : null,
      mcDiscountInr: discountSummary.mcDiscountInr,
      cashDiscountInr: discountSummary.cashDiscountInr,
      totalDiscountInr: discountSummary.totalDiscountInr,
      netTotalInr: totals.net,
      goldSlabRShowMc,
    }),
    ...(editingBillId &&
    editingBillType === 'estimate' &&
    billType === 'sale' && { source_estimate_id: editingBillId }),
  })

  const persistBill = async (
    billType: 'sale' | 'estimate',
    status: string,
    opts?: { skipReset?: boolean; bill_number?: string; placeOfSupply?: string },
  ): Promise<ErpBill | null> => {
    if (saveBusy || lines.length === 0) return null
    setSaveBusy(true)
    try {
      const payload = buildPayload(billType, status, {
        bill_number: opts?.bill_number,
        placeOfSupply: opts?.placeOfSupply,
      })
      let bill: ErpBill
      if (editingBillId && billType === 'estimate') {
        const res = await axios.put<{ bill: ErpBill }>(`/api/reseller/erp/bills/${editingBillId}`, payload)
        bill = res.data.bill
        setEditingBillStatus(bill.status || status)
      } else {
        const res = await axios.post<{ bill: ErpBill; shadow?: boolean; lane?: 'hitesh' | 'jainav' }>(
          '/api/reseller/erp/bills',
          payload,
        )
        bill = res.data.bill
        if (billType === 'sale' && res.data.shadow) {
          ;(bill as ErpBill & { shadow?: boolean; lane?: string }).shadow = true
          ;(bill as ErpBill & { lane?: string }).lane = res.data.lane
        }
        if (billType === 'estimate') {
          setEditingBillId(bill.id)
          setEditingBillNumber(bill.bill_number)
          router.replace(`${resellerErpModulePath('billing')}?edit=${bill.id}`)
        }
      }
      if (billType === 'sale' && !opts?.skipReset) {
        resetBill()
      }
      return bill
    } catch (e) {
      const err = e as {
        response?: { status?: number; data?: { error?: string; conflicts?: SoldBillConflict[] } }
      }
      if (err.response?.status === 409 && err.response.data?.conflicts?.length) {
        setSoldStockMessage(formatSoldStockMessage(err.response.data.conflicts))
        setSoldStockOpen(true)
      } else {
      alert(erpErr(e))
      }
      return null
    } finally {
      setSaveBusy(false)
    }
  }

  const confirmSaveBill = async (opts: { billNumber: string; placeOfSupply: string }) => {
    if (ratesUnfixed) {
      setSaveConfirmOpen(false)
      alert('Rates are unfixed. Fix rates before saving a completed sales bill — use Generate quote for rate-unfix estimates.')
      return
    }
    setSaveConfirmOpen(false)
    clearDuplicateState()
    const bill = await persistBill('sale', 'completed', {
      skipReset: true,
      bill_number: opts.billNumber || undefined,
      placeOfSupply: opts.placeOfSupply || placeOfSupply,
    })
    if (!bill) return
    const shadowBill = bill as ErpBill & { shadow?: boolean; lane?: 'hitesh' | 'jainav' }
    if (shadowBill.shadow) {
      resetBill()
      return
    }
    try {
      const payload = await buildErpSalesPdfPayload({
        bill,
        brandLabel,
        customerName,
        mobile,
        customerAddress: address,
        customerPan,
        customerGst,
        slabSettingsRaw: auth.user,
      })
      setSavedBill(bill)
      setSavedPdfPayload(payload)
      setSavedBillOpen(true)
    } catch (e) {
      console.error(e)
      alert('Bill saved but invoice PDF could not be created.')
      resetBill()
    }
  }

  const onLedgerSavedDone = () => {
    setLedgerSavedMeta(null)
    resetBill()
  }

  const onSavedBillDone = () => {
    setSavedBill(null)
    setSavedPdfPayload(null)
    resetBill()
  }

  const generateQuote = async (modeOverride?: ErpQuoteOutputMode) => {
    if (modeOverride) setQuoteOutputOverride(modeOverride)
    const mode = modeOverride ?? quoteOutputMode
    clearDuplicateState()
    const status = deriveEstimateStatus({
      lines,
      advancePaidInr: parsedAdvance,
      keepCancelled: true,
      currentStatus: editingBillStatus,
    })
    const bill = await persistBill('estimate', status, { skipReset: true })
    if (!bill) return

    const wantsPdf = mode === 'pdf' || mode === 'both'
    const wantsEpson = mode === 'epson' || mode === 'both'

    try {
      if (wantsEpson) {
        try {
          const msg = await printErpEstimateThermal(bill.id)
          alert(msg)
        } catch (e) {
          const errMsg =
            (e as Error)?.message ||
            (e as { response?: { data?: { error?: string } } })?.response?.data?.error ||
            'Could not print estimate on Epson — start the local print agent on this PC and check Hardware → Epson billing printer.'
          if (!wantsPdf) {
            alert(errMsg)
            return
          }
          alert(`${errMsg}\n\nPDF quote will still open.`)
        }
      }

      if (wantsPdf) {
      await shareErpQuotePdf({
        bill,
        brandLabel,
        customerName,
        mobile,
        slabSettingsRaw: auth.user,
          layoutMode: pdfLayoutMode,
        onSheet: (payload) => {
          setPdfSharePayload(payload)
          setPdfShareOpen(true)
        },
      })
      }
    } catch (e) {
      console.error(e)
      alert('Estimate saved but output could not be completed.')
    }
  }

  const cellVal = (line: ErpBillLine, key: string): string | number => {
    switch (key) {
      case 'barcode':
        return line.barcode || ''
      case 'sku':
        return line.sku || '—'
      case 'style_code':
        return line.style_code || '—'
      case 'name':
        return line.name
      case 'invoice_item_name':
        return line.invoice_item_name || line.name
      case 'hsn_code':
        return line.hsn_code || ''
      case 'size':
        return line.size || '—'
      case 'weightGm': {
        const net = line.originalWeightGm ?? line.weightGm
        return net != null && Number.isFinite(Number(net)) ? net : ''
      }
      case 'gross_weight':
        return line.gross_weight != null && Number.isFinite(Number(line.gross_weight)) ? line.gross_weight : ''
      case 'bags':
        return line.bags ?? ''
      case 'bag_wt':
        return line.bag_wt != null && Number.isFinite(Number(line.bag_wt)) ? line.bag_wt : ''
      case 'purity':
        return line.purity != null && Number.isFinite(Number(line.purity)) ? line.purity : ''
      case 'wastage_pct':
        return billingWastageDisplay(line, rateSlab, goldSlabRShowMc)
      case 'ratePerGram':
        return line.ratePerGram ?? ''
      case 'mc_rate':
        return billingMcDisplay(line, rateSlab, goldSlabRShowMc)
      case 'mc_type':
        return line.mc_type ?? ''
      case 'qty':
        if (line.manualCategory === 'gift' || line.mrpMode) {
          return line.qty != null && Number(line.qty) > 0 ? line.qty : ''
        }
        return line.qty ?? 1
      case 'box_charges':
        return line.box_charges ?? 0
      case 'stone_charges':
        return line.stone_charges ?? 0
      case 'metal_type':
        return line.metal_type || 'silver'
      case 'fixed_price':
        return line.fixed_price ?? ''
      case 'amount':
        return formatErpInr(line.lineTotalInr ?? 0)
      default:
        return ''
    }
  }

  const cellInputDisplayValue = (lineKey: string, key: string, line: ErpBillLine): string => {
    const refKey = `${lineKey}-${key}`
    if (cellDrafts[refKey] !== undefined) return cellDrafts[refKey]
    const raw = cellVal(line, key)
    if (manualEditingCell === refKey) {
      if (raw === 0 || raw === '0') return ''
    }
    return String(raw ?? '')
  }

  const commitNumericCell = (idx: number, line: ErpBillLine, k: keyof ErpBillLine, raw: string) => {
    const parsed = parseNumericCellValue(raw)
    const patch: Partial<ErpBillLine> = {
      [k]: parsed,
    } as Partial<ErpBillLine>
    if (k === 'weightGm') {
      patch.originalWeightGm = parsed
      patch.weightGm = parsed
    }
    if (k === 'ratePerGram') {
      patch.rateLocked = raw !== ''
    }
    if (k === 'fixed_price' && isPiecePricedBillLine({ ...line, ...patch })) {
      if (parsed != null) patch.unitInr = parsed
    }
    if (k === 'qty' && (line.manualCategory === 'gift' || line.mrpMode) && parsed == null) {
      patch.qty = 0
    }
    if (line.manualEntry) {
      updateManualLine(idx, patch)
    } else {
      updateLine(idx, patch)
    }
  }

  const commitNumericCellRef = useRef(commitNumericCell)
  commitNumericCellRef.current = commitNumericCell

  const flushNumericDraft = useCallback(
    (lineKey: string, idx: number, line: ErpBillLine, k: keyof ErpBillLine) => {
      const refKey = `${lineKey}-${String(k)}`
      const draft = cellDraftsRef.current[refKey]
      if (draft === undefined) return
      commitNumericCellRef.current(idx, line, k, draft)
      setCellDrafts((prev) => {
        const next = { ...prev }
        delete next[refKey]
        return next
      })
    },
    [],
  )

  const collapseManualRow = useCallback((idx: number) => {
    setLines((prev) =>
      prev.map((l, i) => (i === idx ? { ...l, manualEntryOpen: false } : l)),
    )
  }, [])

  const advanceBillField = useCallback(
    (lineKey: string, field: keyof ErpBillLine, line: ErpBillLine, idx: number) => {
      if (NUMERIC_EDIT_KEYS.includes(field)) {
        flushNumericDraft(lineKey, idx, line, field)
      }
      const nextKey = nextBillTableField(tableCols, String(field), line)
      if (nextKey) {
        focusManualCell(lineKey, nextKey as keyof ErpBillLine)
      } else {
        setManualFocus(null)
        collapseManualRow(idx)
        scanRef.current?.focus()
      }
    },
    [focusManualCell, tableCols, flushNumericDraft, collapseManualRow],
  )

  if (!hydrated) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-sm text-[var(--color-jewelry-black,#1a1814)]/55">
        Loading billing…
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <PdfShareSheet open={pdfShareOpen} onOpenChange={setPdfShareOpen} payload={pdfSharePayload} minimal />
      <ErpSaveBillConfirmDialog
        open={saveConfirmOpen}
        onOpenChange={setSaveConfirmOpen}
        customerName={customerName}
        netTotal={totals.net}
        itemCount={lines.length}
        busy={saveBusy}
        isOfficialGst={isOfficialGstBill}
        customerGst={customerGst}
        defaultPlaceOfSupply={placeOfSupply || defaultPlaceOfSupply}
        onConfirm={(opts) => void confirmSaveBill(opts)}
      />
      <ErpLedgerBillSavedDialog
        open={ledgerSavedOpen}
        onOpenChange={setLedgerSavedOpen}
        billNumber={ledgerSavedMeta?.billNumber || ''}
        customerName={customerName}
        netTotal={totals.net}
        lane={ledgerSavedMeta?.lane || previewLane}
        onDone={onLedgerSavedDone}
      />
      <ErpBillSavedModal
        open={savedBillOpen}
        onOpenChange={setSavedBillOpen}
        bill={savedBill}
        pdfPayload={savedPdfPayload}
        defaultMobile={mobile}
        onDone={onSavedBillDone}
      />
      <ErpCameraScannerModal
        open={cameraOpen}
        onClose={() => setCameraOpen(false)}
        onScan={(code) => void scanWithCode(code)}
      />

      <Dialog open={soldStockOpen} onOpenChange={setSoldStockOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto border-rose-200 bg-white sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-rose-900">Stock already sold</DialogTitle>
          </DialogHeader>
          <p className="whitespace-pre-wrap break-words text-xs leading-relaxed text-[var(--color-jewelry-black,#1a1814)]/75">
            {soldStockMessage}
          </p>
          <DialogFooter>
            <button type="button" className={`${erpBtnPrimary} w-full`} onClick={() => setSoldStockOpen(false)}>
              OK
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {editingBillNumber ? (
        <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm">
          <span className="font-semibold text-blue-900">Editing {editingBillNumber}</span>
          {editingBillType === 'estimate' ? (
            <span className="text-blue-800/70">
              Update quote with <strong>Generate quote</strong>, or use <strong>Save bill</strong> to create a sales bill
              and mark this estimate as billed.
            </span>
          ) : (
            <span className="text-blue-800/70">Changes update this bill — no new number.</span>
          )}
          <Link href={resellerErpModulePath('estimations')} className="ml-auto text-xs font-semibold text-blue-700 underline">
            Back to estimations
          </Link>
        </div>
      ) : null}

      {showRateEdit ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center">
          <div className={`${erpCardCls} w-full max-w-md`}>
            <h3 className="mb-3 text-sm font-semibold">Update rates for this bill</h3>
            <div className="grid gap-3">
              <label className="text-xs font-medium text-[var(--color-jewelry-black,#1a1814)]/60">
                Gold ₹/g
                <input className={`${erpInputCls} mt-1`} value={editGold} onChange={(e) => setEditGold(e.target.value)} />
              </label>
              <label className="text-xs font-medium text-[var(--color-jewelry-black,#1a1814)]/60">
                Silver ₹/g
                <input className={`${erpInputCls} mt-1`} value={editSilver} onChange={(e) => setEditSilver(e.target.value)} />
              </label>
            </div>
            <div className="mt-4 flex gap-2">
              <button type="button" className={erpBtnPrimary} onClick={applyRateEdit}>
                Apply
              </button>
              <button type="button" className={erpBtnGhost} onClick={() => setShowRateEdit(false)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {showWholesaleModal ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center">
          <div className={`${erpCardCls} w-full max-w-md`}>
            <h3 className="mb-3 text-sm font-semibold">
              {pendingSlab ? `Slab ${pendingSlab} — wholesale metal rate` : 'Edit wholesale metal rate'}
            </h3>
            <div className="grid gap-3">
              <label className="text-xs font-medium text-[var(--color-jewelry-black,#1a1814)]/60">
                Gold ₹/g
                <input className={`${erpInputCls} mt-1`} placeholder="e.g. 7200" value={modalWhGold} onChange={(e) => setModalWhGold(e.target.value)} />
              </label>
              <label className="text-xs font-medium text-[var(--color-jewelry-black,#1a1814)]/60">
                Silver ₹/g
                <input className={`${erpInputCls} mt-1`} placeholder="e.g. 220" value={modalWhSilver} onChange={(e) => setModalWhSilver(e.target.value)} />
              </label>
            </div>
            <div className="mt-4 flex gap-2">
              <button type="button" className={erpBtnPrimary} onClick={applyWholesaleSlab}>
                {pendingSlab ? `Apply slab ${pendingSlab}` : 'Apply wholesale rates'}
              </button>
              <button type="button" className={erpBtnGhost} onClick={() => { setShowWholesaleModal(false); setPendingSlab(null) }}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <div className={`${erpCardCls} py-3`}>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-6">
          <div className="relative sm:col-span-2 lg:col-span-2">
            <label className="mb-0.5 block text-[10px] font-semibold uppercase tracking-wide text-[var(--color-jewelry-black,#1a1814)]/45">
              Customer
            </label>
            <input
              className={`${erpInputCls} py-2 text-sm`}
              placeholder="Search or type name"
              value={customerName || customerQ}
              onChange={(e) => {
                setCustomerName(e.target.value)
                setCustomerQ(e.target.value)
                setCustomerId(null)
                setSelectedCustomer(null)
                setCustomerPickIdx(-1)
              }}
              onKeyDown={onCustomerKeyDown}
            />
            {customerQ.trim() && customers.length > 0 ? (
              <ul className="absolute z-20 mt-1 max-h-48 w-full overflow-auto rounded-xl border border-[var(--color-slate-700,#e8e4df)] bg-white shadow-lg">
                {customers.slice(0, 8).map((c, i) => (
                  <li key={c.id}>
                    <button
                      type="button"
                      className={`w-full px-3 py-2 text-left text-sm hover:bg-[var(--kc-accent,#c41e3a)]/[0.06] ${
                        customerPickIdx === i ? 'bg-[var(--kc-accent,#c41e3a)]/[0.08]' : ''
                      }`}
                      onMouseEnter={() => setCustomerPickIdx(i)}
                      onClick={() => selectCustomer(c)}
                    >
                      {c.name}
                      {c.mobile ? <span className="text-[var(--color-jewelry-black,#1a1814)]/45"> · {c.mobile}</span> : null}
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
          <div>
            <label className="mb-0.5 block text-[10px] font-semibold uppercase tracking-wide text-[var(--color-jewelry-black,#1a1814)]/45">
              Mobile
            </label>
            <input className={`${erpInputCls} py-2 text-sm`} value={mobile} onChange={(e) => setMobile(e.target.value)} placeholder="10-digit" />
          </div>
          <div>
            <label className="mb-0.5 block text-[10px] font-semibold uppercase tracking-wide text-[var(--color-jewelry-black,#1a1814)]/45">
              Slab
            </label>
            <select className={`${erpInputCls} py-2 text-sm`} value={rateSlab} onChange={(e) => onSlabChange(e.target.value as ErpRateSlab)}>
              <option value="R">R</option>
              <option value="W">W</option>
              <option value="F">F</option>
            </select>
          </div>
          <div>
            <label className="mb-0.5 block text-[10px] font-semibold uppercase tracking-wide text-[var(--color-jewelry-black,#1a1814)]/45">
              Advance (₹)
            </label>
            <input
              className={`${erpInputCls} py-2 text-sm tabular-nums`}
              inputMode="decimal"
              value={advancePaidInr}
              onChange={(e) => setAdvancePaidInr(e.target.value.replace(/[^\d.]/g, ''))}
              placeholder="0"
            />
          </div>
          <div>
            <label className="mb-0.5 block text-[10px] font-semibold uppercase tracking-wide text-[var(--color-jewelry-black,#1a1814)]/45">
              Collected (₹)
            </label>
            <input
              className={`${erpInputCls} py-2 text-sm tabular-nums`}
              inputMode="decimal"
              value={collectedAmountInr}
              onChange={(e) => setCollectedAmountInr(e.target.value.replace(/[^\d.]/g, ''))}
              placeholder="Received"
            />
        </div>
          <div>
            <label className="mb-0.5 block text-[10px] font-semibold uppercase tracking-wide text-[var(--color-jewelry-black,#1a1814)]/45">
              Discount (₹)
            </label>
            <div
              className={`${erpInputCls} flex min-h-[44px] items-center py-2 text-sm tabular-nums font-semibold ${
                parsedCollected != null && discountSummary.cashDiscountInr < 0
                  ? 'border-amber-400 bg-amber-50/80 text-amber-950'
                  : parsedCollected != null && discountSummary.cashDiscountInr > 0
                    ? 'border-emerald-300 bg-emerald-50/60 text-emerald-950'
                    : 'bg-white text-[#1a1814]'
              }`}
              style={{ color: '#1a1814', WebkitTextFillColor: '#1a1814' }}
              aria-live="polite"
              title="Net total minus collected amount"
            >
              {parsedCollected != null
                ? discountSummary.cashDiscountInr.toLocaleString('en-IN')
                : 'Auto'}
            </div>
          </div>
          <div>
            <label className="mb-0.5 block text-[10px] font-semibold uppercase tracking-wide text-[var(--color-jewelry-black,#1a1814)]/45">
              Payment
            </label>
            <select className={`${erpInputCls} py-2 text-sm`} value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value as ErpPaymentMethod)}>
              <option value="bank">Bank</option>
              <option value="cash">Cash</option>
              <option value="upi">UPI</option>
              <option value="gpay">GPay</option>
              <option value="card">Card</option>
              <option value="mixed">Mixed</option>
            </select>
          </div>
        </div>

        {paymentMethod === 'mixed' ? (
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            <div>
              <label className="mb-0.5 block text-[10px] font-semibold uppercase text-[var(--color-jewelry-black,#1a1814)]/45">Cash (₹)</label>
              <input className={`${erpInputCls} py-2 text-sm`} value={cashAmountInr} onChange={(e) => setCashAmountInr(e.target.value)} />
            </div>
            <div>
              <label className="mb-0.5 block text-[10px] font-semibold uppercase text-[var(--color-jewelry-black,#1a1814)]/45">Online (₹)</label>
              <input className={`${erpInputCls} py-2 text-sm`} value={onlineAmountInr} onChange={(e) => setOnlineAmountInr(e.target.value)} />
            </div>
          </div>
        ) : null}

        <div className="mt-2 flex flex-wrap items-center gap-2">
          <button
            type="button"
            className={`${erpBtnGhost} min-h-[36px] px-2.5 py-1.5 text-xs`}
            onClick={() => setCustomerMoreOpen((o) => !o)}
          >
            {customerMoreOpen ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
            More
          </button>
        {customerName ? (
            <span className="truncate text-[11px] text-[var(--color-jewelry-black,#1a1814)]/70">
              {customerName} · Slab {rateSlab}
              {mobile ? ` · ${mobile}` : ''}
              {customerGst ? ` · GST ${customerGst}` : ''}
              </span>
              ) : null}
        </div>

        {customerMoreOpen ? (
          <div className="mt-2 grid gap-2 border-t border-[var(--color-slate-700,#e8e4df)] pt-2 sm:grid-cols-2 lg:grid-cols-4">
            <div className="sm:col-span-2">
              <label className="mb-0.5 block text-[10px] font-semibold uppercase text-[var(--color-jewelry-black,#1a1814)]/45">Address</label>
              <textarea className={`${erpInputCls} min-h-[52px] py-2 text-sm`} value={address} onChange={(e) => setAddress(e.target.value)} />
            </div>
            <div>
              <label className="mb-0.5 block text-[10px] font-semibold uppercase text-[var(--color-jewelry-black,#1a1814)]/45">PAN</label>
              <input className={`${erpInputCls} py-2 text-sm`} value={customerPan} onChange={(e) => setCustomerPan(e.target.value.toUpperCase())} />
            </div>
            <div>
              <label className="mb-0.5 block text-[10px] font-semibold uppercase text-[var(--color-jewelry-black,#1a1814)]/45">GST no</label>
              <input className={`${erpInputCls} py-2 text-sm`} value={customerGst} onChange={(e) => setCustomerGst(e.target.value.toUpperCase())} />
            </div>
            {isOfficialGstBill ? (
              <div className="sm:col-span-2">
                <label className="mb-0.5 block text-[10px] font-semibold uppercase text-[var(--color-jewelry-black,#1a1814)]/45">Place of supply</label>
                <input className={`${erpInputCls} py-2 text-sm`} value={placeOfSupply} onChange={(e) => setPlaceOfSupply(e.target.value)} list="erp-billing-place-of-supply" />
                <datalist id="erp-billing-place-of-supply">
                  <option value="33 - Tamil Nadu" />
                  <option value="37 - Andhra Pradesh" />
                  <option value="29 - Karnataka" />
                </datalist>
              </div>
              ) : null}
            <div>
              <label className="mb-0.5 block text-[10px] font-semibold uppercase text-[var(--color-jewelry-black,#1a1814)]/45">Birthday</label>
              <ErpDateInput className={`${erpInputCls} py-2 text-sm`} value={customerBirthdate} onChange={setCustomerBirthdate} />
            </div>
            <div>
              <label className="mb-0.5 block text-[10px] font-semibold uppercase text-[var(--color-jewelry-black,#1a1814)]/45">Anniversary</label>
              <ErpDateInput className={`${erpInputCls} py-2 text-sm`} value={customerAnniversary} onChange={setCustomerAnniversary} />
            </div>
            <div className="sm:col-span-2">
              <label className="mb-0.5 block text-[10px] font-semibold uppercase text-[var(--color-jewelry-black,#1a1814)]/45">Notes</label>
              <input className={`${erpInputCls} py-2 text-sm`} value={customerNotes} onChange={(e) => setCustomerNotes(e.target.value)} />
            </div>
          </div>
        ) : null}

        <div className="mt-2 flex flex-wrap items-center gap-2">
          {quoteOutputMode === 'pdf' || quoteOutputMode === 'both' ? (
            <div className="flex w-full flex-wrap items-center gap-2 rounded-xl border border-[var(--color-slate-700,#e8e4df)] bg-[var(--color-slate-900,#faf8f4)] px-3 py-2">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-jewelry-black,#1a1814)]/50">
                PDF layout
              </span>
              {(['detailed', 'summary'] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  className={`min-h-[36px] rounded-lg px-3 text-xs font-semibold capitalize ${
                    pdfLayoutMode === mode
                      ? 'bg-[var(--kc-accent,#c41e3a)] text-white'
                      : 'border border-[var(--color-slate-700,#e8e4df)] bg-white text-[var(--color-jewelry-black,#1a1814)]/75'
                  }`}
                  onClick={() => setPdfLayoutMode(mode)}
                >
                  {mode} estimate
                </button>
              ))}
            </div>
          ) : null}
          <button
            type="button"
            className={erpBtnGhost}
            disabled={customerSaveBusy || !(customerName || customerQ).trim()}
            title="Save customer details without saving the bill"
            onClick={() => void saveCustomerQuick()}
          >
            {customerSaveBusy ? <Loader2 className="size-4 animate-spin" /> : <UserPlus className="size-4" />}
            {customerId ? 'Save customer' : '+ Customer'}
          </button>
          <button type="button" className={erpBtnGhost} onClick={resetBill}>
            <Receipt className="size-4" />
            New bill
          </button>
          <div className="relative">
            <div className="flex overflow-hidden rounded-xl border border-[var(--color-slate-700,#e8e4df)] bg-white">
              <button
                type="button"
                className="inline-flex min-h-[44px] items-center gap-2 px-3 text-sm font-semibold text-[var(--color-jewelry-black,#1a1814)] disabled:opacity-60"
                disabled={saveBusy || lines.length === 0}
                onClick={() => void generateQuote()}
              >
                <FileText className="size-4" />
                {generateQuoteButtonLabel}
              </button>
              <button
                type="button"
                className="inline-flex min-h-[44px] items-center border-l border-[var(--color-slate-700,#e8e4df)] px-2 text-[var(--color-jewelry-black,#1a1814)]"
                aria-label="Choose estimate output"
                disabled={saveBusy || lines.length === 0}
                onClick={() => setQuoteMenuOpen((o) => !o)}
              >
                <ChevronDown className="size-4" />
              </button>
            </div>
            {quoteMenuOpen ? (
              <ul className="absolute right-0 z-30 mt-1 w-56 overflow-hidden rounded-xl border border-[var(--color-slate-700,#e8e4df)] bg-white shadow-lg">
                <li>
                  <button
                    type="button"
                    className="w-full px-3 py-2.5 text-left text-sm text-[var(--color-jewelry-black,#1a1814)] hover:bg-[var(--kc-accent,#c41e3a)]/[0.06]"
                    onClick={() => {
                      setQuoteMenuOpen(false)
                      void generateQuote('epson')
                    }}
                  >
                    Epson estimate
                  </button>
                </li>
                <li>
                  <button
                    type="button"
                    className="w-full px-3 py-2.5 text-left text-sm text-[var(--color-jewelry-black,#1a1814)] hover:bg-[var(--kc-accent,#c41e3a)]/[0.06]"
                    onClick={() => {
                      setQuoteMenuOpen(false)
                      void generateQuote('pdf')
                    }}
                  >
                    PDF estimate
                  </button>
                </li>
              </ul>
            ) : null}
          </div>
          <button
            type="button"
            className={erpBtnPrimary}
            disabled={saveBusy || lines.length === 0 || ratesUnfixed}
            title={ratesUnfixed ? 'Fix rates before saving a sales bill' : undefined}
            onClick={() => {
              if (ratesUnfixed) {
                alert('Rates are unfixed. Fix rates or use Generate quote to save as an estimate.')
                return
              }
              setSaveConfirmOpen(true)
            }}
          >
            {saveBusy ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
            Save bill
          </button>
        </div>
        {ratesUnfixed ? (
          <p className="mt-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-900">
            Rates are unfixed — sales bill save is disabled. Use <strong>Generate quote</strong> to save as a rate-unfix estimate.
          </p>
        ) : null}
      </div>

      <div className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className={`${erpCardCls} border-blue-200/60 bg-blue-50/30`}>
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-semibold text-blue-900">Scanner</span>
              <button
                type="button"
                className="inline-flex min-h-[36px] min-w-[36px] items-center justify-center rounded-lg border border-blue-200 bg-white text-blue-700 shadow-sm transition hover:bg-blue-50"
                aria-label="Open camera scanner"
                disabled={scanBusy}
                onClick={() => setCameraOpen(true)}
              >
                <Camera className="size-4" />
              </button>
            </div>
            <div className="flex gap-2">
              <input
                ref={scanRef}
                className={erpInputCls}
                placeholder="Scan barcode…"
                value={scanCode}
                onChange={(e) => setScanCode(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void scan()
                }}
              />
              <button type="button" className={erpBtnGhost} disabled={scanBusy} onClick={() => void scan()}>
                {scanBusy ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}
              </button>
            </div>
            {(duplicateScanMsg || scanErrorMsg) ? (
              <div
                ref={duplicateBannerRef}
                tabIndex={0}
                role="alert"
                className={`mt-2 rounded-lg border px-2.5 py-2 text-[11px] outline-none ring-2 ${
                  scanErrorMsg
                    ? 'border-rose-300 bg-rose-50 text-rose-950 ring-rose-400/40'
                    : 'border-amber-300 bg-amber-50 text-amber-950 ring-amber-400/40'
                }`}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') dismissScanBanner()
                }}
              >
                <p className="font-medium">{duplicateScanMsg || scanErrorMsg}</p>
                <button
                  type="button"
                  className={`mt-1 text-[10px] font-semibold uppercase tracking-wide underline ${
                    scanErrorMsg ? 'text-rose-800' : 'text-amber-800'
                  }`}
                  onClick={dismissScanBanner}
                >
                  OK · Enter
                </button>
              </div>
            ) : null}
          </div>

          <div className={erpCardCls}>
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-semibold text-[var(--color-jewelry-black,#1a1814)]">Current rates</span>
              <button type="button" className="text-[10px] font-semibold text-[var(--kc-accent,#c41e3a)]" onClick={() => setShowRateEdit(true)}>
                Update
              </button>
            </div>
            <ul className="space-y-1.5 text-xs">
              <li className="flex justify-between">
                <span className="text-[var(--color-jewelry-black,#1a1814)]/60">Gold</span>
                <span className="font-semibold tabular-nums">{formatErpInr(goldPerG)}/gm</span>
              </li>
              <li className="flex justify-between">
                <span className="text-[var(--color-jewelry-black,#1a1814)]/60">Silver</span>
                <span className="font-semibold tabular-nums">{formatErpInr(silverPerG)}/gm</span>
              </li>
            </ul>
            {(rateSlab === 'W' || rateSlab === 'F') && (wholesaleGold || wholesaleSilver) ? (
              <div className="mt-2 space-y-1">
                <p className="text-[10px] text-emerald-700">
                Wholesale:
                {wholesaleGold ? ` Gold ${formatErpInr(wholesaleGold)}/g` : ''}
                {wholesaleGold && wholesaleSilver ? ' ·' : ''}
                {wholesaleSilver ? ` Silver ${formatErpInr(wholesaleSilver)}/g` : ''}
                </p>
                <button
                  type="button"
                  className="text-[10px] font-semibold text-[var(--kc-accent,#c41e3a)] underline"
                  onClick={openEditWholesale}
                >
                  Edit wholesale rates
                </button>
              </div>
            ) : (rateSlab === 'W' || rateSlab === 'F') ? (
              <button
                type="button"
                className="mt-2 text-[10px] font-semibold text-[var(--kc-accent,#c41e3a)] underline"
                onClick={openEditWholesale}
              >
                Set wholesale rates
              </button>
            ) : null}
            {lines.length > 0 ? (
              <button
                type="button"
                className="mt-3 w-full rounded-lg border border-[var(--color-slate-700,#e8e4df)] px-2 py-2 text-[10px] font-semibold text-[var(--color-jewelry-black,#1a1814)]/70 hover:bg-[var(--color-slate-900,#faf8f4)]"
                onClick={rateUnfix}
              >
                Rate unfix
              </button>
            ) : null}
          </div>
        </div>

        <div className={`${erpCardCls} overflow-visible p-0`}>
          <div className="flex items-center justify-between border-b border-[var(--color-slate-700,#e8e4df)] bg-blue-600 px-3 py-2.5 text-white">
            <span className="text-sm font-semibold">Scanned products</span>
            <span className="rounded-full bg-white/20 px-2 py-0.5 text-xs font-semibold">{lines.length} items</span>
          </div>

          <div className="max-h-[min(620px,calc(100vh-14rem))] overflow-y-auto">
            <table className="w-full table-fixed text-[11px] leading-snug">
              <thead className="sticky top-0 z-10 bg-[var(--color-slate-900,#faf8f4)] shadow-sm">
                <tr className="border-b border-[var(--color-slate-700,#e8e4df)] text-[var(--color-jewelry-black,#1a1814)]/60">
                  <th className="w-[2.5%] px-1 py-2">#</th>
                  {tableCols.map((c) => (
                    <th key={c.key} className={`px-0.5 py-2 text-left font-semibold whitespace-normal break-words ${c.w}`}>
                      {c.label}
                    </th>
                  ))}
                  <th className="w-[2.5%] px-1 py-2" />
                </tr>
              </thead>
              <tbody>
                {lines.length === 0 ? (
                  <tr>
                    <td colSpan={tableCols.length + 2} className="px-4 py-12 text-center text-[var(--color-jewelry-black,#1a1814)]/45">
                      Scan a barcode or press A / S / B / G for manual entry
                    </td>
                  </tr>
                ) : (
                  lines.map((line, idx) => {
                    const lineKey = line.code || line.barcode || `row-${idx}`
                    const catalog = line.invoice_item_name
                      ? billingCatalogs[line.invoice_item_name] || []
                      : []
                    const styleDraft = String(line.style_code || '')
                    const skuDraft = String(line.sku || '')
                    const stacked = !!line.manualEntry && line.manualEntryOpen === true
                    const gift = isGiftManualLine(line)
                    const nextAfterSku = gift ? 'name' : 'weightGm'

                    if (stacked) {
                      return (
                        <ErpBillingStackedRow
                          key={lineKey}
                          line={line}
                          idx={idx}
                          lineKey={lineKey}
                          catalog={catalog}
                          highlight={duplicateHighlights.has(idx)}
                          manualFocus={manualFocus}
                          rowRef={(el) => {
                            rowRefs.current[idx] = el
                          }}
                          cellValue={(field) => {
                            if (NUMERIC_EDIT_KEYS.includes(field)) {
                              return cellInputDisplayValue(lineKey, String(field), line)
                            }
                            return String(cellVal(line, String(field)) ?? '')
                          }}
                          inputRef={(field, el) => {
                            manualCellRefs.current[`${lineKey}-${String(field)}`] = el
                          }}
                          onSkuChange={(v) => updateLine(idx, { sku: v || undefined })}
                          onStyleChange={(v) => updateLine(idx, { style_code: v || undefined })}
                          onSkuCommit={(sku, style) => {
                            void applyDesignDefaults(idx, style, sku, () => {
                              focusManualCell(lineKey, nextAfterSku)
                            })
                          }}
                          onStyleCommit={(style) => {
                            if (line.sku) {
                              void applyDesignDefaults(idx, style, String(line.sku), () => {
                                focusManualCell(lineKey, nextAfterSku)
                              })
                              return
                            }
                            updateLine(idx, { style_code: style })
                            focusManualCell(lineKey, 'sku')
                          }}
                          onProductChange={(name) => updateLine(idx, { name })}
                          onProductCommit={(name, imageUrl) => {
                            updateLine(idx, { name, imageUrl: imageUrl || line.imageUrl })
                            focusManualCell(lineKey, 'size')
                          }}
                          onSizeChange={(label) => updateLine(idx, { size: label || null })}
                          onSizeCommit={(label) => {
                            const hit = (line.designSizeOptions || []).find((s) => s.size_label === label)
                            let patch: Partial<ErpBillLine> = { size: label || null }
                            if (hit?.fixed_price_mrp != null) {
                              const mrp = hit.fixed_price_mrp
                              const slabPrice = giftMrpSlabPrice(mrp, rateSlab, slabSettings)
                              patch = {
                                ...patch,
                                mrpListPrice: mrp,
                                fixed_price: slabPrice,
                                unitInr: slabPrice,
                                mrpMode: true,
                              }
                            }
                            updateLine(idx, patch)
                            advanceBillField(lineKey, 'size', { ...line, ...patch }, idx)
                          }}
                          onNumericChange={(field, raw) => {
                            if (NUMERIC_EDIT_KEYS.includes(field)) {
                              if (!isPartialDecimalInput(raw)) return
                              setCellDrafts((prev) => ({ ...prev, [`${lineKey}-${String(field)}`]: raw }))
                              return
                            }
                            updateLine(idx, { [field]: raw } as Partial<ErpBillLine>)
                          }}
                          onNumericBlur={(field) => {
                            if (NUMERIC_EDIT_KEYS.includes(field)) {
                              flushNumericDraft(lineKey, idx, line, field)
                            }
                          }}
                          onAdvance={(field) => advanceBillField(lineKey, field, line, idx)}
                          onDelete={() => setLines((p) => p.filter((_, i) => i !== idx))}
                        />
                      )
                    }

                    return (
                    <tr
                      key={lineKey}
                      ref={(el) => {
                        rowRefs.current[idx] = el
                      }}
                      className={`border-b border-[var(--color-slate-700,#e8e4df)]/50 transition-colors ${
                        duplicateHighlights.has(idx) ? 'bg-amber-100 ring-2 ring-amber-400 ring-inset' : ''
                      } ${line.manualEntry ? 'bg-emerald-50/30' : ''}`}
                      onDoubleClick={() => {
                        if (line.manualEntry) updateLine(idx, { manualEntryOpen: true })
                      }}
                    >
                      <td className="px-2 py-2 tabular-nums">{idx + 1}</td>
                      {tableCols.map((col) => {
                        if (col.key === 'amount') {
                          return (
                            <td key={col.key} className="px-2 py-2 font-semibold tabular-nums text-emerald-700">
                              {cellVal(line, col.key)}
                            </td>
                          )
                        }

                        if (line.manualEntry && col.key === 'style_code') {
                          const refKey = `${lineKey}-style_code`
                          return (
                            <td key={col.key} className="px-1 py-1">
                              <ErpBillingStyleSkuCell
                                value={styleDraft === '—' ? '' : styleDraft}
                                placeholder="Style…"
                                options={styleOptionsForCatalog(catalog, styleDraft)}
                                autoFocus={manualFocus?.lineKey === lineKey && manualFocus.field === 'style_code'}
                                inputRef={(el) => {
                                  manualCellRefs.current[refKey] = el
                                }}
                                onChange={(v) => updateLine(idx, { style_code: v || undefined })}
                                onCommit={(v) => {
                                  if (!v) return
                                  const style = v.trim().toUpperCase()
                                  if (line.sku) {
                                    void applyDesignDefaults(idx, style, String(line.sku), () => {
                                      focusManualCell(lineKey, isGiftManualLine(line) ? 'name' : 'weightGm')
                                    })
                                    return
                                  }
                                  updateLine(idx, { style_code: style })
                                  focusManualCell(lineKey, 'sku')
                                }}
                              />
                            </td>
                          )
                        }

                        if (line.manualEntry && col.key === 'sku') {
                          const refKey = `${lineKey}-sku`
                          const skuOptions = uniqueSkusFromCatalog(catalog).map((x) => x.sku)
                          return (
                            <td key={col.key} className="px-1 py-1">
                              <ErpBillingStyleSkuCell
                                value={skuDraft === '—' ? '' : skuDraft}
                                placeholder="SKU…"
                                options={skuOptions}
                                autoFocus={manualFocus?.lineKey === lineKey && manualFocus.field === 'sku'}
                                inputRef={(el) => {
                                  manualCellRefs.current[refKey] = el
                                }}
                                onChange={(v) => updateLine(idx, { sku: v || undefined })}
                                onCommit={(v) => {
                                  if (!v) return
                                  const sku = v.trim().toUpperCase()
                                  const styleCode =
                                    findStyleForSku(catalog, sku) || String(line.style_code || '')
                                  if (!styleCode) {
                                    updateLine(idx, { sku })
                                    focusManualCell(lineKey, 'style_code')
                                    return
                                  }
                                  void applyDesignDefaults(idx, styleCode, sku, () => {
                                    focusManualCell(lineKey, isGiftManualLine(line) ? 'name' : 'weightGm')
                                  })
                                }}
                              />
                            </td>
                          )
                        }

                        if (col.key === 'name' && line.designProductOptions?.length) {
                          const refKey = `${lineKey}-name`
                          return (
                            <td key={col.key} className="px-0.5 py-0.5">
                              <ErpBillingStyleSkuCell
                                value={String(line.name || '')}
                                placeholder="Product…"
                                options={line.designProductOptions.map((p) => p.name)}
                                autoFocus={manualFocus?.lineKey === lineKey && manualFocus.field === 'name'}
                                inputRef={(el) => {
                                  manualCellRefs.current[refKey] = el
                                }}
                                onChange={(v) => updateLine(idx, { name: v })}
                                onCommit={(name) => {
                                  const hit = line.designProductOptions?.find(
                                    (p) => p.name.trim().toUpperCase() === name.trim().toUpperCase(),
                                  )
                                  updateLine(idx, { name, imageUrl: hit?.image_url || line.imageUrl })
                                  focusManualCell(lineKey, 'size')
                                }}
                              />
                            </td>
                          )
                        }

                        if (col.key === 'size' && line.designSizeOptions?.length) {
                          const refKey = `${lineKey}-size`
                          const sizeOpts = line.designSizeOptions
                          return (
                            <td key={col.key} className="px-0.5 py-0.5">
                              <ErpBillingStyleSkuCell
                                value={String(line.size ?? '')}
                                placeholder="Size…"
                                options={sizeOpts.map((s) => s.size_label)}
                                autoFocus={manualFocus?.lineKey === lineKey && manualFocus.field === 'size'}
                                inputRef={(el) => {
                                  manualCellRefs.current[refKey] = el
                                }}
                                onChange={(label) => updateLine(idx, { size: label || null })}
                                onCommit={(label) => {
                                  const hit = sizeOpts.find((s) => s.size_label === label)
                                  let patch: Partial<ErpBillLine> = { size: label || null }
                                  if (hit?.fixed_price_mrp != null) {
                                    const mrp = hit.fixed_price_mrp
                                    const slabPrice = giftMrpSlabPrice(mrp, rateSlab, slabSettings)
                                    patch = {
                                      ...patch,
                                      mrpListPrice: mrp,
                                      fixed_price: slabPrice,
                                      unitInr: slabPrice,
                                      mrpMode: true,
                                    }
                                  }
                                  updateLine(idx, patch)
                                  advanceBillField(lineKey, 'size', { ...line, ...patch }, idx)
                                }}
                              />
                            </td>
                          )
                        }

                        if ('edit' in col && col.edit) {
                          const k = col.key as keyof ErpBillLine
                          const goldSlabRField =
                            isGoldSlabRLine(line, rateSlab) &&
                            (k === 'wastage_pct' || k === 'mc_rate')
                          const mcHint = k === 'mc_rate' ? billingMcDiscountHint(line, rateSlab, goldSlabRShowMc) : null
                          const refKey = `${lineKey}-${String(k)}`
                          const isManualFocused = manualFocus?.lineKey === lineKey && manualFocus.field === k
                          const isNumericField = NUMERIC_EDIT_KEYS.includes(k)
                          return (
                            <td key={col.key} className="px-1 py-1">
                              <input
                                ref={(el) => {
                                  manualCellRefs.current[refKey] = el
                                }}
                                autoFocus={isManualFocused}
                                type="text"
                                inputMode={isNumericField ? 'decimal' : 'text'}
                                className={`w-full min-w-0 rounded border px-1 py-1 tabular-nums text-[11px] ${
                                  line.manualEntry
                                    ? 'border-emerald-300 bg-white text-[var(--color-jewelry-black,#1a1814)]'
                                    : 'border-[var(--color-slate-700,#e8e4df)] bg-white text-[var(--color-jewelry-black,#1a1814)]'
                                } ${goldSlabRField ? 'bg-[var(--color-slate-900,#faf8f4)] text-[var(--color-jewelry-black,#1a1814)]/70' : ''}`}
                                readOnly={goldSlabRField}
                                title={
                                  goldSlabRField
                                    ? mcHint || 'Slab R gold — wastage is shown as making charges (auto)'
                                    : undefined
                                }
                                value={
                                  isNumericField
                                    ? cellInputDisplayValue(lineKey, String(k), line)
                                    : String(cellVal(line, col.key) ?? '')
                                }
                                onFocus={() => {
                                  setManualEditingCell(refKey)
                                  if (isNumericField) {
                                    const current = cellVal(line, String(k))
                                    setCellDrafts((prev) => ({
                                      ...prev,
                                      [refKey]:
                                        prev[refKey] ??
                                        (current === 0 || current === '0' ? '' : String(current ?? '')),
                                    }))
                                  }
                                }}
                                onBlur={() => {
                                  if (manualEditingCell === refKey) setManualEditingCell(null)
                                  if (isNumericField) {
                                    const draft = cellDraftsRef.current[refKey]
                                    if (draft !== undefined) {
                                      commitNumericCell(idx, line, k, draft)
                                      setCellDrafts((prev) => {
                                        const next = { ...prev }
                                        delete next[refKey]
                                        return next
                                      })
                                    }
                                  }
                                }}
                                onChange={(e) => {
                                  if (goldSlabRField) return
                                  const v = e.target.value
                                  if (isNumericField) {
                                    if (!isPartialDecimalInput(v)) return
                                    setCellDrafts((prev) => ({ ...prev, [refKey]: v }))
                                    return
                                  }
                                  const patch: Partial<ErpBillLine> = {
                                    [k]: v || null,
                                  } as Partial<ErpBillLine>
                                  if (line.manualEntry) {
                                    updateManualLine(idx, patch)
                                  } else {
                                  updateLine(idx, patch)
                                  }
                                }}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    e.preventDefault()
                                    advanceBillField(lineKey, k, line, idx)
                                  } else if (e.key === 'Tab' && !e.shiftKey) {
                                    e.preventDefault()
                                    advanceBillField(lineKey, k, line, idx)
                                  }
                                }}
                              />
                              {mcHint ? (
                                <p className="mt-0.5 max-w-[88px] text-[9px] leading-tight text-emerald-700">
                                  {mcHint}
                                </p>
                              ) : null}
                            </td>
                          )
                        }
                        return (
                          <td key={col.key} className="whitespace-normal break-words px-1 py-1.5 text-[var(--color-jewelry-black,#1a1814)]">
                            {cellVal(line, col.key)}
                          </td>
                        )
                      })}
                      <td className="px-2 py-2">
                        <button type="button" className="text-rose-500" onClick={() => setLines((p) => p.filter((_, i) => i !== idx))}>
                          <X className="size-4" />
                        </button>
                      </td>
                    </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>

          {lines.length > 0 ? (
            <div className="grid grid-cols-2 gap-3 border-t border-[var(--color-slate-700,#e8e4df)] bg-[var(--color-slate-900,#faf8f4)] px-4 py-3 sm:grid-cols-3 lg:grid-cols-7">
              <div>
                <p className="text-[10px] uppercase text-[var(--color-jewelry-black,#1a1814)]/45">Items</p>
                <p className="font-semibold">{totals.count}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase text-[var(--color-jewelry-black,#1a1814)]/45">Total weight</p>
                <p className="font-semibold tabular-nums text-blue-700">{totals.weight.toFixed(2)}g</p>
              </div>
              <div>
                <p className="text-[10px] uppercase text-[var(--color-jewelry-black,#1a1814)]/45">Subtotal</p>
                <p className="font-semibold tabular-nums">{formatErpInr(totals.subtotal)}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase text-[var(--color-jewelry-black,#1a1814)]/45">GST (3%)</p>
                <p className="font-semibold tabular-nums text-blue-700">{formatErpInr(totals.gst)}</p>
              </div>
              {parsedAdvance > 0 || advancePaidInr.trim() ? (
                <>
                  <div>
                    <p className="text-[10px] uppercase text-[var(--color-jewelry-black,#1a1814)]/45">Advance paid</p>
                    <p className="font-semibold tabular-nums text-emerald-700">{formatErpInr(parsedAdvance)}</p>
                  </div>
                  {parsedAdvance > 0 ? (
                  <div>
                    <p className="text-[10px] uppercase text-[var(--color-jewelry-black,#1a1814)]/45">Amount to pay</p>
                    <p className="font-semibold tabular-nums text-amber-800">{formatErpInr(balanceDue)}</p>
                  </div>
                  ) : null}
                </>
              ) : null}
              {discountSummary.totalDiscountInr !== 0 ? (
                <div>
                  <p className="text-[10px] uppercase text-[var(--color-jewelry-black,#1a1814)]/45">Discount</p>
                  <p className="font-semibold tabular-nums text-emerald-700">
                    {formatErpInr(discountSummary.totalDiscountInr)}
                  </p>
                  {discountSummary.mcDiscountInr > 0 ? (
                    <p className="text-[9px] text-[var(--color-jewelry-black,#1a1814)]/50">
                      MC ₹{discountSummary.mcDiscountInr.toLocaleString('en-IN')}
                      {parsedCollected != null && discountSummary.cashDiscountInr !== 0
                        ? ` + cash ₹${discountSummary.cashDiscountInr.toLocaleString('en-IN')}`
                        : ''}
                    </p>
                  ) : null}
                </div>
              ) : null}
              {parsedCollected != null ? (
                <div>
                  <p className="text-[10px] uppercase text-[var(--color-jewelry-black,#1a1814)]/45">Collected</p>
                  <p className="font-semibold tabular-nums">{formatErpInr(parsedCollected)}</p>
                </div>
              ) : null}
              <div className="col-span-2 sm:col-span-1">
                <p className="text-[10px] uppercase text-[var(--color-jewelry-black,#1a1814)]/45">Net total</p>
                <p className="rounded-xl bg-emerald-600 px-3 py-1.5 text-center text-sm font-bold tabular-nums text-white">
                  {formatErpInr(totals.net)}
                </p>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}

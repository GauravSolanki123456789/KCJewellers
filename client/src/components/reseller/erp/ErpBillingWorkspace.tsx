'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import axios from '@/lib/axios'
import { useAuth } from '@/hooks/useAuth'
import { type WholesaleUserFields } from '@/lib/customer-tier'
import {
  computeLineBreakdown,
  displayRatesToPerGram,
  parseRateSlabFromNotes,
  parseSlabSettingsFromUser,
  perGramToDisplayRates,
  type ErpRateSlab,
} from '@/lib/erp-billing-pricing'
import { billingMcDisplay, billingMcDiscountHint, billingWastageDisplay, computeBillingDiscountSummary, isGoldSlabRLine } from '@/lib/erp-billing-display'
import { cachedGet } from '@/lib/api-get-cache'
import { applyRatesUnfixed, buildErpBillSession, type ErpBillSession } from '@/lib/erp-bill-session'
import { deriveEstimateStatus } from '@/lib/erp-estimate-status'
import { formatErpDateDdMmYyyy } from '@/lib/erp-date-format'
import { formatErpInr, resellerErpModulePath } from '@/lib/reseller-erp-modules'
import { ratesApiQueryForStorefront } from '@/lib/storefront-domain'
import { shareErpQuotePdf } from '@/components/reseller/erp/ErpQuotePdfShare'
import { ErpBillSavedModal, ErpSaveBillConfirmDialog } from '@/components/reseller/erp/ErpBillSavedModal'
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
  type ErpQuoteOutputMode,
} from '@/lib/erp-quote-output'
import {
  defaultHsnCode,
  defaultInvoiceItemName,
  formatSoldStockMessage,
  type SoldBillConflict,
} from '@/lib/erp-invoice-defaults'
import {
  erpBtnGhost,
  erpBtnPrimary,
  erpCardCls,
  erpErr,
  erpInputCls,
  type ErpBill,
  type ErpBillLine,
  type ErpCustomer,
  type ErpProductHit,
} from '@/components/reseller/erp/erp-ui'
import {
  Camera,
  FileText,
  Loader2,
  Plus,
  Receipt,
  Search,
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
  editingBillId?: number | null
  editingBillNumber?: string | null
  editingBillType?: string | null
  editingBillStatus?: string | null
}

const TABLE_COLS = [
  { key: 'barcode', label: 'Barcode', w: 'min-w-[110px]' },
  { key: 'sku', label: 'SKU', w: 'min-w-[80px]' },
  { key: 'style_code', label: 'StyleCode', w: 'min-w-[80px]' },
  { key: 'name', label: 'ProductName', w: 'min-w-[100px]' },
  { key: 'invoice_item_name', label: 'Invoice item', w: 'min-w-[120px]', edit: true },
  { key: 'hsn_code', label: 'HSN', w: 'min-w-[72px]', edit: true },
  { key: 'size', label: 'Size', w: 'min-w-[56px]' },
  { key: 'weightGm', label: 'AvgWeight', w: 'min-w-[64px]', edit: true },
  { key: 'purity', label: 'Purity', w: 'min-w-[52px]', edit: true },
  { key: 'wastage_pct', label: 'Wast%', w: 'min-w-[52px]', edit: true },
  { key: 'ratePerGram', label: 'Rate', w: 'min-w-[64px]', edit: true },
  { key: 'mc_rate', label: 'MCRate', w: 'min-w-[64px]', edit: true },
  { key: 'mc_type', label: 'MCType', w: 'min-w-[64px]', edit: true },
  { key: 'qty', label: 'PCS', w: 'min-w-[48px]', edit: true },
  { key: 'box_charges', label: 'Box', w: 'min-w-[56px]', edit: true },
  { key: 'stone_charges', label: 'Stone', w: 'min-w-[56px]', edit: true },
  { key: 'metal_type', label: 'Metal', w: 'min-w-[64px]' },
  { key: 'fixed_price', label: 'Fixed', w: 'min-w-[64px]', edit: true },
  { key: 'amount', label: 'Amount', w: 'min-w-[72px]' },
] as const

function productToLine(p: ErpProductHit, code: string): ErpBillLine {
  const wt = p.net_weight ?? p.gross_weight ?? null
  const metal = (p.metal_type || 'silver').toLowerCase()
  return {
    name: p.product_name || p.name || code,
    code,
    barcode: p.barcode || code,
    sku: p.sku || undefined,
    style_code: p.style_code || undefined,
    size: p.size ?? null,
    qty: p.pcs ?? 1,
    weightGm: wt,
    gross_weight: p.gross_weight ?? null,
    bag_wt: p.bag_wt ?? null,
    purity: p.purity ?? (metal.includes('silver') ? 925 : null),
    wastage_pct: p.wastage_pct ?? null,
    ratePerGram: null,
    mc_rate: p.mc_rate ?? null,
    mc_type: p.mc_type ?? null,
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
    invoice_item_name: defaultInvoiceItemName(metal, p.product_name || p.name),
    hsn_code: defaultHsnCode(metal),
  }
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
  const [bills, setBills] = useState<ErpBill[]>([])
  const [hydrated, setHydrated] = useState(false)
  const [editingBillId, setEditingBillId] = useState<number | null>(null)
  const [editingBillNumber, setEditingBillNumber] = useState<string | null>(null)
  const [editingBillType, setEditingBillType] = useState<string | null>(null)
  const [editingBillStatus, setEditingBillStatus] = useState<string | null>(null)
  const [advancePaidInr, setAdvancePaidInr] = useState('')
  const [collectedAmountInr, setCollectedAmountInr] = useState('')
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

  const quoteOutputMode = useMemo(
    () => resolveQuoteOutputMode(workstation.quoteOutputMode, shopQuoteOutputMode),
    [workstation.quoteOutputMode, shopQuoteOutputMode],
  )

  const generateQuoteButtonLabel = useMemo(() => {
    const prefix = editingBillId ? 'Update & ' : 'Generate '
    if (quoteOutputMode === 'epson') return `${prefix}Epson estimate`
    if (quoteOutputMode === 'both') return `${prefix}quote (PDF + Epson)`
    return `${prefix}PDF quote`
  }, [editingBillId, quoteOutputMode])

  const recalcLine = useCallback(
    (
      line: ErpBillLine,
      opts?: { slab?: ErpRateSlab; rates?: unknown; goldPerG?: number; silverPerG?: number },
    ): ErpBillLine => {
      const slab = opts?.slab ?? rateSlab
      const rates = opts?.rates ?? displayRates
      const g = opts?.goldPerG ?? goldPerG
      const s = opts?.silverPerG ?? silverPerG
      const bd = computeLineBreakdown(
        line,
        rates,
        slab,
        slabSettings,
        wholesaleGold,
        wholesaleSilver,
        g,
        s,
      )
      const next: ErpBillLine = { ...line, lineTotalInr: bd.total }
      const isGoldSlabR =
        slab === 'R' && String(line.metal_type || '').toLowerCase().startsWith('gold')
      if (isGoldSlabR) {
        next.displayWastagePct = 0
        next.displayMcInr = bd.mc > 0 ? bd.mc : null
        next.displayMcBeforeDiscount =
          bd.mc_before_discount != null && bd.mc_before_discount > bd.mc
            ? bd.mc_before_discount
            : null
        next.displayMcDiscountPct = bd.mc_discount_pct ?? null
      } else {
        next.displayWastagePct = null
        next.displayMcInr = null
        next.displayMcBeforeDiscount = null
        next.displayMcDiscountPct = null
      }
      if (!line.rateLocked) {
        const r = bd.rate_per_gram
        next.ratePerGram =
          r != null && Number.isFinite(r) ? Math.round(r * 100) / 100 : null
      }
      return next
    },
    [displayRates, rateSlab, slabSettings, wholesaleGold, wholesaleSilver, goldPerG, silverPerG],
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
        const cleared: ErpBillLine = {
          ...line,
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
    [recalcLine],
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
      .get<{ bills: ErpBill[] }>('/api/reseller/erp/bills', { params: { bill_type: 'sale' } })
      .then((res) => {
        setBills((res.data.bills || []).filter((b) => b.bill_type === 'sale'))
      })
      .catch(() => setBills([]))
    void axios
      .get<{ settings?: { printFormats?: unknown } }>('/api/reseller/erp/settings')
      .then((res) => {
        const pf = migratePrintFormats(
          res.data.settings?.printFormats as Parameters<typeof migratePrintFormats>[0],
        )
        setShopQuoteOutputMode(normalizeQuoteOutputMode(pf.defaultQuoteOutputMode))
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
      const loadedLines = applyRatesUnfixed(bill.lines || [], session.ratesUnfixed)
      const recalcedLines = loadedLines.map((l) => recalcLine(l, { slab: restoredSlab }))
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
      editingBillId,
      editingBillNumber,
      editingBillType,
      editingBillStatus,
    })
  }, [hydrated, customerId, customerName, mobile, address, customerPan, customerGst, rateSlab, lines, wholesaleGold, wholesaleSilver, goldPerG, silverPerG, displayRates, advancePaidInr, collectedAmountInr, editingBillId, editingBillNumber, editingBillType, editingBillStatus])

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
    setSelectedCustomer(c)
    setCustomerQ('')
    setCustomerPickIdx(-1)
  }

  const pickHighlightedCustomer = () => {
    const list = customers.slice(0, 8)
    if (customerPickIdx >= 0 && customerPickIdx < list.length) {
      selectCustomer(list[customerPickIdx])
    }
  }

  const onCustomerKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    const list = customerQ.trim() && customers.length > 0 ? customers.slice(0, 8) : []
    if (!list.length) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setCustomerPickIdx((i) => Math.min(i + 1, list.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setCustomerPickIdx((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter' && customerPickIdx >= 0) {
      e.preventDefault()
      pickHighlightedCustomer()
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

    const dupIdx = lines.findIndex(
      (l) => (l.barcode || l.code || '').trim().toLowerCase() === code.toLowerCase(),
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
      let line = productToLine(res.data.product, code)
      if (res.data.availability?.label) line.availability = res.data.availability.label
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
        return recalcLine({ ...l, ...patch })
      }),
    )
  }

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
    if (hasGold) setWholesaleGold(g)
    if (hasSilver) setWholesaleSilver(s)
    const nextSlab = pendingSlab ?? rateSlab
    if (pendingSlab) setRateSlab(pendingSlab)
    setLines((prev) => transitionLinesForSlab(prev, nextSlab))
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
      const bd = computeLineBreakdown(l, displayRates, rateSlab, slabSettings, wholesaleGold, wholesaleSilver, goldPerG, silverPerG)
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

  const buildPayload = (billType: 'sale' | 'estimate', status: string) => ({
    bill_type: billType,
    customer_id: customerId,
    customer_name: customerName,
    total_inr: totals.net,
    status,
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
      collectedAmountInr: parsedCollected,
      mcDiscountInr: discountSummary.mcDiscountInr,
      cashDiscountInr: discountSummary.cashDiscountInr,
      totalDiscountInr: discountSummary.totalDiscountInr,
      netTotalInr: totals.net,
    }),
    ...(editingBillId &&
    editingBillType === 'estimate' &&
    billType === 'sale' && { source_estimate_id: editingBillId }),
  })

  const persistBill = async (
    billType: 'sale' | 'estimate',
    status: string,
    opts?: { skipReset?: boolean },
  ): Promise<ErpBill | null> => {
    if (saveBusy || lines.length === 0) return null
    setSaveBusy(true)
    try {
      const payload = buildPayload(billType, status)
      let bill: ErpBill
      if (editingBillId && billType === 'estimate') {
        const res = await axios.put<{ bill: ErpBill }>(`/api/reseller/erp/bills/${editingBillId}`, payload)
        bill = res.data.bill
        setEditingBillStatus(bill.status || status)
      } else {
        const res = await axios.post<{ bill: ErpBill }>('/api/reseller/erp/bills', payload)
        bill = res.data.bill
        if (billType === 'estimate') {
          setEditingBillId(bill.id)
          setEditingBillNumber(bill.bill_number)
          router.replace(`${resellerErpModulePath('billing')}?edit=${bill.id}`)
        }
      }
      if (billType === 'sale' && !opts?.skipReset) {
        resetBill()
      }
      const res = await axios.get<{ bills: ErpBill[] }>('/api/reseller/erp/bills', {
        params: { bill_type: 'sale' },
      })
      setBills((res.data.bills || []).filter((b) => b.bill_type === 'sale'))
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

  const confirmSaveBill = async () => {
    if (ratesUnfixed) {
      setSaveConfirmOpen(false)
      alert('Rates are unfixed. Fix rates before saving a completed sales bill — use Generate quote for rate-unfix estimates.')
      return
    }
    setSaveConfirmOpen(false)
    clearDuplicateState()
    const bill = await persistBill('sale', 'completed', { skipReset: true })
    if (!bill) return
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

  const onSavedBillDone = () => {
    setSavedBill(null)
    setSavedPdfPayload(null)
    resetBill()
  }

  const generateQuote = async () => {
    clearDuplicateState()
    const status = deriveEstimateStatus({
      lines,
      advancePaidInr: parsedAdvance,
      keepCancelled: true,
      currentStatus: editingBillStatus,
    })
    const bill = await persistBill('estimate', status, { skipReset: true })
    if (!bill) return

    const wantsPdf = quoteOutputMode === 'pdf' || quoteOutputMode === 'both'
    const wantsEpson = quoteOutputMode === 'epson' || quoteOutputMode === 'both'

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
      case 'weightGm':
        return line.weightGm ?? ''
      case 'purity':
        return line.purity ?? ''
      case 'wastage_pct':
        return billingWastageDisplay(line, rateSlab)
      case 'ratePerGram':
        return line.ratePerGram ?? ''
      case 'mc_rate':
        return billingMcDisplay(line, rateSlab)
      case 'mc_type':
        return line.mc_type ?? ''
      case 'qty':
        return line.qty ?? 1
      case 'box_charges':
        return line.box_charges ?? 0
      case 'stone_charges':
        return line.stone_charges ?? 0
      case 'metal_type':
        return (line.metal_type || 'silver').slice(0, 8)
      case 'fixed_price':
        return line.fixed_price ?? ''
      case 'amount':
        return formatErpInr(line.lineTotalInr ?? 0)
      default:
        return ''
    }
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
        onConfirm={() => void confirmSaveBill()}
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
            <h3 className="mb-3 text-sm font-semibold">Slab {pendingSlab} — wholesale metal rate</h3>
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
                Apply slab {pendingSlab}
              </button>
              <button type="button" className={erpBtnGhost} onClick={() => { setShowWholesaleModal(false); setPendingSlab(null) }}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <div className={erpCardCls}>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="relative sm:col-span-2">
            <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-[var(--color-jewelry-black,#1a1814)]/45">
              Customer
            </label>
            <input
              className={erpInputCls}
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
            <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-[var(--color-jewelry-black,#1a1814)]/45">
              Mobile
            </label>
            <input className={erpInputCls} value={mobile} onChange={(e) => setMobile(e.target.value)} placeholder="10-digit" />
          </div>
          <div>
            <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-[var(--color-jewelry-black,#1a1814)]/45">
              Rate slab
            </label>
            <select
              className={erpInputCls}
              value={rateSlab}
              onChange={(e) => onSlabChange(e.target.value as ErpRateSlab)}
            >
              <option value="R">R</option>
              <option value="W">W</option>
              <option value="F">F</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-[var(--color-jewelry-black,#1a1814)]/45">
              Advance paid (₹)
            </label>
            <input
              className={erpInputCls}
              type="number"
              min={0}
              step={1}
              value={advancePaidInr}
              onChange={(e) => setAdvancePaidInr(e.target.value)}
              placeholder="0"
            />
          </div>
          <div>
            <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-[var(--color-jewelry-black,#1a1814)]/45">
              Collected (₹)
            </label>
            <input
              className={erpInputCls}
              type="number"
              step={1}
              value={collectedAmountInr}
              onChange={(e) => setCollectedAmountInr(e.target.value)}
              placeholder="Amount received"
            />
          </div>
          <div>
            <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-[var(--color-jewelry-black,#1a1814)]/45">
              Discount (₹)
            </label>
            <input
              className={`${erpInputCls} bg-[var(--color-slate-900,#faf8f4)] text-[var(--color-jewelry-black,#1a1814)]/80`}
              readOnly
              value={
                discountSummary.totalDiscountInr !== 0
                  ? String(discountSummary.totalDiscountInr)
                  : ''
              }
              placeholder="Auto (MC + cash)"
              title={
                discountSummary.mcDiscountInr > 0
                  ? `MC discount ₹${discountSummary.mcDiscountInr.toLocaleString('en-IN')}${
                      parsedCollected != null
                        ? ` + cash ₹${discountSummary.cashDiscountInr.toLocaleString('en-IN')}`
                        : ''
                    }`
                  : 'Net total minus collected amount'
              }
            />
          </div>
          <div className="sm:col-span-2">
            <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-[var(--color-jewelry-black,#1a1814)]/45">
              Customer address
            </label>
            <textarea
              className={`${erpInputCls} min-h-[72px] py-2.5`}
              placeholder="Address for tax invoice"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
            />
          </div>
          <div>
            <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-[var(--color-jewelry-black,#1a1814)]/45">
              PAN
            </label>
            <input
              className={erpInputCls}
              placeholder="Customer PAN"
              value={customerPan}
              onChange={(e) => setCustomerPan(e.target.value.toUpperCase())}
            />
          </div>
          <div>
            <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-[var(--color-jewelry-black,#1a1814)]/45">
              GST no
            </label>
            <input
              className={erpInputCls}
              placeholder="Customer GSTIN"
              value={customerGst}
              onChange={(e) => setCustomerGst(e.target.value.toUpperCase())}
            />
          </div>
        </div>
        {customerName ? (
          <div className="mt-2 rounded-lg border border-amber-200/70 bg-amber-50/60 px-2.5 py-1.5">
            <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px] leading-snug text-[var(--color-jewelry-black,#1a1814)]/75">
              <span className="font-semibold text-[var(--color-jewelry-black,#1a1814)]">{customerName}</span>
              <span className="rounded bg-amber-200/70 px-1.5 py-px text-[9px] font-bold uppercase text-amber-900">
                Slab {rateSlab}
              </span>
              {mobile ? (
                <>
                  <span className="text-[var(--color-jewelry-black,#1a1814)]/35">·</span>
                  <span>{mobile}</span>
                </>
              ) : null}
              {selectedCustomer?.email ? (
                <>
                  <span className="text-[var(--color-jewelry-black,#1a1814)]/35">·</span>
                  <span className="max-w-[180px] truncate">{selectedCustomer.email}</span>
                </>
              ) : null}
              {selectedCustomer?.gstin ? (
                <>
                  <span className="text-[var(--color-jewelry-black,#1a1814)]/35">·</span>
                  <span>GST {selectedCustomer.gstin}</span>
                </>
              ) : null}
              {(address || selectedCustomer?.address) ? (
                <>
                  <span className="text-[var(--color-jewelry-black,#1a1814)]/35">·</span>
                  <span className="max-w-[220px] truncate">{address || selectedCustomer?.address}</span>
                </>
              ) : null}
              {selectedCustomer?.birthdate ? (
                <>
                  <span className="text-[var(--color-jewelry-black,#1a1814)]/35">·</span>
                  <span>Bday {formatErpDateDdMmYyyy(selectedCustomer.birthdate)}</span>
                </>
              ) : null}
              {selectedCustomer?.anniversary_date ? (
                <>
                  <span className="text-[var(--color-jewelry-black,#1a1814)]/35">·</span>
                  <span>Anniv {formatErpDateDdMmYyyy(selectedCustomer.anniversary_date)}</span>
                </>
              ) : null}
              {selectedCustomer?.notes ? (
                <>
                  <span className="text-[var(--color-jewelry-black,#1a1814)]/35">·</span>
                  <span className="max-w-[200px] truncate italic">{selectedCustomer.notes}</span>
                </>
              ) : null}
            </div>
          </div>
        ) : null}
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" className={erpBtnGhost} onClick={resetBill}>
            <Receipt className="size-4" />
            New bill
          </button>
          <button type="button" className={erpBtnGhost} disabled={saveBusy || lines.length === 0} onClick={() => void generateQuote()}>
            <FileText className="size-4" />
            {generateQuoteButtonLabel}
          </button>
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

      <div className="grid gap-4 lg:grid-cols-[240px_1fr]">
        <div className="space-y-3">
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
            <p className="mt-2 text-[10px] text-blue-900/55">
              USB scanner, type &amp; Enter, or tap the camera icon on phone/laptop.
            </p>
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
              <p className="mt-2 text-[10px] text-emerald-700">
                Wholesale:
                {wholesaleGold ? ` Au ${formatErpInr(wholesaleGold)}/g` : ''}
                {wholesaleGold && wholesaleSilver ? ' ·' : ''}
                {wholesaleSilver ? ` Ag ${formatErpInr(wholesaleSilver)}/g` : ''}
              </p>
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

        <div className={`${erpCardCls} overflow-hidden p-0`}>
          <div className="flex items-center justify-between border-b border-[var(--color-slate-700,#e8e4df)] bg-blue-600 px-3 py-2.5 text-white">
            <span className="text-sm font-semibold">Scanned products</span>
            <span className="rounded-full bg-white/20 px-2 py-0.5 text-xs font-semibold">{lines.length} items</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[1200px] text-xs">
              <thead>
                <tr className="border-b border-[var(--color-slate-700,#e8e4df)] bg-[var(--color-slate-900,#faf8f4)] text-[var(--color-jewelry-black,#1a1814)]/55">
                  <th className="px-2 py-2">#</th>
                  {TABLE_COLS.map((c) => (
                    <th key={c.key} className={`whitespace-nowrap px-2 py-2 text-left font-semibold ${c.w}`}>
                      {c.label}
                    </th>
                  ))}
                  <th className="px-2 py-2" />
                </tr>
              </thead>
              <tbody>
                {lines.length === 0 ? (
                  <tr>
                    <td colSpan={TABLE_COLS.length + 2} className="px-4 py-12 text-center text-[var(--color-jewelry-black,#1a1814)]/45">
                      Scan a barcode to add items
                    </td>
                  </tr>
                ) : (
                  lines.map((line, idx) => (
                    <tr
                      key={`${line.barcode}-${idx}`}
                      ref={(el) => {
                        rowRefs.current[idx] = el
                      }}
                      className={`border-b border-[var(--color-slate-700,#e8e4df)]/50 transition-colors ${
                        duplicateHighlights.has(idx) ? 'bg-amber-100 ring-2 ring-amber-400 ring-inset' : ''
                      }`}
                    >
                      <td className="px-2 py-2 tabular-nums">{idx + 1}</td>
                      {TABLE_COLS.map((col) => {
                        if (col.key === 'amount') {
                          return (
                            <td key={col.key} className="px-2 py-2 font-semibold tabular-nums text-emerald-700">
                              {cellVal(line, col.key)}
                            </td>
                          )
                        }
                        if ('edit' in col && col.edit) {
                          const k = col.key as keyof ErpBillLine
                          const goldSlabRField =
                            isGoldSlabRLine(line, rateSlab) &&
                            (k === 'wastage_pct' || k === 'mc_rate')
                          const mcHint = k === 'mc_rate' ? billingMcDiscountHint(line, rateSlab) : null
                          return (
                            <td key={col.key} className="px-1 py-1">
                              <input
                                className={`w-full min-w-[52px] rounded border border-[var(--color-slate-700,#e8e4df)] px-1 py-1 tabular-nums ${
                                  goldSlabRField ? 'bg-[var(--color-slate-900,#faf8f4)] text-[var(--color-jewelry-black,#1a1814)]/70' : ''
                                }`}
                                readOnly={goldSlabRField}
                                title={
                                  goldSlabRField
                                    ? mcHint || 'Slab R gold — wastage is shown as making charges (auto)'
                                    : undefined
                                }
                                value={String(cellVal(line, col.key) ?? '')}
                                onChange={(e) => {
                                  if (goldSlabRField) return
                                  const v = e.target.value
                                  const numKeys = ['weightGm', 'purity', 'wastage_pct', 'ratePerGram', 'mc_rate', 'qty', 'box_charges', 'stone_charges', 'fixed_price']
                                  const patch: Partial<ErpBillLine> = {
                                    [k]: numKeys.includes(k) ? (v === '' ? null : Number(v)) : v,
                                  } as Partial<ErpBillLine>
                                  if (k === 'ratePerGram') {
                                    patch.rateLocked = v !== ''
                                  }
                                  updateLine(idx, patch)
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
                          <td key={col.key} className="max-w-[120px] truncate px-2 py-2">
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
                  ))
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
              {parsedAdvance > 0 ? (
                <>
                  <div>
                    <p className="text-[10px] uppercase text-[var(--color-jewelry-black,#1a1814)]/45">Advance paid</p>
                    <p className="font-semibold tabular-nums text-emerald-700">{formatErpInr(parsedAdvance)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase text-[var(--color-jewelry-black,#1a1814)]/45">Amount to pay</p>
                    <p className="font-semibold tabular-nums text-amber-800">{formatErpInr(balanceDue)}</p>
                  </div>
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

      {bills.length > 0 ? (
        <div className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--color-jewelry-black,#1a1814)]/45">Recent bills</h3>
          {bills.slice(0, 5).map((b) => (
            <div key={b.id} className={`${erpCardCls} flex flex-wrap items-center justify-between gap-2 py-3`}>
              <div>
                <p className="font-semibold text-[var(--color-jewelry-black,#1a1814)]">{b.bill_number}</p>
                <p className="text-xs text-[var(--color-jewelry-black,#1a1814)]/55">
                  {b.customer_name || '—'} · {b.status}
                </p>
              </div>
              <p className="font-semibold tabular-nums text-[var(--kc-accent,#c41e3a)]">{formatErpInr(b.total_inr)}</p>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  )
}

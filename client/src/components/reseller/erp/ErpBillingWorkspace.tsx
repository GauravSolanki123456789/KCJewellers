'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import axios from '@/lib/axios'
import { useAuth } from '@/hooks/useAuth'
import { type WholesaleUserFields } from '@/lib/customer-tier'
import {
  computeLineBreakdown,
  displayRatesToPerGram,
  parseSlabSettingsFromUser,
  perGramToDisplayRates,
  type ErpRateSlab,
} from '@/lib/erp-billing-pricing'
import { formatErpInr } from '@/lib/reseller-erp-modules'
import { ratesApiQueryForStorefront } from '@/lib/storefront-domain'
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
  UserPlus,
  X,
} from 'lucide-react'

const BILLING_DRAFT_KEY = 'kc-erp-billing-draft-v1'

type BillingDraft = {
  customerId: number | null
  customerName: string
  mobile: string
  address: string
  rateSlab: ErpRateSlab
  lines: ErpBillLine[]
  wholesaleGold: number | null
  wholesaleSilver: number | null
  goldPerG: number
  silverPerG: number
}

const TABLE_COLS = [
  { key: 'barcode', label: 'Barcode', w: 'min-w-[110px]' },
  { key: 'sku', label: 'SKU', w: 'min-w-[80px]' },
  { key: 'style_code', label: 'StyleCode', w: 'min-w-[80px]' },
  { key: 'name', label: 'ProductName', w: 'min-w-[100px]' },
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
    purity: p.purity ?? (metal.includes('silver') ? 925 : null),
    wastage_pct: p.wastage_pct ?? null,
    ratePerGram: null,
    mc_rate: p.mc_rate ?? null,
    mc_type: p.mc_type ?? null,
    box_charges: p.box_charges ?? 0,
    stone_charges: p.stone_charges ?? 0,
    metal_type: p.metal_type || 'silver',
    item_code: p.item_code ?? undefined,
    imageUrl: p.image_url ?? null,
    fixed_price: p.fixed_price ?? null,
    stock_piece_id: p.id,
    availability: null,
    lineTotalInr: null,
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
  const [saveBusy, setSaveBusy] = useState(false)
  const [bills, setBills] = useState<ErpBill[]>([])
  const [hydrated, setHydrated] = useState(false)
  const scanRef = useRef<HTMLInputElement>(null)

  const recalcLine = useCallback(
    (line: ErpBillLine): ErpBillLine => {
      const bd = computeLineBreakdown(
        line,
        displayRates,
        rateSlab,
        slabSettings,
        wholesaleGold,
        wholesaleSilver,
      )
      const next: ErpBillLine = { ...line, lineTotalInr: bd.total }
      if (!line.rateLocked) {
        const r = bd.rate_per_gram
        next.ratePerGram =
          r != null && Number.isFinite(r) ? Math.round(r * 100) / 100 : null
      }
      return next
    },
    [displayRates, rateSlab, slabSettings, wholesaleGold, wholesaleSilver],
  )

  const recalcAll = useCallback(
    (list: ErpBillLine[]) => list.map(recalcLine),
    [recalcLine],
  )

  const loadDisplayRates = useCallback(async () => {
    const res = await axios.get<{ rates?: unknown }>(
      `/api/rates/display${ratesApiQueryForStorefront()}`,
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
    void axios.get<{ bills: ErpBill[] }>('/api/reseller/erp/bills').then((res) => {
      setBills((res.data.bills || []).filter((b) => b.bill_type === 'sale'))
    })
  }, [loadDisplayRates])

  useEffect(() => {
    const d = loadDraft()
    if (d) {
      if (d.customerId != null) setCustomerId(d.customerId)
      if (d.customerName) setCustomerName(d.customerName)
      if (d.mobile) setMobile(d.mobile)
      if (d.address) setAddress(d.address)
      if (d.rateSlab) setRateSlab(d.rateSlab)
      if (d.lines?.length) setLines(d.lines)
      if (d.wholesaleGold != null) setWholesaleGold(d.wholesaleGold)
      if (d.wholesaleSilver != null) setWholesaleSilver(d.wholesaleSilver)
      if (d.goldPerG) setGoldPerG(d.goldPerG)
      if (d.silverPerG) setSilverPerG(d.silverPerG)
    }
    setHydrated(true)
  }, [])

  useEffect(() => {
    if (!hydrated) return
    saveDraft({
      customerId,
      customerName,
      mobile,
      address,
      rateSlab,
      lines,
      wholesaleGold,
      wholesaleSilver,
      goldPerG,
      silverPerG,
    })
  }, [hydrated, customerId, customerName, mobile, address, rateSlab, lines, wholesaleGold, wholesaleSilver, goldPerG, silverPerG])

  useEffect(() => {
    if (!hydrated || !displayRates) return
    setLines((prev) => recalcAll(prev))
  }, [displayRates, rateSlab, wholesaleGold, wholesaleSilver, slabSettings, hydrated, recalcAll])

  const loadCustomers = useCallback(async (q: string) => {
    const res = await axios.get<{ customers: ErpCustomer[] }>('/api/reseller/erp/customers', {
      params: q.trim() ? { q: q.trim() } : {},
    })
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
    setCustomerQ('')
  }

  const scan = async () => {
    const code = scanCode.trim()
    if (!code || scanBusy) return
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
      alert(erpErr(e))
    } finally {
      setScanBusy(false)
    }
  }

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
      setPendingSlab(next)
      setModalWhGold(wholesaleGold != null ? String(wholesaleGold) : '')
      setModalWhSilver(wholesaleSilver != null ? String(wholesaleSilver) : '')
      setShowWholesaleModal(true)
    } else {
      setRateSlab(next)
      setLines((prev) => unlockLineRates(prev))
    }
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
    if (pendingSlab) setRateSlab(pendingSlab)
    setLines((prev) => unlockLineRates(prev))
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

  const totals = useMemo(() => {
    let taxable = 0
    let gst = 0
    let net = 0
    let weight = 0
    for (const l of lines) {
      const bd = computeLineBreakdown(l, displayRates, rateSlab, slabSettings, wholesaleGold, wholesaleSilver)
      taxable += bd.taxable
      gst += (bd.cgst || 0) + (bd.sgst || 0)
      net += bd.total
      weight += Number(l.weightGm) || 0
    }
    return { subtotal: taxable, gst, net, weight, count: lines.length }
  }, [lines, displayRates, rateSlab, slabSettings, wholesaleGold, wholesaleSilver])

  const resetBill = () => {
    setLines([])
    setCustomerId(null)
    setCustomerName('')
    setMobile('')
    setAddress('')
    setRateSlab('R')
    setWholesaleGold(null)
    setWholesaleSilver(null)
    clearDraftStorage()
    void loadDisplayRates()
  }

  const saveBill = async (billType: 'sale' | 'estimate', status: string) => {
    if (saveBusy || lines.length === 0) return
    setSaveBusy(true)
    try {
      await axios.post('/api/reseller/erp/bills', {
        bill_type: billType,
        customer_id: customerId,
        customer_name: customerName,
        total_inr: totals.net,
        status,
        notes: `Rate slab ${rateSlab}${address ? ` · ${address}` : ''}`,
        lines: lines.map((l) => ({ ...l, lineTotalInr: l.lineTotalInr ?? 0 })),
      })
      resetBill()
      const res = await axios.get<{ bills: ErpBill[] }>('/api/reseller/erp/bills')
      setBills((res.data.bills || []).filter((b) => b.bill_type === 'sale'))
    } catch (e) {
      alert(erpErr(e))
    } finally {
      setSaveBusy(false)
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
      case 'size':
        return line.size || '—'
      case 'weightGm':
        return line.weightGm ?? ''
      case 'purity':
        return line.purity ?? ''
      case 'wastage_pct':
        return line.wastage_pct ?? ''
      case 'ratePerGram':
        return line.ratePerGram ?? ''
      case 'mc_rate':
        return line.mc_rate ?? ''
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
              }}
            />
            {customerQ.trim() && customers.length > 0 ? (
              <ul className="absolute z-20 mt-1 max-h-48 w-full overflow-auto rounded-xl border border-[var(--color-slate-700,#e8e4df)] bg-white shadow-lg">
                {customers.slice(0, 8).map((c) => (
                  <li key={c.id}>
                    <button
                      type="button"
                      className="w-full px-3 py-2 text-left text-sm hover:bg-[var(--kc-accent,#c41e3a)]/[0.06]"
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
        </div>
        {customerName ? (
          <div className="mt-3 rounded-xl border border-amber-200/80 bg-amber-50/80 px-3 py-2.5 text-sm">
            <span className="font-semibold text-[var(--color-jewelry-black,#1a1814)]">{customerName}</span>
            {address ? <span className="text-[var(--color-jewelry-black,#1a1814)]/60"> · {address}</span> : null}
            <span className="ml-2 rounded-full bg-amber-200/80 px-2 py-0.5 text-[10px] font-bold uppercase text-amber-900">
              Slab {rateSlab}
            </span>
          </div>
        ) : null}
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" className={`${erpBtnPrimary} bg-emerald-600`} onClick={() => void loadCustomers('')}>
            <UserPlus className="size-4" />
            Refresh customers
          </button>
          <button type="button" className={erpBtnGhost} onClick={resetBill}>
            <Receipt className="size-4" />
            New bill
          </button>
          <button type="button" className={erpBtnGhost} disabled={saveBusy || lines.length === 0} onClick={() => void saveBill('estimate', 'draft')}>
            <FileText className="size-4" />
            Generate quote
          </button>
          <button type="button" className={erpBtnPrimary} disabled={saveBusy || lines.length === 0} onClick={() => void saveBill('sale', 'completed')}>
            {saveBusy ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
            Save bill
          </button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[240px_1fr]">
        <div className="space-y-3">
          <div className={`${erpCardCls} border-blue-200/60 bg-blue-50/30`}>
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-semibold text-blue-900">Scanner</span>
              <Camera className="size-4 text-blue-600" />
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
                    <tr key={`${line.barcode}-${idx}`} className="border-b border-[var(--color-slate-700,#e8e4df)]/50">
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
                          return (
                            <td key={col.key} className="px-1 py-1">
                              <input
                                className="w-full min-w-[52px] rounded border border-[var(--color-slate-700,#e8e4df)] px-1 py-1 tabular-nums"
                                value={String(line[k] ?? '')}
                                onChange={(e) => {
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
            <div className="grid grid-cols-2 gap-3 border-t border-[var(--color-slate-700,#e8e4df)] bg-[var(--color-slate-900,#faf8f4)] px-4 py-3 sm:grid-cols-5">
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

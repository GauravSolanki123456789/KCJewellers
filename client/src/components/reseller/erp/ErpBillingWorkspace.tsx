'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import axios from '@/lib/axios'
import { calculateBreakdown, type Item } from '@/lib/pricing'
import { formatErpInr } from '@/lib/reseller-erp-modules'
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
  Trash2,
  UserPlus,
  X,
} from 'lucide-react'

type LiveRates = {
  gold_per_gram: number
  silver_per_gram: number
  platinum_per_gram: number
}

const RATE_SLABS = ['R', 'W', 'F'] as const

function lineAmount(line: ErpBillLine, rates: LiveRates): number {
  if (line.lineTotalInr != null && Number.isFinite(line.lineTotalInr)) return line.lineTotalInr
  const item: Item = {
    barcode: line.barcode || line.code,
    sku: line.sku,
    item_name: line.name,
    style_code: line.style_code,
    metal_type: line.metal_type || 'silver',
    net_weight: line.weightGm ?? undefined,
    net_wt: line.weightGm ?? undefined,
    purity: line.purity ?? 925,
    wastage_pct: line.wastage_pct ?? undefined,
    mc_rate: line.mc_rate ?? undefined,
    mc_type: line.mc_type ?? undefined,
    stone_charges: line.stone_charges ?? 0,
    box_charges: line.box_charges ?? 0,
    fixed_price: line.fixed_price ?? undefined,
    size: line.size ?? undefined,
  }
  const live = {
    silver: { display_rate: line.ratePerGram ?? rates.silver_per_gram },
    gold: { display_rate: line.ratePerGram ?? rates.gold_per_gram },
  }
  const bd = calculateBreakdown(item, live, 3)
  return bd.total
}

function productToLine(p: ErpProductHit, code: string, rates: LiveRates): ErpBillLine {
  const wt = p.net_weight ?? p.gross_weight ?? null
  const metal = (p.metal_type || 'silver').toLowerCase()
  const rate =
    metal.includes('gold')
      ? rates.gold_per_gram
      : metal.includes('platinum')
        ? rates.platinum_per_gram
        : rates.silver_per_gram
  const line: ErpBillLine = {
    name: p.product_name || p.name || code,
    code,
    barcode: p.barcode || code,
    sku: p.sku || undefined,
    style_code: p.style_code || undefined,
    size: p.size ?? null,
    qty: 1,
    weightGm: wt,
    purity: p.purity ?? (metal.includes('silver') ? 925 : null),
    wastage_pct: p.wastage_pct ?? null,
    ratePerGram: rate,
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
  }
  line.lineTotalInr = lineAmount(line, rates)
  return line
}

export function ErpBillingWorkspace() {
  const [customers, setCustomers] = useState<ErpCustomer[]>([])
  const [customerQ, setCustomerQ] = useState('')
  const [customerId, setCustomerId] = useState<number | null>(null)
  const [customerName, setCustomerName] = useState('')
  const [mobile, setMobile] = useState('')
  const [address, setAddress] = useState('')
  const [rateSlab, setRateSlab] = useState<(typeof RATE_SLABS)[number]>('R')
  const [lines, setLines] = useState<ErpBillLine[]>([])
  const [rates, setRates] = useState<LiveRates>({ gold_per_gram: 7500, silver_per_gram: 252.2, platinum_per_gram: 3500 })
  const [scanCode, setScanCode] = useState('')
  const [scanBusy, setScanBusy] = useState(false)
  const [saveBusy, setSaveBusy] = useState(false)
  const [bills, setBills] = useState<ErpBill[]>([])
  const scanRef = useRef<HTMLInputElement>(null)

  const loadCustomers = useCallback(async (q: string) => {
    const res = await axios.get<{ customers: ErpCustomer[] }>('/api/reseller/erp/customers', {
      params: q.trim() ? { q: q.trim() } : {},
    })
    setCustomers(res.data.customers || [])
  }, [])

  const loadRates = useCallback(async () => {
    const res = await axios.get<{ rates: LiveRates }>('/api/reseller/erp/rates/live')
    if (res.data.rates) setRates(res.data.rates)
  }, [])

  const loadBills = useCallback(async () => {
    const res = await axios.get<{ bills: ErpBill[] }>('/api/reseller/erp/bills')
    setBills((res.data.bills || []).filter((b) => b.bill_type === 'sale'))
  }, [])

  useEffect(() => {
    void loadRates()
    void loadBills()
  }, [loadRates, loadBills])

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
      const line = productToLine(res.data.product, code, rates)
      if (res.data.availability?.label) line.availability = res.data.availability.label
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
        const next = { ...l, ...patch }
        next.lineTotalInr = lineAmount(next, rates)
        return next
      }),
    )
  }

  const totals = useMemo(() => {
    const amounts = lines.map((l) => lineAmount(l, rates))
    const subtotal = amounts.reduce((s, a) => s + a, 0)
    const gst = subtotal * 0.03
    const weight = lines.reduce((s, l) => s + (Number(l.weightGm) || 0), 0)
    return { subtotal, gst, net: subtotal + gst, weight, count: lines.length }
  }, [lines, rates])

  const resetBill = () => {
    setLines([])
    setCustomerId(null)
    setCustomerName('')
    setMobile('')
    setAddress('')
    setRateSlab('R')
  }

  const saveBill = async (billType: 'sale' | 'estimate', status: string) => {
    if (saveBusy || lines.length === 0) return
    setSaveBusy(true)
    try {
      await axios.post('/api/reseller/erp/bills', {
        bill_type: billType,
        customer_id: customerId,
        customer_name: customerName,
        total_inr: billType === 'estimate' ? totals.subtotal : totals.net,
        status,
        notes: `Rate slab ${rateSlab}${address ? ` · ${address}` : ''}`,
        lines: lines.map((l) => ({
          ...l,
          lineTotalInr: lineAmount(l, rates),
        })),
      })
      resetBill()
      await loadBills()
    } catch (e) {
      alert(erpErr(e))
    } finally {
      setSaveBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      {/* Customer header */}
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
            <select className={erpInputCls} value={rateSlab} onChange={(e) => setRateSlab(e.target.value as (typeof RATE_SLABS)[number])}>
              {RATE_SLABS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
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
          <button
            type="button"
            className={erpBtnGhost}
            disabled={saveBusy || lines.length === 0}
            onClick={() => void saveBill('estimate', 'draft')}
          >
            <FileText className="size-4" />
            Generate quote
          </button>
          <button
            type="button"
            className={erpBtnPrimary}
            disabled={saveBusy || lines.length === 0}
            onClick={() => void saveBill('sale', 'completed')}
          >
            {saveBusy ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
            Save bill
          </button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[240px_1fr]">
        {/* Sidebar */}
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
            <p className="mt-1.5 text-[10px] text-blue-800/60">Press Enter or tap search</p>
          </div>

          <div className={erpCardCls}>
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-semibold text-[var(--color-jewelry-black,#1a1814)]">Current rates</span>
              <button type="button" className="text-[10px] font-semibold text-[var(--kc-accent,#c41e3a)]" onClick={() => void loadRates()}>
                Update
              </button>
            </div>
            <ul className="space-y-1.5 text-xs">
              <li className="flex justify-between">
                <span className="text-[var(--color-jewelry-black,#1a1814)]/60">Gold</span>
                <span className="font-semibold tabular-nums">{formatErpInr(rates.gold_per_gram)}/gm</span>
              </li>
              <li className="flex justify-between">
                <span className="text-[var(--color-jewelry-black,#1a1814)]/60">Silver</span>
                <span className="font-semibold tabular-nums">{formatErpInr(rates.silver_per_gram)}/gm</span>
              </li>
              <li className="flex justify-between">
                <span className="text-[var(--color-jewelry-black,#1a1814)]/60">Platinum</span>
                <span className="font-semibold tabular-nums">{formatErpInr(rates.platinum_per_gram)}/gm</span>
              </li>
            </ul>
          </div>
        </div>

        {/* Scanned products table */}
        <div className={`${erpCardCls} overflow-hidden p-0`}>
          <div className="flex items-center justify-between border-b border-[var(--color-slate-700,#e8e4df)] bg-blue-600 px-3 py-2.5 text-white">
            <span className="text-sm font-semibold">Scanned products</span>
            <span className="rounded-full bg-white/20 px-2 py-0.5 text-xs font-semibold">{lines.length} items</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[880px] text-xs">
              <thead>
                <tr className="border-b border-[var(--color-slate-700,#e8e4df)] bg-[var(--color-slate-900,#faf8f4)] text-[var(--color-jewelry-black,#1a1814)]/55">
                  {['#', 'Barcode', 'Item', 'SKU', 'Style', 'Metal', 'Size', 'Wt(g)', 'P%', 'Rate', 'MC', 'Box', 'Stone', 'Amount', ''].map(
                    (h) => (
                      <th key={h || 'x'} className="whitespace-nowrap px-2 py-2 text-left font-semibold">
                        {h}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody>
                {lines.length === 0 ? (
                  <tr>
                    <td colSpan={15} className="px-4 py-12 text-center text-[var(--color-jewelry-black,#1a1814)]/45">
                      Scan a barcode to add items
                    </td>
                  </tr>
                ) : (
                  lines.map((line, idx) => (
                    <tr key={`${line.barcode}-${idx}`} className="border-b border-[var(--color-slate-700,#e8e4df)]/50">
                      <td className="px-2 py-2 tabular-nums">{idx + 1}</td>
                      <td className="max-w-[120px] truncate px-2 py-2 font-medium">{line.barcode}</td>
                      <td className="max-w-[100px] truncate px-2 py-2">{line.name}</td>
                      <td className="px-2 py-2">{line.sku || '—'}</td>
                      <td className="px-2 py-2">{line.style_code || '—'}</td>
                      <td className="px-2 py-2">
                        <span className="rounded bg-[var(--color-slate-900,#f0ede8)] px-1.5 py-0.5 text-[10px] font-semibold uppercase">
                          {(line.metal_type || 'silver').slice(0, 6)}
                        </span>
                      </td>
                      <td className="px-2 py-2">{line.size || '—'}</td>
                      <td className="px-1 py-1">
                        <input
                          className="w-16 rounded border border-[var(--color-slate-700,#e8e4df)] px-1 py-1 tabular-nums"
                          value={line.weightGm ?? ''}
                          onChange={(e) => updateLine(idx, { weightGm: Number(e.target.value) || null })}
                        />
                      </td>
                      <td className="px-2 py-2 tabular-nums">{line.purity ?? '—'}</td>
                      <td className="px-1 py-1">
                        <input
                          className="w-16 rounded border border-[var(--color-slate-700,#e8e4df)] px-1 py-1 tabular-nums"
                          value={line.ratePerGram ?? ''}
                          onChange={(e) => updateLine(idx, { ratePerGram: Number(e.target.value) || null })}
                        />
                      </td>
                      <td className="px-1 py-1">
                        <input
                          className="w-16 rounded border border-[var(--color-slate-700,#e8e4df)] px-1 py-1 tabular-nums"
                          value={line.mc_rate ?? ''}
                          onChange={(e) => updateLine(idx, { mc_rate: Number(e.target.value) || null })}
                        />
                      </td>
                      <td className="px-2 py-2 tabular-nums">{formatErpInr(line.box_charges ?? 0)}</td>
                      <td className="px-2 py-2 tabular-nums">{formatErpInr(line.stone_charges ?? 0)}</td>
                      <td className="px-2 py-2 font-semibold tabular-nums text-emerald-700">
                        {formatErpInr(lineAmount(line, rates))}
                      </td>
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

      {/* Recent bills */}
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

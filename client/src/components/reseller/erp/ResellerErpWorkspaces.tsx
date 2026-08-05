'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import axios from '@/lib/axios'
import { Loader2, MessageCircle, Plus, Search, Trash2, ScanLine, Download, Upload, FileSpreadsheet, ClipboardList } from 'lucide-react'
import { RESELLER_ERP_PATH, RESELLER_MC_SLABS_PATH, RESELLER_RATES_PATH } from '@/lib/routes'
import { formatErpInr } from '@/lib/reseller-erp-modules'
import { formatErpDateDdMmYyyy } from '@/lib/erp-date-format'
import { customerWhatsAppHref } from '@/lib/catalog-inquiry-shared'
import { ErpDateInput } from '@/components/reseller/erp/ErpDateInput'
import {
  erpBtnGhost,
  erpBtnPrimary,
  erpCardCls,
  erpInputCls,
  erpErr,
  type ErpBill,
  type ErpBillLine,
  type ErpCustomer,
  type ErpProductHit,
  type ErpStockItem,
} from '@/components/reseller/erp/erp-ui'

async function lookupProduct(code: string): Promise<ErpProductHit | null> {
  const c = code.trim()
  if (!c) return null
  try {
    const res = await axios.get<{ product: ErpProductHit }>('/api/reseller/erp/products/lookup', {
      params: { code: c },
    })
    return res.data.product
  } catch {
    return null
  }
}

function ProductThumb({ url, name }: { url?: string | null; name?: string | null }) {
  if (!url) {
    return (
      <div className="flex size-12 shrink-0 items-center justify-center rounded-lg bg-[var(--color-slate-900,#f7f4ef)] text-[10px] text-[var(--color-jewelry-black,#1a1814)]/40">
        No photo
      </div>
    )
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={url} alt={name || 'Product'} className="size-12 shrink-0 rounded-lg object-cover ring-1 ring-[var(--color-slate-700,#e8e4df)]" />
  )
}

function BarcodeLookupField({
  onHit,
  placeholder = 'Scan or type barcode / SKU',
}: {
  onHit: (product: ErpProductHit, code: string) => void
  placeholder?: string
}) {
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const ref = useRef<HTMLInputElement>(null)

  const run = async () => {
    if (!code.trim() || busy) return
    setBusy(true)
    try {
      const p = await lookupProduct(code)
      if (p) onHit(p, code.trim())
      else alert('No product found for this barcode / SKU')
    } finally {
      setBusy(false)
      setCode('')
      ref.current?.focus()
    }
  }

  return (
    <div className="flex gap-2">
      <input
        ref={ref}
        className={erpInputCls}
        placeholder={placeholder}
        value={code}
        onChange={(e) => setCode(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') void run()
        }}
      />
      <button type="button" className={erpBtnGhost} disabled={busy} onClick={() => void run()}>
        {busy ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}
      </button>
    </div>
  )
}

export function CustomersWorkspace() {
  type UpcomingEvent = {
    customer_id: number
    name: string
    mobile?: string | null
    kind: 'birthday' | 'anniversary'
    event_date: string
    when: 'today' | 'tomorrow'
  }

  const [customers, setCustomers] = useState<ErpCustomer[]>([])
  const [upcomingEvents, setUpcomingEvents] = useState<UpcomingEvent[]>([])
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState(false)
  const [bulkBusy, setBulkBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const [form, setForm] = useState({
    name: '',
    mobile: '',
    email: '',
    gstin: '',
    address: '',
    birthdate: '',
    anniversary_date: '',
    notes: '',
  })

  const load = useCallback(async () => {
    const [list, up] = await Promise.all([
      axios.get<{ customers: ErpCustomer[] }>('/api/reseller/erp/customers', {
        params: q.trim() ? { q: q.trim() } : {},
      }),
      axios.get<{ events: UpcomingEvent[] }>('/api/reseller/erp/customers/upcoming'),
    ])
    setCustomers(list.data.customers || [])
    setUpcomingEvents(up.data.events || [])
  }, [q])

  useEffect(() => {
    void load().catch(() => setCustomers([]))
  }, [load])

  const save = async () => {
    if (!form.name.trim() || busy) return
    setBusy(true)
    try {
      await axios.post('/api/reseller/erp/customers', form)
      setForm({
        name: '',
        mobile: '',
        email: '',
        gstin: '',
        address: '',
        birthdate: '',
        anniversary_date: '',
        notes: '',
      })
      await load()
    } catch (e) {
      alert(erpErr(e))
    } finally {
      setBusy(false)
    }
  }

  const remove = async (id: number) => {
    if (!confirm('Delete this customer?')) return
    await axios.delete(`/api/reseller/erp/customers/${id}`)
    await load()
  }

  const CUSTOMER_COLS = ['Name', 'Mobile', 'Email', 'GSTIN', 'Address', 'Birthday', 'Anniversary', 'Notes'] as const

  const downloadAllExcel = async () => {
    setBusy(true)
    setMsg(null)
    try {
      const res = await axios.get<{ customers: Record<string, unknown>[] }>('/api/reseller/erp/customers/export')
      const rows = (res.data.customers || []).map((c) => ({
        Name: c.name ?? '',
        Mobile: c.mobile ?? '',
        Email: c.email ?? '',
        GSTIN: c.gstin ?? '',
        Address: c.address ?? '',
        Birthday: c.birthdate ? formatErpDateDdMmYyyy(String(c.birthdate)) : '',
        Anniversary: c.anniversary_date ? formatErpDateDdMmYyyy(String(c.anniversary_date)) : '',
        Notes: c.notes ?? '',
      }))
      const XLSX = await import('xlsx')
      const ws = XLSX.utils.json_to_sheet(rows.length ? rows : [{ Name: '' }])
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'Customers')
      XLSX.writeFile(wb, `erp-customers-${new Date().toISOString().slice(0, 10)}.xlsx`)
      setMsg(`Downloaded ${rows.length} customer(s).`)
    } catch (e) {
      alert(erpErr(e))
    } finally {
      setBusy(false)
    }
  }

  const downloadSampleExcel = async () => {
    const XLSX = await import('xlsx')
    const sample = [
      {
        Name: 'Sample Customer',
        Mobile: '9876543210',
        Email: 'sample@example.com',
        GSTIN: '',
        Address: 'City, State',
        Birthday: '15/01/1990',
        Anniversary: '20/06/2015',
        Notes: 'Optional notes',
      },
    ]
    const ws = XLSX.utils.json_to_sheet(sample)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Customers')
    XLSX.writeFile(wb, 'erp-customers-sample.xlsx')
  }

  const onBulkFile = async (file: File) => {
    setBulkBusy(true)
    setMsg(null)
    try {
      const buf = await file.arrayBuffer()
      const XLSX = await import('xlsx')
      const wb = XLSX.read(buf, { type: 'array' })
      const sheet = wb.Sheets[wb.SheetNames[0]]
      const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' })
      if (!raw.length) throw new Error('No rows in file')
      const rows = raw.map((row) => {
        const out: Record<string, string> = {}
        for (const col of CUSTOMER_COLS) {
          const v = row[col] ?? row[col.toLowerCase()]
          if (v != null && String(v).trim() !== '') out[col] = String(v).trim()
        }
        return out
      })
      const res = await axios.post<{ inserted: number; skipped: number }>('/api/reseller/erp/customers/bulk', { rows })
      setMsg(`Bulk upload: ${res.data.inserted} added, ${res.data.skipped} skipped.`)
      await load()
    } catch (e) {
      alert(erpErr(e))
    } finally {
      setBulkBusy(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  return (
    <div className="space-y-5">
      {upcomingEvents.length > 0 ? (
        <div className={erpCardCls}>
          <p className="mb-2 text-sm font-semibold text-[var(--color-jewelry-black,#1a1814)]">Reminders</p>
          <ul className="space-y-2">
            {upcomingEvents.map((ev) => {
              const isToday = ev.when === 'today'
              const dateLabel = formatErpDateDdMmYyyy(ev.event_date)
              const headline = isToday
                ? ev.kind === 'birthday'
                  ? `Happy Birthday ${ev.name}`
                  : `Happy Anniversary ${ev.name}`
                : ev.kind === 'birthday'
                  ? `Upcoming birthday · ${ev.name}`
                  : `Upcoming anniversary · ${ev.name}`
              const sub = isToday
                ? dateLabel
                : `${dateLabel} · 1 day to go`
              const waText = isToday
                ? ev.kind === 'birthday'
                  ? `Happy Birthday ${ev.name}!`
                  : `Happy Anniversary ${ev.name}!`
                : null
              const waHref = waText ? customerWhatsAppHref(ev.mobile, waText) : null
              return (
                <li
                  key={`${ev.customer_id}-${ev.kind}`}
                  className={`flex flex-wrap items-center justify-between gap-2 rounded-xl border px-3 py-2.5 ${
                    isToday
                      ? 'border-[var(--kc-accent,#c41e3a)]/25 bg-[var(--kc-accent,#c41e3a)]/[0.06]'
                      : 'border-amber-200/80 bg-amber-50/60'
                  }`}
                >
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-[var(--color-jewelry-black,#1a1814)]">{headline}</p>
                    <p className="text-[11px] text-[var(--color-jewelry-black,#1a1814)]/55">{sub}</p>
                  </div>
                  {isToday && waHref ? (
                    <a
                      href={waHref}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl bg-emerald-600 px-3 text-xs font-semibold text-white hover:bg-emerald-700"
                    >
                      <MessageCircle className="size-4" />
                      WhatsApp
                    </a>
                  ) : null}
                </li>
              )
            })}
          </ul>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-emerald-600 px-4 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-60"
          disabled={busy}
          onClick={() => void downloadAllExcel()}
        >
          {busy ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
          Download All
        </button>
        <button
          type="button"
          className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-violet-600 px-4 text-sm font-semibold text-white shadow-sm hover:bg-violet-700"
          onClick={() => void downloadSampleExcel()}
        >
          <ClipboardList className="size-4" />
          Sample
        </button>
        <button
          type="button"
          className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 disabled:opacity-60"
          disabled={bulkBusy}
          onClick={() => fileRef.current?.click()}
        >
          {bulkBusy ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
          Bulk Upload
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".xlsx,.xls,.csv"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) void onBulkFile(f)
          }}
        />
      </div>
      {msg ? (
        <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{msg}</p>
      ) : null}

      <div className={erpCardCls}>
        <p className="mb-3 text-sm font-semibold text-[var(--color-jewelry-black,#1a1814)]">Add customer</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <input className={erpInputCls} placeholder="Name *" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <input className={erpInputCls} placeholder="Mobile" value={form.mobile} onChange={(e) => setForm({ ...form, mobile: e.target.value })} />
          <input className={erpInputCls} placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          <input className={erpInputCls} placeholder="GSTIN" value={form.gstin} onChange={(e) => setForm({ ...form, gstin: e.target.value })} />
          <input className={erpInputCls} placeholder="Address" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
          <label className="text-xs text-[var(--color-jewelry-black,#1a1814)]/55">
            Birthday (dd/mm/yyyy)
            <ErpDateInput className={`${erpInputCls} mt-1`} value={form.birthdate} onChange={(v) => setForm({ ...form, birthdate: v })} />
          </label>
          <label className="text-xs text-[var(--color-jewelry-black,#1a1814)]/55">
            Anniversary (dd/mm/yyyy)
            <ErpDateInput className={`${erpInputCls} mt-1`} value={form.anniversary_date} onChange={(v) => setForm({ ...form, anniversary_date: v })} />
          </label>
          <textarea className={`${erpInputCls} min-h-[88px] py-2.5 sm:col-span-2`} placeholder="Notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
        </div>
        <button type="button" className={`${erpBtnPrimary} mt-3`} disabled={busy || !form.name.trim()} onClick={() => void save()}>
          {busy ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
          Save customer
        </button>
      </div>

      <input className={erpInputCls} placeholder="Search name, mobile, GSTIN…" value={q} onChange={(e) => setQ(e.target.value)} />

      <ul className="space-y-2">
        {customers.length === 0 ? (
          <li className="rounded-2xl border border-dashed border-[var(--color-slate-700,#e8e4df)] bg-white/70 px-4 py-10 text-center text-sm text-[var(--color-jewelry-black,#1a1814)]/55">
            No customers yet.
          </li>
        ) : (
          customers.map((c) => (
            <li key={c.id} className={`${erpCardCls} flex items-start justify-between gap-3 py-3.5`}>
              <div className="min-w-0">
                <p className="font-semibold text-[var(--color-jewelry-black,#1a1814)]">{c.name}</p>
                <p className="mt-0.5 text-xs text-[var(--color-jewelry-black,#1a1814)]/55">
                  {[c.mobile, c.gstin, c.email].filter(Boolean).join(' · ') || '—'}
                </p>
                {(c.birthdate || c.anniversary_date) && (
                  <p className="mt-1 text-[11px] text-[var(--kc-accent,#c41e3a)]">
                    {[c.birthdate ? `Birthday ${formatErpDateDdMmYyyy(c.birthdate)}` : null, c.anniversary_date ? `Anniversary ${formatErpDateDdMmYyyy(c.anniversary_date)}` : null].filter(Boolean).join(' · ')}
                  </p>
                )}
              </div>
              <button type="button" className="rounded-lg p-2 text-[var(--color-jewelry-black,#1a1814)]/40 hover:bg-rose-50 hover:text-rose-600" onClick={() => void remove(c.id)} aria-label="Delete">
                <Trash2 className="size-4" />
              </button>
            </li>
          ))
        )}
      </ul>
    </div>
  )
}

const BILL_STATUSES = ['draft', 'completed', 'paid', 'cancelled'] as const
const ORDER_STATUSES = ['pending', 'processing', 'ready', 'delivered', 'cancelled'] as const

export function BillsWorkspace({
  billTypeFilter,
  showPhotos = false,
}: {
  billTypeFilter?: string
  showPhotos?: boolean
}) {
  const [bills, setBills] = useState<ErpBill[]>([])
  const [busy, setBusy] = useState(false)
  const [customerName, setCustomerName] = useState('')
  const [notes, setNotes] = useState('')
  const [lines, setLines] = useState<ErpBillLine[]>([])
  const billType = billTypeFilter || 'sale'
  const isOrder = billType === 'order'
  const statuses = isOrder ? ORDER_STATUSES : BILL_STATUSES

  const load = useCallback(async () => {
    const res = await axios.get<{ bills: ErpBill[] }>('/api/reseller/erp/bills')
    let list = res.data.bills || []
    if (billTypeFilter) list = list.filter((b) => b.bill_type === billTypeFilter)
    setBills(list)
  }, [billTypeFilter])

  useEffect(() => {
    void load().catch(() => setBills([]))
  }, [load])

  const addLineFromProduct = (p: ErpProductHit, code: string) => {
    const wt = p.net_weight ?? p.gross_weight ?? null
    setLines((prev) => [
      ...prev,
      {
        name: p.name || code,
        code: p.barcode || p.sku || code,
        qty: 1,
        unitInr: p.fixed_price && p.fixed_price > 0 ? p.fixed_price : null,
        lineTotalInr: p.fixed_price && p.fixed_price > 0 ? p.fixed_price : null,
        weightGm: wt,
        imageUrl: p.image_url ?? null,
      },
    ])
  }

  const total = lines.reduce((s, l) => s + (Number(l.lineTotalInr) || 0), 0)

  const save = async () => {
    if (busy || lines.length === 0) return
    setBusy(true)
    try {
      await axios.post('/api/reseller/erp/bills', {
        bill_type: billType,
        customer_name: customerName,
        total_inr: total,
        notes,
        status: isOrder ? 'pending' : 'draft',
        lines,
      })
      setCustomerName('')
      setNotes('')
      setLines([])
      await load()
    } catch (e) {
      alert(erpErr(e))
    } finally {
      setBusy(false)
    }
  }

  const setStatus = async (id: number, status: string) => {
    await axios.patch(`/api/reseller/erp/bills/${id}`, { status })
    await load()
  }

  return (
    <div className="space-y-5">
      <div className={erpCardCls}>
        <p className="mb-3 text-sm font-semibold text-[var(--color-jewelry-black,#1a1814)]">New entry</p>
        <div className="space-y-3">
          <input className={erpInputCls} placeholder="Customer name" value={customerName} onChange={(e) => setCustomerName(e.target.value)} />
          <BarcodeLookupField onHit={addLineFromProduct} />
          {lines.length > 0 ? (
            <ul className="space-y-2">
              {lines.map((line, idx) => (
                <li key={`${line.code}-${idx}`} className="flex items-center gap-3 rounded-xl border border-[var(--color-slate-700,#e8e4df)] bg-[var(--color-slate-900,#faf8f4)] px-3 py-2">
                  {showPhotos ? <ProductThumb url={line.imageUrl} name={line.name} /> : null}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-[var(--color-jewelry-black,#1a1814)]">{line.name}</p>
                    <p className="text-xs text-[var(--color-jewelry-black,#1a1814)]/55">
                      {line.code}
                      {line.weightGm != null ? ` · ${line.weightGm} gm` : ''}
                    </p>
                  </div>
                  <input
                    className="w-20 rounded-lg border border-[var(--color-slate-700,#e8e4df)] px-2 py-1.5 text-sm tabular-nums"
                    inputMode="decimal"
                    placeholder="₹"
                    value={line.lineTotalInr ?? ''}
                    onChange={(e) => {
                      const v = Number(e.target.value)
                      setLines((prev) =>
                        prev.map((l, i) =>
                          i === idx ? { ...l, lineTotalInr: Number.isFinite(v) ? v : null, unitInr: Number.isFinite(v) ? v : null } : l,
                        ),
                      )
                    }}
                  />
                  <button type="button" className="p-1.5 text-rose-500" onClick={() => setLines((p) => p.filter((_, i) => i !== idx))} aria-label="Remove line">
                    <Trash2 className="size-4" />
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--color-slate-700,#e8e4df)] pt-3">
            <span className="text-sm font-semibold text-[var(--color-jewelry-black,#1a1814)]">Total {formatErpInr(total)}</span>
            <button type="button" className={erpBtnPrimary} disabled={busy || lines.length === 0} onClick={() => void save()}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
              Save
            </button>
          </div>
          <input className={erpInputCls} placeholder="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
      </div>

      <ul className="space-y-2">
        {bills.length === 0 ? (
          <li className="rounded-2xl border border-dashed border-[var(--color-slate-700,#e8e4df)] bg-white/70 px-4 py-10 text-center text-sm text-[var(--color-jewelry-black,#1a1814)]/55">
            No records yet.
          </li>
        ) : (
          bills.map((b) => (
            <li key={b.id} className={erpCardCls}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-semibold text-[var(--color-jewelry-black,#1a1814)]">{b.bill_number}</p>
                  <p className="text-xs text-[var(--color-jewelry-black,#1a1814)]/55">
                    {b.customer_name || '—'} · {b.status}
                  </p>
                </div>
                <p className="text-base font-semibold tabular-nums text-[var(--kc-accent,#c41e3a)]">{formatErpInr(b.total_inr)}</p>
              </div>
              {showPhotos && b.lines?.length ? (
                <ul className="mt-2 space-y-1.5">
                  {b.lines.map((line, i) => (
                    <li key={i} className="flex items-center gap-2 text-xs text-[var(--color-jewelry-black,#1a1814)]/70">
                      <ProductThumb url={line.imageUrl} name={line.name} />
                      <span>{line.name}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
              <div className="mt-2 flex flex-wrap gap-2">
                {statuses.map((s) => (
                  <button
                    key={s}
                    type="button"
                    className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase ${
                      b.status === s
                        ? 'border-[var(--kc-accent,#c41e3a)]/40 bg-[var(--kc-accent,#c41e3a)]/10 text-[var(--kc-accent,#c41e3a)]'
                        : 'border-[var(--color-slate-700,#e8e4df)] text-[var(--color-jewelry-black,#1a1814)]/50'
                    }`}
                    onClick={() => void setStatus(b.id, s)}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </li>
          ))
        )}
      </ul>
    </div>
  )
}

export function StockWorkspace({ rolOnly }: { rolOnly?: boolean }) {
  const [items, setItems] = useState<ErpStockItem[]>([])
  const [busy, setBusy] = useState(false)
  const [form, setForm] = useState({
    product_name: '',
    product_barcode: '',
    product_sku: '',
    current_qty: '',
    reorder_level: '',
  })

  const load = useCallback(async () => {
    const res = await axios.get<{ items: ErpStockItem[] }>('/api/reseller/erp/stock')
    let list = res.data.items || []
    if (rolOnly) list = list.filter((i) => i.below_rol || i.current_qty <= i.reorder_level)
    setItems(list)
  }, [rolOnly])

  useEffect(() => {
    void load().catch(() => setItems([]))
  }, [load])

  const save = async () => {
    if (busy) return
    setBusy(true)
    try {
      await axios.post('/api/reseller/erp/stock', {
        ...form,
        current_qty: Number(form.current_qty) || 0,
        reorder_level: Number(form.reorder_level) || 0,
      })
      setForm({ product_name: '', product_barcode: '', product_sku: '', current_qty: '', reorder_level: '' })
      await load()
    } catch (e) {
      alert(erpErr(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-5">
      {!rolOnly ? (
        <div className={erpCardCls}>
          <p className="mb-3 text-sm font-semibold text-[var(--color-jewelry-black,#1a1814)]">Add / update stock</p>
          <BarcodeLookupField
            placeholder="Scan barcode to fill product"
            onHit={(p, code) => {
              setForm((f) => ({
                ...f,
                product_barcode: p.barcode || code,
                product_sku: p.sku || '',
                product_name: p.name || '',
              }))
            }}
          />
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <input className={erpInputCls} placeholder="Product name" value={form.product_name} onChange={(e) => setForm({ ...form, product_name: e.target.value })} />
            <input className={erpInputCls} placeholder="Barcode" value={form.product_barcode} onChange={(e) => setForm({ ...form, product_barcode: e.target.value })} />
            <input className={erpInputCls} placeholder="Current qty" inputMode="decimal" value={form.current_qty} onChange={(e) => setForm({ ...form, current_qty: e.target.value })} />
            <input className={erpInputCls} placeholder="Reorder level" inputMode="decimal" value={form.reorder_level} onChange={(e) => setForm({ ...form, reorder_level: e.target.value })} />
          </div>
          <button type="button" className={`${erpBtnPrimary} mt-3`} disabled={busy} onClick={() => void save()}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
            Save stock
          </button>
        </div>
      ) : null}

      <ul className="space-y-2">
        {items.length === 0 ? (
          <li className="rounded-2xl border border-dashed border-[var(--color-slate-700,#e8e4df)] bg-white/70 px-4 py-10 text-center text-sm text-[var(--color-jewelry-black,#1a1814)]/55">
            {rolOnly ? 'Nothing below reorder level.' : 'No stock lines yet.'}
          </li>
        ) : (
          items.map((i) => (
            <li
              key={i.id}
              className={`${erpCardCls} ${i.below_rol || i.current_qty <= i.reorder_level ? 'border-[var(--kc-accent,#c41e3a)]/35' : ''}`}
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-semibold text-[var(--color-jewelry-black,#1a1814)]">{i.product_name || i.product_barcode || 'Item'}</p>
                  <p className="text-xs text-[var(--color-jewelry-black,#1a1814)]/55">{[i.product_barcode, i.product_sku].filter(Boolean).join(' · ') || '—'}</p>
                </div>
                <div className="text-right text-sm">
                  <p className="font-semibold tabular-nums">Qty {i.current_qty}</p>
                  <p className="text-xs text-[var(--color-jewelry-black,#1a1814)]/55">ROL {i.reorder_level}</p>
                </div>
              </div>
            </li>
          ))
        )}
      </ul>
    </div>
  )
}

export function DigiRatesWorkspace({ metal }: { metal: 'gold' | 'silver' }) {
  const [rates, setRates] = useState<Record<string, number | null> | null>(null)
  const [updatedAt, setUpdatedAt] = useState<string | null>(null)

  useEffect(() => {
    void axios
      .get<{ rates: Record<string, unknown> | null }>('/api/reseller/erp/rates/digi')
      .then((res) => {
        const r = res.data.rates
        if (!r) {
          setRates(null)
          return
        }
        setRates({
          digi_silver_per_gram: r.digi_silver_per_gram != null ? Number(r.digi_silver_per_gram) : null,
          digi_gold_24k_per_gram: r.digi_gold_24k_per_gram != null ? Number(r.digi_gold_24k_per_gram) : null,
          digi_gold_22k_per_gram: r.digi_gold_22k_per_gram != null ? Number(r.digi_gold_22k_per_gram) : null,
          digi_gold_18k_per_gram: r.digi_gold_18k_per_gram != null ? Number(r.digi_gold_18k_per_gram) : null,
        })
        setUpdatedAt(r.updated_at != null ? String(r.updated_at) : null)
      })
      .catch(() => setRates(null))
  }, [])

  const rows =
    metal === 'silver'
      ? [{ label: 'DigiSilver ₹/g', value: rates?.digi_silver_per_gram }]
      : [
          { label: 'DigiGold 24K ₹/g', value: rates?.digi_gold_24k_per_gram },
          { label: 'DigiGold 22K ₹/g', value: rates?.digi_gold_22k_per_gram },
          { label: 'DigiGold 18K ₹/g', value: rates?.digi_gold_18k_per_gram },
        ]

  return (
    <div className="space-y-4">
      <div className={erpCardCls}>
        <ul className="space-y-3">
          {rows.map((row) => (
            <li key={row.label} className="flex items-center justify-between text-sm">
              <span className="text-[var(--color-jewelry-black,#1a1814)]/70">{row.label}</span>
              <span className="font-semibold tabular-nums text-[var(--color-jewelry-black,#1a1814)]">
                {row.value != null && Number.isFinite(row.value) ? formatErpInr(row.value) : '—'}
              </span>
            </li>
          ))}
        </ul>
        {updatedAt ? (
          <p className="mt-3 text-xs text-[var(--color-jewelry-black,#1a1814)]/45">
            Updated {new Date(updatedAt).toLocaleString('en-IN')}
          </p>
        ) : null}
      </div>
      <Link href={RESELLER_RATES_PATH} className={erpBtnPrimary}>
        Update rates
      </Link>
    </div>
  )
}

export function ReportsWorkspace({ percentagesOnly = false }: { percentagesOnly?: boolean }) {
  const [data, setData] = useState<{
    summary: {
      billCount: number
      completedInr: number
      creditInr: number
      estimateInr: number
      orderInr: number
      totalInr: number
      completionPct: number
    }
    byType: { bill_type: string; n: number; total: number }[]
  } | null>(null)

  useEffect(() => {
    void axios.get('/api/reseller/erp/reports/sales').then((res) => setData(res.data)).catch(() => setData(null))
  }, [])

  if (!data) return <p className="text-sm text-[var(--color-jewelry-black,#1a1814)]/55">Loading…</p>

  const s = data.summary
  const cards = percentagesOnly
    ? [{ label: 'Completion %', value: `${s.completionPct}%` }]
    : [
        { label: 'Bills (30d)', value: String(s.billCount) },
        { label: 'Total value', value: formatErpInr(s.totalInr) },
        { label: 'Completed', value: formatErpInr(s.completedInr) },
        { label: 'Credit', value: formatErpInr(s.creditInr) },
        { label: 'Estimates', value: formatErpInr(s.estimateInr) },
        { label: 'Orders', value: formatErpInr(s.orderInr) },
      ]

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {cards.map((c) => (
          <div key={c.label} className={erpCardCls}>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-jewelry-black,#1a1814)]/45">{c.label}</p>
            <p className="mt-1 text-lg font-semibold tabular-nums text-[var(--color-jewelry-black,#1a1814)]">{c.value}</p>
          </div>
        ))}
      </div>
      <ul className="space-y-2">
        {data.byType.map((row) => (
          <li key={row.bill_type} className={`${erpCardCls} flex items-center justify-between text-sm`}>
            <span className="font-medium capitalize text-[var(--color-jewelry-black,#1a1814)]">{row.bill_type}</span>
            <span className="tabular-nums text-[var(--color-jewelry-black,#1a1814)]/70">
              {row.n} · {formatErpInr(row.total)}
              {s.totalInr > 0 ? ` · ${Math.round((row.total / s.totalInr) * 1000) / 10}%` : ''}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

export function SettingsWorkspace({
  settingsKey,
  fields,
}: {
  settingsKey: string
  fields: { key: string; label: string; placeholder?: string; type?: string; multiline?: boolean }[]
}) {
  const [values, setValues] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    void axios
      .get<{ settings: Record<string, unknown> }>('/api/reseller/erp/settings')
      .then((res) => {
        const block = (res.data.settings?.[settingsKey] as Record<string, string>) || {}
        const next: Record<string, string> = {}
        for (const f of fields) next[f.key] = block[f.key] != null ? String(block[f.key]) : ''
        setValues(next)
      })
      .catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settingsKey])

  const save = async () => {
    setBusy(true)
    setSaved(false)
    try {
      await axios.put('/api/reseller/erp/settings', { settings: { [settingsKey]: values } })
      setSaved(true)
    } catch {
      alert('Could not save settings')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={erpCardCls}>
      <div className="grid gap-3">
        {fields.map((f) => (
          <label key={f.key} className="block text-xs font-medium text-[var(--color-jewelry-black,#1a1814)]/60">
            {f.label}
            {f.multiline ? (
              <textarea
                className={`${erpInputCls} mt-1 min-h-[88px] py-2.5`}
                placeholder={f.placeholder}
                value={values[f.key] || ''}
                onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
              />
            ) : (
              <input
                type={f.type || 'text'}
                className={`${erpInputCls} mt-1`}
                placeholder={f.placeholder}
                value={values[f.key] || ''}
                onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
              />
            )}
          </label>
        ))}
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button type="button" className={erpBtnPrimary} disabled={busy} onClick={() => void save()}>
          {busy ? <Loader2 className="size-4 animate-spin" /> : null}
          Save
        </button>
        {saved ? <span className="text-xs font-medium text-emerald-600">Saved</span> : null}
      </div>
    </div>
  )
}

export function IntegrationsWorkspace() {
  const [settings, setSettings] = useState<Record<string, unknown>>({})

  useEffect(() => {
    void axios.get<{ settings: Record<string, unknown> }>('/api/reseller/erp/settings').then((res) => setSettings(res.data.settings || {}))
  }, [])

  const blocks = [
    { key: 'gst', label: 'GST' },
    { key: 'einvoice', label: 'E-invoice' },
    { key: 'eway', label: 'E-way bill' },
    { key: 'tally', label: 'Tally' },
    { key: 'scanner', label: 'Scanner' },
  ]

  return (
    <ul className="space-y-2">
      {blocks.map((b) => {
        const block = (settings[b.key] as Record<string, string>) || {}
        const configured = Object.values(block).some((v) => v != null && String(v).trim())
        return (
          <li key={b.key} className={`${erpCardCls} flex items-center justify-between`}>
            <span className="font-medium text-[var(--color-jewelry-black,#1a1814)]">{b.label}</span>
            <span className={`text-xs font-semibold ${configured ? 'text-emerald-600' : 'text-[var(--color-jewelry-black,#1a1814)]/45'}`}>
              {configured ? 'Configured' : 'Not set'}
            </span>
          </li>
        )
      })}
    </ul>
  )
}

export function ScannerWorkspace() {
  const [lastHit, setLastHit] = useState<ErpProductHit | null>(null)
  const [code, setCode] = useState('')

  return (
    <div className="space-y-4">
      <div className={erpCardCls}>
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-[var(--color-jewelry-black,#1a1814)]">
          <ScanLine className="size-4 text-[var(--kc-accent,#c41e3a)]" />
          Barcode / QR lookup
        </div>
        <BarcodeLookupField
          onHit={(p) => {
            setLastHit(p)
            setCode(p.barcode || p.sku || '')
          }}
        />
        <p className="mt-2 text-xs text-[var(--color-jewelry-black,#1a1814)]/45">
          USB scanners usually type the code and send Enter — focus the field above and scan.
        </p>
      </div>
      {lastHit ? (
        <div className={`${erpCardCls} flex gap-3`}>
          <ProductThumb url={lastHit.image_url} name={lastHit.name} />
          <div>
            <p className="font-semibold text-[var(--color-jewelry-black,#1a1814)]">{lastHit.name}</p>
            <p className="text-xs text-[var(--color-jewelry-black,#1a1814)]/55">{code}</p>
            {lastHit.net_weight != null ? (
              <p className="mt-1 text-sm tabular-nums text-[var(--kc-accent,#c41e3a)]">{lastHit.net_weight} gm</p>
            ) : null}
          </div>
        </div>
      ) : null}
      <SettingsWorkspace
        settingsKey="scanner"
        fields={[
          { key: 'mode', label: 'Preferred scanner', placeholder: 'USB wedge / camera' },
          { key: 'suffix', label: 'Scan suffix', placeholder: 'Enter' },
        ]}
      />
    </div>
  )
}

export function SlabsLinkPanel() {
  return (
    <div className={erpCardCls}>
      <Link href={RESELLER_MC_SLABS_PATH} className={erpBtnPrimary}>
        Open MC slabs
      </Link>
    </div>
  )
}

export function ErpFallbackPanel() {
  return (
    <div className="rounded-2xl border border-dashed border-[var(--color-slate-700,#e8e4df)] bg-white px-4 py-10 text-center text-sm text-[var(--color-jewelry-black,#1a1814)]/55">
      <Link href={RESELLER_ERP_PATH} className={erpBtnGhost}>
        Back to ERP home
      </Link>
    </div>
  )
}

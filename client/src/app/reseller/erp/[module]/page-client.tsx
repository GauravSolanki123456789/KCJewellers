'use client'

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import axios from '@/lib/axios'
import { Loader2, Plus, Trash2 } from 'lucide-react'
import { RESELLER_ERP_PATH } from '@/lib/routes'
import {
  formatErpInr,
  getResellerErpModule,
  type ResellerErpModuleId,
} from '@/lib/reseller-erp-modules'
import { ResellerErpAccessGate, ResellerErpShell } from '@/components/reseller/erp/ResellerErpShell'

type Customer = {
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

type Bill = {
  id: number
  bill_number: string
  bill_type: string
  customer_name?: string | null
  total_inr: number
  status: string
  bill_date?: string | null
}

type StockItem = {
  id: number
  product_barcode?: string | null
  product_sku?: string | null
  product_name?: string | null
  reorder_level: number
  current_qty: number
  below_rol?: boolean
}

const inputCls =
  'min-h-[44px] w-full rounded-xl border border-[var(--color-slate-700,#e8e4df)] bg-white px-3 text-sm text-[var(--color-jewelry-black,#1a1814)] outline-none focus:border-[var(--kc-accent,#c41e3a)]/50'
const btnPrimary =
  'inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-[var(--kc-accent,#c41e3a)] px-4 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-60'
const btnGhost =
  'inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-[var(--color-slate-700,#e8e4df)] bg-white px-4 text-sm font-semibold text-[var(--color-jewelry-black,#1a1814)]'

function CustomersWorkspace() {
  const [customers, setCustomers] = useState<Customer[]>([])
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState(false)
  const [form, setForm] = useState({
    name: '',
    mobile: '',
    email: '',
    gstin: '',
    birthdate: '',
    anniversary_date: '',
    notes: '',
  })

  const load = useCallback(async () => {
    const res = await axios.get<{ customers: Customer[] }>('/api/reseller/erp/customers', {
      params: q.trim() ? { q: q.trim() } : {},
    })
    setCustomers(res.data.customers || [])
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
        birthdate: '',
        anniversary_date: '',
        notes: '',
      })
      await load()
    } catch (e: unknown) {
      alert((e as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Could not save')
    } finally {
      setBusy(false)
    }
  }

  const remove = async (id: number) => {
    if (!confirm('Delete this customer?')) return
    await axios.delete(`/api/reseller/erp/customers/${id}`)
    await load()
  }

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-[var(--color-slate-700,#e8e4df)] bg-white p-4 shadow-sm">
        <p className="mb-3 text-sm font-semibold text-[var(--color-jewelry-black,#1a1814)]">Add customer</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <input className={inputCls} placeholder="Name *" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <input className={inputCls} placeholder="Mobile" value={form.mobile} onChange={(e) => setForm({ ...form, mobile: e.target.value })} />
          <input className={inputCls} placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          <input className={inputCls} placeholder="GSTIN" value={form.gstin} onChange={(e) => setForm({ ...form, gstin: e.target.value })} />
          <label className="text-xs text-[var(--color-jewelry-black,#1a1814)]/55">
            Birthday
            <input type="date" className={`${inputCls} mt-1`} value={form.birthdate} onChange={(e) => setForm({ ...form, birthdate: e.target.value })} />
          </label>
          <label className="text-xs text-[var(--color-jewelry-black,#1a1814)]/55">
            Anniversary
            <input type="date" className={`${inputCls} mt-1`} value={form.anniversary_date} onChange={(e) => setForm({ ...form, anniversary_date: e.target.value })} />
          </label>
          <textarea
            className={`${inputCls} min-h-[88px] py-2.5 sm:col-span-2`}
            placeholder="Notes"
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
          />
        </div>
        <button type="button" className={`${btnPrimary} mt-3`} disabled={busy || !form.name.trim()} onClick={() => void save()}>
          {busy ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
          Save customer
        </button>
      </div>

      <div className="flex gap-2">
        <input className={inputCls} placeholder="Search name, mobile, GSTIN…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      <ul className="space-y-2">
        {customers.length === 0 ? (
          <li className="rounded-2xl border border-dashed border-[var(--color-slate-700,#e8e4df)] bg-white/70 px-4 py-10 text-center text-sm text-[var(--color-jewelry-black,#1a1814)]/55">
            No customers yet — add your first walk-in or wholesale client.
          </li>
        ) : (
          customers.map((c) => (
            <li
              key={c.id}
              className="flex items-start justify-between gap-3 rounded-2xl border border-[var(--color-slate-700,#e8e4df)] bg-white px-4 py-3.5 shadow-sm"
            >
              <div className="min-w-0">
                <p className="font-semibold text-[var(--color-jewelry-black,#1a1814)]">{c.name}</p>
                <p className="mt-0.5 text-xs text-[var(--color-jewelry-black,#1a1814)]/55">
                  {[c.mobile, c.gstin].filter(Boolean).join(' · ') || 'No mobile / GSTIN'}
                </p>
                {(c.birthdate || c.anniversary_date) && (
                  <p className="mt-1 text-[11px] text-[var(--kc-accent,#c41e3a)]">
                    {[
                      c.birthdate ? `Birthday ${String(c.birthdate).slice(0, 10)}` : null,
                      c.anniversary_date
                        ? `Anniversary ${String(c.anniversary_date).slice(0, 10)}`
                        : null,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
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

function BillsWorkspace({ billTypeFilter }: { billTypeFilter?: string }) {
  const [bills, setBills] = useState<Bill[]>([])
  const [busy, setBusy] = useState(false)
  const [form, setForm] = useState({
    customer_name: '',
    total_inr: '',
    notes: '',
    bill_type: billTypeFilter || 'sale',
  })

  const load = useCallback(async () => {
    const res = await axios.get<{ bills: Bill[] }>('/api/reseller/erp/bills')
    let list = res.data.bills || []
    if (billTypeFilter) list = list.filter((b) => b.bill_type === billTypeFilter)
    setBills(list)
  }, [billTypeFilter])

  useEffect(() => {
    void load().catch(() => setBills([]))
  }, [load])

  const save = async () => {
    if (busy) return
    setBusy(true)
    try {
      await axios.post('/api/reseller/erp/bills', {
        bill_type: form.bill_type,
        customer_name: form.customer_name,
        total_inr: Number(form.total_inr) || 0,
        notes: form.notes,
        status: 'draft',
        lines: form.customer_name
          ? [{ name: form.customer_name, qty: 1, lineTotalInr: Number(form.total_inr) || 0 }]
          : [],
      })
      setForm({ customer_name: '', total_inr: '', notes: '', bill_type: billTypeFilter || 'sale' })
      await load()
    } catch (e: unknown) {
      alert((e as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Could not save bill')
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
      <div className="rounded-2xl border border-[var(--color-slate-700,#e8e4df)] bg-white p-4 shadow-sm">
        <p className="mb-3 text-sm font-semibold text-[var(--color-jewelry-black,#1a1814)]">
          New {billTypeFilter || 'bill'}
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          {!billTypeFilter ? (
            <select className={inputCls} value={form.bill_type} onChange={(e) => setForm({ ...form, bill_type: e.target.value })}>
              <option value="sale">Sale bill</option>
              <option value="credit">Credit bill</option>
              <option value="estimate">Estimation</option>
              <option value="order">Order</option>
            </select>
          ) : null}
          <input className={inputCls} placeholder="Customer name" value={form.customer_name} onChange={(e) => setForm({ ...form, customer_name: e.target.value })} />
          <input className={inputCls} placeholder="Total ₹" inputMode="decimal" value={form.total_inr} onChange={(e) => setForm({ ...form, total_inr: e.target.value })} />
          <input className={`${inputCls} sm:col-span-2`} placeholder="Notes / SKU summary" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
        </div>
        <button type="button" className={`${btnPrimary} mt-3`} disabled={busy} onClick={() => void save()}>
          {busy ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
          Create
        </button>
      </div>

      <ul className="space-y-2">
        {bills.length === 0 ? (
          <li className="rounded-2xl border border-dashed border-[var(--color-slate-700,#e8e4df)] bg-white/70 px-4 py-10 text-center text-sm text-[var(--color-jewelry-black,#1a1814)]/55">
            No records yet.
          </li>
        ) : (
          bills.map((b) => (
            <li key={b.id} className="rounded-2xl border border-[var(--color-slate-700,#e8e4df)] bg-white px-4 py-3.5 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-semibold text-[var(--color-jewelry-black,#1a1814)]">{b.bill_number}</p>
                  <p className="text-xs text-[var(--color-jewelry-black,#1a1814)]/55">
                    {b.customer_name || '—'} · {b.bill_type} · {b.status}
                  </p>
                </div>
                <p className="text-base font-semibold tabular-nums text-[var(--kc-accent,#c41e3a)]">
                  {formatErpInr(b.total_inr)}
                </p>
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {['draft', 'completed', 'paid', 'cancelled'].map((s) => (
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

function StockWorkspace({ rolOnly }: { rolOnly?: boolean }) {
  const [items, setItems] = useState<StockItem[]>([])
  const [busy, setBusy] = useState(false)
  const [form, setForm] = useState({
    product_name: '',
    product_barcode: '',
    product_sku: '',
    current_qty: '',
    reorder_level: '',
  })

  const load = useCallback(async () => {
    const res = await axios.get<{ items: StockItem[] }>('/api/reseller/erp/stock')
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
    } catch (e: unknown) {
      alert((e as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Could not save')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-5">
      {!rolOnly ? (
        <div className="rounded-2xl border border-[var(--color-slate-700,#e8e4df)] bg-white p-4 shadow-sm">
          <p className="mb-3 text-sm font-semibold text-[var(--color-jewelry-black,#1a1814)]">Add / update stock line</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <input className={inputCls} placeholder="Product name" value={form.product_name} onChange={(e) => setForm({ ...form, product_name: e.target.value })} />
            <input className={inputCls} placeholder="Barcode / QR" value={form.product_barcode} onChange={(e) => setForm({ ...form, product_barcode: e.target.value })} />
            <input className={inputCls} placeholder="SKU" value={form.product_sku} onChange={(e) => setForm({ ...form, product_sku: e.target.value })} />
            <input className={inputCls} placeholder="Current qty" inputMode="decimal" value={form.current_qty} onChange={(e) => setForm({ ...form, current_qty: e.target.value })} />
            <input className={inputCls} placeholder="Reorder level (ROL)" inputMode="decimal" value={form.reorder_level} onChange={(e) => setForm({ ...form, reorder_level: e.target.value })} />
          </div>
          <button type="button" className={`${btnPrimary} mt-3`} disabled={busy} onClick={() => void save()}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
            Save stock
          </button>
        </div>
      ) : null}

      <ul className="space-y-2">
        {items.length === 0 ? (
          <li className="rounded-2xl border border-dashed border-[var(--color-slate-700,#e8e4df)] bg-white/70 px-4 py-10 text-center text-sm text-[var(--color-jewelry-black,#1a1814)]/55">
            {rolOnly ? 'Nothing below reorder level — nice work.' : 'No stock lines yet.'}
          </li>
        ) : (
          items.map((i) => (
            <li
              key={i.id}
              className={`rounded-2xl border bg-white px-4 py-3.5 shadow-sm ${
                i.below_rol || i.current_qty <= i.reorder_level
                  ? 'border-[var(--kc-accent,#c41e3a)]/35'
                  : 'border-[var(--color-slate-700,#e8e4df)]'
              }`}
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-semibold text-[var(--color-jewelry-black,#1a1814)]">{i.product_name || i.product_barcode || 'Item'}</p>
                  <p className="text-xs text-[var(--color-jewelry-black,#1a1814)]/55">
                    {[i.product_barcode, i.product_sku].filter(Boolean).join(' · ') || 'No barcode'}
                  </p>
                </div>
                <div className="text-right text-sm">
                  <p className="tabular-nums font-semibold text-[var(--color-jewelry-black,#1a1814)]">Qty {i.current_qty}</p>
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

function ReportsWorkspace() {
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
    void axios
      .get('/api/reseller/erp/reports/sales')
      .then((res) => setData(res.data))
      .catch(() => setData(null))
  }, [])

  if (!data) {
    return <p className="text-sm text-[var(--color-jewelry-black,#1a1814)]/55">Loading sales report…</p>
  }

  const s = data.summary
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {[
          { label: 'Bills (30d)', value: String(s.billCount) },
          { label: 'Total value', value: formatErpInr(s.totalInr) },
          { label: 'Completed', value: formatErpInr(s.completedInr) },
          { label: 'Credit', value: formatErpInr(s.creditInr) },
          { label: 'Estimates', value: formatErpInr(s.estimateInr) },
          { label: 'Completion %', value: `${s.completionPct}%` },
        ].map((c) => (
          <div key={c.label} className="rounded-2xl border border-[var(--color-slate-700,#e8e4df)] bg-white px-3 py-3.5 shadow-sm">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-jewelry-black,#1a1814)]/45">{c.label}</p>
            <p className="mt-1 text-lg font-semibold tabular-nums text-[var(--color-jewelry-black,#1a1814)]">{c.value}</p>
          </div>
        ))}
      </div>
      <ul className="space-y-2">
        {data.byType.map((row) => (
          <li key={row.bill_type} className="flex items-center justify-between rounded-xl border border-[var(--color-slate-700,#e8e4df)] bg-white px-4 py-3 text-sm">
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

function SettingsWorkspace({ settingsKey, fields }: { settingsKey: string; fields: { key: string; label: string; placeholder?: string }[] }) {
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
    // fields are static per module mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settingsKey])

  const save = async () => {
    setBusy(true)
    setSaved(false)
    try {
      await axios.put('/api/reseller/erp/settings', {
        settings: { [settingsKey]: values },
      })
      setSaved(true)
    } catch {
      alert('Could not save settings')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="rounded-2xl border border-[var(--color-slate-700,#e8e4df)] bg-white p-4 shadow-sm">
      <div className="grid gap-3">
        {fields.map((f) => (
          <label key={f.key} className="block text-xs font-medium text-[var(--color-jewelry-black,#1a1814)]/60">
            {f.label}
            <input
              className={`${inputCls} mt-1`}
              placeholder={f.placeholder}
              value={values[f.key] || ''}
              onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
            />
          </label>
        ))}
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button type="button" className={btnPrimary} disabled={busy} onClick={() => void save()}>
          {busy ? <Loader2 className="size-4 animate-spin" /> : null}
          Save settings
        </button>
        {saved ? <span className="text-xs font-medium text-emerald-600">Saved</span> : null}
      </div>
    </div>
  )
}

function ModuleBody({ moduleId }: { moduleId: ResellerErpModuleId }) {
  switch (moduleId) {
    case 'customers':
      return <CustomersWorkspace />
    case 'billing':
      return <BillsWorkspace billTypeFilter="sale" />
    case 'credit-bills':
      return <BillsWorkspace billTypeFilter="credit" />
    case 'orders':
      return <BillsWorkspace billTypeFilter="order" />
    case 'estimations':
      return <BillsWorkspace billTypeFilter="estimate" />
    case 'stock':
      return <StockWorkspace />
    case 'rol':
      return <StockWorkspace rolOnly />
    case 'sales-reports':
    case 'sales-percentages':
      return <ReportsWorkspace />
    case 'gst':
      return (
        <SettingsWorkspace
          settingsKey="gst"
          fields={[
            { key: 'gstin', label: 'Business GSTIN', placeholder: '22AAAAA0000A1Z5' },
            { key: 'legalName', label: 'Legal name', placeholder: 'As on GST certificate' },
            { key: 'placeOfSupply', label: 'Default place of supply', placeholder: 'State code / name' },
          ]}
        />
      )
    case 'e-invoice':
      return (
        <SettingsWorkspace
          settingsKey="einvoice"
          fields={[
            { key: 'apiUrl', label: 'E-invoice API URL', placeholder: 'https://…' },
            { key: 'apiKey', label: 'API key / username', placeholder: '••••' },
            { key: 'apiSecret', label: 'API secret / password', placeholder: '••••' },
          ]}
        />
      )
    case 'e-way':
      return (
        <SettingsWorkspace
          settingsKey="eway"
          fields={[
            { key: 'apiUrl', label: 'E-way bill API URL', placeholder: 'https://…' },
            { key: 'apiKey', label: 'API key', placeholder: '••••' },
            { key: 'gstin', label: 'Transporter / GSTIN', placeholder: '' },
          ]}
        />
      )
    case 'tally':
      return (
        <SettingsWorkspace
          settingsKey="tally"
          fields={[
            { key: 'company', label: 'Tally company name', placeholder: 'Your company' },
            { key: 'serverUrl', label: 'Tally / ODBC / API endpoint', placeholder: 'http://localhost:9000' },
            { key: 'notes', label: 'Sync notes', placeholder: 'Ledger mapping, voucher types…' },
          ]}
        />
      )
    case 'rate-uncut':
      return (
        <SettingsWorkspace
          settingsKey="rateUncut"
          fields={[
            { key: 'silverUncut', label: 'Silver uncut ₹/g offset or rate', placeholder: '0' },
            { key: 'goldUncut', label: 'Gold uncut ₹/g offset or rate', placeholder: '0' },
            { key: 'notes', label: 'How staff should apply uncut rates', placeholder: '' },
          ]}
        />
      )
    case 'barcoding':
      return (
        <SettingsWorkspace
          settingsKey="barcoding"
          fields={[
            { key: 'labelFormat', label: 'Label format', placeholder: '40×25 mm / Code128' },
            { key: 'prefix', label: 'Barcode prefix', placeholder: 'BNM-' },
            { key: 'notes', label: 'Printing / scanner notes', placeholder: '' },
          ]}
        />
      )
    case 'tag-splitting':
      return (
        <SettingsWorkspace
          settingsKey="tagSplit"
          fields={[
            { key: 'rules', label: 'Split / merge rules', placeholder: 'e.g. split by weight, keep parent barcode…' },
            { key: 'notes', label: 'Staff SOP notes', placeholder: '' },
          ]}
        />
      )
    case 'scanner':
      return (
        <SettingsWorkspace
          settingsKey="scanner"
          fields={[
            { key: 'mode', label: 'Preferred scanner', placeholder: 'USB wedge / camera QR' },
            { key: 'suffix', label: 'Scan suffix (Enter / Tab)', placeholder: 'Enter' },
            { key: 'notes', label: 'Counter notes', placeholder: '' },
          ]}
        />
      )
    case 'integrations':
      return (
        <SettingsWorkspace
          settingsKey="integrations"
          fields={[
            { key: 'overview', label: 'Connected systems overview', placeholder: 'E-invoice live · E-way pending · Tally path…' },
            { key: 'sms', label: 'SMS provider notes', placeholder: '' },
          ]}
        />
      )
    default:
      return (
        <div className="rounded-2xl border border-dashed border-[var(--color-slate-700,#e8e4df)] bg-white px-4 py-10 text-center text-sm text-[var(--color-jewelry-black,#1a1814)]/55">
          This module opens from the ERP hub. Use DigiGold / DigiSilver / Slabs links for live rates tools.
          <div className="mt-4">
            <Link href={RESELLER_ERP_PATH} className={btnGhost}>
              Back to ERP home
            </Link>
          </div>
        </div>
      )
  }
}

function ModulePageContent() {
  const params = useParams()
  const raw = typeof params?.module === 'string' ? params.module : Array.isArray(params?.module) ? params.module[0] : ''
  const mod = useMemo(() => getResellerErpModule(raw), [raw])

  if (!mod) {
    return (
      <ResellerErpShell title="Module not found" subtitle="Pick a module from the ERP home.">
        <Link href={RESELLER_ERP_PATH} className={btnPrimary}>
          ERP home
        </Link>
      </ResellerErpShell>
    )
  }

  return (
    <ResellerErpShell title={mod.title} subtitle={mod.description}>
      <ModuleBody moduleId={mod.id} />
    </ResellerErpShell>
  )
}

export default function ResellerErpModulePageClient() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[50vh] items-center justify-center text-[var(--color-jewelry-black,#1a1814)]/60">
          Loading module…
        </div>
      }
    >
      <ResellerErpAccessGate>
        <ModulePageContent />
      </ResellerErpAccessGate>
    </Suspense>
  )
}

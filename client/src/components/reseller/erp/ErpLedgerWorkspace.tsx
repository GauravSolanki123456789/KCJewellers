'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import axios from '@/lib/axios'
import {
  BookMarked,
  Download,
  Loader2,
  Plus,
  Trash2,
  Upload,
  Wallet,
} from 'lucide-react'
import { ErpDateInput } from '@/components/reseller/erp/ErpDateInput'
import {
  erpBtnGhost,
  erpBtnPrimary,
  erpCardCls,
  erpInputCls,
  erpErr,
  type ErpCustomer,
  type ErpLedgerEntry,
} from '@/components/reseller/erp/erp-ui'
import { formatErpInr } from '@/lib/reseller-erp-modules'

type LedgerSummary = {
  received_inr: number
  paid_out_inr: number
  entry_count: number
  suspense_total_inr: number
  suspense_count: number
  by_customer: {
    customer_id: number | null
    customer_name: string | null
    received: number
    paid_out: number
  }[]
}

const PAYMENT_MODES = ['cash', 'upi', 'neft', 'imps', 'cheque', 'card', 'other'] as const

const ENTRY_LABELS: Record<string, string> = {
  payment_in: 'Payment received',
  payment_out: 'Payment out',
  suspense_in: 'Suspense',
  bill_advance: 'Bill advance',
  adjustment: 'Adjustment',
}

function todayIso() {
  return new Date().toISOString().slice(0, 10)
}

function firstOfMonthIso() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

export function ErpLedgerWorkspace() {
  const [tab, setTab] = useState<'entries' | 'add' | 'import' | 'suspense' | 'report'>('entries')
  const [entries, setEntries] = useState<ErpLedgerEntry[]>([])
  const [customers, setCustomers] = useState<ErpCustomer[]>([])
  const [summary, setSummary] = useState<LedgerSummary | null>(null)
  const [from, setFrom] = useState(firstOfMonthIso())
  const [to, setTo] = useState(todayIso())
  const [customerFilter, setCustomerFilter] = useState('')
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const [form, setForm] = useState({
    entry_date: todayIso(),
    entry_type: 'payment_in' as string,
    amount_inr: '',
    customer_id: '',
    payment_mode: 'upi' as string,
    reference_no: '',
    bank_name: '',
    counterparty_name: '',
    narration: '',
    is_suspense: false,
  })

  const [resolveCustomerId, setResolveCustomerId] = useState<Record<number, string>>({})

  const loadCustomers = useCallback(async () => {
    const res = await axios.get<{ customers: ErpCustomer[] }>('/api/reseller/erp/customers')
    setCustomers(res.data.customers || [])
  }, [])

  const loadEntries = useCallback(async () => {
    const params: Record<string, string> = {}
    if (from) params.from = from
    if (to) params.to = to
    if (customerFilter) params.customer_id = customerFilter
    if (q.trim()) params.q = q.trim()
    if (tab === 'suspense') params.suspense_only = '1'
    const res = await axios.get<{ entries: ErpLedgerEntry[] }>('/api/reseller/erp/ledger/entries', {
      params,
    })
    setEntries(res.data.entries || [])
  }, [from, to, customerFilter, q, tab])

  const loadSummary = useCallback(async () => {
    const params: Record<string, string> = {}
    if (from) params.from = from
    if (to) params.to = to
    const res = await axios.get<LedgerSummary>('/api/reseller/erp/ledger/summary', { params })
    setSummary(res.data)
  }, [from, to])

  const reload = useCallback(async () => {
    setBusy(true)
    try {
      await Promise.all([loadEntries(), loadSummary()])
    } finally {
      setBusy(false)
    }
  }, [loadEntries, loadSummary])

  useEffect(() => {
    void loadCustomers().catch(() => setCustomers([]))
  }, [loadCustomers])

  useEffect(() => {
    void reload().catch(() => setEntries([]))
  }, [reload])

  const netReceived = useMemo(() => {
    if (!summary) return 0
    return (summary.received_inr || 0) - (summary.paid_out_inr || 0)
  }, [summary])

  const saveEntry = async () => {
    const amount = Number(String(form.amount_inr).replace(/[,₹\s]/g, ''))
    if (!Number.isFinite(amount) || amount <= 0) {
      alert('Enter a valid amount')
      return
    }
    setBusy(true)
    setMsg(null)
    try {
      await axios.post('/api/reseller/erp/ledger/entries', {
        entry_date: form.entry_date,
        entry_type: form.is_suspense ? 'suspense_in' : form.entry_type,
        amount_inr: amount,
        customer_id: form.customer_id ? Number(form.customer_id) : null,
        payment_mode: form.payment_mode,
        reference_no: form.reference_no,
        bank_name: form.bank_name,
        counterparty_name: form.counterparty_name,
        narration: form.narration,
        is_suspense: form.is_suspense,
      })
      setForm({
        entry_date: todayIso(),
        entry_type: 'payment_in',
        amount_inr: '',
        customer_id: '',
        payment_mode: 'upi',
        reference_no: '',
        bank_name: '',
        counterparty_name: '',
        narration: '',
        is_suspense: false,
      })
      setMsg('Payment recorded.')
      setTab('entries')
      await reload()
    } catch (e) {
      alert(erpErr(e))
    } finally {
      setBusy(false)
    }
  }

  const onImportFile = async (file: File) => {
    setBusy(true)
    setMsg(null)
    try {
      const buf = await file.arrayBuffer()
      const XLSX = await import('xlsx')
      const wb = XLSX.read(buf, { type: 'array' })
      const sheet = wb.Sheets[wb.SheetNames[0]]
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' })
      if (!rows.length) throw new Error('No rows in file')
      const res = await axios.post<{ inserted: number; skipped: number; suspense: number }>(
        '/api/reseller/erp/ledger/import',
        { rows, file_name: file.name, mark_unmatched_suspense: true },
      )
      setMsg(
        `Imported ${res.data.inserted} row(s)${res.data.suspense ? ` · ${res.data.suspense} in suspense` : ''}${res.data.skipped ? ` · ${res.data.skipped} skipped` : ''}.`,
      )
      setTab('entries')
      await reload()
    } catch (e) {
      alert(erpErr(e))
    } finally {
      setBusy(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const downloadSample = async () => {
    const XLSX = await import('xlsx')
    const sample = [
      {
        Date: '05/08/2026',
        Narration: 'NEFT from Gaurav Solanki',
        Credit: 4104,
        Debit: '',
        UTR: 'UTR123456789',
        Bank: 'HDFC',
        Customer: 'Gaurav Solanki',
      },
    ]
    const ws = XLSX.utils.json_to_sheet(sample)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'BankSheet')
    XLSX.writeFile(wb, 'erp-ledger-bank-sample.xlsx')
  }

  const resolveSuspense = async (entryId: number) => {
    const cid = resolveCustomerId[entryId]
    if (!cid) {
      alert('Select a customer to assign this payment')
      return
    }
    setBusy(true)
    try {
      await axios.post(`/api/reseller/erp/ledger/entries/${entryId}/resolve`, {
        customer_id: Number(cid),
      })
      await reload()
    } catch (e) {
      alert(erpErr(e))
    } finally {
      setBusy(false)
    }
  }

  const removeEntry = async (id: number) => {
    if (!confirm('Delete this ledger entry?')) return
    await axios.delete(`/api/reseller/erp/ledger/entries/${id}`)
    await reload()
  }

  const tabs = [
    { id: 'entries' as const, label: 'All entries' },
    { id: 'add' as const, label: 'Add payment' },
    { id: 'import' as const, label: 'Bank import' },
    { id: 'suspense' as const, label: 'Suspense' },
    { id: 'report' as const, label: 'Reports' },
  ]

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className={`${erpCardCls} border-emerald-200/80 bg-emerald-50/40`}>
          <p className="text-[10px] font-bold uppercase tracking-wide text-emerald-800/70">Received</p>
          <p className="mt-1 text-xl font-bold tabular-nums text-emerald-900">
            {formatErpInr(summary?.received_inr ?? 0)}
          </p>
        </div>
        <div className={erpCardCls}>
          <p className="text-[10px] font-bold uppercase tracking-wide text-[var(--color-jewelry-black,#1a1814)]/45">
            Paid out
          </p>
          <p className="mt-1 text-xl font-bold tabular-nums text-[var(--color-jewelry-black,#1a1814)]">
            {formatErpInr(summary?.paid_out_inr ?? 0)}
          </p>
        </div>
        <div className={erpCardCls}>
          <p className="text-[10px] font-bold uppercase tracking-wide text-[var(--color-jewelry-black,#1a1814)]/45">
            Net (period)
          </p>
          <p className="mt-1 text-xl font-bold tabular-nums text-[var(--color-jewelry-black,#1a1814)]">
            {formatErpInr(netReceived)}
          </p>
        </div>
        <div className={`${erpCardCls} border-amber-200/80 bg-amber-50/50`}>
          <p className="text-[10px] font-bold uppercase tracking-wide text-amber-900/70">In suspense</p>
          <p className="mt-1 text-xl font-bold tabular-nums text-amber-900">
            {formatErpInr(summary?.suspense_total_inr ?? 0)}
          </p>
          <p className="text-[11px] text-amber-800/70">{summary?.suspense_count ?? 0} unmatched</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`min-h-[40px] rounded-xl px-3 text-xs font-semibold ${
              tab === t.id
                ? 'bg-[var(--kc-accent,#c41e3a)] text-white'
                : 'border border-[var(--color-slate-700,#e8e4df)] bg-white text-[var(--color-jewelry-black,#1a1814)]'
            }`}
          >
            {t.label}
          </button>
        ))}
        <button
          type="button"
          className={`${erpBtnGhost} ml-auto min-h-[40px] text-xs`}
          disabled={busy}
          onClick={() => void reload()}
        >
          {busy ? <Loader2 className="size-4 animate-spin" /> : null}
          Refresh
        </button>
      </div>

      {msg ? (
        <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{msg}</p>
      ) : null}

      {(tab === 'entries' || tab === 'suspense') && (
        <div className={`${erpCardCls} space-y-3`}>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <label className="text-xs text-[var(--color-jewelry-black,#1a1814)]/55">
              From
              <ErpDateInput className={`${erpInputCls} mt-1`} value={from} onChange={setFrom} />
            </label>
            <label className="text-xs text-[var(--color-jewelry-black,#1a1814)]/55">
              To
              <ErpDateInput className={`${erpInputCls} mt-1`} value={to} onChange={setTo} />
            </label>
            <label className="text-xs text-[var(--color-jewelry-black,#1a1814)]/55 sm:col-span-2">
              Customer
              <select
                className={`${erpInputCls} mt-1`}
                value={customerFilter}
                onChange={(e) => setCustomerFilter(e.target.value)}
              >
                <option value="">All customers</option>
                {customers.map((c) => (
                  <option key={c.id} value={String(c.id)}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs text-[var(--color-jewelry-black,#1a1814)]/55">
              Search
              <input
                className={`${erpInputCls} mt-1`}
                placeholder="UTR, narration…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </label>
          </div>

          <div className="overflow-x-auto rounded-xl border border-[var(--color-slate-700,#e8e4df)]">
            <table className="min-w-full text-left text-xs">
              <thead className="bg-[var(--color-slate-900,#f7f4ef)] text-[10px] font-bold uppercase tracking-wide text-[var(--color-jewelry-black,#1a1814)]/55">
                <tr>
                  <th className="px-3 py-2.5">Date</th>
                  <th className="px-3 py-2.5">Type</th>
                  <th className="px-3 py-2.5">Customer / party</th>
                  <th className="px-3 py-2.5">Mode</th>
                  <th className="px-3 py-2.5">Reference</th>
                  <th className="px-3 py-2.5 text-right">Amount</th>
                  <th className="px-3 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {entries.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-3 py-10 text-center text-[var(--color-jewelry-black,#1a1814)]/45">
                      No entries for this filter.
                    </td>
                  </tr>
                ) : (
                  entries.map((e) => (
                    <tr key={e.id} className="border-t border-[var(--color-slate-700,#e8e4df)]/60">
                      <td className="whitespace-nowrap px-3 py-2.5">{e.entry_date}</td>
                      <td className="px-3 py-2.5">
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                            e.is_suspense
                              ? 'bg-amber-100 text-amber-900'
                              : e.entry_type === 'payment_out'
                                ? 'bg-rose-50 text-rose-800'
                                : 'bg-emerald-50 text-emerald-800'
                          }`}
                        >
                          {ENTRY_LABELS[e.entry_type] || e.entry_type}
                        </span>
                      </td>
                      <td className="max-w-[160px] truncate px-3 py-2.5">
                        {e.customer_name || e.counterparty_name || '—'}
                        {e.bill_number ? (
                          <span className="block text-[10px] text-[var(--color-jewelry-black,#1a1814)]/45">
                            {e.bill_number}
                          </span>
                        ) : null}
                      </td>
                      <td className="px-3 py-2.5 uppercase">{e.payment_mode}</td>
                      <td className="max-w-[120px] truncate px-3 py-2.5">{e.reference_no || '—'}</td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-right font-semibold tabular-nums">
                        {formatErpInr(e.amount_inr)}
                      </td>
                      <td className="px-2 py-2">
                        {tab === 'suspense' && e.is_suspense ? (
                          <div className="flex min-w-[200px] flex-col gap-1 sm:flex-row">
                            <select
                              className={`${erpInputCls} min-h-[36px] py-1 text-[11px]`}
                              value={resolveCustomerId[e.id] || ''}
                              onChange={(ev) =>
                                setResolveCustomerId((m) => ({ ...m, [e.id]: ev.target.value }))
                              }
                            >
                              <option value="">Assign customer…</option>
                              {customers.map((c) => (
                                <option key={c.id} value={String(c.id)}>
                                  {c.name}
                                </option>
                              ))}
                            </select>
                            <button
                              type="button"
                              className="rounded-lg bg-emerald-600 px-2 py-1 text-[10px] font-semibold text-white"
                              onClick={() => void resolveSuspense(e.id)}
                            >
                              Assign
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            className="rounded-lg p-1.5 text-rose-500 hover:bg-rose-50"
                            onClick={() => void removeEntry(e.id)}
                            aria-label="Delete"
                          >
                            <Trash2 className="size-4" />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'add' && (
        <div className={`${erpCardCls} space-y-3`}>
          <p className="flex items-center gap-2 text-sm font-semibold text-[var(--color-jewelry-black,#1a1814)]">
            <Wallet className="size-4 text-emerald-700" />
            Record payment manually
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-xs text-[var(--color-jewelry-black,#1a1814)]/55">
              Date
              <ErpDateInput
                className={`${erpInputCls} mt-1`}
                value={form.entry_date}
                onChange={(v) => setForm({ ...form, entry_date: v })}
              />
            </label>
            <label className="text-xs text-[var(--color-jewelry-black,#1a1814)]/55">
              Amount (₹)
              <input
                className={`${erpInputCls} mt-1`}
                inputMode="decimal"
                value={form.amount_inr}
                onChange={(e) => setForm({ ...form, amount_inr: e.target.value })}
              />
            </label>
            <label className="text-xs text-[var(--color-jewelry-black,#1a1814)]/55">
              Type
              <select
                className={`${erpInputCls} mt-1`}
                value={form.entry_type}
                onChange={(e) => setForm({ ...form, entry_type: e.target.value })}
                disabled={form.is_suspense}
              >
                <option value="payment_in">Payment received</option>
                <option value="payment_out">Payment out</option>
                <option value="adjustment">Adjustment</option>
              </select>
            </label>
            <label className="text-xs text-[var(--color-jewelry-black,#1a1814)]/55">
              Mode
              <select
                className={`${erpInputCls} mt-1`}
                value={form.payment_mode}
                onChange={(e) => setForm({ ...form, payment_mode: e.target.value })}
              >
                {PAYMENT_MODES.map((m) => (
                  <option key={m} value={m}>
                    {m.toUpperCase()}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs text-[var(--color-jewelry-black,#1a1814)]/55 sm:col-span-2">
              Customer
              <select
                className={`${erpInputCls} mt-1`}
                value={form.customer_id}
                onChange={(e) => setForm({ ...form, customer_id: e.target.value, is_suspense: false })}
                disabled={form.is_suspense}
              >
                <option value="">— Select customer —</option>
                {customers.map((c) => (
                  <option key={c.id} value={String(c.id)}>
                    {c.name}
                    {c.mobile ? ` · ${c.mobile}` : ''}
                  </option>
                ))}
              </select>
            </label>
            <input
              className={erpInputCls}
              placeholder="UTR / Cheque no"
              value={form.reference_no}
              onChange={(e) => setForm({ ...form, reference_no: e.target.value })}
            />
            <input
              className={erpInputCls}
              placeholder="Bank name"
              value={form.bank_name}
              onChange={(e) => setForm({ ...form, bank_name: e.target.value })}
            />
            <input
              className={`${erpInputCls} sm:col-span-2`}
              placeholder="Party name (if walk-in / unmatched)"
              value={form.counterparty_name}
              onChange={(e) => setForm({ ...form, counterparty_name: e.target.value })}
            />
            <textarea
              className={`${erpInputCls} min-h-[80px] py-2.5 sm:col-span-2`}
              placeholder="Narration / notes"
              value={form.narration}
              onChange={(e) => setForm({ ...form, narration: e.target.value })}
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-[var(--color-jewelry-black,#1a1814)]">
            <input
              type="checkbox"
              checked={form.is_suspense}
              onChange={(e) =>
                setForm({
                  ...form,
                  is_suspense: e.target.checked,
                  customer_id: e.target.checked ? '' : form.customer_id,
                })
              }
            />
            Put in suspense (assign customer later)
          </label>
          <button type="button" className={erpBtnPrimary} disabled={busy} onClick={() => void saveEntry()}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
            Save payment
          </button>
        </div>
      )}

      {tab === 'import' && (
        <div className={`${erpCardCls} space-y-4`}>
          <p className="flex items-center gap-2 text-sm font-semibold text-[var(--color-jewelry-black,#1a1814)]">
            <BookMarked className="size-4 text-blue-700" />
            Import bank sheet (.xlsx / .csv)
          </p>
          <p className="text-xs leading-relaxed text-[var(--color-jewelry-black,#1a1814)]/60">
            Upload your morning bank statement export. Columns like Date, Narration, Credit, Debit, UTR, Bank are auto-detected.
            Unmatched rows can go to <strong>suspense</strong> for later customer assignment.
          </p>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={erpBtnGhost} onClick={() => void downloadSample()}>
              <Download className="size-4" />
              Sample sheet
            </button>
            <button
              type="button"
              className={`${erpBtnPrimary} bg-blue-600 hover:opacity-90`}
              disabled={busy}
              onClick={() => fileRef.current?.click()}
            >
              {busy ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
              Upload bank file
            </button>
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) void onImportFile(f)
              }}
            />
          </div>
        </div>
      )}

      {tab === 'report' && (
        <div className={`${erpCardCls} space-y-3`}>
          <p className="text-sm font-semibold text-[var(--color-jewelry-black,#1a1814)]">Customer-wise receipts</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-xs text-[var(--color-jewelry-black,#1a1814)]/55">
              From
              <ErpDateInput className={`${erpInputCls} mt-1`} value={from} onChange={setFrom} />
            </label>
            <label className="text-xs text-[var(--color-jewelry-black,#1a1814)]/55">
              To
              <ErpDateInput className={`${erpInputCls} mt-1`} value={to} onChange={setTo} />
            </label>
          </div>
          <div className="overflow-x-auto rounded-xl border border-[var(--color-slate-700,#e8e4df)]">
            <table className="min-w-full text-left text-xs">
              <thead className="bg-[var(--color-slate-900,#f7f4ef)] text-[10px] font-bold uppercase text-[var(--color-jewelry-black,#1a1814)]/55">
                <tr>
                  <th className="px-3 py-2.5">Customer</th>
                  <th className="px-3 py-2.5 text-right">Received</th>
                  <th className="px-3 py-2.5 text-right">Paid out</th>
                  <th className="px-3 py-2.5 text-right">Net</th>
                </tr>
              </thead>
              <tbody>
                {(summary?.by_customer || []).length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-3 py-8 text-center text-[var(--color-jewelry-black,#1a1814)]/45">
                      No customer payments in this period.
                    </td>
                  </tr>
                ) : (
                  (summary?.by_customer || []).map((row, i) => (
                    <tr key={`${row.customer_id}-${i}`} className="border-t border-[var(--color-slate-700,#e8e4df)]/60">
                      <td className="px-3 py-2.5">{row.customer_name || 'Walk-in / unassigned'}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{formatErpInr(row.received)}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{formatErpInr(row.paid_out)}</td>
                      <td className="px-3 py-2.5 text-right font-semibold tabular-nums">
                        {formatErpInr((row.received || 0) - (row.paid_out || 0))}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

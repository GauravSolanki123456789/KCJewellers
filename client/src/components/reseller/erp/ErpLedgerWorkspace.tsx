'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import axios from '@/lib/axios'
import {
  BookMarked,
  Check,
  Download,
  Loader2,
  Pencil,
  Plus,
  Trash2,
  Search,
  Upload,
  Wallet,
  X,
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
import { parseBankStatementFile, type ParsedBankRow } from '@/lib/erp-bank-import-parser'
import { ErpCustomerAccountPanel } from '@/components/reseller/erp/ErpCustomerAccountPanel'

type ImportPreviewRow = ParsedBankRow & {
  customer_name?: string | null
  duplicate?: boolean
  skip?: boolean
  import?: boolean
  is_suspense?: boolean
}

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
  payment_out: 'Payment made (out)',
  suspense_in: 'Suspense',
  bill_advance: 'Bill advance',
  adjustment: 'Adjustment',
  purchase: 'Purchase (PV)',
  expense: 'Expense',
  salary: 'Salary / staff',
}

function todayIso() {
  return new Date().toISOString().slice(0, 10)
}

function firstOfMonthIso() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

export function ErpLedgerWorkspace({ laneMode = false }: { laneMode?: boolean }) {
  const [tab, setTab] = useState<
    'entries' | 'add' | 'import' | 'suspense' | 'report' | 'purchase' | 'expense'
  >('entries')
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
    payment_mode: 'neft' as string,
    reference_no: '',
    bank_name: '',
    counterparty_name: '',
    narration: '',
    is_suspense: false,
  })

  const [resolveCustomerId, setResolveCustomerId] = useState<Record<number, string>>({})
  const [importPreview, setImportPreview] = useState<ImportPreviewRow[]>([])
  const [importFileName, setImportFileName] = useState('')
  const [importBankName, setImportBankName] = useState('')
  const [importDuplicateCount, setImportDuplicateCount] = useState(0)
  const [lastBatchId, setLastBatchId] = useState<number | null>(null)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editDraft, setEditDraft] = useState<Partial<ErpLedgerEntry>>({})
  const [addingInline, setAddingInline] = useState(false)
  const [inlineDraft, setInlineDraft] = useState({
    entry_date: todayIso(),
    entry_type: 'payment_in',
    amount_inr: '',
    customer_id: '',
    payment_mode: 'neft',
    reference_no: '',
    bank_name: '',
    counterparty_name: '',
    narration: '',
    is_suspense: false,
    employee_id: '',
  })
  const [employees, setEmployees] = useState<{ id: number; name: string; mobile?: string | null }[]>([])
  const [pvForm, setPvForm] = useState({
    entry_date: todayIso(),
    vendor_name: '',
    vendor_bill_ref: '',
    amount_inr: '',
    weight_kg: '',
    metal_type: 'SILVER',
    payment_mode: 'neft',
    narration: '',
  })
  const [expenseForm, setExpenseForm] = useState({
    entry_date: todayIso(),
    entry_type: 'expense' as 'expense' | 'salary' | 'payment_out',
    amount_inr: '',
    counterparty_name: '',
    employee_id: '',
    payment_mode: 'cash',
    narration: '',
  })
  const [newEmployeeName, setNewEmployeeName] = useState('')
  const [payCustomerQ, setPayCustomerQ] = useState('')
  const [payCustomerResults, setPayCustomerResults] = useState<ErpCustomer[]>([])
  const [payCustomerPickIdx, setPayCustomerPickIdx] = useState(-1)
  const [payCustomerLabel, setPayCustomerLabel] = useState('')

  useEffect(() => {
    const t = setTimeout(() => {
      if (!payCustomerQ.trim()) {
        setPayCustomerResults([])
        return
      }
      void axios
        .get<{ customers: ErpCustomer[] }>('/api/reseller/erp/customers', { params: { q: payCustomerQ.trim() } })
        .then((r) => setPayCustomerResults(r.data.customers || []))
        .catch(() => setPayCustomerResults([]))
    }, 200)
    return () => clearTimeout(t)
  }, [payCustomerQ])

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
    if (laneMode) params.lane_view = '1'
    if (lastBatchId && tab === 'import') params.import_batch_id = String(lastBatchId)
    const res = await axios.get<{ entries: ErpLedgerEntry[] }>('/api/reseller/erp/ledger/entries', {
      params,
    })
    setEntries(res.data.entries || [])
  }, [from, to, customerFilter, q, tab, laneMode, lastBatchId])

  const loadSummary = useCallback(async () => {
    const params: Record<string, string> = {}
    if (from) params.from = from
    if (to) params.to = to
    if (laneMode) params.lane_view = '1'
    const res = await axios.get<LedgerSummary>('/api/reseller/erp/ledger/summary', { params })
    setSummary(res.data)
  }, [from, to, laneMode])

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
    void axios
      .get<{ employees: { id: number; name: string; mobile?: string | null }[] }>(
        '/api/reseller/erp/employees',
      )
      .then((r) => setEmployees(r.data.employees || []))
      .catch(() => setEmployees([]))
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
        ledger_scope: laneMode ? 'lane' : 'official',
      })
      setForm({
        entry_date: todayIso(),
        entry_type: 'payment_in',
        amount_inr: '',
        customer_id: '',
        payment_mode: 'neft',
        reference_no: '',
        bank_name: '',
        counterparty_name: '',
        narration: '',
        is_suspense: false,
      })
      setPayCustomerQ('')
      setPayCustomerLabel('')
      setPayCustomerResults([])
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
      const parsed = await parseBankStatementFile(file)
      if (!parsed.rows.length) throw new Error('No transactions found — check bank format (IDFC / HDFC / generic).')

      const previewRes = await axios.post<{
        preview: ImportPreviewRow[]
        duplicate_count: number
        skipped: number
      }>('/api/reseller/erp/ledger/import/preview', {
        rows: parsed.rows,
        file_name: file.name,
        bank_name: parsed.bankName,
        mark_unmatched_suspense: true,
        ledger_scope: laneMode ? 'lane' : 'official',
      })

      const rows = (previewRes.data.preview || []).map((r) => ({
        ...r,
        import: !r.duplicate,
      }))
      setImportPreview(rows)
      setImportFileName(file.name)
      setImportBankName(parsed.bankName)
      setImportDuplicateCount(previewRes.data.duplicate_count || 0)
      setMsg(
        `Parsed ${rows.length} transaction(s) from ${parsed.format === 'idfc' ? 'IDFC' : 'generic'} format` +
          (previewRes.data.duplicate_count
            ? ` · ${previewRes.data.duplicate_count} duplicate(s) flagged`
            : ''),
      )
    } catch (e) {
      alert(erpErr(e))
    } finally {
      setBusy(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const updatePreviewRow = (idx: number, patch: Partial<ImportPreviewRow>) => {
    setImportPreview((rows) => rows.map((r, i) => (i === idx ? { ...r, ...patch } : r)))
  }

  const commitImport = async () => {
    const toImport = importPreview.filter((r) => r.import !== false && !r.skip)
    if (!toImport.length) {
      alert('No rows selected for import')
      return
    }
    setBusy(true)
    setMsg(null)
    try {
      const res = await axios.post<{
        inserted: number
        skipped: number
        suspense: number
        duplicates: number
        batch_id: number
      }>('/api/reseller/erp/ledger/import', {
        rows: toImport,
        file_name: importFileName,
        bank_name: importBankName,
        mark_unmatched_suspense: true,
        skip_duplicates: true,
        ledger_scope: laneMode ? 'lane' : 'official',
      })
      setLastBatchId(res.data.batch_id)
      setImportPreview([])
      setMsg(
        `Imported ${res.data.inserted} entry(s)` +
          (res.data.duplicates ? ` · ${res.data.duplicates} duplicate(s) skipped` : '') +
          (res.data.suspense ? ` · ${res.data.suspense} in suspense` : ''),
      )
      setTab('entries')
      await reload()
    } catch (e) {
      alert(erpErr(e))
    } finally {
      setBusy(false)
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
    setBusy(true)
    try {
      await axios.delete(`/api/reseller/erp/ledger/entries/${id}`)
      if (editingId === id) setEditingId(null)
      await reload()
    } catch (e) {
      alert(erpErr(e))
    } finally {
      setBusy(false)
    }
  }

  const startEdit = (e: ErpLedgerEntry) => {
    setEditingId(e.id)
    setEditDraft({ ...e })
    setAddingInline(false)
  }

  const cancelEdit = () => {
    setEditingId(null)
    setEditDraft({})
  }

  const saveEdit = async () => {
    if (!editingId) return
    const amount = Number(String(editDraft.amount_inr ?? '').replace(/[,₹\s]/g, ''))
    if (!Number.isFinite(amount) || amount <= 0) {
      alert('Enter a valid amount')
      return
    }
    setBusy(true)
    try {
      await axios.put(`/api/reseller/erp/ledger/entries/${editingId}`, {
        entry_date: editDraft.entry_date,
        entry_type: editDraft.entry_type,
        amount_inr: amount,
        customer_id: editDraft.customer_id ?? null,
        payment_mode: editDraft.payment_mode,
        reference_no: editDraft.reference_no,
        bank_name: editDraft.bank_name,
        counterparty_name: editDraft.counterparty_name,
        narration: editDraft.narration,
        is_suspense: editDraft.is_suspense,
        employee_id: editDraft.employee_id ?? null,
        weight_kg: editDraft.weight_kg ?? null,
      })
      cancelEdit()
      await reload()
    } catch (e) {
      alert(erpErr(e))
    } finally {
      setBusy(false)
    }
  }

  const saveInlineAdd = async () => {
    const amount = Number(String(inlineDraft.amount_inr).replace(/[,₹\s]/g, ''))
    if (!Number.isFinite(amount) || amount <= 0) {
      alert('Enter a valid amount')
      return
    }
    setBusy(true)
    try {
      await axios.post('/api/reseller/erp/ledger/entries', {
        entry_date: inlineDraft.entry_date,
        entry_type: inlineDraft.is_suspense ? 'suspense_in' : inlineDraft.entry_type,
        amount_inr: amount,
        customer_id: inlineDraft.customer_id ? Number(inlineDraft.customer_id) : null,
        payment_mode: inlineDraft.payment_mode,
        reference_no: inlineDraft.reference_no,
        bank_name: inlineDraft.bank_name,
        counterparty_name: inlineDraft.counterparty_name,
        narration: inlineDraft.narration,
        is_suspense: inlineDraft.is_suspense,
        employee_id: inlineDraft.employee_id ? Number(inlineDraft.employee_id) : null,
        ledger_scope: laneMode ? 'lane' : 'official',
      })
      setAddingInline(false)
      setInlineDraft({
        entry_date: todayIso(),
        entry_type: 'payment_in',
        amount_inr: '',
        customer_id: '',
        payment_mode: 'neft',
        reference_no: '',
        bank_name: '',
        counterparty_name: '',
        narration: '',
        is_suspense: false,
        employee_id: '',
      })
      await reload()
    } catch (e) {
      alert(erpErr(e))
    } finally {
      setBusy(false)
    }
  }

  const savePurchase = async () => {
    const amount = Number(String(pvForm.amount_inr).replace(/[,₹\s]/g, ''))
    const weightKg = Number(String(pvForm.weight_kg).replace(/[,₹\s]/g, ''))
    if (!Number.isFinite(amount) || amount <= 0) {
      alert('Enter purchase amount')
      return
    }
    if (!Number.isFinite(weightKg) || weightKg <= 0) {
      alert('Enter weight in kg')
      return
    }
    setBusy(true)
    try {
      const res = await axios.post<{ purchase_voucher: { pv_number: string } }>(
        '/api/reseller/erp/purchase-vouchers',
        {
          ...pvForm,
          amount_inr: amount,
          weight_kg: weightKg,
        },
      )
      setMsg(`Purchase saved — ${res.data.purchase_voucher.pv_number}. Upload stock in Products with this PV number.`)
      setPvForm({
        entry_date: todayIso(),
        vendor_name: '',
        vendor_bill_ref: '',
        amount_inr: '',
        weight_kg: '',
        metal_type: 'SILVER',
        payment_mode: 'neft',
        narration: '',
      })
      setTab('entries')
      await reload()
    } catch (e) {
      alert(erpErr(e))
    } finally {
      setBusy(false)
    }
  }

  const saveExpense = async () => {
    const amount = Number(String(expenseForm.amount_inr).replace(/[,₹\s]/g, ''))
    if (!Number.isFinite(amount) || amount <= 0) {
      alert('Enter a valid amount')
      return
    }
    setBusy(true)
    try {
      await axios.post('/api/reseller/erp/ledger/entries', {
        entry_date: expenseForm.entry_date,
        entry_type: expenseForm.entry_type,
        amount_inr: amount,
        counterparty_name: expenseForm.counterparty_name,
        employee_id: expenseForm.employee_id ? Number(expenseForm.employee_id) : null,
        payment_mode: expenseForm.payment_mode,
        narration: expenseForm.narration,
        ledger_scope: laneMode ? 'lane' : 'official',
      })
      setMsg('Entry saved.')
      setExpenseForm({
        entry_date: todayIso(),
        entry_type: 'expense',
        amount_inr: '',
        counterparty_name: '',
        employee_id: '',
        payment_mode: 'cash',
        narration: '',
      })
      setTab('entries')
      await reload()
    } catch (e) {
      alert(erpErr(e))
    } finally {
      setBusy(false)
    }
  }

  const addEmployee = async () => {
    const name = newEmployeeName.trim()
    if (!name) return
    try {
      const res = await axios.post<{ employee: { id: number; name: string } }>(
        '/api/reseller/erp/employees',
        { name },
      )
      setEmployees((list) => [...list, res.data.employee])
      setNewEmployeeName('')
    } catch (e) {
      alert(erpErr(e))
    }
  }

  const renderEntryRow = (e: ErpLedgerEntry, editing: boolean) => {
    const d = editing ? editDraft : e
    if (editing) {
      return (
        <tr key={e.id} className="border-t border-[var(--color-slate-700,#e8e4df)]/60 bg-blue-50/40">
          <td className="px-2 py-2">
            <ErpDateInput
              className={`${erpInputCls} min-w-[110px] py-1.5 text-xs`}
              value={String(d.entry_date || '')}
              onChange={(v) => setEditDraft({ ...editDraft, entry_date: v })}
            />
          </td>
          <td className="px-2 py-2">
            <select
              className={`${erpInputCls} py-1.5 text-xs`}
              value={d.entry_type || 'payment_in'}
              onChange={(ev) => setEditDraft({ ...editDraft, entry_type: ev.target.value })}
            >
              {Object.entries(ENTRY_LABELS).map(([k, label]) => (
                <option key={k} value={k}>
                  {label}
                </option>
              ))}
            </select>
          </td>
          <td className="px-2 py-2">
            <select
              className={`${erpInputCls} mb-1 min-w-[120px] py-1.5 text-xs`}
              value={d.customer_id ? String(d.customer_id) : ''}
              onChange={(ev) =>
                setEditDraft({
                  ...editDraft,
                  customer_id: ev.target.value ? Number(ev.target.value) : null,
                })
              }
            >
              <option value="">Walk-in / party</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <input
              className={`${erpInputCls} min-w-[120px] py-1.5 text-xs`}
              placeholder="Party name"
              value={d.counterparty_name || ''}
              onChange={(ev) => setEditDraft({ ...editDraft, counterparty_name: ev.target.value })}
            />
          </td>
          <td className="px-2 py-2">
            <select
              className={`${erpInputCls} py-1.5 text-xs`}
              value={d.payment_mode || 'neft'}
              onChange={(ev) => setEditDraft({ ...editDraft, payment_mode: ev.target.value })}
            >
              {PAYMENT_MODES.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </td>
          <td className="px-2 py-2">
            <input
              className={`${erpInputCls} min-w-[90px] py-1.5 text-xs`}
              value={d.reference_no || ''}
              onChange={(ev) => setEditDraft({ ...editDraft, reference_no: ev.target.value })}
            />
          </td>
          <td className="px-2 py-2 text-right">
            <input
              className={`${erpInputCls} w-24 py-1.5 text-right text-xs tabular-nums`}
              value={String(d.amount_inr ?? '')}
              onChange={(ev) => setEditDraft({ ...editDraft, amount_inr: Number(ev.target.value) || 0 })}
            />
          </td>
          <td className="px-2 py-2">
            <div className="flex gap-1">
              <button type="button" className="rounded-lg bg-emerald-600 p-1.5 text-white" onClick={() => void saveEdit()}>
                <Check className="size-4" />
              </button>
              <button type="button" className="rounded-lg border p-1.5" onClick={cancelEdit}>
                <X className="size-4" />
              </button>
            </div>
          </td>
        </tr>
      )
    }
    return (
      <tr key={e.id} className="border-t border-[var(--color-slate-700,#e8e4df)]/60">
        <td className="whitespace-nowrap px-3 py-2.5">{e.entry_date}</td>
        <td className="px-3 py-2.5">
          <span
            className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
              e.is_suspense
                ? 'bg-amber-100 text-amber-900'
                : e.entry_type === 'payment_out' || e.entry_type === 'purchase' || e.entry_type === 'expense' || e.entry_type === 'salary'
                  ? 'bg-rose-50 text-rose-800'
                  : 'bg-emerald-50 text-emerald-800'
            }`}
          >
            {ENTRY_LABELS[e.entry_type] || e.entry_type}
          </span>
        </td>
        <td className="max-w-[160px] truncate px-3 py-2.5">
          {e.customer_name || e.counterparty_name || '—'}
          {e.pv_number ? (
            <span className="block text-[10px] font-semibold text-blue-800">{e.pv_number}</span>
          ) : null}
          {e.bill_number ? (
            <span className="block text-[10px] text-[var(--color-jewelry-black,#1a1814)]/45">{e.bill_number}</span>
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
                onChange={(ev) => setResolveCustomerId((m) => ({ ...m, [e.id]: ev.target.value }))}
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
          ) : tab === 'entries' ? (
            <div className="flex gap-1">
              <button
                type="button"
                className="rounded-lg p-1.5 text-blue-700 hover:bg-blue-50"
                onClick={() => startEdit(e)}
                aria-label="Edit"
              >
                <Pencil className="size-4" />
              </button>
              <button
                type="button"
                className="rounded-lg p-1.5 text-rose-500 hover:bg-rose-50"
                onClick={() => void removeEntry(e.id)}
                aria-label="Delete"
              >
                <Trash2 className="size-4" />
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
    )
  }

  const tabs = [
    { id: 'entries' as const, label: 'All entries' },
    { id: 'add' as const, label: 'Add payment' },
    { id: 'purchase' as const, label: 'Purchase (PV)' },
    { id: 'expense' as const, label: 'Expenses / staff' },
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

      <ErpCustomerAccountPanel
        laneMode={laneMode}
        from={from}
        to={to}
        onCustomerSelected={(id) => setCustomerFilter(id ? String(id) : '')}
      />

      {(tab === 'entries' || tab === 'suspense') && (
        <div className={`${erpCardCls} space-y-3`}>
          <div>
            <p className="text-sm font-semibold text-[var(--color-jewelry-black,#1a1814)]">Payment entries</p>
            <p className="mt-0.5 text-[11px] leading-relaxed text-[var(--color-jewelry-black,#1a1814)]/55">
              Bank receipts, UPI/NEFT payments, and suspense items for the date range below. Sales bills appear in the
              customer account above; this table is for money received or paid out.
            </p>
          </div>
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
              Customer filter
              <input
                className={`${erpInputCls} mt-1`}
                placeholder="Set via customer search above, or type customer id"
                value={customerFilter}
                onChange={(e) => setCustomerFilter(e.target.value.replace(/\D/g, ''))}
              />
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

          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-semibold text-[var(--color-jewelry-black,#1a1814)]">Ledger entries</p>
            {tab === 'entries' ? (
              <button
                type="button"
                className={erpBtnGhost}
                onClick={() => {
                  setAddingInline(true)
                  setEditingId(null)
                }}
              >
                <Plus className="size-4" />
                Add entry
              </button>
            ) : null}
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
                {addingInline && tab === 'entries' ? (
                  <tr className="border-t border-[var(--color-slate-700,#e8e4df)]/60 bg-emerald-50/40">
                    <td className="px-2 py-2">
                      <ErpDateInput
                        className={`${erpInputCls} min-w-[110px] py-1.5 text-xs`}
                        value={inlineDraft.entry_date}
                        onChange={(v) => setInlineDraft({ ...inlineDraft, entry_date: v })}
                      />
                    </td>
                    <td className="px-2 py-2">
                      <select
                        className={`${erpInputCls} py-1.5 text-xs`}
                        value={inlineDraft.entry_type}
                        onChange={(ev) => setInlineDraft({ ...inlineDraft, entry_type: ev.target.value })}
                      >
                        {Object.entries(ENTRY_LABELS).map(([k, label]) => (
                          <option key={k} value={k}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-2 py-2">
                      <select
                        className={`${erpInputCls} mb-1 min-w-[120px] py-1.5 text-xs`}
                        value={inlineDraft.customer_id}
                        onChange={(ev) => setInlineDraft({ ...inlineDraft, customer_id: ev.target.value })}
                      >
                        <option value="">Walk-in</option>
                        {customers.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                      <input
                        className={`${erpInputCls} min-w-[120px] py-1.5 text-xs`}
                        placeholder="Party"
                        value={inlineDraft.counterparty_name}
                        onChange={(ev) => setInlineDraft({ ...inlineDraft, counterparty_name: ev.target.value })}
                      />
                    </td>
                    <td className="px-2 py-2">
                      <select
                        className={`${erpInputCls} py-1.5 text-xs`}
                        value={inlineDraft.payment_mode}
                        onChange={(ev) => setInlineDraft({ ...inlineDraft, payment_mode: ev.target.value })}
                      >
                        {PAYMENT_MODES.map((m) => (
                          <option key={m} value={m}>
                            {m}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-2 py-2">
                      <input
                        className={`${erpInputCls} min-w-[90px] py-1.5 text-xs`}
                        value={inlineDraft.reference_no}
                        onChange={(ev) => setInlineDraft({ ...inlineDraft, reference_no: ev.target.value })}
                      />
                    </td>
                    <td className="px-2 py-2 text-right">
                      <input
                        className={`${erpInputCls} w-24 py-1.5 text-right text-xs tabular-nums`}
                        placeholder="₹"
                        value={inlineDraft.amount_inr}
                        onChange={(ev) => setInlineDraft({ ...inlineDraft, amount_inr: ev.target.value })}
                      />
                    </td>
                    <td className="px-2 py-2">
                      <div className="flex gap-1">
                        <button type="button" className="rounded-lg bg-emerald-600 p-1.5 text-white" onClick={() => void saveInlineAdd()}>
                          <Check className="size-4" />
                        </button>
                        <button type="button" className="rounded-lg border p-1.5" onClick={() => setAddingInline(false)}>
                          <X className="size-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ) : null}
                {entries.length === 0 && !addingInline ? (
                  <tr>
                    <td colSpan={7} className="px-3 py-10 text-center text-[var(--color-jewelry-black,#1a1814)]/45">
                      No entries for this filter.
                    </td>
                  </tr>
                ) : (
                  entries.map((e) => renderEntryRow(e, editingId === e.id))
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
                <option value="payment_out">Payment made (to party / supplier)</option>
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
              <div className="relative mt-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--color-jewelry-black,#1a1814)]/40" />
                <input
                  className={`${erpInputCls} pl-9`}
                  placeholder="Search by name or mobile…"
                  value={payCustomerQ}
                  disabled={form.is_suspense}
                  onChange={(e) => {
                    setPayCustomerQ(e.target.value)
                    setPayCustomerPickIdx(-1)
                    if (!e.target.value.trim()) {
                      setForm({ ...form, customer_id: '' })
                      setPayCustomerLabel('')
                    }
                  }}
                  onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => {
                    const list = payCustomerResults.slice(0, 8)
                    if (!list.length) return
                    if (e.key === 'ArrowDown') {
                      e.preventDefault()
                      setPayCustomerPickIdx((i) => Math.min(i + 1, list.length - 1))
                    } else if (e.key === 'ArrowUp') {
                      e.preventDefault()
                      setPayCustomerPickIdx((i) => Math.max(i - 1, 0))
                    } else if (e.key === 'Enter' && payCustomerPickIdx >= 0) {
                      e.preventDefault()
                      const c = list[payCustomerPickIdx]
                      setForm({ ...form, customer_id: String(c.id), is_suspense: false })
                      setPayCustomerQ(c.name)
                      setPayCustomerLabel(c.mobile ? `${c.name} · ${c.mobile}` : c.name)
                      setPayCustomerResults([])
                    }
                  }}
                />
                {payCustomerResults.length > 0 && payCustomerQ.trim() && !form.customer_id ? (
                  <ul className="absolute z-20 mt-1 max-h-48 w-full overflow-auto rounded-xl border border-[var(--color-slate-700,#e8e4df)] bg-white shadow-lg">
                    {payCustomerResults.slice(0, 8).map((c, i) => (
                      <li key={c.id}>
                        <button
                          type="button"
                          className={`block w-full px-3 py-2.5 text-left text-sm ${
                            i === payCustomerPickIdx ? 'bg-[var(--kc-accent,#c41e3a)]/10' : 'hover:bg-[var(--color-slate-900,#f7f4ef)]'
                          }`}
                          onClick={() => {
                            setForm({ ...form, customer_id: String(c.id), is_suspense: false })
                            setPayCustomerQ(c.name)
                            setPayCustomerLabel(c.mobile ? `${c.name} · ${c.mobile}` : c.name)
                            setPayCustomerResults([])
                          }}
                        >
                          <span className="font-medium">{c.name}</span>
                          {c.mobile ? <span className="ml-2 text-xs text-[var(--color-jewelry-black,#1a1814)]/50">{c.mobile}</span> : null}
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
              {payCustomerLabel ? (
                <p className="mt-1 text-[11px] text-[var(--color-jewelry-black,#1a1814)]/55">{payCustomerLabel}</p>
              ) : null}
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

      {tab === 'purchase' && (
        <div className={`${erpCardCls} space-y-4`}>
          <p className="text-sm font-semibold text-[var(--color-jewelry-black,#1a1814)]">
            Record stock purchase — generates PV number (PV0001, PV0002…)
          </p>
          <p className="text-xs text-[var(--color-jewelry-black,#1a1814)]/60">
            After saving, go to <strong>Products → Stock upload</strong>, enter the PV number, and upload Excel until
            weight tallies. Purchase appears in both normal and Jainav ledgers.
          </p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <label className="text-xs text-[var(--color-jewelry-black,#1a1814)]/55">
              Date
              <ErpDateInput className={`${erpInputCls} mt-1`} value={pvForm.entry_date} onChange={(v) => setPvForm({ ...pvForm, entry_date: v })} />
            </label>
            <label className="text-xs text-[var(--color-jewelry-black,#1a1814)]/55">
              Vendor / supplier
              <input className={`${erpInputCls} mt-1`} value={pvForm.vendor_name} onChange={(e) => setPvForm({ ...pvForm, vendor_name: e.target.value })} />
            </label>
            <label className="text-xs text-[var(--color-jewelry-black,#1a1814)]/55">
              Vendor bill ref
              <input className={`${erpInputCls} mt-1`} value={pvForm.vendor_bill_ref} onChange={(e) => setPvForm({ ...pvForm, vendor_bill_ref: e.target.value })} placeholder="Receipt no" />
            </label>
            <label className="text-xs text-[var(--color-jewelry-black,#1a1814)]/55">
              Amount (₹)
              <input className={`${erpInputCls} mt-1 tabular-nums`} inputMode="decimal" value={pvForm.amount_inr} onChange={(e) => setPvForm({ ...pvForm, amount_inr: e.target.value.replace(/[^\d.]/g, '') })} />
            </label>
            <label className="text-xs text-[var(--color-jewelry-black,#1a1814)]/55">
              Weight (kg)
              <input className={`${erpInputCls} mt-1 tabular-nums`} inputMode="decimal" value={pvForm.weight_kg} onChange={(e) => setPvForm({ ...pvForm, weight_kg: e.target.value.replace(/[^\d.]/g, '') })} />
            </label>
            <label className="text-xs text-[var(--color-jewelry-black,#1a1814)]/55">
              Metal
              <select className={`${erpInputCls} mt-1`} value={pvForm.metal_type} onChange={(e) => setPvForm({ ...pvForm, metal_type: e.target.value })}>
                <option value="SILVER">Silver</option>
                <option value="GOLD">Gold</option>
              </select>
            </label>
            <label className="text-xs text-[var(--color-jewelry-black,#1a1814)]/55">
              Payment mode
              <select className={`${erpInputCls} mt-1`} value={pvForm.payment_mode} onChange={(e) => setPvForm({ ...pvForm, payment_mode: e.target.value })}>
                {PAYMENT_MODES.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </label>
            <label className="text-xs text-[var(--color-jewelry-black,#1a1814)]/55 sm:col-span-2">
              Notes
              <textarea className={`${erpInputCls} mt-1 min-h-[72px] py-2`} value={pvForm.narration} onChange={(e) => setPvForm({ ...pvForm, narration: e.target.value })} />
            </label>
          </div>
          <button type="button" className={erpBtnPrimary} disabled={busy} onClick={() => void savePurchase()}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
            Save purchase &amp; generate PV
          </button>
        </div>
      )}

      {tab === 'expense' && (
        <div className={`${erpCardCls} space-y-4`}>
          <p className="text-sm font-semibold text-[var(--color-jewelry-black,#1a1814)]">
            Expenses, staff salary &amp; advances
          </p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <label className="text-xs text-[var(--color-jewelry-black,#1a1814)]/55">
              Date
              <ErpDateInput className={`${erpInputCls} mt-1`} value={expenseForm.entry_date} onChange={(v) => setExpenseForm({ ...expenseForm, entry_date: v })} />
            </label>
            <label className="text-xs text-[var(--color-jewelry-black,#1a1814)]/55">
              Type
              <select className={`${erpInputCls} mt-1`} value={expenseForm.entry_type} onChange={(e) => setExpenseForm({ ...expenseForm, entry_type: e.target.value as typeof expenseForm.entry_type })}>
                <option value="expense">Expense (food, rent…)</option>
                <option value="salary">Salary / staff payment</option>
                <option value="payment_out">Other payment out</option>
              </select>
            </label>
            <label className="text-xs text-[var(--color-jewelry-black,#1a1814)]/55">
              Amount (₹)
              <input className={`${erpInputCls} mt-1 tabular-nums`} value={expenseForm.amount_inr} onChange={(e) => setExpenseForm({ ...expenseForm, amount_inr: e.target.value.replace(/[^\d.]/g, '') })} />
            </label>
            <label className="text-xs text-[var(--color-jewelry-black,#1a1814)]/55">
              Employee
              <select className={`${erpInputCls} mt-1`} value={expenseForm.employee_id} onChange={(e) => setExpenseForm({ ...expenseForm, employee_id: e.target.value })}>
                <option value="">— Not linked —</option>
                {employees.map((emp) => (
                  <option key={emp.id} value={emp.id}>{emp.name}</option>
                ))}
              </select>
            </label>
            <label className="text-xs text-[var(--color-jewelry-black,#1a1814)]/55">
              Party / description
              <input className={`${erpInputCls} mt-1`} value={expenseForm.counterparty_name} onChange={(e) => setExpenseForm({ ...expenseForm, counterparty_name: e.target.value })} />
            </label>
            <label className="text-xs text-[var(--color-jewelry-black,#1a1814)]/55">
              Payment mode
              <select className={`${erpInputCls} mt-1`} value={expenseForm.payment_mode} onChange={(e) => setExpenseForm({ ...expenseForm, payment_mode: e.target.value })}>
                {PAYMENT_MODES.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </label>
            <label className="text-xs text-[var(--color-jewelry-black,#1a1814)]/55 sm:col-span-2">
              Notes
              <textarea className={`${erpInputCls} mt-1 min-h-[72px] py-2`} value={expenseForm.narration} onChange={(e) => setExpenseForm({ ...expenseForm, narration: e.target.value })} />
            </label>
          </div>
          <div className="flex flex-wrap items-end gap-2 border-t border-[var(--color-slate-700,#e8e4df)] pt-3">
            <input className={`${erpInputCls} min-w-[160px] flex-1`} placeholder="New employee name" value={newEmployeeName} onChange={(e) => setNewEmployeeName(e.target.value)} />
            <button type="button" className={erpBtnGhost} onClick={() => void addEmployee()}>
              <Plus className="size-4" />
              Add employee
            </button>
          </div>
          {laneMode ? (
            <p className="text-xs text-emerald-800">Cash entries here stay in Jainav lane only (hidden from normal ledger).</p>
          ) : null}
          <button type="button" className={erpBtnPrimary} disabled={busy} onClick={() => void saveExpense()}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
            Save entry
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
            Upload IDFC, HDFC, or generic bank exports. Review parsed rows, link customers, then import.
            {laneMode ? (
              <span className="mt-1 block font-medium text-emerald-800">
                Jainav lane — entries go to lane ledger only (hidden from normal ledger).
              </span>
            ) : null}
            Unmatched rows can go to <strong>suspense</strong> for later assignment.
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

          {importPreview.length > 0 ? (
            <div className="space-y-3 border-t border-[var(--color-slate-700,#e8e4df)] pt-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-semibold text-[var(--color-jewelry-black,#1a1814)]">
                  Review {importPreview.length} row(s)
                  {importDuplicateCount > 0 ? (
                    <span className="ml-2 text-xs font-medium text-amber-800">
                      {importDuplicateCount} duplicate(s)
                    </span>
                  ) : null}
                </p>
                <button type="button" className={erpBtnPrimary} disabled={busy} onClick={() => void commitImport()}>
                  {busy ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
                  Import selected
                </button>
              </div>
              <div className="overflow-x-auto rounded-xl border border-[var(--color-slate-700,#e8e4df)]">
                <table className="min-w-[920px] text-left text-xs">
                  <thead className="bg-[var(--color-slate-900,#f7f4ef)] text-[10px] font-bold uppercase text-[var(--color-jewelry-black,#1a1814)]/55">
                    <tr>
                      <th className="px-2 py-2">Import</th>
                      <th className="px-2 py-2">Date</th>
                      <th className="px-2 py-2">Type</th>
                      <th className="px-2 py-2 text-right">Amount</th>
                      <th className="px-2 py-2">Party / narration</th>
                      <th className="px-2 py-2">UTR / ref</th>
                      <th className="px-2 py-2">Customer</th>
                    </tr>
                  </thead>
                  <tbody>
                    {importPreview.map((row, idx) => (
                      <tr
                        key={`${row.row_index}-${idx}`}
                        className={`border-t border-[var(--color-slate-700,#e8e4df)]/60 ${
                          row.duplicate ? 'bg-amber-50/80' : ''
                        }`}
                      >
                        <td className="px-2 py-2">
                          <input
                            type="checkbox"
                            checked={row.import !== false && !row.skip}
                            disabled={!!row.duplicate}
                            onChange={(e) => updatePreviewRow(idx, { import: e.target.checked })}
                          />
                          {row.duplicate ? (
                            <span className="ml-1 text-[10px] font-semibold text-amber-800">Dup</span>
                          ) : null}
                        </td>
                        <td className="px-2 py-2">
                          <ErpDateInput
                            className={`${erpInputCls} min-w-[120px] py-1.5 text-xs`}
                            value={row.entry_date}
                            onChange={(v) => updatePreviewRow(idx, { entry_date: v })}
                          />
                        </td>
                        <td className="px-2 py-2">
                          <select
                            className={`${erpInputCls} py-1.5 text-xs`}
                            value={row.entry_type}
                            onChange={(e) =>
                              updatePreviewRow(idx, {
                                entry_type: e.target.value as 'payment_in' | 'payment_out',
                              })
                            }
                          >
                            <option value="payment_in">Received</option>
                            <option value="payment_out">Paid out</option>
                          </select>
                        </td>
                        <td className="px-2 py-2 text-right">
                          <input
                            className={`${erpInputCls} w-24 py-1.5 text-right text-xs tabular-nums`}
                            value={String(row.amount_inr)}
                            onChange={(e) =>
                              updatePreviewRow(idx, {
                                amount_inr: Number(e.target.value.replace(/[^\d.]/g, '')) || 0,
                              })
                            }
                          />
                        </td>
                        <td className="px-2 py-2">
                          <input
                            className={`${erpInputCls} mb-1 min-w-[180px] py-1.5 text-xs`}
                            value={row.counterparty_name}
                            placeholder="Party name"
                            onChange={(e) => updatePreviewRow(idx, { counterparty_name: e.target.value })}
                          />
                          <input
                            className={`${erpInputCls} min-w-[180px] py-1.5 text-xs`}
                            value={row.narration}
                            placeholder="Narration"
                            onChange={(e) => updatePreviewRow(idx, { narration: e.target.value })}
                          />
                        </td>
                        <td className="px-2 py-2">
                          <input
                            className={`${erpInputCls} min-w-[100px] py-1.5 text-xs`}
                            value={row.reference_no}
                            onChange={(e) => updatePreviewRow(idx, { reference_no: e.target.value })}
                          />
                        </td>
                        <td className="px-2 py-2">
                          <select
                            className={`${erpInputCls} min-w-[140px] py-1.5 text-xs`}
                            value={row.customer_id ? String(row.customer_id) : ''}
                            onChange={(e) => {
                              const cid = e.target.value ? Number(e.target.value) : null
                              const c = customers.find((x) => x.id === cid)
                              updatePreviewRow(idx, {
                                customer_id: cid,
                                customer_name: c?.name || null,
                                is_suspense: !cid,
                              })
                            }}
                          >
                            <option value="">Suspense / unassigned</option>
                            {customers.map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.name}
                                {c.mobile ? ` · ${c.mobile}` : ''}
                              </option>
                            ))}
                          </select>
                          {row.customer_name ? (
                            <p className="mt-0.5 text-[10px] text-emerald-700">{row.customer_name}</p>
                          ) : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}
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

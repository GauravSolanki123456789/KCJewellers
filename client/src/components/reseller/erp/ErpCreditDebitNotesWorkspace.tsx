'use client'

import { useCallback, useEffect, useMemo, useState, type KeyboardEvent } from 'react'
import axios from '@/lib/axios'
import { useAuth } from '@/hooks/useAuth'
import type { WholesaleUserFields } from '@/lib/customer-tier'
import {
  erpBtnGhost,
  erpBtnPrimary,
  erpCardCls,
  erpErr,
  erpInputCls,
  type ErpBill,
  type ErpCustomer,
} from '@/components/reseller/erp/erp-ui'
import { ErpDateInput } from '@/components/reseller/erp/ErpDateInput'
import { fetchGstInvoiceItems, type GstInvoiceItem } from '@/components/reseller/erp/ErpGstInvoiceItemsPanel'
import { useErpOperator } from '@/context/ErpOperatorContext'
import { formatErpInr } from '@/lib/reseller-erp-modules'
import { formatErpDateDdMmYyyy } from '@/lib/erp-date-format'
import { downloadCreditDebitNotePdf } from '@/lib/erp-note-pdf'
import { downloadCreditDebitNoteExcel } from '@/lib/erp-note-excel'
import { FileSpreadsheet, FileText, Loader2, Trash2 } from 'lucide-react'

type Kind = 'credit' | 'debit'

export function ErpCreditDebitNotesWorkspace({ kind }: { kind: Kind }) {
  const { canDeleteRecords } = useErpOperator()
  const auth = useAuth()
  const shopName = useMemo(() => {
    const name = auth.user && (auth.user as WholesaleUserFields).business_name
    return typeof name === 'string' && name.trim() ? name.trim() : 'Shop'
  }, [auth.user])

  const [bills, setBills] = useState<ErpBill[]>([])
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [custQ, setCustQ] = useState('')
  const [custResults, setCustResults] = useState<ErpCustomer[]>([])
  const [pickIdx, setPickIdx] = useState(-1)
  const [customer, setCustomer] = useState<ErpCustomer | null>(null)
  const [amount, setAmount] = useState('')
  const [reason, setReason] = useState('')
  const [remarks, setRemarks] = useState('')
  const [against, setAgainst] = useState('')
  const [invoiceItem, setInvoiceItem] = useState('')
  const [invoiceItems, setInvoiceItems] = useState<GstInvoiceItem[]>([])
  const [noteDate, setNoteDate] = useState(() => new Date().toISOString().slice(0, 10))

  const title = kind === 'credit' ? 'Credit notes' : 'Debit notes'
  const billType = kind

  const load = useCallback(async () => {
    try {
      const params =
        kind === 'credit'
          ? { bill_types: 'credit,sales_return', from: '2000-01-01' }
          : { bill_type: 'debit', from: '2000-01-01' }
      const res = await axios.get<{ bills: ErpBill[] }>('/api/reseller/erp/bills', { params })
      setBills(res.data.bills || [])
    } catch {
      setBills([])
    }
  }, [kind])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    void fetchGstInvoiceItems().then(setInvoiceItems)
  }, [])

  useEffect(() => {
    const t = setTimeout(() => {
      if (!custQ.trim() || customer) {
        setCustResults([])
        return
      }
      void axios
        .get<{ customers: ErpCustomer[] }>('/api/reseller/erp/customers', { params: { q: custQ.trim() } })
        .then((r) => setCustResults(r.data.customers || []))
        .catch(() => setCustResults([]))
    }, 200)
    return () => clearTimeout(t)
  }, [custQ, customer])

  const onCustKey = (e: KeyboardEvent<HTMLInputElement>) => {
    const list = custResults.slice(0, 8)
    if (!list.length) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setPickIdx((i) => Math.min(i + 1, list.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setPickIdx((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter' && pickIdx >= 0) {
      e.preventDefault()
      const c = list[pickIdx]
      setCustomer(c)
      setCustQ(c.name)
      setCustResults([])
    }
  }

  const issue = async () => {
    const amt = Number(amount)
    if (!customer) {
      setMsg('Select a customer.')
      return
    }
    if (!Number.isFinite(amt) || amt <= 0) {
      setMsg('Enter a valid amount.')
      return
    }
    const taxable = Math.round((amt / 1.03) * 100) / 100
    const gst = Math.round((amt - taxable) * 100) / 100
    setBusy(true)
    setMsg(null)
    try {
      const res = await axios.post<{ bill: ErpBill }>('/api/reseller/erp/bills', {
        bill_type: billType,
        status: 'completed',
        customer_id: customer.id,
        customer_name: customer.name,
        total_inr: amt,
        bill_date: noteDate,
        notes: remarks,
        lines: [],
        session: {
          reason,
          remarks,
          againstBills: against.trim(),
          taxableInr: taxable,
          gstInr: gst,
          mobile: customer.mobile || '',
          invoiceItemName: invoiceItem || undefined,
        },
      })
      setAmount('')
      setReason('')
      setRemarks('')
      setAgainst('')
      setInvoiceItem('')
      await load()
      setMsg(`${title.slice(0, -1)} ${res.data.bill.bill_number} issued.`)
      await downloadCreditDebitNotePdf({
        kind,
        bill: res.data.bill,
        shopName,
        customerMobile: customer.mobile || null,
      })
    } catch (e) {
      setMsg(erpErr(e))
    } finally {
      setBusy(false)
    }
  }

  const remove = async (id: number) => {
    if (!window.confirm('Delete this note? The number can be reused.')) return
    setBusy(true)
    try {
      await axios.delete(`/api/reseller/erp/bills/${id}`)
      await load()
    } catch (e) {
      setMsg(erpErr(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className={erpCardCls}>
        <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-jewelry-black,#1a1814)]/45">
          Jewellery ERP
        </p>
        <h2 className="text-lg font-bold text-[var(--color-jewelry-black,#1a1814)]">{title}</h2>
      </div>

      <div className={erpCardCls}>
        <p className="mb-3 text-sm font-semibold text-[var(--color-jewelry-black,#1a1814)]">Issue manually</p>
        <div className="relative mb-2">
          <input
            className={erpInputCls}
            placeholder="Customer name, mobile, GSTIN…"
            value={custQ}
            onChange={(e) => {
              setCustQ(e.target.value)
              setCustomer(null)
              setPickIdx(-1)
            }}
            onKeyDown={onCustKey}
          />
          {custResults.length > 0 && !customer ? (
            <ul className="absolute z-20 mt-1 max-h-48 w-full overflow-auto rounded-xl border border-[var(--color-slate-700,#e8e4df)] bg-white shadow-lg">
              {custResults.slice(0, 8).map((c, i) => (
                <li key={c.id}>
                  <button
                    type="button"
                    className={`block w-full px-3 py-2.5 text-left text-sm text-[var(--color-jewelry-black,#1a1814)] ${
                      i === pickIdx ? 'bg-[var(--kc-accent,#c41e3a)]/10' : 'hover:bg-[var(--color-slate-900,#f7f4ef)]'
                    }`}
                    onClick={() => {
                      setCustomer(c)
                      setCustQ(c.name)
                      setCustResults([])
                    }}
                  >
                    <span className="font-medium">{c.name}</span>
                    {c.mobile ? <span className="ml-2 text-xs opacity-60">{c.mobile}</span> : null}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
        {customer ? (
          <p className="mb-2 text-xs text-[var(--color-jewelry-black,#1a1814)]/60">
            {customer.name}
            {customer.mobile ? ` · ${customer.mobile}` : ''}
          </p>
        ) : null}
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-[#1a1814]">Amount ₹</p>
            <input className={`${erpInputCls} mt-1`} value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-[#1a1814]">Date</p>
            <div className="mt-1">
              <ErpDateInput value={noteDate} onChange={setNoteDate} />
            </div>
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-[#1a1814]">Against bill(s) (optional)</p>
            <input className={`${erpInputCls} mt-1`} value={against} onChange={(e) => setAgainst(e.target.value)} />
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-[#1a1814]">Reason (optional)</p>
            <input className={`${erpInputCls} mt-1`} value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
          <div className="sm:col-span-2">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-[#1a1814]">Invoice item</p>
            <select
              className={`${erpInputCls} mt-1`}
              value={invoiceItem}
              onChange={(e) => setInvoiceItem(e.target.value)}
            >
              <option value="">Choose invoice item…</option>
              {invoiceItems.map((it) => (
                <option key={it.id} value={it.name}>
                  {it.name}
                  {it.hsn ? ` · ${it.hsn}` : ''}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="mt-2">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-[#1a1814]">Remarks (optional)</p>
          <input className={`${erpInputCls} mt-1`} value={remarks} onChange={(e) => setRemarks(e.target.value)} />
        </div>
        <button type="button" className={`${erpBtnPrimary} mt-3`} disabled={busy} onClick={() => void issue()}>
          Issue {kind === 'credit' ? 'credit note' : 'debit note'}
        </button>
      </div>

      <div className={erpCardCls}>
        <p className="mb-3 text-sm font-semibold text-[var(--color-jewelry-black,#1a1814)]">History</p>
        {bills.length ? (
          <div className="overflow-x-auto rounded-xl border border-[var(--color-slate-700,#e8e4df)]">
            <table className="min-w-full text-left text-xs">
              <thead className="bg-[var(--color-slate-900,#f7f4ef)] text-[10px] font-bold uppercase tracking-wide text-[var(--color-jewelry-black,#1a1814)]/55">
                <tr>
                  <th className="px-3 py-2.5">Number</th>
                  <th className="px-3 py-2.5">Date</th>
                  <th className="px-3 py-2.5">Customer</th>
                  <th className="px-3 py-2.5 text-right">Amount</th>
                  <th className="px-3 py-2.5">Actions</th>
                </tr>
              </thead>
              <tbody>
                {bills.map((b) => (
                  <tr key={b.id} className="border-t border-[var(--color-slate-700,#e8e4df)]/60">
                    <td className="px-3 py-2 font-mono font-semibold text-[var(--color-jewelry-black,#1a1814)]">
                      {b.bill_number}
                    </td>
                    <td className="px-3 py-2">{formatErpDateDdMmYyyy(b.bill_date || b.created_at)}</td>
                    <td className="px-3 py-2">{b.customer_name || '—'}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatErpInr(b.total_inr)}</td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap gap-1">
                        <button
                          type="button"
                          className={erpBtnGhost}
                          onClick={() =>
                            void downloadCreditDebitNotePdf({
                              kind,
                              bill: b,
                              shopName,
                              customerMobile: b.session?.mobile || null,
                            })
                          }
                        >
                          <FileText className="size-4" /> PDF
                        </button>
                        <button type="button" className={erpBtnGhost} onClick={() => void downloadCreditDebitNoteExcel(b, kind)}>
                          <FileSpreadsheet className="size-4" /> Excel
                        </button>
                        {canDeleteRecords ? (
                          <button type="button" className={erpBtnGhost} onClick={() => void remove(b.id)}>
                            <Trash2 className="size-4" />
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-[var(--color-jewelry-black,#1a1814)]/55">No {title.toLowerCase()} yet.</p>
        )}
      </div>

      {msg ? <p className="text-sm text-[var(--color-jewelry-black,#1a1814)]/70">{msg}</p> : null}
      {busy ? (
        <p className="flex items-center gap-2 text-sm text-[var(--color-jewelry-black,#1a1814)]/55">
          <Loader2 className="size-4 animate-spin" /> Working…
        </p>
      ) : null}
    </div>
  )
}

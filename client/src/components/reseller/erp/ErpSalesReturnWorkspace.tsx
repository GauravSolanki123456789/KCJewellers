'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import axios from '@/lib/axios'
import { useAuth } from '@/hooks/useAuth'
import type { WholesaleUserFields } from '@/lib/customer-tier'
import {
  erpBtnGhost,
  erpBtnPrimary,
  erpCardCls,
  erpErr,
  erpInputCls,
  erpListItemSelected,
  type ErpBill,
  type ErpCustomer,
} from '@/components/reseller/erp/erp-ui'
import { ErpBillPreviewModal } from '@/components/reseller/erp/ErpBillPreviewModal'
import { ErpCameraScannerModal } from '@/components/reseller/erp/ErpCameraScannerModal'
import { ErpDateInput } from '@/components/reseller/erp/ErpDateInput'
import { formatErpInr } from '@/lib/reseller-erp-modules'
import { formatErpDateDdMmYyyy } from '@/lib/erp-date-format'
import {
  applyExtrasToReturnLine,
  billLinesForReturn,
  computeReturnTotals,
  formatReturnWeight,
  parseReturnSlabSettings,
  recalcReturnLine,
  type ReturnLine,
} from '@/lib/erp-sales-return'
import { downloadCreditDebitNotePdf } from '@/lib/erp-note-pdf'
import {
  Camera,
  CheckSquare,
  Eye,
  Loader2,
  Square,
  Trash2,
  Undo2,
  X,
} from 'lucide-react'

type PickMode = 'bill' | 'customer'
type PreviewKind = 'return' | 'debit'

function completedSale(bill: ErpBill) {
  return ['completed', 'paid', 'final'].includes(String(bill.status || '').toLowerCase())
}

export function ErpSalesReturnWorkspace() {
  const auth = useAuth()
  const shopName = useMemo(() => {
    const name = auth.user && (auth.user as WholesaleUserFields).business_name
    return typeof name === 'string' && name.trim() ? name.trim() : 'Shop'
  }, [auth.user])
  const slabSettings = useMemo(
    () => parseReturnSlabSettings(auth.user && (auth.user as WholesaleUserFields).reseller_slab_settings),
    [auth.user],
  )

  const [history, setHistory] = useState<ErpBill[]>([])
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [pickMode, setPickMode] = useState<PickMode>('bill')
  const [billNoInput, setBillNoInput] = useState('')
  const [selectedBills, setSelectedBills] = useState<ErpBill[]>([])
  const [custQ, setCustQ] = useState('')
  const [custResults, setCustResults] = useState<ErpCustomer[]>([])
  const [pickIdx, setPickIdx] = useState(-1)
  const [customer, setCustomer] = useState<ErpCustomer | null>(null)
  const [customerBills, setCustomerBills] = useState<ErpBill[]>([])
  const [viewBill, setViewBill] = useState<ErpBill | null>(null)
  const [returnedKeys, setReturnedKeys] = useState<Set<string>>(new Set())
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set())
  const [scanCode, setScanCode] = useState('')
  const [scannerOpen, setScannerOpen] = useState(false)
  const [flashKey, setFlashKey] = useState<string | null>(null)
  const [previewKind, setPreviewKind] = useState<PreviewKind | null>(null)
  const [previewLines, setPreviewLines] = useState<ReturnLine[]>([])
  const [customGold, setCustomGold] = useState('')
  const [customSilver, setCustomSilver] = useState('')
  const [origTotalsOn, setOrigTotalsOn] = useState(true)
  const [customTotalsOn, setCustomTotalsOn] = useState(false)
  const [extraBox, setExtraBox] = useState('')
  const [extraStone, setExtraStone] = useState('')
  const [extraAmt, setExtraAmt] = useState('')
  const [noteOpen, setNoteOpen] = useState(false)
  const [noteKind, setNoteKind] = useState<'credit' | 'debit'>('credit')
  const [noteAmount, setNoteAmount] = useState('')
  const [noteReason, setNoteReason] = useState('')
  const [noteRemarks, setNoteRemarks] = useState('')
  const [noteDate, setNoteDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [pendingReturn, setPendingReturn] = useState<ErpBill | null>(null)
  const scanRef = useRef<HTMLInputElement>(null)

  const loadHistory = useCallback(async () => {
    try {
      const res = await axios.get<{ bills: ErpBill[] }>('/api/reseller/erp/bills', {
        params: { bill_type: 'sales_return', from: '2000-01-01' },
      })
      setHistory(res.data.bills || [])
    } catch {
      setHistory([])
    }
  }, [])

  const loadReturnedKeys = useCallback(async () => {
    try {
      const res = await axios.get<{ keys: string[] }>('/api/reseller/erp/sales-returns/returned-keys')
      setReturnedKeys(new Set(res.data.keys || []))
    } catch {
      setReturnedKeys(new Set())
    }
  }, [])

  useEffect(() => {
    void loadHistory()
    void loadReturnedKeys()
  }, [loadHistory, loadReturnedKeys])

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

  const addBills = (incoming: ErpBill[]) => {
    setSelectedBills((prev) => {
      const map = new Map(prev.map((b) => [b.id, b]))
      for (const b of incoming) {
        if (completedSale(b)) map.set(b.id, b)
      }
      return [...map.values()]
    })
  }

  const lookupBillNumbers = async () => {
    const raw = billNoInput.trim()
    if (!raw) return
    setBusy(true)
    setMsg(null)
    try {
      const res = await axios.get<{ bills: ErpBill[] }>('/api/reseller/erp/sales-returns/source-bills', {
        params: { numbers: raw },
      })
      const bills = res.data.bills || []
      if (!bills.length) setMsg(`No completed sale found for ${raw}.`)
      else {
        addBills(bills)
        setBillNoInput('')
      }
    } catch (e) {
      setMsg(erpErr(e))
    } finally {
      setBusy(false)
    }
  }

  const pickCustomer = async (c: ErpCustomer) => {
    setCustomer(c)
    setCustQ(c.name)
    setCustResults([])
    setBusy(true)
    try {
      const res = await axios.get<{ bills: ErpBill[] }>('/api/reseller/erp/bills', {
        params: { bill_type: 'sale', customer_id: c.id },
      })
      setCustomerBills((res.data.bills || []).filter(completedSale))
    } catch (e) {
      setMsg(erpErr(e))
      setCustomerBills([])
    } finally {
      setBusy(false)
    }
  }

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
      void pickCustomer(list[pickIdx])
    }
  }

  const availableLines = useMemo(() => {
    const out: ReturnLine[] = []
    for (const bill of selectedBills) {
      for (const line of billLinesForReturn(bill)) out.push(line)
    }
    return out
  }, [selectedBills])

  const selectableLines = useMemo(
    () => availableLines.filter((l) => !returnedKeys.has(l.source_line_key)),
    [availableLines, returnedKeys],
  )

  const billById = useMemo(() => new Map(selectedBills.map((b) => [b.id, b])), [selectedBills])

  const toggleKey = (key: string) => {
    if (returnedKeys.has(key)) return
    setSelectedKeys((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const selectAll = () => setSelectedKeys(new Set(selectableLines.map((l) => l.source_line_key)))
  const selectNone = () => setSelectedKeys(new Set())

  const matchScan = (code: string) => {
    const needle = code.trim().toLowerCase()
    if (!needle) return
    const matches = selectableLines.filter((l) => {
      const codes = [l.barcode, l.code, l.sku].map((x) => String(x || '').trim().toLowerCase())
      return codes.includes(needle)
    })
    if (!matches.length) {
      setMsg(`No matching product for ${code}.`)
      return
    }
    setSelectedKeys((prev) => {
      const next = new Set(prev)
      for (const m of matches) next.add(m.source_line_key)
      return next
    })
    setFlashKey(matches[0].source_line_key)
    window.setTimeout(() => setFlashKey(null), 1800)
    setMsg(`Selected ${matches.length} item${matches.length === 1 ? '' : 's'} for ${code}.`)
  }

  const openPreview = (kind: PreviewKind) => {
    const chosen = selectableLines.filter((l) => selectedKeys.has(l.source_line_key))
    if (!chosen.length) {
      setMsg('Select at least one product.')
      return
    }
    setPreviewLines(chosen.map((l) => ({ ...l })))
    setPreviewKind(kind)
    setOrigTotalsOn(kind === 'return')
    setCustomTotalsOn(false)
    setCustomGold('')
    setCustomSilver('')
    setExtraBox('')
    setExtraStone('')
    setExtraAmt('')
    setMsg(null)
  }

  const goldN = Number(customGold) || 0
  const silverN = Number(customSilver) || 0

  const originalPreview = useMemo(
    () => previewLines.map((l) => recalcReturnLine(l, billById.get(l.source_bill_id), slabSettings, 'original')),
    [previewLines, billById, slabSettings],
  )
  const customPreview = useMemo(
    () =>
      previewLines.map((l) =>
        recalcReturnLine(l, billById.get(l.source_bill_id), slabSettings, 'custom', goldN, silverN),
      ),
    [previewLines, billById, slabSettings, goldN, silverN],
  )
  const origTotals = useMemo(() => computeReturnTotals(originalPreview), [originalPreview])
  const custTotals = useMemo(() => computeReturnTotals(customPreview), [customPreview])

  const applyDebitExtras = () => {
    const box = Number(extraBox) || 0
    const stone = Number(extraStone) || 0
    const amount = Number(extraAmt) || 0
    if (!box && !stone && !amount) return
    setPreviewLines((prev) => prev.map((l) => applyExtrasToReturnLine(l, { box, stone, amount })))
  }

  const takeReturn = async () => {
    if (!previewLines.length) return
    const useCustom = customTotalsOn && (goldN > 0 || silverN > 0)
    const lines = useCustom ? customPreview : originalPreview
    const totals = useCustom ? custTotals : origTotals
    const first = selectedBills[0]
    setBusy(true)
    setMsg(null)
    try {
      const ssr = await axios.post<{ bill: ErpBill }>('/api/reseller/erp/bills', {
        bill_type: 'sales_return',
        status: 'completed',
        customer_id: first?.customer_id || customer?.id || null,
        customer_name: first?.customer_name || customer?.name || '',
        total_inr: totals.net,
        bill_date: new Date().toISOString().slice(0, 10),
        lines,
        session: {
          sourceBillIds: selectedBills.map((b) => b.id),
          againstBills: selectedBills.map((b) => b.bill_number).join(', '),
          rateMode: useCustom ? 'custom' : 'original',
          customGoldPerG: goldN || null,
          customSilverPerG: silverN || null,
          originalNet: origTotals.net,
          customNet: custTotals.net,
          taxableInr: totals.taxable,
          gstInr: totals.gst,
          returnWeightGm: totals.weightGm,
          mobile: customer?.mobile || first?.session?.mobile || '',
        },
      })
      setPendingReturn(ssr.data.bill)
      setNoteKind('credit')
      setNoteAmount(String(totals.net))
      setNoteReason('Sales return')
      setNoteRemarks('')
      setNoteDate(new Date().toISOString().slice(0, 10))
      setNoteOpen(true)
      setPreviewKind(null)
      await loadHistory()
      await loadReturnedKeys()
      setMsg(`Return ${ssr.data.bill.bill_number} saved. Stock restored. Fill credit note to issue.`)
    } catch (e) {
      setMsg(erpErr(e))
    } finally {
      setBusy(false)
    }
  }

  const issueDebitFromPreview = () => {
    const totals = computeReturnTotals(previewLines)
    const extraNet = Math.max(0, totals.net - origTotals.net)
    setNoteKind('debit')
    setNoteAmount(String(extraNet > 0 ? extraNet : totals.net))
    setNoteReason('Debit adjustment')
    setNoteRemarks('')
    setNoteDate(new Date().toISOString().slice(0, 10))
    setPendingReturn(null)
    setNoteOpen(true)
    setPreviewKind(null)
  }

  const issueNote = async () => {
    const amt = Number(noteAmount)
    if (!Number.isFinite(amt) || amt <= 0) {
      setMsg('Enter a valid amount.')
      return
    }
    const first = selectedBills[0]
    const source = pendingReturn
    const sourceSession = (source?.session || {}) as { againstBills?: string; mobile?: string; returnWeightGm?: number }
    const customerId = first?.customer_id || source?.customer_id || customer?.id || null
    const customerName = first?.customer_name || source?.customer_name || customer?.name || ''
    const againstBills =
      selectedBills.map((b) => b.bill_number).filter(Boolean).join(', ') || sourceSession.againstBills || source?.bill_number || ''
    const mobile = customer?.mobile || first?.session?.mobile || sourceSession.mobile || ''
    const taxable = Math.round((amt / 1.03) * 100) / 100
    const gst = Math.round((amt - taxable) * 100) / 100
    const weightGm =
      noteKind === 'credit'
        ? origTotals.weightGm || custTotals.weightGm || Number(sourceSession.returnWeightGm) || 0
        : 0
    setBusy(true)
    try {
      const res = await axios.post<{ bill: ErpBill }>('/api/reseller/erp/bills', {
        bill_type: noteKind,
        status: 'completed',
        customer_id: customerId,
        customer_name: customerName,
        total_inr: amt,
        bill_date: noteDate,
        notes: noteRemarks,
        lines: [],
        session: {
          reason: noteReason,
          remarks: noteRemarks,
          againstBills,
          sourceReturnId: source?.id || null,
          sourceReturnNumber: source?.bill_number || '',
          taxableInr: taxable,
          gstInr: gst,
          returnWeightGm: weightGm,
          mobile,
        },
      })
      setNoteOpen(false)
      setMsg(`${noteKind === 'credit' ? 'Credit note' : 'Debit note'} ${res.data.bill.bill_number} issued.`)
      await downloadCreditDebitNotePdf({
        kind: noteKind,
        bill: res.data.bill,
        shopName,
        customerMobile: mobile || null,
      })
      setSelectedKeys(new Set())
      if (noteKind === 'credit') {
        setSelectedBills([])
        setPreviewLines([])
        setPendingReturn(null)
      }
    } catch (e) {
      setMsg(erpErr(e))
    } finally {
      setBusy(false)
    }
  }

  const deleteReturn = async (id: number) => {
    if (!window.confirm('Delete this sales return? The number can be reused. Returned stock will be marked sold again.')) {
      return
    }
    setBusy(true)
    try {
      await axios.delete(`/api/reseller/erp/bills/${id}`)
      await loadHistory()
      await loadReturnedKeys()
    } catch (e) {
      setMsg(erpErr(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className={erpCardCls}>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-jewelry-black,#1a1814)]/45">
              Jewellery ERP
            </p>
            <h2 className="text-lg font-bold text-[var(--color-jewelry-black,#1a1814)]">Sales return</h2>
          </div>
          <button type="button" className={erpBtnGhost} onClick={() => void loadHistory()}>
            Refresh
          </button>
        </div>
        {history.length ? (
          <div className="overflow-x-auto rounded-xl border border-[var(--color-slate-700,#e8e4df)]">
            <table className="min-w-full text-left text-xs">
              <thead className="bg-[var(--color-slate-900,#f7f4ef)] text-[10px] font-bold uppercase tracking-wide text-[var(--color-jewelry-black,#1a1814)]/55">
                <tr>
                  <th className="px-3 py-2.5">Return no</th>
                  <th className="px-3 py-2.5">Date</th>
                  <th className="px-3 py-2.5">Customer</th>
                  <th className="px-3 py-2.5 text-right">Amount</th>
                  <th className="px-3 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {history.map((b) => (
                  <tr key={b.id} className="border-t border-[var(--color-slate-700,#e8e4df)]/60">
                    <td className="px-3 py-2 font-mono font-semibold text-[var(--color-jewelry-black,#1a1814)]">
                      {b.bill_number}
                    </td>
                    <td className="px-3 py-2">{formatErpDateDdMmYyyy(b.bill_date || b.created_at)}</td>
                    <td className="px-3 py-2">{b.customer_name || '—'}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatErpInr(b.total_inr)}</td>
                    <td className="px-3 py-2 text-right">
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          className="text-[var(--color-jewelry-black,#1a1814)] underline"
                          onClick={() => {
                            setPendingReturn(b)
                            setSelectedBills([])
                            setNoteKind('credit')
                            setNoteAmount(String(b.total_inr || ''))
                            setNoteReason('Sales return')
                            setNoteRemarks('')
                            setNoteDate(new Date().toISOString().slice(0, 10))
                            setNoteOpen(true)
                          }}
                        >
                          Credit note
                        </button>
                        <button type="button" className="text-[var(--kc-accent,#c41e3a)]" onClick={() => void deleteReturn(b.id)}>
                          <Trash2 className="size-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-[var(--color-jewelry-black,#1a1814)]/55">No sales returns yet. SSR001 will be used first.</p>
        )}
      </div>

      <div className={erpCardCls}>
        <p className="mb-3 text-sm font-semibold text-[var(--color-jewelry-black,#1a1814)]">Select bills</p>
        <div className="mb-3 flex flex-wrap gap-2">
          {(['bill', 'customer'] as const).map((m) => (
            <button
              key={m}
              type="button"
              className={pickMode === m ? erpBtnPrimary : erpBtnGhost}
              onClick={() => setPickMode(m)}
            >
              {m === 'bill' ? 'By bill number' : 'By customer'}
            </button>
          ))}
        </div>

        {pickMode === 'bill' ? (
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              className={erpInputCls}
              placeholder="SA001, SCB001, SA002…"
              value={billNoInput}
              onChange={(e) => setBillNoInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  void lookupBillNumbers()
                }
              }}
            />
            <button type="button" className={erpBtnPrimary} disabled={busy} onClick={() => void lookupBillNumbers()}>
              Add bill(s)
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="relative">
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
                        onClick={() => void pickCustomer(c)}
                      >
                        <span className="font-medium">{c.name}</span>
                        {c.mobile ? <span className="ml-2 text-xs opacity-60">{c.mobile}</span> : null}
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
            {customerBills.length ? (
              <div className="space-y-2">
                {customerBills.map((b) => {
                  const on = selectedBills.some((s) => s.id === b.id)
                  return (
                    <div
                      key={b.id}
                      className={`flex flex-wrap items-center justify-between gap-2 rounded-xl border px-3 py-2 text-sm text-[var(--color-jewelry-black,#1a1814)] ${
                        on ? erpListItemSelected : 'border-[var(--color-slate-700,#e8e4df)] bg-white'
                      }`}
                    >
                      <label className="flex min-h-[44px] flex-1 items-center gap-2">
                        <input
                          type="checkbox"
                          checked={on}
                          onChange={() => {
                            if (on) setSelectedBills((prev) => prev.filter((x) => x.id !== b.id))
                            else addBills([b])
                          }}
                        />
                        <span className="font-mono font-semibold">{b.bill_number}</span>
                        <span className="opacity-60">{formatErpDateDdMmYyyy(b.bill_date || b.created_at)}</span>
                        <span className="tabular-nums">{formatErpInr(b.total_inr)}</span>
                      </label>
                      <button type="button" className={erpBtnGhost} onClick={() => setViewBill(b)}>
                        <Eye className="size-4" /> Preview
                      </button>
                    </div>
                  )
                })}
              </div>
            ) : customer ? (
              <p className="text-sm text-[var(--color-jewelry-black,#1a1814)]/55">No completed bills for this customer.</p>
            ) : null}
          </div>
        )}

        {selectedBills.length ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {selectedBills.map((b) => (
              <span
                key={b.id}
                className="inline-flex min-h-[36px] items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-3 text-xs font-semibold text-[#1a1814]"
              >
                {b.bill_number}
                <button type="button" onClick={() => setSelectedBills((prev) => prev.filter((x) => x.id !== b.id))}>
                  <X className="size-3.5" />
                </button>
              </span>
            ))}
          </div>
        ) : null}
      </div>

      {availableLines.length ? (
        <div className={erpCardCls}>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-semibold text-[var(--color-jewelry-black,#1a1814)]">Scanned products</p>
            <div className="flex flex-wrap gap-2">
              <button type="button" className={erpBtnGhost} onClick={selectAll}>
                <CheckSquare className="size-4" /> Select all
              </button>
              <button type="button" className={erpBtnGhost} onClick={selectNone}>
                <Square className="size-4" /> Deselect all
              </button>
            </div>
          </div>
          <div className="mb-3 flex flex-col gap-2 sm:flex-row">
            <input
              ref={scanRef}
              className={erpInputCls}
              placeholder="Scan barcode…"
              value={scanCode}
              onChange={(e) => setScanCode(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  matchScan(scanCode)
                  setScanCode('')
                }
              }}
            />
            <button type="button" className={erpBtnGhost} onClick={() => setScannerOpen(true)}>
              <Camera className="size-4" /> Camera
            </button>
          </div>
          <div className="space-y-2">
            {availableLines.map((line) => {
              const returned = returnedKeys.has(line.source_line_key)
              const on = selectedKeys.has(line.source_line_key)
              const flash = flashKey === line.source_line_key
              return (
                <label
                  key={line.source_line_key}
                  className={`flex min-h-[52px] items-start gap-3 rounded-xl border px-3 py-2 text-sm text-[var(--color-jewelry-black,#1a1814)] ${
                    returned
                      ? 'border-[var(--color-slate-700,#e8e4df)] bg-[var(--color-slate-900,#f7f4ef)] opacity-60'
                      : flash
                        ? 'border-amber-400 bg-amber-50 ring-2 ring-amber-300'
                        : on
                          ? erpListItemSelected
                          : 'border-[var(--color-slate-700,#e8e4df)] bg-white'
                  }`}
                >
                  <input
                    type="checkbox"
                    className="mt-1"
                    disabled={returned}
                    checked={on}
                    onChange={() => toggleKey(line.source_line_key)}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold">{line.name}</span>
                    <span className="block text-xs opacity-70">
                      {line.source_bill_number}
                      {line.barcode ? ` · ${line.barcode}` : ''}
                      {` · ${formatReturnWeight(line.weightGm)}`}
                      {line.ratePerGram != null ? ` · ₹${line.ratePerGram}/g` : ''}
                      {` · ${formatErpInr(line.lineTotalInr)}`}
                      {returned ? ' · Already returned' : ''}
                    </span>
                  </span>
                </label>
              )
            })}
          </div>
          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <button type="button" className={erpBtnPrimary} onClick={() => openPreview('return')}>
              <Undo2 className="size-4" /> Take return preview
            </button>
            <button type="button" className={erpBtnGhost} onClick={() => openPreview('debit')}>
              Debit adjustment
            </button>
          </div>
        </div>
      ) : null}

      {msg ? <p className="text-sm text-[var(--color-jewelry-black,#1a1814)]/70">{msg}</p> : null}
      {busy ? (
        <p className="flex items-center gap-2 text-sm text-[var(--color-jewelry-black,#1a1814)]/55">
          <Loader2 className="size-4 animate-spin" /> Working…
        </p>
      ) : null}

      <ErpCameraScannerModal open={scannerOpen} onClose={() => setScannerOpen(false)} onScan={matchScan} />
      <ErpBillPreviewModal bill={viewBill} kind="sale" onClose={() => setViewBill(null)} />

      {previewKind ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/45 p-3 sm:items-center">
          <div className={`${erpCardCls} max-h-[92vh] w-full max-w-3xl overflow-y-auto`}>
            <div className="mb-3 flex items-start justify-between gap-2">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-jewelry-black,#1a1814)]/45">
                  {previewKind === 'return' ? 'Return preview' : 'Debit adjustment'}
                </p>
                <h3 className="text-lg font-bold text-[var(--color-jewelry-black,#1a1814)]">
                  {previewKind === 'return' ? 'Calculate return amount' : 'Add charges'}
                </h3>
              </div>
              <button type="button" className={erpBtnGhost} onClick={() => setPreviewKind(null)}>
                <X className="size-4" />
              </button>
            </div>
            <div className="space-y-2">
              {previewLines.map((line, idx) => (
                <div key={line.source_line_key} className="rounded-xl border border-[var(--color-slate-700,#e8e4df)] p-3">
                  <div className="mb-2 flex items-start justify-between gap-2">
                    <p className="text-sm font-semibold text-[var(--color-jewelry-black,#1a1814)]">{line.name}</p>
                    <button
                      type="button"
                      className="text-[var(--kc-accent,#c41e3a)]"
                      onClick={() => setPreviewLines((prev) => prev.filter((_, i) => i !== idx))}
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    <label className="text-[10px] font-semibold uppercase text-[var(--color-jewelry-black,#1a1814)]/45">
                      Weight g
                      <input
                        className={`${erpInputCls} mt-1`}
                        value={line.weightGm ?? ''}
                        onChange={(e) => {
                          const v = Number(e.target.value)
                          setPreviewLines((prev) =>
                            prev.map((p, i) => (i === idx ? { ...p, weightGm: Number.isFinite(v) ? v : 0 } : p)),
                          )
                        }}
                      />
                    </label>
                    <label className="text-[10px] font-semibold uppercase text-[var(--color-jewelry-black,#1a1814)]/45">
                      Met %
                      <input
                        className={`${erpInputCls} mt-1`}
                        value={line.purity ?? ''}
                        onChange={(e) => {
                          const v = Number(e.target.value)
                          setPreviewLines((prev) =>
                            prev.map((p, i) => (i === idx ? { ...p, purity: Number.isFinite(v) ? v : null } : p)),
                          )
                        }}
                      />
                    </label>
                    <label className="text-[10px] font-semibold uppercase text-[var(--color-jewelry-black,#1a1814)]/45">
                      MC
                      <input
                        className={`${erpInputCls} mt-1`}
                        value={line.mc_rate ?? ''}
                        onChange={(e) => {
                          const v = Number(e.target.value)
                          setPreviewLines((prev) =>
                            prev.map((p, i) => (i === idx ? { ...p, mc_rate: Number.isFinite(v) ? v : null } : p)),
                          )
                        }}
                      />
                    </label>
                    <label className="text-[10px] font-semibold uppercase text-[var(--color-jewelry-black,#1a1814)]/45">
                      Amount
                      <input
                        className={`${erpInputCls} mt-1`}
                        value={line.lineTotalInr ?? ''}
                        onChange={(e) => {
                          const v = Number(e.target.value)
                          setPreviewLines((prev) =>
                            prev.map((p, i) =>
                              i === idx ? { ...p, lineTotalInr: Number.isFinite(v) ? v : 0, originalTotalInr: p.originalTotalInr } : p,
                            ),
                          )
                        }}
                      />
                    </label>
                  </div>
                  <p className="mt-1 text-xs text-[var(--color-jewelry-black,#1a1814)]/55">
                    {line.source_bill_number}
                    {line.barcode ? ` · ${line.barcode}` : ''}
                    {line.wastage_pct != null ? ` · Wastage ${line.wastage_pct}%` : ''}
                    {` · Billed ${formatErpInr(line.originalTotalInr)}`}
                  </p>
                </div>
              ))}
            </div>

            {previewKind === 'return' ? (
              <div className="mt-4 space-y-3">
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className={origTotalsOn ? erpBtnPrimary : erpBtnGhost}
                    onClick={() => setOrigTotalsOn((v) => !v)}
                  >
                    Same billed rate {origTotalsOn ? formatErpInr(origTotals.net) : ''}
                  </button>
                  <button
                    type="button"
                    className={customTotalsOn ? erpBtnPrimary : erpBtnGhost}
                    onClick={() => setCustomTotalsOn((v) => !v)}
                  >
                    Rate I put {customTotalsOn ? formatErpInr(custTotals.net) : ''}
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <label className="text-[10px] font-semibold uppercase text-[var(--color-jewelry-black,#1a1814)]/45">
                    Gold ₹/g
                    <input className={`${erpInputCls} mt-1`} value={customGold} onChange={(e) => setCustomGold(e.target.value)} />
                  </label>
                  <label className="text-[10px] font-semibold uppercase text-[var(--color-jewelry-black,#1a1814)]/45">
                    Silver ₹/g
                    <input
                      className={`${erpInputCls} mt-1`}
                      value={customSilver}
                      onChange={(e) => setCustomSilver(e.target.value)}
                    />
                  </label>
                </div>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {[
                    { l: 'Original net', v: origTotals.net, show: origTotalsOn || customTotalsOn },
                    { l: 'Custom net', v: custTotals.net, show: customTotalsOn },
                    { l: 'GST (orig)', v: origTotals.gst, show: origTotalsOn },
                    { l: 'Weight', v: origTotals.weightGm, show: true, weight: true },
                  ]
                    .filter((x) => x.show)
                    .map((c) => (
                      <div key={c.l} className="rounded-xl border border-[var(--color-slate-700,#e8e4df)] px-3 py-2">
                        <p className="text-[10px] font-semibold uppercase text-[var(--color-jewelry-black,#1a1814)]/45">{c.l}</p>
                        <p className="text-sm font-semibold tabular-nums text-[var(--color-jewelry-black,#1a1814)]">
                          {c.weight ? formatReturnWeight(c.v) : formatErpInr(c.v)}
                        </p>
                      </div>
                    ))}
                </div>
                <button type="button" className={erpBtnPrimary} disabled={busy} onClick={() => void takeReturn()}>
                  <Undo2 className="size-4" /> Take return
                </button>
              </div>
            ) : (
              <div className="mt-4 space-y-3">
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                  <label className="text-[10px] font-semibold uppercase text-[var(--color-jewelry-black,#1a1814)]/45">
                    Box charges ₹
                    <input className={`${erpInputCls} mt-1`} value={extraBox} onChange={(e) => setExtraBox(e.target.value)} />
                  </label>
                  <label className="text-[10px] font-semibold uppercase text-[var(--color-jewelry-black,#1a1814)]/45">
                    Stone charges ₹
                    <input className={`${erpInputCls} mt-1`} value={extraStone} onChange={(e) => setExtraStone(e.target.value)} />
                  </label>
                  <label className="text-[10px] font-semibold uppercase text-[var(--color-jewelry-black,#1a1814)]/45">
                    Extra amount ₹
                    <input className={`${erpInputCls} mt-1`} value={extraAmt} onChange={(e) => setExtraAmt(e.target.value)} />
                  </label>
                </div>
                <button type="button" className={erpBtnGhost} onClick={applyDebitExtras}>
                  Apply to selected products
                </button>
                <p className="text-sm font-semibold text-[var(--color-jewelry-black,#1a1814)]">
                  Current total {formatErpInr(computeReturnTotals(previewLines).net)} · billed {formatErpInr(origTotals.net)}
                </p>
                <button type="button" className={erpBtnPrimary} onClick={issueDebitFromPreview}>
                  Issue debit note
                </button>
              </div>
            )}
          </div>
        </div>
      ) : null}

      {noteOpen ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/45 p-3 sm:items-center">
          <div className={`${erpCardCls} w-full max-w-lg`}>
            <h3 className="mb-3 text-lg font-bold text-[var(--color-jewelry-black,#1a1814)]">
              {noteKind === 'credit' ? 'Issue credit note' : 'Issue debit note'}
            </h3>
            <div className="space-y-2">
              <label className="text-[10px] font-semibold uppercase text-[var(--color-jewelry-black,#1a1814)]/45">
                Amount ₹
                <input className={`${erpInputCls} mt-1`} value={noteAmount} onChange={(e) => setNoteAmount(e.target.value)} />
              </label>
              <label className="text-[10px] font-semibold uppercase text-[var(--color-jewelry-black,#1a1814)]/45">
                Date
                <ErpDateInput value={noteDate} onChange={setNoteDate} />
              </label>
              <label className="text-[10px] font-semibold uppercase text-[var(--color-jewelry-black,#1a1814)]/45">
                Reason (optional)
                <input className={`${erpInputCls} mt-1`} value={noteReason} onChange={(e) => setNoteReason(e.target.value)} />
              </label>
              <label className="text-[10px] font-semibold uppercase text-[var(--color-jewelry-black,#1a1814)]/45">
                Remarks (optional)
                <input className={`${erpInputCls} mt-1`} value={noteRemarks} onChange={(e) => setNoteRemarks(e.target.value)} />
              </label>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <button type="button" className={erpBtnPrimary} disabled={busy} onClick={() => void issueNote()}>
                Issue {noteKind === 'credit' ? 'credit note' : 'debit note'}
              </button>
              <button type="button" className={erpBtnGhost} onClick={() => setNoteOpen(false)}>
                Later
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

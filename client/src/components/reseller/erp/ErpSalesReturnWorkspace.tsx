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
import { fetchGstInvoiceItems, type GstInvoiceItem } from '@/components/reseller/erp/ErpGstInvoiceItemsPanel'
import { useErpOperator } from '@/context/ErpOperatorContext'
import { formatErpInr } from '@/lib/reseller-erp-modules'
import { formatErpDateDdMmYyyy } from '@/lib/erp-date-format'
import {
  anyReturnLinesChanged,
  applyExtrasToReturnLine,
  billedMetalRatePerG,
  billLinesForReturn,
  computeReturnTotals,
  formatReturnWeight,
  parseReturnSlabSettings,
  recalcReturnLine,
  returnLineChanged,
  returnLineMetSlabDisplay,
  sourceBillsUseLaneLedger,
  uniqueBilledRates,
  type ReturnLine,
} from '@/lib/erp-sales-return'
import { downloadCreditDebitNoteExcel } from '@/lib/erp-note-excel'
import { downloadCreditDebitNotePdf } from '@/lib/erp-note-pdf'
import type { ErpRateSlab } from '@/lib/erp-billing-pricing'
import {
  Camera,
  CheckSquare,
  Eye,
  FileSpreadsheet,
  FileText,
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
  const { canDeleteRecords } = useErpOperator()
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
  const [previewSnapshots, setPreviewSnapshots] = useState<Map<string, ReturnLine>>(new Map())
  const [previewSelectedKeys, setPreviewSelectedKeys] = useState<Set<string>>(new Set())
  const [bulkWastage, setBulkWastage] = useState('')
  const [bulkMc, setBulkMc] = useState('')
  const [bulkWeight, setBulkWeight] = useState('')
  const [bulkInvoiceItem, setBulkInvoiceItem] = useState('')
  const [customGold, setCustomGold] = useState('')
  const [customSilver, setCustomSilver] = useState('')
  const [rateMode, setRateMode] = useState<'original' | 'custom'>('original')
  const [extraBox, setExtraBox] = useState('')
  const [extraStone, setExtraStone] = useState('')
  const [extraAmt, setExtraAmt] = useState('')
  const [invoiceItems, setInvoiceItems] = useState<GstInvoiceItem[]>([])
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
    void fetchGstInvoiceItems().then(setInvoiceItems)
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
    const cloned = chosen.map((l) => ({ ...l }))
    const snaps = new Map<string, ReturnLine>()
    for (const line of cloned) snaps.set(line.source_line_key, { ...line })
    setPreviewLines(cloned)
    setPreviewSnapshots(snaps)
    setPreviewSelectedKeys(new Set(cloned.map((l) => l.source_line_key)))
    setPreviewKind(kind)
    setRateMode('original')
    setCustomGold('')
    setCustomSilver('')
    setBulkWastage('')
    setBulkMc('')
    setBulkWeight('')
    setBulkInvoiceItem('')
    setExtraBox('')
    setExtraStone('')
    setExtraAmt('')
    setMsg(null)
  }

  const togglePreviewSelectAll = () => {
    if (previewSelectedKeys.size === previewLines.length) {
      setPreviewSelectedKeys(new Set())
    } else {
      setPreviewSelectedKeys(new Set(previewLines.map((l) => l.source_line_key)))
    }
  }

  const togglePreviewLine = (key: string) => {
    setPreviewSelectedKeys((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const applyBulkPreviewEdits = () => {
    const wastage = bulkWastage.trim() !== '' ? Number(bulkWastage) : null
    const mc = bulkMc.trim() !== '' ? Number(bulkMc) : null
    const weight = bulkWeight.trim() !== '' ? Number(bulkWeight) : null
    const invoiceName = bulkInvoiceItem.trim()
    if (!previewSelectedKeys.size) {
      setMsg('Select at least one product in the preview to apply changes.')
      return
    }
    if (wastage == null && mc == null && weight == null && !invoiceName) {
      setMsg('Enter wastage, MC, weight, or invoice item to apply.')
      return
    }
    setPreviewLines((prev) =>
      prev.map((line) => {
        if (!previewSelectedKeys.has(line.source_line_key)) return line
        const hsn =
          invoiceName && invoiceItems.find((it) => it.name === invoiceName)?.hsn
            ? invoiceItems.find((it) => it.name === invoiceName)?.hsn
            : line.hsn_code
        return {
          ...line,
          ...(weight != null && Number.isFinite(weight)
            ? { weightGm: weight, originalWeightGm: weight }
            : {}),
          ...(wastage != null && Number.isFinite(wastage) ? { wastage_pct: wastage } : {}),
          ...(mc != null && Number.isFinite(mc) ? { mc_rate: mc } : {}),
          ...(invoiceName
            ? { invoice_item_name: invoiceName, hsn_code: hsn || line.hsn_code }
            : {}),
        }
      }),
    )
    setMsg(
      `Updated ${previewSelectedKeys.size} product${previewSelectedKeys.size === 1 ? '' : 's'}. Amounts recalculated.`,
    )
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
  const billedRatePreview = useMemo(
    () =>
      previewLines.map((l) =>
        recalcReturnLine(l, billById.get(l.source_bill_id), slabSettings, 'custom', 0, 0),
      ),
    [previewLines, billById, slabSettings],
  )
  const linesAdjusted = useMemo(
    () => anyReturnLinesChanged(previewLines, previewSnapshots),
    [previewLines, previewSnapshots],
  )
  const sameRatePreview = useMemo(
    () =>
      previewLines.map((line, idx) => {
        const snap = previewSnapshots.get(line.source_line_key)
        if (snap && returnLineChanged(line, snap)) return billedRatePreview[idx]
        return originalPreview[idx]
      }),
    [previewLines, previewSnapshots, originalPreview, billedRatePreview],
  )
  const origTotals = useMemo(() => computeReturnTotals(sameRatePreview), [sameRatePreview])
  const custTotals = useMemo(() => computeReturnTotals(customPreview), [customPreview])

  const billedRates = useMemo(() => uniqueBilledRates(previewLines, billById), [previewLines, billById])
  const billedRateLabel = useMemo(() => {
    const parts: string[] = []
    if (billedRates.silver.length === 1) parts.push(`₹${billedRates.silver[0]}/g Silver`)
    else if (billedRates.silver.length > 1)
      parts.push(billedRates.silver.map((r) => `₹${r}/g Silver`).join(', '))
    if (billedRates.gold.length === 1) parts.push(`₹${billedRates.gold[0]}/g Gold`)
    else if (billedRates.gold.length > 1)
      parts.push(billedRates.gold.map((r) => `₹${r}/g Gold`).join(', '))
    return parts.join(' · ')
  }, [billedRates])

  const applyDebitExtras = () => {
    const box = Number(extraBox) || 0
    const stone = Number(extraStone) || 0
    const amount = Number(extraAmt) || 0
    if (!box && !stone && !amount) return
    if (!previewSelectedKeys.size) {
      setMsg('Select products in the preview to apply debit adjustments.')
      return
    }
    setPreviewLines((prev) =>
      prev.map((l) =>
        previewSelectedKeys.has(l.source_line_key)
          ? applyExtrasToReturnLine(l, { box, stone, amount })
          : l,
      ),
    )
  }

  const takeReturn = async () => {
    if (!previewLines.length) return
    if (rateMode === 'custom' && !(goldN > 0 || silverN > 0)) {
      setMsg('Enter a gold or silver rate, or choose Same billed rate.')
      return
    }
    const useCustom = rateMode === 'custom'
    const lines = useCustom ? customPreview : sameRatePreview
    const totals = useCustom ? custTotals : origTotals
    const first = selectedBills[0]
    const lane = sourceBillsUseLaneLedger(selectedBills)
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
          rateSlab: first?.session?.rateSlab || 'R',
          goldPerG: useCustom && goldN > 0 ? goldN : first?.session?.goldPerG ?? null,
          silverPerG: useCustom && silverN > 0 ? silverN : first?.session?.silverPerG ?? null,
          displayRates: first?.session?.displayRates ?? null,
          wholesaleGold: first?.session?.wholesaleGold ?? null,
          wholesaleSilver: first?.session?.wholesaleSilver ?? null,
          goldSlabRShowMc: first?.session?.goldSlabRShowMc,
          mobile: customer?.mobile || first?.session?.mobile || '',
          reason: 'Sales return',
          ledgerScope: lane ? 'lane' : 'official',
          paymentMethod: first?.session?.paymentMethod || null,
        },
      })
      setPreviewKind(null)
      setSelectedKeys(new Set())
      setSelectedBills([])
      setPreviewLines([])
      await loadHistory()
      await loadReturnedKeys()
      setMsg(`Return ${ssr.data.bill.bill_number} saved. Stock restored.`)
      await downloadCreditDebitNotePdf({
        kind: 'credit',
        bill: ssr.data.bill,
        shopName,
        customerMobile: customer?.mobile || first?.session?.mobile || null,
        slabSettingsRaw: auth.user && (auth.user as WholesaleUserFields).reseller_slab_settings,
      })
    } catch (e) {
      setMsg(erpErr(e))
    } finally {
      setBusy(false)
    }
  }

  const issueDebitFromPreview = async () => {
    const totals = computeReturnTotals(previewLines)
    const extraNet = Math.max(0, totals.net - origTotals.net)
    const amt = extraNet > 0 ? extraNet : totals.net
    if (!(amt > 0)) {
      setMsg('Enter an extra amount for the debit note.')
      return
    }
    const first = selectedBills[0]
    const lane = sourceBillsUseLaneLedger(selectedBills)
    const taxable = Math.round((amt / 1.03) * 100) / 100
    const gst = Math.round((amt - taxable) * 100) / 100
    setBusy(true)
    setMsg(null)
    try {
      const res = await axios.post<{ bill: ErpBill }>('/api/reseller/erp/bills', {
        bill_type: 'debit',
        status: 'completed',
        customer_id: first?.customer_id || customer?.id || null,
        customer_name: first?.customer_name || customer?.name || '',
        total_inr: amt,
        bill_date: new Date().toISOString().slice(0, 10),
        lines: previewLines,
        session: {
          reason: 'Debit adjustment',
          againstBills: selectedBills.map((b) => b.bill_number).filter(Boolean).join(', '),
          taxableInr: taxable,
          gstInr: gst,
          mobile: customer?.mobile || first?.session?.mobile || '',
          ledgerScope: lane ? 'lane' : 'official',
          paymentMethod: first?.session?.paymentMethod || null,
        },
      })
      setPreviewKind(null)
      setMsg(`Debit note ${res.data.bill.bill_number} issued.`)
      await downloadCreditDebitNotePdf({
        kind: 'debit',
        bill: res.data.bill,
        shopName,
        customerMobile: customer?.mobile || first?.session?.mobile || null,
      })
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
                          className="inline-flex items-center gap-1 text-[#1a1814] underline"
                          onClick={() =>
                            void downloadCreditDebitNotePdf({
                              kind: 'credit',
                              bill: b,
                              shopName,
                              customerMobile: b.session?.mobile || null,
                              slabSettingsRaw:
                                auth.user && (auth.user as WholesaleUserFields).reseller_slab_settings,
                            })
                          }
                        >
                          <FileText className="size-3.5" />
                          PDF
                        </button>
                        <button
                          type="button"
                          className="inline-flex items-center gap-1 text-[#1a1814] underline"
                          onClick={() =>
                            void downloadCreditDebitNoteExcel(
                              b,
                              'credit',
                              auth.user && (auth.user as WholesaleUserFields).reseller_slab_settings,
                            )
                          }
                        >
                          <FileSpreadsheet className="size-3.5" />
                          Excel
                        </button>
                        {canDeleteRecords ? (
                          <button
                            type="button"
                            className="text-[var(--kc-accent,#c41e3a)]"
                            onClick={() => void deleteReturn(b.id)}
                          >
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

            <div className="mb-3 flex flex-wrap items-center gap-2">
              <button type="button" className={erpBtnGhost} onClick={togglePreviewSelectAll}>
                {previewSelectedKeys.size === previewLines.length ? (
                  <CheckSquare className="size-4" />
                ) : (
                  <Square className="size-4" />
                )}
                {previewSelectedKeys.size === previewLines.length ? 'Deselect all' : 'Select all'}
              </button>
              <span className="text-xs text-[#1a1814]/70">
                {previewSelectedKeys.size} of {previewLines.length} selected
                {linesAdjusted ? ' · amounts recalculated from your edits' : ''}
              </span>
            </div>

            <div className="mb-3 rounded-xl border border-[var(--color-slate-700,#e8e4df)] bg-[var(--color-slate-900,#faf8f4)] p-3">
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-[#1a1814]">
                Apply to selected products
              </p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-[#1a1814]">Wastage %</p>
                  <input
                    className={`${erpInputCls} mt-1`}
                    value={bulkWastage}
                    onChange={(e) => setBulkWastage(e.target.value)}
                    placeholder="Leave blank"
                    inputMode="decimal"
                  />
                </div>
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-[#1a1814]">MC</p>
                  <input
                    className={`${erpInputCls} mt-1`}
                    value={bulkMc}
                    onChange={(e) => setBulkMc(e.target.value)}
                    placeholder="Leave blank"
                    inputMode="decimal"
                  />
                </div>
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-[#1a1814]">Weight g</p>
                  <input
                    className={`${erpInputCls} mt-1`}
                    value={bulkWeight}
                    onChange={(e) => setBulkWeight(e.target.value)}
                    placeholder="Leave blank"
                    inputMode="decimal"
                  />
                </div>
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-[#1a1814]">Invoice item</p>
                  <select
                    className={`${erpInputCls} mt-1`}
                    value={bulkInvoiceItem}
                    onChange={(e) => setBulkInvoiceItem(e.target.value)}
                  >
                    <option value="">No change</option>
                    {invoiceItems.map((it) => (
                      <option key={it.id} value={it.name}>
                        {it.name}
                        {it.hsn ? ` · ${it.hsn}` : ''}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <button type="button" className={`${erpBtnGhost} mt-2`} onClick={applyBulkPreviewEdits}>
                Apply to {previewSelectedKeys.size || 0} selected
              </button>
            </div>

            <div className="space-y-2">
              {previewLines.map((line, idx) => {
                const shown =
                  previewKind === 'return'
                    ? rateMode === 'custom'
                      ? customPreview[idx] || line
                      : sameRatePreview[idx] || line
                    : line
                const previewOn = previewSelectedKeys.has(line.source_line_key)
                const billedRate = billedMetalRatePerG(line, billById.get(line.source_bill_id))
                const sourceBill = billById.get(line.source_bill_id)
                const sourceSlab = (sourceBill?.session?.rateSlab || 'R') as ErpRateSlab
                const metDisplay = returnLineMetSlabDisplay(line, sourceSlab)
                return (
                <div
                  key={line.source_line_key}
                  className={`rounded-xl border p-3 ${
                    previewOn
                      ? erpListItemSelected
                      : 'border-[var(--color-slate-700,#e8e4df)] bg-white'
                  }`}
                >
                  <div className="mb-2 flex items-start justify-between gap-2">
                    <label className="flex min-w-0 flex-1 items-start gap-2">
                      <input
                        type="checkbox"
                        className="mt-1"
                        checked={previewOn}
                        onChange={() => togglePreviewLine(line.source_line_key)}
                      />
                      <span className="min-w-0">
                        <span className="block text-sm font-semibold text-[#1a1814]">{line.name}</span>
                        {line.barcode ? (
                          <span className="block text-xs text-[#1a1814]/65">{line.barcode}</span>
                        ) : null}
                      </span>
                    </label>
                    <button
                      type="button"
                      className="text-[var(--kc-accent,#c41e3a)]"
                      onClick={() => {
                        setPreviewLines((prev) => prev.filter((_, i) => i !== idx))
                        setPreviewSelectedKeys((prev) => {
                          const next = new Set(prev)
                          next.delete(line.source_line_key)
                          return next
                        })
                      }}
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-[#1a1814]">Weight g</p>
                      <input
                        className={`${erpInputCls} mt-1`}
                        value={line.weightGm ?? ''}
                        onChange={(e) => {
                          const v = Number(e.target.value)
                          setPreviewLines((prev) =>
                            prev.map((p, i) =>
                              i === idx
                                ? {
                                    ...p,
                                    weightGm: Number.isFinite(v) ? v : 0,
                                    originalWeightGm: Number.isFinite(v) ? v : 0,
                                  }
                                : p,
                            ),
                          )
                        }}
                      />
                    </div>
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-[#1a1814]">Wastage %</p>
                      <input
                        className={`${erpInputCls} mt-1`}
                        value={line.wastage_pct ?? ''}
                        onChange={(e) => {
                          const v = Number(e.target.value)
                          setPreviewLines((prev) =>
                            prev.map((p, i) =>
                              i === idx ? { ...p, wastage_pct: Number.isFinite(v) ? v : null } : p,
                            ),
                          )
                        }}
                      />
                    </div>
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-[#1a1814]">
                        {metDisplay.label}
                      </p>
                      <p className="mt-1 flex min-h-[44px] items-center rounded-xl border border-[var(--color-slate-700,#e8e4df)] bg-[var(--color-slate-900,#faf8f4)] px-3 text-sm tabular-nums text-[#1a1814]">
                        {metDisplay.value || '—'}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-[#1a1814]">MC</p>
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
                    </div>
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-[#1a1814]">Amount</p>
                      <p className="mt-1 flex min-h-[44px] items-center rounded-xl border border-[var(--color-slate-700,#e8e4df)] bg-[var(--color-slate-900,#faf8f4)] px-3 text-sm font-semibold tabular-nums text-[#1a1814]">
                        {formatErpInr(shown.lineTotalInr)}
                      </p>
                    </div>
                  </div>
                  <div className="mt-2">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-[#1a1814]">Invoice item</p>
                    <select
                      className={`${erpInputCls} mt-1`}
                      value={line.invoice_item_name || ''}
                      onChange={(e) => {
                        const name = e.target.value
                        const hsn = invoiceItems.find((it) => it.name === name)?.hsn || line.hsn_code
                        setPreviewLines((prev) =>
                          prev.map((p, i) => (i === idx ? { ...p, invoice_item_name: name || null, hsn_code: hsn || p.hsn_code } : p)),
                        )
                      }}
                    >
                      <option value="">{line.invoice_item_name || 'Choose invoice item…'}</option>
                      {invoiceItems.map((it) => (
                        <option key={it.id} value={it.name}>
                          {it.name}
                          {it.hsn ? ` · ${it.hsn}` : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                  <p className="mt-1 text-xs text-[#1a1814]/70">
                    {line.source_bill_number}
                    {line.barcode ? ` · ${line.barcode}` : ''}
                    {line.wastage_pct != null ? ` · Wastage ${line.wastage_pct}%` : ''}
                    {billedRate > 0 ? ` · Billed ₹${billedRate}/g` : ''}
                    {` · Billed ${formatErpInr(line.originalTotalInr)}`}
                  </p>
                </div>
                )
              })}
            </div>

            {previewKind === 'return' ? (
              <div className="mt-4 space-y-3">
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className={rateMode === 'original' ? erpBtnPrimary : erpBtnGhost}
                    onClick={() => setRateMode('original')}
                  >
                    Same billed rate
                    {billedRateLabel ? ` ${billedRateLabel}` : ''}
                    {` ${formatErpInr(origTotals.net)}`}
                  </button>
                  <button
                    type="button"
                    className={rateMode === 'custom' ? erpBtnPrimary : erpBtnGhost}
                    onClick={() => setRateMode('custom')}
                  >
                    Rate I put{(goldN > 0 || silverN > 0) ? ` ${formatErpInr(custTotals.net)}` : ''}
                  </button>
                </div>
                {rateMode === 'custom' ? (
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-[#1a1814]">Gold ₹/g</p>
                      <input className={`${erpInputCls} mt-1`} value={customGold} onChange={(e) => setCustomGold(e.target.value)} inputMode="decimal" />
                    </div>
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-[#1a1814]">Silver ₹/g</p>
                      <input
                        className={`${erpInputCls} mt-1`}
                        value={customSilver}
                        onChange={(e) => setCustomSilver(e.target.value)}
                        inputMode="decimal"
                      />
                    </div>
                  </div>
                ) : null}
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {[
                    { l: 'Original net', v: origTotals.net, show: true },
                    { l: 'Rate I put', v: custTotals.net, show: goldN > 0 || silverN > 0 },
                    { l: rateMode === 'custom' ? 'GST (new)' : 'GST', v: rateMode === 'custom' ? custTotals.gst : origTotals.gst, show: true },
                    { l: 'Weight', v: origTotals.weightGm, show: true, weight: true },
                  ]
                    .filter((x) => x.show)
                    .map((c) => (
                      <div key={c.l} className="rounded-xl border border-[var(--color-slate-700,#e8e4df)] px-3 py-2">
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-[#1a1814]">{c.l}</p>
                        <p className="text-sm font-semibold tabular-nums text-[#1a1814]">
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
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-[#1a1814]">Box charges ₹</p>
                    <input className={`${erpInputCls} mt-1`} value={extraBox} onChange={(e) => setExtraBox(e.target.value)} />
                  </div>
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-[#1a1814]">Stone charges ₹</p>
                    <input className={`${erpInputCls} mt-1`} value={extraStone} onChange={(e) => setExtraStone(e.target.value)} />
                  </div>
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-[#1a1814]">Extra amount ₹</p>
                    <input className={`${erpInputCls} mt-1`} value={extraAmt} onChange={(e) => setExtraAmt(e.target.value)} />
                  </div>
                </div>
                <button type="button" className={erpBtnGhost} onClick={applyDebitExtras}>
                  Apply to selected products
                </button>
                <p className="text-sm font-semibold text-[#1a1814]">
                  Current total {formatErpInr(computeReturnTotals(previewLines).net)} · billed {formatErpInr(origTotals.net)}
                </p>
                <button type="button" className={erpBtnPrimary} disabled={busy} onClick={() => void issueDebitFromPreview()}>
                  Issue debit note
                </button>
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  )
}

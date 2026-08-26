'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import axios from '@/lib/axios'
import { Download, Lock, Trash2, Upload } from 'lucide-react'
import { useErpOperator } from '@/context/ErpOperatorContext'
import { RESELLER_ERP_PATH } from '@/lib/routes'
import { formatErpInr } from '@/lib/reseller-erp-modules'
import { erpBtnPrimary, erpCardCls, erpErr, erpInputCls } from '@/components/reseller/erp/erp-ui'
import { ResellerErpShell } from '@/components/reseller/erp/ResellerErpShell'
import { ErpNavVisibilityPanel } from '@/components/reseller/erp/ErpNavVisibilityPanel'
import { useErpNavVisibility } from '@/hooks/useErpNavVisibility'

type ShadowBill = {
  id: number | string
  bill_number: string
  lane: 'hitesh' | 'jainav'
  customer_name?: string
  customer_gstin?: string
  payment_method?: string
  total_inr: number
  bill_date: string
  status: string
  source?: string
}

export function ErpShadowWorkspace({ embedded = false }: { embedded?: boolean }) {
  const router = useRouter()
  const { shadowUnlocked, lockShadow, operator } = useErpOperator()
  const { reload: reloadNavVisibility } = useErpNavVisibility()
  const [lane, setLane] = useState<'hitesh' | 'jainav' | 'both'>('both')
  const [bills, setBills] = useState<ShadowBill[]>([])
  const [summary, setSummary] = useState<{ hitesh: { count: number; total: number }; jainav: { count: number; total: number } } | null>(null)
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [msg, setMsg] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [newKey, setNewKey] = useState('')
  const [purgeConfirm, setPurgeConfirm] = useState('')
  const [billForm, setBillForm] = useState({
    customerName: '',
    customerGstin: '',
    paymentMethod: 'cash',
    totalInr: '',
    notes: '',
    barcode: '',
    laneOverride: '' as '' | 'hitesh' | 'jainav',
  })

  const load = useCallback(async () => {
    if (!shadowUnlocked) return
    setBusy(true)
    try {
      const qLane = lane === 'both' ? '' : lane
      const [bRes, sRes] = await Promise.all([
        axios.get<{ bills: ShadowBill[] }>('/api/reseller/erp/shadow/bills', {
          params: { lane: qLane || undefined, from: date, to: date },
        }),
        axios.get<{ summary: typeof summary; date: string }>('/api/reseller/erp/shadow/summary', {
          params: { from: date },
        }),
      ])
      setBills(bRes.data.bills || [])
      setSummary(sRes.data.summary || null)
    } catch (e) {
      setMsg(erpErr(e))
    } finally {
      setBusy(false)
    }
  }, [shadowUnlocked, lane, date])

  useEffect(() => {
    if (!shadowUnlocked) {
      if (!embedded) router.replace(RESELLER_ERP_PATH)
      return
    }
    void load()
  }, [shadowUnlocked, load, router, embedded])

  const downloadExport = async (exportLane: 'hitesh' | 'jainav' | 'both', detail = false) => {
    setBusy(true)
    try {
      const path = detail ? '/api/reseller/erp/shadow/export-detail' : '/api/reseller/erp/shadow/export'
      if (detail) {
        const res = await axios.get(path, {
          params: { lane: exportLane, from: date, to: date },
        })
        const blob = new Blob([JSON.stringify(res.data, null, 2)], { type: 'application/json' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `ledger-detail-${exportLane}-${date}.json`
        a.click()
        URL.revokeObjectURL(url)
      } else {
        const res = await axios.get(path, {
          params: { lane: exportLane, from: date, to: date },
          responseType: 'blob',
        })
        const url = URL.createObjectURL(res.data)
        const a = document.createElement('a')
        a.href = url
        a.download = `ledger-${exportLane}-${date}.csv`
        a.click()
        URL.revokeObjectURL(url)
      }
      setMsg(`Downloaded ${exportLane} file — save it to your phone or pen drive.`)
    } catch (e) {
      setMsg(erpErr(e))
    } finally {
      setBusy(false)
    }
  }

  const purgeJainav = async () => {
    if (purgeConfirm !== 'PURGE') {
      setMsg('Type PURGE in the confirmation box.')
      return
    }
    if (!confirm('Permanently delete Jainav (cash) bills for this date? This cannot be undone.')) return
    setBusy(true)
    try {
      const res = await axios.post<{ deletedCount: number; estimatesDeleted?: number }>('/api/reseller/erp/shadow/purge', {
        lane: 'jainav',
        from: date,
        to: date,
        confirm: 'PURGE',
      })
      const estNote =
        res.data.estimatesDeleted && res.data.estimatesDeleted > 0
          ? ` · ${res.data.estimatesDeleted} linked estimate(s) removed`
          : ''
      setMsg(`Purged ${res.data.deletedCount} Jainav bill(s)${estNote}.`)
      setPurgeConfirm('')
      await load()
    } catch (e) {
      setMsg(erpErr(e))
    } finally {
      setBusy(false)
    }
  }

  const saveBill = async () => {
    const total = Number(billForm.totalInr)
    if (!Number.isFinite(total) || total <= 0) {
      setMsg('Enter a valid bill total.')
      return
    }
    setBusy(true)
    try {
      await axios.post('/api/reseller/erp/shadow/bills', {
        customer_name: billForm.customerName,
        customer_gstin: billForm.customerGstin || null,
        payment_method: billForm.paymentMethod,
        total_inr: total,
        notes: billForm.notes,
        lane: billForm.laneOverride || undefined,
        bill_date: date,
        lines: billForm.barcode
          ? [{ barcode: billForm.barcode.trim(), lineTotalInr: total, qty: 1 }]
          : [{ description: 'Sale', lineTotalInr: total, qty: 1 }],
      })
      setMsg('Bill saved.')
      setBillForm({
        customerName: '',
        customerGstin: '',
        paymentMethod: 'cash',
        totalInr: '',
        notes: '',
        barcode: '',
        laneOverride: '',
      })
      await load()
    } catch (e) {
      setMsg(erpErr(e))
    } finally {
      setBusy(false)
    }
  }

  const saveNewKey = async () => {
    if (newKey.length < 3) {
      setMsg('Secret sequence must be at least 3 characters.')
      return
    }
    setBusy(true)
    try {
      await axios.put('/api/reseller/erp/shadow/settings', { secretSequence: newKey })
      setMsg('Secret key updated.')
      setNewKey('')
    } catch (e) {
      setMsg(erpErr(e))
    } finally {
      setBusy(false)
    }
  }

  if (!operator?.shadowAccess) {
    if (embedded) {
      return <p className="text-sm text-[var(--color-jewelry-black,#1a1814)]">You do not have access to this area.</p>
    }
    return (
      <ResellerErpShell title="Access denied" backHref={RESELLER_ERP_PATH}>
        <p className="text-sm text-[var(--color-jewelry-black,#1a1814)]">You do not have access to this area.</p>
      </ResellerErpShell>
    )
  }

  const body = (
    <>
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <label className="text-xs font-medium text-[var(--color-jewelry-black,#1a1814)]/70">
          Business date
          <input
            type="date"
            className={`${erpInputCls} mt-1`}
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </label>
        <div className="flex flex-wrap gap-2">
          {(['both', 'hitesh', 'jainav'] as const).map((l) => (
            <button
              key={l}
              type="button"
              className={`min-h-[40px] rounded-xl border px-3 text-xs font-semibold capitalize ${
                lane === l
                  ? 'border-[var(--kc-accent,#c41e3a)] bg-[var(--kc-accent,#c41e3a)]/10 text-[var(--kc-accent,#c41e3a)]'
                  : 'border-[var(--color-slate-700,#e8e4df)] bg-white text-[var(--color-jewelry-black,#1a1814)]'
              }`}
              onClick={() => setLane(l)}
            >
              {l === 'both' ? 'Both' : l}
            </button>
          ))}
        </div>
      </div>

      {summary ? (
        <div className="mb-4 grid grid-cols-2 gap-3">
          <div className={erpCardCls}>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-jewelry-black,#1a1814)]/45">
              Hitesh (GST / online)
            </p>
            <p className="mt-1 text-lg font-semibold text-[var(--color-jewelry-black,#1a1814)]">
              {summary.hitesh.count} · {formatErpInr(summary.hitesh.total)}
            </p>
          </div>
          <div className={erpCardCls}>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-jewelry-black,#1a1814)]/45">
              Jainav (cash)
            </p>
            <p className="mt-1 text-lg font-semibold text-[var(--color-jewelry-black,#1a1814)]">
              {summary.jainav.count} · {formatErpInr(summary.jainav.total)}
            </p>
          </div>
        </div>
      ) : null}

      {msg ? (
        <p className="mb-4 rounded-xl border border-[var(--color-slate-700,#e8e4df)] bg-white px-3 py-2 text-xs text-[var(--color-jewelry-black,#1a1814)]">
          {msg}
        </p>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <div className={erpCardCls}>
          <p className="mb-3 text-sm font-semibold text-[var(--color-jewelry-black,#1a1814)]">Quick entry</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-xs font-medium text-[var(--color-jewelry-black,#1a1814)]/70 sm:col-span-2">
              Customer name
              <input className={`${erpInputCls} mt-1`} value={billForm.customerName} onChange={(e) => setBillForm((f) => ({ ...f, customerName: e.target.value }))} />
            </label>
            <label className="text-xs font-medium text-[var(--color-jewelry-black,#1a1814)]/70">
              GSTIN (optional)
              <input className={`${erpInputCls} mt-1 font-mono text-xs`} value={billForm.customerGstin} onChange={(e) => setBillForm((f) => ({ ...f, customerGstin: e.target.value.toUpperCase() }))} />
            </label>
            <label className="text-xs font-medium text-[var(--color-jewelry-black,#1a1814)]/70">
              Payment
              <select className={`${erpInputCls} mt-1`} value={billForm.paymentMethod} onChange={(e) => setBillForm((f) => ({ ...f, paymentMethod: e.target.value }))}>
                <option value="cash">Cash</option>
                <option value="upi">UPI / GPay</option>
                <option value="gpay">GPay</option>
                <option value="card">Card</option>
                <option value="bank">Bank</option>
                <option value="mixed">Cash + online</option>
              </select>
            </label>
            <label className="text-xs font-medium text-[var(--color-jewelry-black,#1a1814)]/70">
              Barcode (optional)
              <input className={`${erpInputCls} mt-1 font-mono`} value={billForm.barcode} onChange={(e) => setBillForm((f) => ({ ...f, barcode: e.target.value.toUpperCase() }))} />
            </label>
            <label className="text-xs font-medium text-[var(--color-jewelry-black,#1a1814)]/70">
              Total ₹
              <input className={`${erpInputCls} mt-1`} inputMode="decimal" value={billForm.totalInr} onChange={(e) => setBillForm((f) => ({ ...f, totalInr: e.target.value }))} />
            </label>
            <label className="text-xs font-medium text-[var(--color-jewelry-black,#1a1814)]/70 sm:col-span-2">
              Force lane (optional)
              <select className={`${erpInputCls} mt-1`} value={billForm.laneOverride} onChange={(e) => setBillForm((f) => ({ ...f, laneOverride: e.target.value as '' | 'hitesh' | 'jainav' }))}>
                <option value="">Auto (GST/online → Hitesh, cash → Jainav)</option>
                <option value="hitesh">Hitesh</option>
                <option value="jainav">Jainav</option>
              </select>
            </label>
          </div>
          <button type="button" className={`${erpBtnPrimary} mt-3`} disabled={busy} onClick={() => void saveBill()}>
            Save bill
          </button>
        </div>

        <div className={erpCardCls}>
          <p className="mb-3 text-sm font-semibold text-[var(--color-jewelry-black,#1a1814)]">End of day</p>
          <p className="mb-3 text-[11px] leading-relaxed text-[var(--color-jewelry-black,#1a1814)]/60">
            Plug in your phone or pen drive. Tap export — when the browser asks where to save, pick the USB drive or
            phone folder. After files are safely copied, type PURGE below for Jainav cash bills.
          </p>
          <div className="space-y-2">
            <button type="button" className={`${erpBtnPrimary} w-full justify-center`} onClick={() => void downloadExport('jainav')}>
              <Download className="size-4" />
              Export Jainav (CSV)
            </button>
            <button type="button" className={`${erpBtnPrimary} w-full justify-center`} onClick={() => void downloadExport('hitesh')}>
              <Download className="size-4" />
              Export Hitesh (CSV)
            </button>
            <button type="button" className={`${erpBtnPrimary} w-full justify-center`} onClick={() => void downloadExport('both', true)}>
              <Upload className="size-4" />
              Export both (full JSON)
            </button>
          </div>
          <div className="mt-4 rounded-xl border border-red-200 bg-red-50/60 p-3">
            <p className="text-xs font-semibold text-red-900">Purge Jainav after backup</p>
            <p className="mt-1 text-[11px] text-red-800/80">
              Hard-deletes cash bills for {date}. Stock stays sold. Type PURGE to confirm.
            </p>
            <input
              className={`${erpInputCls} mt-2`}
              placeholder="Type PURGE"
              value={purgeConfirm}
              onChange={(e) => setPurgeConfirm(e.target.value)}
            />
            <button
              type="button"
              className="mt-2 inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-red-700 px-4 text-sm font-semibold text-white"
              disabled={busy}
              onClick={() => void purgeJainav()}
            >
              <Trash2 className="size-4" />
              Purge Jainav bills
            </button>
          </div>
          <div className="mt-4 border-t border-[var(--color-slate-700,#e8e4df)] pt-4">
            <p className="mb-2 text-xs font-semibold text-[var(--color-jewelry-black,#1a1814)]">Change secret key</p>
            <input
              className={erpInputCls}
              placeholder="New sequence e.g. F9Rs*"
              value={newKey}
              onChange={(e) => setNewKey(e.target.value)}
            />
            <button type="button" className={`${erpBtnPrimary} mt-2`} disabled={busy} onClick={() => void saveNewKey()}>
              Update key
            </button>
          </div>
        </div>
      </div>

      <ErpNavVisibilityPanel onSaved={() => void reloadNavVisibility()} />

      <div className={`${erpCardCls} mt-4`}>
        <p className="mb-3 text-sm font-semibold text-[var(--color-jewelry-black,#1a1814)]">
          Bills · {date} {busy ? '…' : ''}
        </p>
        <ul className="space-y-2">
          {bills.map((b) => (
            <li
              key={b.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--color-slate-700,#e8e4df)] bg-white px-3 py-2.5 text-sm"
            >
              <div>
                <span className="font-mono font-semibold text-[var(--color-jewelry-black,#1a1814)]">{b.bill_number}</span>
                <span className="ml-2 rounded-full bg-[var(--color-slate-900,#f7f4ef)] px-2 py-0.5 text-[10px] font-semibold uppercase">
                  {b.source === 'official_gst' ? 'GST' : b.lane}
                </span>
                <p className="text-xs text-[var(--color-jewelry-black,#1a1814)]/55">
                  {b.customer_name || 'Walk-in'} · {b.payment_method || 'cash'}
                  {b.customer_gstin ? ` · ${b.customer_gstin}` : ''}
                </p>
              </div>
              <span className="font-semibold tabular-nums text-[var(--color-jewelry-black,#1a1814)]">
                {formatErpInr(b.total_inr)}
              </span>
            </li>
          ))}
          {!bills.length ? (
            <li className="py-6 text-center text-sm text-[var(--color-jewelry-black,#1a1814)]/45">No bills for this date.</li>
          ) : null}
        </ul>
      </div>
    </>
  )

  if (embedded) return body

  return (
    <ResellerErpShell
      title="Hitesh & Jainav"
      subtitle="Day close · export · purge"
      backHref={RESELLER_ERP_PATH}
      actions={
        <button
          type="button"
          className={erpBtnPrimary}
          onClick={() => {
            void lockShadow()
            router.push(RESELLER_ERP_PATH)
          }}
        >
          <Lock className="size-4" />
          Lock & exit
        </button>
      }
    >
      {body}
    </ResellerErpShell>
  )
}

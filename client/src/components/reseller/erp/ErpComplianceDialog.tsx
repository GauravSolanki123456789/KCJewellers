'use client'

import { useState, useEffect } from 'react'
import axios from '@/lib/axios'
import { Download, FileCheck, Loader2, Truck } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import type { ErpBill } from '@/components/reseller/erp/erp-ui'
import { erpBtnGhost, erpBtnPrimary, erpErr } from '@/components/reseller/erp/erp-ui'

type Kind = 'e-invoice' | 'e-way'

export type ErpComplianceSuccessMeta = {
  irn?: string
  ewb_no?: string
  sandbox?: boolean
  message?: string
}

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  bill: ErpBill | null
  kind: Kind
  onSuccess: (bill: ErpBill, meta?: ErpComplianceSuccessMeta) => void
  onDownloadTaxInvoice?: (bill: ErpBill) => void | Promise<void>
}

export function ErpComplianceDialog({ open, onOpenChange, bill, kind, onSuccess, onDownloadTaxInvoice }: Props) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [regenerateMode, setRegenerateMode] = useState(false)
  const [withEway, setWithEway] = useState(true)

  const isEinvoice = kind === 'e-invoice'
  const existingIrn = bill?.compliance?.einvoice?.irn
  const existingEwb = bill?.compliance?.eway?.ewb_no
  const hasExisting = isEinvoice ? !!existingIrn : !!existingEwb
  const showDownloadOnly = hasExisting && !regenerateMode && isEinvoice && !!onDownloadTaxInvoice && !(withEway && !existingEwb)

  useEffect(() => {
    if (!open) {
      setRegenerateMode(false)
      setWithEway(true)
      setError('')
    } else {
      setWithEway(!bill?.compliance?.eway?.ewb_no)
    }
  }, [open, bill?.id, bill?.compliance?.eway?.ewb_no])

  const runDownload = async () => {
    if (!bill || !onDownloadTaxInvoice) return
    setBusy(true)
    setError('')
    try {
      await onDownloadTaxInvoice(bill)
      onOpenChange(false)
    } catch (e) {
      setError(erpErr(e))
    } finally {
      setBusy(false)
    }
  }

  const run = async () => {
    if (!bill) return
    setBusy(true)
    setError('')
    try {
      const path = isEinvoice
        ? `/api/reseller/erp/bills/${bill.id}/e-invoice`
        : `/api/reseller/erp/bills/${bill.id}/e-way`
      const res = await axios.post<{
        success: boolean
        message?: string
        bill: ErpBill
        irn?: string
        ewb_no?: string
        sandbox?: boolean
      }>(path, isEinvoice ? { withEway: withEway && !existingEwb } : {})
      onOpenChange(false)
      onSuccess(res.data.bill, {
        irn: res.data.irn,
        ewb_no: res.data.ewb_no,
        sandbox: res.data.sandbox,
        message: res.data.message,
      })
    } catch (e) {
      setError(erpErr(e))
    } finally {
      setBusy(false)
    }
  }

  if (!bill) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto border-[var(--color-slate-700,#e8e4df)] bg-white sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-[var(--color-jewelry-black,#1a1814)]">
            {isEinvoice ? (
              <FileCheck className="size-5 shrink-0 text-emerald-700" />
            ) : (
              <Truck className="size-5 shrink-0 text-blue-700" />
            )}
            Generate {isEinvoice ? 'e-invoice' : 'e-way bill'}?
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3 text-sm text-[var(--color-jewelry-black,#1a1814)]">
          <p className="text-[var(--color-jewelry-black,#1a1814)]/70">
            Bill <span className="font-semibold text-emerald-800">{bill.bill_number}</span> ·{' '}
            {bill.customer_name || 'Customer'}
          </p>
          {isEinvoice && existingIrn ? (
            <p className="break-all text-xs font-medium text-emerald-800">Already generated — IRN: {existingIrn}</p>
          ) : null}
          {!isEinvoice && existingEwb ? (
            <p className="text-xs font-medium text-emerald-800">Already generated — EWB: {existingEwb}</p>
          ) : null}
          {existingEwb ? (
            <p className="text-xs font-medium text-blue-800">E-way bill: {existingEwb}</p>
          ) : null}

          {isEinvoice && !existingEwb ? (
            <label className="flex min-h-[44px] cursor-pointer items-start gap-3 rounded-xl border border-[var(--color-slate-700,#e8e4df)] bg-[var(--color-slate-900,#faf8f4)] px-3 py-3">
              <input
                type="checkbox"
                className="mt-1 size-4 accent-emerald-700"
                checked={withEway}
                onChange={(e) => setWithEway(e.target.checked)}
              />
              <span>
                <span className="block font-semibold text-[var(--color-jewelry-black,#1a1814)]">
                  Also generate e-way bill
                </span>
                <span className="mt-0.5 block text-xs text-[var(--color-jewelry-black,#1a1814)]/60">
                  Creates the e-way bill with this e-invoice. Leave unchecked for e-invoice only — you can generate e-way later from the E-way button.
                </span>
              </span>
            </label>
          ) : null}
        </div>

        {error ? (
          <p className="break-words rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">
            {error}
          </p>
        ) : null}

        <DialogFooter className="flex-col gap-2 sm:flex-row sm:gap-2">
          <button type="button" className={erpBtnGhost} disabled={busy} onClick={() => onOpenChange(false)}>
            Cancel
          </button>
          {showDownloadOnly ? (
            <>
              <button
                type="button"
                className={erpBtnGhost}
                disabled={busy}
                onClick={() => setRegenerateMode(true)}
              >
                Regenerate
              </button>
              <button type="button" className={erpBtnPrimary} disabled={busy} onClick={() => void runDownload()}>
                {busy ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
                Download {bill.bill_number}-einvoice
              </button>
            </>
          ) : (
            <button type="button" className={erpBtnPrimary} disabled={busy} onClick={() => void run()}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : null}
              {isEinvoice && withEway && !existingEwb
                ? existingIrn
                  ? 'Yes, generate e-way'
                  : 'Yes, generate both'
                : 'Yes, generate'}
            </button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

'use client'

import { useState } from 'react'
import axios from '@/lib/axios'
import { FileCheck, Loader2, Truck } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import type { ErpBill } from '@/components/reseller/erp/erp-ui'
import { erpBtnGhost, erpBtnPrimary, erpErr } from '@/components/reseller/erp/erp-ui'

type Kind = 'e-invoice' | 'e-way'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  bill: ErpBill | null
  kind: Kind
  onSuccess: (bill: ErpBill) => void
}

export function ErpComplianceDialog({ open, onOpenChange, bill, kind, onSuccess }: Props) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const isEinvoice = kind === 'e-invoice'
  const existingIrn = bill?.compliance?.einvoice?.irn
  const existingEwb = bill?.compliance?.eway?.ewb_no

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
      }>(path)
      onSuccess(res.data.bill)
      onOpenChange(false)
      alert(
        res.data.message ||
          (isEinvoice
            ? `E-invoice generated${res.data.irn ? `: ${res.data.irn}` : ''}`
            : `E-way bill generated${res.data.ewb_no ? `: ${res.data.ewb_no}` : ''}`) +
          (res.data.sandbox ? '\n\n(Sandbox mode)' : ''),
      )
    } catch (e) {
      setError(erpErr(e))
    } finally {
      setBusy(false)
    }
  }

  if (!bill) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-[var(--color-slate-700,#e8e4df)] bg-white sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-[var(--color-jewelry-black,#1a1814)]">
            {isEinvoice ? (
              <FileCheck className="size-5 text-emerald-700" />
            ) : (
              <Truck className="size-5 text-blue-700" />
            )}
            Generate {isEinvoice ? 'e-invoice' : 'e-way bill'}?
          </DialogTitle>
          <DialogDescription className="space-y-2 text-[var(--color-jewelry-black,#1a1814)]/65">
            <span className="block">
              Bill <span className="font-semibold text-emerald-800">{bill.bill_number}</span> ·{' '}
              {bill.customer_name || 'Customer'}
            </span>
            <span className="block rounded-lg border border-amber-200/80 bg-amber-50/80 px-2.5 py-2 text-xs text-amber-950">
              GST details from your ERP GST settings will be validated and sent to GSTZen
              {isEinvoice ? ' e-invoice API' : ' e-way bill API'}. Use sandbox token in E-invoice settings for
              testing.
            </span>
            {isEinvoice && existingIrn ? (
              <span className="block text-xs font-medium text-emerald-700">Already generated — IRN: {existingIrn}</span>
            ) : null}
            {!isEinvoice && existingEwb ? (
              <span className="block text-xs font-medium text-emerald-700">Already generated — EWB: {existingEwb}</span>
            ) : null}
          </DialogDescription>
        </DialogHeader>

        {error ? (
          <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">{error}</p>
        ) : null}

        <DialogFooter className="gap-2 sm:gap-2">
          <button type="button" className={erpBtnGhost} disabled={busy} onClick={() => onOpenChange(false)}>
            Cancel
          </button>
          <button type="button" className={erpBtnPrimary} disabled={busy} onClick={() => void run()}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : null}
            Yes, generate
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

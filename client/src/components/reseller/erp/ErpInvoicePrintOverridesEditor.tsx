'use client'

import { useState } from 'react'
import axios from '@/lib/axios'
import { erpBtnGhost, erpInputCls } from '@/components/reseller/erp/erp-ui'
import type { ErpBill } from '@/components/reseller/erp/erp-ui'
import type { ErpBillSession } from '@/lib/erp-bill-session'
import { buildErpSalesPdfPayload } from '@/lib/erp-sales-pdf'
import type { ErpInvoicePrintOverrides } from '@/lib/erp-sales-invoice-template'
import type { PdfShareSheetPayload } from '@/lib/pdf-share'
import { ChevronDown, ChevronUp, Loader2, RefreshCw } from 'lucide-react'

type Props = {
  bill: ErpBill
  brandLabel: string
  slabSettingsRaw?: unknown
  taxInvoiceMode?: boolean
  onRegenerated: (payload: PdfShareSheetPayload) => void
}

export function ErpInvoicePrintOverridesEditor({
  bill,
  brandLabel,
  slabSettingsRaw,
  taxInvoiceMode,
  onRegenerated,
}: Props) {
  const session = (bill.session || {}) as ErpBillSession
  const initial = session.invoicePrintOverrides || {}
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [copy1, setCopy1] = useState(initial.copyLabels?.[0] || '')
  const [copy2, setCopy2] = useState(initial.copyLabels?.[1] || '')
  const [copy3, setCopy3] = useState(initial.copyLabels?.[2] || '')
  const [documentTitle, setDocumentTitle] = useState(initial.documentTitle || '')
  const [termsText, setTermsText] = useState((initial.terms || []).join('\n'))
  const [electronicRefLabel, setElectronicRefLabel] = useState(initial.electronicRefLabel || '')

  const buildOverrides = (): ErpInvoicePrintOverrides => {
    const overrides: ErpInvoicePrintOverrides = {}
    const labels = [copy1.trim(), copy2.trim(), copy3.trim()]
    if (labels.some(Boolean)) overrides.copyLabels = labels as [string, string, string]
    if (documentTitle.trim()) overrides.documentTitle = documentTitle.trim()
    const terms = termsText
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean)
    if (terms.length) overrides.terms = terms
    if (electronicRefLabel.trim()) overrides.electronicRefLabel = electronicRefLabel.trim()
    return overrides
  }

  const regenerate = async (persist: boolean) => {
    setBusy(true)
    try {
      const overrides = buildOverrides()
      const nextSession: ErpBillSession = {
        ...session,
        invoicePrintOverrides: Object.keys(overrides).length ? overrides : undefined,
      }
      let workingBill = bill
      if (persist && bill.id) {
        await axios.put(`/api/reseller/erp/bills/${bill.id}`, { session: nextSession })
        workingBill = { ...bill, session: nextSession }
      } else {
        workingBill = { ...bill, session: nextSession }
      }
      const payload = await buildErpSalesPdfPayload({
        bill: workingBill,
        brandLabel,
        customerName: bill.customer_name,
        mobile: session.mobile,
        customerAddress: session.address,
        customerPan: session.pan,
        customerGst: session.customerGst,
        slabSettingsRaw,
        taxInvoiceMode,
      })
      onRegenerated(payload)
    } catch (e) {
      alert((e as Error)?.message || 'Could not regenerate PDF')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="rounded-xl border border-[var(--color-slate-700,#e8e4df)] bg-white">
      <button
        type="button"
        className="flex w-full min-h-[44px] items-center justify-between gap-2 px-3 py-2 text-left"
        onClick={() => setOpen((v) => !v)}
      >
        <span className="text-xs font-semibold text-[var(--color-jewelry-black,#1a1814)]">
          Edit invoice format (this bill)
        </span>
        {open ? (
          <ChevronUp className="size-4 shrink-0 text-[var(--color-jewelry-black,#1a1814)]/40" />
        ) : (
          <ChevronDown className="size-4 shrink-0 text-[var(--color-jewelry-black,#1a1814)]/40" />
        )}
      </button>

      {open ? (
        <div className="space-y-3 border-t border-[var(--color-slate-700,#e8e4df)] px-3 py-3">
          <p className="text-[11px] leading-relaxed text-[var(--color-jewelry-black,#1a1814)]/55">
            Override copy labels, title, or terms for all 3 A4 pages on this bill only. Leave blank to use shop
            defaults from Print formats → Tax invoice PDF.
          </p>
          <label className="block text-[11px] font-medium text-[var(--color-jewelry-black,#1a1814)]/60">
            Document title
            <input
              className={`${erpInputCls} mt-1 text-xs`}
              placeholder="Leave blank for default"
              value={documentTitle}
              onChange={(e) => setDocumentTitle(e.target.value)}
            />
          </label>
          <div className="grid gap-2">
            {(['Page 1 label', 'Page 2 label', 'Page 3 label'] as const).map((label, i) => (
              <label key={label} className="text-[11px] font-medium text-[var(--color-jewelry-black,#1a1814)]/60">
                {label}
                <input
                  className={`${erpInputCls} mt-1 text-xs`}
                  placeholder={
                    i === 0
                      ? 'ORIGINAL FOR RECIPIENT'
                      : i === 1
                        ? 'DUPLICATE FOR TRANSPORTER'
                        : 'TRIPLICATE FOR SUPPLIER'
                  }
                  value={[copy1, copy2, copy3][i]}
                  onChange={(e) => {
                    if (i === 0) setCopy1(e.target.value)
                    else if (i === 1) setCopy2(e.target.value)
                    else setCopy3(e.target.value)
                  }}
                />
              </label>
            ))}
          </div>
          <label className="block text-[11px] font-medium text-[var(--color-jewelry-black,#1a1814)]/60">
            Terms (one per line)
            <textarea
              className={`${erpInputCls} mt-1 min-h-[80px] py-2 text-xs leading-relaxed`}
              placeholder="Leave blank for shop default terms"
              value={termsText}
              onChange={(e) => setTermsText(e.target.value)}
            />
          </label>
          <label className="block text-[11px] font-medium text-[var(--color-jewelry-black,#1a1814)]/60">
            Electronic ref label
            <input
              className={`${erpInputCls} mt-1 text-xs`}
              placeholder="Electronic Ref No :"
              value={electronicRefLabel}
              onChange={(e) => setElectronicRefLabel(e.target.value)}
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={erpBtnGhost}
              disabled={busy}
              onClick={() => void regenerate(false)}
            >
              {busy ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
              Preview PDF
            </button>
            <button
              type="button"
              className={erpBtnGhost}
              disabled={busy}
              onClick={() => void regenerate(true)}
            >
              Save &amp; regenerate PDF
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}

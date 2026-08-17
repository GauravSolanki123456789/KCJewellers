'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { printErpBillThermal } from '@/lib/erp-billing-print'
import {
  CheckCircle2,
  Download,
  MessageCircle,
  Printer,
  Receipt,
  Share2,
} from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import type { ErpBill } from '@/components/reseller/erp/erp-ui'
import { erpBtnGhost, erpBtnPrimary, erpInputCls } from '@/components/reseller/erp/erp-ui'
import { formatErpInr, resellerErpModulePath } from '@/lib/reseller-erp-modules'
import {
  downloadPdfBlob,
  printPdfBlob,
  sharePdfFileNative,
  type PdfShareSheetPayload,
} from '@/lib/pdf-share'
import { customerWhatsAppHref } from '@/lib/catalog-inquiry-shared'
import { openExternalUrl, shouldUseSameTabWhatsAppNavigation } from '@/lib/cart-order-whatsapp'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  bill: ErpBill | null
  pdfPayload: PdfShareSheetPayload | null
  defaultMobile?: string
  onDone: () => void
  /** saved = after Save bill; e-invoice = after e-invoice generation */
  variant?: 'saved' | 'e-invoice' | 'e-way'
  complianceNote?: string | null
  autoDownload?: boolean
}

export function ErpBillSavedModal({
  open,
  onOpenChange,
  bill,
  pdfPayload,
  defaultMobile = '',
  onDone,
  variant = 'saved',
  complianceNote = null,
  autoDownload = true,
}: Props) {
  const [mobile, setMobile] = useState(defaultMobile)
  const [autoDownloaded, setAutoDownloaded] = useState(false)
  const [thermalBusy, setThermalBusy] = useState(false)

  useEffect(() => {
    if (open) {
      setMobile(defaultMobile)
      setAutoDownloaded(false)
    }
  }, [open, defaultMobile])

  useEffect(() => {
    if (!open || !pdfPayload || autoDownload === false || autoDownloaded) return
    downloadPdfBlob(pdfPayload.blob, pdfPayload.filename)
    setAutoDownloaded(true)
  }, [open, pdfPayload, autoDownloaded, autoDownload])

  const handlePrint = useCallback(() => {
    if (!pdfPayload) return
    printPdfBlob(pdfPayload.blob)
  }, [pdfPayload])

  const handleDownload = useCallback(() => {
    if (!pdfPayload) return
    downloadPdfBlob(pdfPayload.blob, pdfPayload.filename)
  }, [pdfPayload])

  const handleWhatsApp = useCallback(() => {
    if (!pdfPayload) return
    const text = pdfPayload.fallbackWhatsAppText
    const href = customerWhatsAppHref(mobile.trim() || null, text)
    if (href) {
      openExternalUrl(href, { preferNewTab: !shouldUseSameTabWhatsAppNavigation() })
    }
  }, [pdfPayload, mobile])

  const handleShare = useCallback(async () => {
    if (!pdfPayload) return
    const result = await sharePdfFileNative(pdfPayload.blob, pdfPayload.filename, {
      title: pdfPayload.title,
      text: pdfPayload.text,
    })
    if (result === 'unsupported' || result === 'failed') {
      handleDownload()
    }
  }, [pdfPayload, handleDownload])

  const printThermalReceipt = useCallback(async () => {
    if (!bill?.id) return
    setThermalBusy(true)
    try {
      const msg = await printErpBillThermal(bill.id)
      alert(msg)
    } catch (e) {
      const msg =
        (e as Error)?.message ||
        (e as { response?: { data?: { error?: string } } })?.response?.data?.error ||
        'Could not print on Epson — start the local print agent on this PC and check Hardware → Epson billing printer.'
      alert(msg)
    } finally {
      setThermalBusy(false)
    }
  }, [bill?.id])

  const closeAndDone = () => {
    onOpenChange(false)
    onDone()
  }

  if (!bill) return null

  const isEinvoice = variant === 'e-invoice'
  const isEway = variant === 'e-way'
  const title = isEinvoice ? 'E-invoice generated' : isEway ? 'E-way bill generated' : 'Bill saved'
  const Icon = isEinvoice || isEway ? CheckCircle2 : CheckCircle2

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto border-[var(--color-slate-700,#e8e4df)] bg-white sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-[var(--color-jewelry-black,#1a1814)]">
            <Icon className="size-5 text-emerald-600" />
            {title}
          </DialogTitle>
          <DialogDescription className="text-[var(--color-jewelry-black,#1a1814)]/65">
            <span className="font-semibold text-emerald-800">{bill.bill_number}</span> ·{' '}
            {bill.customer_name || 'Walk-in'} · {formatErpInr(bill.total_inr)}
          </DialogDescription>
        </DialogHeader>

        <p className="rounded-xl border border-emerald-200/80 bg-emerald-50/70 px-3 py-2 text-xs leading-relaxed text-emerald-950">
          {isEinvoice
            ? 'Your tax invoice PDF was downloaded automatically. Share or print it below.'
            : isEway
              ? 'E-way bill was generated successfully. You can share related documents below.'
              : 'Your invoice PDF was downloaded automatically. You can print it or send it on WhatsApp below.'}
          {complianceNote ? (
            <span className="mt-2 block font-medium text-emerald-900">{complianceNote}</span>
          ) : null}
        </p>

        <div className="grid grid-cols-2 gap-2">
          <button type="button" className={erpBtnGhost} onClick={handleDownload}>
            <Download className="size-4" />
            Download again
          </button>
          <button type="button" className={erpBtnGhost} onClick={handlePrint}>
            <Printer className="size-4" />
            Print PDF
          </button>
          {variant === 'saved' ? (
            <button
              type="button"
              className={erpBtnGhost}
              disabled={thermalBusy}
              onClick={() => void printThermalReceipt()}
            >
              <Receipt className="size-4" />
              {thermalBusy ? 'Printing…' : 'Print on Epson'}
            </button>
          ) : null}
          <button type="button" className={`${erpBtnGhost} col-span-2`} onClick={() => void handleShare()}>
            <Share2 className="size-4" />
            Share PDF
          </button>
        </div>

        <div className="rounded-xl border border-[var(--color-slate-700,#e8e4df)] bg-[var(--color-slate-900,#faf8f4)] p-3">
          <label className="block text-xs font-semibold uppercase tracking-wide text-[var(--color-jewelry-black,#1a1814)]/55">
            WhatsApp mobile
            <span className="ml-1 font-normal normal-case text-[var(--color-jewelry-black,#1a1814)]/45">
              (change temporarily to send elsewhere)
            </span>
            <input
              type="tel"
              inputMode="numeric"
              className={`${erpInputCls} mt-1.5`}
              placeholder="10-digit mobile"
              value={mobile}
              onChange={(e) => setMobile(e.target.value.replace(/\D/g, '').slice(0, 10))}
            />
          </label>
          <button
            type="button"
            className={`${erpBtnPrimary} mt-3 w-full`}
            onClick={handleWhatsApp}
            disabled={!pdfPayload}
          >
            <MessageCircle className="size-4" />
            Send bill on WhatsApp
          </button>
        </div>

        <DialogFooter className="flex-col gap-2 sm:flex-col">
          <button type="button" className={`${erpBtnPrimary} w-full`} onClick={closeAndDone}>
            Done
          </button>
          {variant === 'saved' ? (
            <div className="flex w-full flex-col gap-2 sm:flex-row">
              <Link href={resellerErpModulePath('billing')} className={`${erpBtnGhost} flex-1 justify-center`}>
                <Receipt className="size-4" />
                Back to billing
              </Link>
              <Link
                href={resellerErpModulePath('sales-bills')}
                className={`${erpBtnGhost} flex-1 justify-center border-emerald-300 bg-emerald-50 text-emerald-900`}
              >
                Sales bills
              </Link>
            </div>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

type ConfirmProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  customerName: string
  netTotal: number
  itemCount: number
  busy?: boolean
  onConfirm: () => void
}

export function ErpSaveBillConfirmDialog({
  open,
  onOpenChange,
  customerName,
  netTotal,
  itemCount,
  busy,
  onConfirm,
}: ConfirmProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-[var(--color-slate-700,#e8e4df)] bg-white sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-[var(--color-jewelry-black,#1a1814)]">Save &amp; generate bill?</DialogTitle>
          <DialogDescription className="text-[var(--color-jewelry-black,#1a1814)]/65">
            This will save the sale, mark scanned items as sold, and generate a tax invoice PDF for{' '}
            <span className="font-semibold">{customerName || 'walk-in customer'}</span> ({itemCount} item
            {itemCount !== 1 ? 's' : ''}, {formatErpInr(netTotal)}).
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:gap-2">
          <button type="button" className={erpBtnGhost} disabled={busy} onClick={() => onOpenChange(false)}>
            Cancel
          </button>
          <button type="button" className={erpBtnPrimary} disabled={busy} onClick={onConfirm}>
            Yes, save bill
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

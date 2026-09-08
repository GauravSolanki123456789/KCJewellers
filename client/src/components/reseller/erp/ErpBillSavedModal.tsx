'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import axios from '@/lib/axios'
import { printErpBillThermal } from '@/lib/erp-billing-print'
import {
  CheckCircle2,
  Download,
  FileText,
  Loader2,
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
  nextScbBillNumberFromList,
  suggestManualBillNumberFromList,
} from '@/lib/erp-next-bill-number'
import { validateGstin } from '@/lib/erp-gstin'
import {
  downloadPdfBlob,
  openPdfBlobInViewer,
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
  autoOpenViewer?: boolean
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
  autoOpenViewer = true,
}: Props) {
  const [mobile, setMobile] = useState(defaultMobile)
  const [autoOpened, setAutoOpened] = useState(false)
  const [waMode, setWaMode] = useState<'pick' | 'customer'>('customer')
  const [thermalBusy, setThermalBusy] = useState(false)

  useEffect(() => {
    if (open) {
      setMobile(defaultMobile)
      setAutoOpened(false)
    }
  }, [open, defaultMobile])

  useEffect(() => {
    if (!open || !pdfPayload || autoOpenViewer === false || autoOpened) return
    void openPdfBlobInViewer(pdfPayload.blob, {
      filename: pdfPayload.filename,
      title: pdfPayload.title,
      text: pdfPayload.text,
      fallbackWhatsAppText: pdfPayload.fallbackWhatsAppText,
      fallbackWhatsAppHref: pdfPayload.fallbackWhatsAppHref,
      customerWhatsAppHref: customerWhatsAppHref(mobile.trim() || defaultMobile || null, pdfPayload.fallbackWhatsAppText),
      customerMobile: mobile.trim() || defaultMobile || pdfPayload.customerMobile || null,
      brandLabel: pdfPayload.brandLabel,
    })
    setAutoOpened(true)
  }, [open, pdfPayload, autoOpened, autoOpenViewer, mobile, defaultMobile])

  const handlePrint = useCallback(() => {
    if (!pdfPayload) return
    printPdfBlob(pdfPayload.blob)
  }, [pdfPayload])

  const handleDownload = useCallback(() => {
    if (!pdfPayload) return
    downloadPdfBlob(pdfPayload.blob, pdfPayload.filename)
  }, [pdfPayload])

  const handleOpenPdf = useCallback(() => {
    if (!pdfPayload) return
    void openPdfBlobInViewer(pdfPayload.blob, {
      filename: pdfPayload.filename,
      title: pdfPayload.title,
      text: pdfPayload.text,
      fallbackWhatsAppText: pdfPayload.fallbackWhatsAppText,
      fallbackWhatsAppHref: pdfPayload.fallbackWhatsAppHref,
      customerWhatsAppHref: customerWhatsAppHref(mobile.trim() || null, pdfPayload.fallbackWhatsAppText),
      customerMobile: mobile.trim() || pdfPayload.customerMobile || null,
      brandLabel: pdfPayload.brandLabel,
    })
  }, [pdfPayload, mobile])

  const handleWhatsApp = useCallback(() => {
    if (!pdfPayload) return
    const text = pdfPayload.fallbackWhatsAppText
    const href =
      waMode === 'customer'
        ? customerWhatsAppHref(mobile.trim() || null, text)
        : pdfPayload.fallbackWhatsAppHref?.trim() || null
    if (href) {
      openExternalUrl(href, { preferNewTab: !shouldUseSameTabWhatsAppNavigation() })
    }
  }, [pdfPayload, mobile, waMode])

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

        {(isEinvoice || isEway || complianceNote) ? (
          <p className="rounded-xl border border-emerald-200/80 bg-emerald-50/70 px-3 py-2 text-xs leading-relaxed text-emerald-950">
            {isEinvoice
              ? 'Tax invoice PDF is ready below.'
              : isEway
                ? 'E-way bill was generated successfully.'
                : null}
            {complianceNote ? (
              <span className="mt-2 block font-medium text-emerald-900">{complianceNote}</span>
            ) : null}
          </p>
        ) : null}

        <div className="grid grid-cols-2 gap-2">
          <button type="button" className={erpBtnGhost} onClick={handleOpenPdf}>
            <FileText className="size-4" />
            Open PDF tab
          </button>
          <button type="button" className={erpBtnGhost} onClick={handleDownload}>
            <Download className="size-4" />
            Download
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
              (customer number for direct send)
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
          <label className="mt-2 block text-xs font-semibold uppercase tracking-wide text-[var(--color-jewelry-black,#1a1814)]/55">
            WhatsApp mode
            <select
              className={`${erpInputCls} mt-1.5 text-sm font-medium normal-case`}
              value={waMode}
              onChange={(e) => setWaMode(e.target.value as 'pick' | 'customer')}
            >
              <option value="customer">Send to customer number (from your WhatsApp)</option>
              <option value="pick">Pick contact / share sheet (current)</option>
            </select>
          </label>
          <button
            type="button"
            className={`${erpBtnPrimary} mt-3 w-full`}
            onClick={handleWhatsApp}
            disabled={!pdfPayload}
          >
            <MessageCircle className="size-4" />
            {waMode === 'customer' ? 'Send bill to customer on WhatsApp' : 'WhatsApp (pick contact)'}
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
  onConfirm: (opts: { billNumber: string; placeOfSupply: string }) => void
  /** When false, sale goes to Hitesh/Jainav ledger — no GST invoice. */
  isOfficialGst?: boolean
  customerGst?: string
  defaultPlaceOfSupply?: string
}

const MANUAL_BILL_VALUE = '__manual__'

export function ErpSaveBillConfirmDialog({
  open,
  onOpenChange,
  customerName,
  netTotal,
  itemCount,
  busy,
  onConfirm,
  isOfficialGst = true,
  customerGst = '',
  defaultPlaceOfSupply = '',
}: ConfirmProps) {
  const [autoNumber, setAutoNumber] = useState('')
  const [manualSuggestion, setManualSuggestion] = useState('')
  const [billChoice, setBillChoice] = useState('')
  const [manualBillNumber, setManualBillNumber] = useState('')
  const [placeOfSupply, setPlaceOfSupply] = useState('')
  const [localErr, setLocalErr] = useState('')
  const [numberLoadErr, setNumberLoadErr] = useState('')

  useEffect(() => {
    if (!open || !isOfficialGst) return
    setPlaceOfSupply(defaultPlaceOfSupply)
    setLocalErr('')
    setNumberLoadErr('')
    setBillChoice(MANUAL_BILL_VALUE)
    setManualBillNumber('')
    void axios
      .get<{ bill_number: string; manual_suggestion?: string | null }>(
        '/api/reseller/erp/bills/next-number',
        { params: { bill_type: 'sale' } },
      )
      .then((res) => {
        const n = res.data.bill_number || ''
        const manual = res.data.manual_suggestion || ''
        if (manual) {
          setManualSuggestion(manual)
          setManualBillNumber(manual)
        }
        if (n) {
          setAutoNumber(n)
          setBillChoice(n)
          setNumberLoadErr('')
        } else {
          setAutoNumber('')
          setNumberLoadErr('Auto bill number unavailable — enter your bill number below.')
        }
      })
      .catch(() => {
        void axios
          .get<{ bills: { bill_number: string }[] }>('/api/reseller/erp/bills', {
            params: { bill_type: 'sale', from: '2020-01-01' },
          })
          .then((listRes) => {
            const numbers = (listRes.data.bills || []).map((b) => b.bill_number)
            const n = nextScbBillNumberFromList(numbers)
            const manual = suggestManualBillNumberFromList(numbers)
            setAutoNumber(n)
            setBillChoice(n)
            setNumberLoadErr('')
            if (manual) {
              setManualSuggestion(manual)
              setManualBillNumber(manual)
            }
          })
          .catch(() => {
            setAutoNumber('SCB001')
            setBillChoice('SCB001')
            setNumberLoadErr('Auto bill number unavailable — enter your bill number below.')
          })
      })
  }, [open, isOfficialGst, defaultPlaceOfSupply])

  const handleConfirm = () => {
    setLocalErr('')
    if (isOfficialGst) {
      const gstCheck = validateGstin(customerGst, 'Customer GST number')
      if (!gstCheck.ok) {
        setLocalErr(gstCheck.error)
        return
      }
      let billNumber = billChoice
      if (billChoice === MANUAL_BILL_VALUE) {
        billNumber = manualBillNumber.trim().toUpperCase()
        if (!billNumber) {
          setLocalErr('Enter a bill number (e.g. SA1362).')
          return
        }
        if (!/^[A-Z0-9][A-Z0-9\-./]{0,62}$/i.test(billNumber)) {
          setLocalErr('Bill number has invalid characters.')
          return
        }
      } else if (!billNumber) {
        setLocalErr('Select a bill number or enter one manually.')
        return
      }
      if (!placeOfSupply.trim()) {
        setLocalErr('Place of supply is required for GST bills.')
        return
      }
      onConfirm({ billNumber, placeOfSupply: placeOfSupply.trim() })
      return
    }
    onConfirm({ billNumber: '', placeOfSupply: '' })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto border-[var(--color-slate-700,#e8e4df)] bg-white sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-[var(--color-jewelry-black,#1a1814)]">
            {isOfficialGst ? 'Save & generate bill?' : 'Save sale?'}
          </DialogTitle>
          <DialogDescription className="text-[var(--color-jewelry-black,#1a1814)]/65">
            Save the sale for{' '}
            <span className="font-semibold text-[var(--color-jewelry-black,#1a1814)]">
              {customerName || 'walk-in customer'}
            </span>{' '}
            ({itemCount} item{itemCount !== 1 ? 's' : ''}, {formatErpInr(netTotal)}).
          </DialogDescription>
        </DialogHeader>

        {isOfficialGst ? (
          <div className="space-y-3">
            {numberLoadErr ? (
              <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                {numberLoadErr}
              </p>
            ) : null}
            <label className="block text-xs font-semibold text-[var(--color-jewelry-black,#1a1814)]/70">
              Bill number
              <select
                className={`${erpInputCls} mt-1`}
                value={billChoice}
                onChange={(e) => setBillChoice(e.target.value)}
                disabled={busy}
              >
                {autoNumber ? <option value={autoNumber}>Auto — {autoNumber} (next available)</option> : null}
                <option value={MANUAL_BILL_VALUE}>Enter bill number manually…</option>
              </select>
            </label>
            {billChoice === MANUAL_BILL_VALUE || !autoNumber ? (
              <label className="block text-xs font-semibold text-[var(--color-jewelry-black,#1a1814)]/70">
                Manual bill no
                <input
                  className={`${erpInputCls} mt-1 font-mono uppercase`}
                  placeholder={manualSuggestion ? `Suggested: ${manualSuggestion}` : 'e.g. SA1362'}
                  value={manualBillNumber}
                  onChange={(e) => setManualBillNumber(e.target.value.toUpperCase())}
                  disabled={busy}
                />
                {manualSuggestion ? (
                  <p className="mt-1 text-[10px] text-emerald-700">
                    Suggested next: <span className="font-mono font-semibold">{manualSuggestion}</span>
                  </p>
                ) : null}
              </label>
            ) : null}
            <label className="block text-xs font-semibold text-[var(--color-jewelry-black,#1a1814)]/70">
              Place of supply
              <input
                className={`${erpInputCls} mt-1`}
                placeholder="e.g. 37 - Andhra Pradesh"
                value={placeOfSupply}
                onChange={(e) => setPlaceOfSupply(e.target.value)}
                disabled={busy}
                list="erp-place-of-supply-states"
              />
              <datalist id="erp-place-of-supply-states">
                <option value="33 - Tamil Nadu" />
                <option value="37 - Andhra Pradesh" />
                <option value="29 - Karnataka" />
                <option value="36 - Telangana" />
                <option value="27 - Maharashtra" />
                <option value="07 - Delhi" />
                <option value="32 - Kerala" />
                <option value="09 - Uttar Pradesh" />
              </datalist>
            </label>
          </div>
        ) : null}

        {localErr ? (
          <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">{localErr}</p>
        ) : null}

        <DialogFooter className="gap-2 sm:gap-2">
          <button type="button" className={erpBtnGhost} disabled={busy} onClick={() => onOpenChange(false)}>
            Cancel
          </button>
          <button type="button" className={erpBtnPrimary} disabled={busy} onClick={handleConfirm}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : null}
            {isOfficialGst ? 'Yes, save bill' : 'Yes, save sale'}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

type LedgerSavedProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  billNumber: string
  customerName: string
  netTotal: number
  lane: 'hitesh' | 'jainav'
  onDone: () => void
}

/** Shown after a no-GST sale — no PDF, no link to official sales list. */
export function ErpLedgerBillSavedDialog({
  open,
  onOpenChange,
  billNumber,
  customerName,
  netTotal,
  lane,
  onDone,
}: LedgerSavedProps) {
  const closeAndDone = () => {
    onOpenChange(false)
    onDone()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-[var(--color-slate-700,#e8e4df)] bg-white sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-[var(--color-jewelry-black,#1a1814)]">
            <CheckCircle2 className="size-5 text-emerald-600" />
            Sale recorded
          </DialogTitle>
          <DialogDescription className="text-[var(--color-jewelry-black,#1a1814)]/65">
            <span className="font-mono font-semibold text-emerald-800">{billNumber}</span> ·{' '}
            {customerName || 'Walk-in'} · {formatErpInr(netTotal)}
          </DialogDescription>
        </DialogHeader>
        <p className="rounded-xl border border-emerald-200/80 bg-emerald-50/70 px-3 py-2 text-xs leading-relaxed text-emerald-950">
          Items marked sold.
        </p>
        <DialogFooter className="flex-col gap-2 sm:flex-col">
          <button type="button" className={`${erpBtnPrimary} w-full`} onClick={closeAndDone}>
            Done
          </button>
          <Link href={resellerErpModulePath('billing')} className={`${erpBtnGhost} w-full justify-center`}>
            <Receipt className="size-4" />
            Back to billing
          </Link>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

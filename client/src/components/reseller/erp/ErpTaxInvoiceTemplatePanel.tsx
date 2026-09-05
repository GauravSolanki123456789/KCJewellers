'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import axios from '@/lib/axios'
import { pdf } from '@react-pdf/renderer'
import {
  erpBtnGhost,
  erpBtnPrimary,
  erpCardCls,
  erpInputCls,
} from '@/components/reseller/erp/erp-ui'
import { ErpConfigurableTaxInvoicePdfDocument } from '@/lib/erp-marlecha-invoice-pdf'
import { computeErpQuoteTotals } from '@/lib/erp-quote-pdf'
import { sampleBillForTaxInvoicePreview } from '@/lib/erp-tax-invoice-sample'
import { fileToImageDataUrl, runOcrOnImage } from '@/lib/erp-tax-invoice-ocr'
import {
  DEFAULT_MARLECHA_TAX_INVOICE_TEMPLATE,
  normalizeTaxInvoiceTemplate,
  ocrTextToEditableTemplate,
  parseEditableTextToTemplate,
  templateConfigToEditableText,
  type ErpTaxInvoiceTemplateConfig,
} from '@/lib/erp-tax-invoice-template'
import {
  Check,
  Eye,
  FileImage,
  Loader2,
  RotateCcw,
  Save,
  ScanLine,
  Upload,
} from 'lucide-react'

type Variant = 'bill' | 'e-invoice' | 'e-way'

const VARIANT_HINT: Record<Variant, string> = {
  bill: 'Sales bill PDF (3 A4 pages)',
  'e-invoice': 'E-invoice PDF uses the same layout + IRN / QR block',
  'e-way': 'E-way PDF uses the same layout + E-Way Bill number',
}

type Props = {
  variant?: Variant
  compact?: boolean
}

export function ErpTaxInvoiceTemplatePanel({ variant = 'bill', compact }: Props) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [editText, setEditText] = useState(() => templateConfigToEditableText(DEFAULT_MARLECHA_TAX_INVOICE_TEMPLATE))
  const [referencePreview, setReferencePreview] = useState<string | null>(null)
  const [scanBusy, setScanBusy] = useState(false)
  const [scanStatus, setScanStatus] = useState<string | null>(null)
  const [scanProgress, setScanProgress] = useState(0)
  const [saveBusy, setSaveBusy] = useState(false)
  const [previewBusy, setPreviewBusy] = useState(false)
  const [saved, setSaved] = useState(false)
  const [loadBusy, setLoadBusy] = useState(true)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)

  useEffect(() => {
    void axios
      .get<{ settings: { taxInvoiceTemplate?: unknown } }>('/api/reseller/erp/settings')
      .then((res) => {
        const raw = res.data.settings?.taxInvoiceTemplate
        if (raw) {
          const cfg = normalizeTaxInvoiceTemplate(raw)
          setEditText(cfg.sourceText?.trim() || templateConfigToEditableText(cfg))
        }
      })
      .catch(() => {})
      .finally(() => setLoadBusy(false))
  }, [])

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl)
    }
  }, [previewUrl])

  const buildConfig = useCallback((): ErpTaxInvoiceTemplateConfig => {
    const parsed = parseEditableTextToTemplate(editText, DEFAULT_MARLECHA_TAX_INVOICE_TEMPLATE)
    parsed.sourceText = editText
    parsed.updatedAt = new Date().toISOString()
    return parsed
  }, [editText])

  const handleUpload = async (file: File | null) => {
    if (!file) return
    setScanBusy(true)
    setScanStatus('Preparing file…')
    setScanProgress(0)
    setSaved(false)
    try {
      const dataUrl = await fileToImageDataUrl(file, setScanStatus)
      setReferencePreview(dataUrl)
      setScanStatus('Scanning text (OCR)…')
      const ocrText = await runOcrOnImage(dataUrl, (p) => {
        setScanStatus(p.status)
        setScanProgress(p.progress)
      })
      const nextText = ocrTextToEditableTemplate(ocrText)
      setEditText(nextText)
      setScanStatus('Scan complete — review and edit below, then Save.')
    } catch (e) {
      setScanStatus((e as Error)?.message || 'Scan failed')
    } finally {
      setScanBusy(false)
    }
  }

  const applyMarlechaDefault = () => {
    setEditText(templateConfigToEditableText(DEFAULT_MARLECHA_TAX_INVOICE_TEMPLATE))
    setSaved(false)
  }

  const runPreview = async () => {
    setPreviewBusy(true)
    try {
      const settings = await axios.get<{ settings: Record<string, unknown> }>('/api/reseller/erp/settings')
      const gst = (settings.data.settings?.gst || {}) as Record<string, string>
      const bank = (settings.data.settings?.bank || {}) as Record<string, string>
      const bill = sampleBillForTaxInvoicePreview()
      const totals = computeErpQuoteTotals(bill, null)
      const templateConfig = buildConfig()
      const blob = await pdf(
        <ErpConfigurableTaxInvoicePdfDocument
          bill={bill}
          brandName={gst.legalName || templateConfig.shopName}
          totals={totals}
          gst={{
            gstin: gst.gstin,
            legalName: gst.legalName,
            address: gst.address,
            phone: gst.phone,
            email: gst.email,
            placeOfSupply: '37 - Andhra Pradesh',
          }}
          bank={{
            bankName: bank.bankName,
            accountName: bank.accountName,
            accountNo: bank.accountNo,
            ifsc: bank.ifsc,
            branch: bank.branch,
          }}
          customerName={bill.customer_name}
          customerAddress={(bill.session as { address?: string })?.address}
          templateConfig={templateConfig}
          ewayBillNo={variant === 'e-way' ? '123456789012' : null}
          compliance={
            variant === 'e-invoice'
              ? {
                  irn: 'SAMPLE-IRN-FOR-PREVIEW-ONLY',
                  ack_no: '012345678901234',
                  ack_date: '05-09-2026',
                  qrImageSrc: null,
                  sandbox: true,
                }
              : null
          }
        />,
      ).toBlob()
      if (previewUrl) URL.revokeObjectURL(previewUrl)
      setPreviewUrl(URL.createObjectURL(blob))
    } catch (e) {
      alert((e as Error)?.message || 'Preview failed')
    } finally {
      setPreviewBusy(false)
    }
  }

  const save = async () => {
    setSaveBusy(true)
    setSaved(false)
    try {
      const config = buildConfig()
      const toSave = { ...config }
      delete toSave.referenceImage
      await axios.put('/api/reseller/erp/settings', {
        settings: {
          taxInvoiceTemplate: toSave,
        },
      })
      setSaved(true)
    } catch {
      alert('Could not save template')
    } finally {
      setSaveBusy(false)
    }
  }

  if (loadBusy) {
    return (
      <div className={`${erpCardCls} flex min-h-[120px] items-center justify-center gap-2 text-sm text-[var(--color-jewelry-black,#1a1814)]/55`}>
        <Loader2 className="size-4 animate-spin" />
        Loading invoice format…
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className={erpCardCls}>
        <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-[var(--color-jewelry-black,#1a1814)]">
              Tax invoice PDF format
            </p>
            <p className="mt-1 text-xs leading-relaxed text-[var(--color-jewelry-black,#1a1814)]/60">
              {VARIANT_HINT[variant]}. Upload a sample invoice photo or PDF — we scan it line by line, then you
              edit the layout like a notepad. Same format applies to bills, e-invoice, and e-way PDFs. Output is
              3 A4 pages: Original → Duplicate → Triplicate.
            </p>
          </div>
          <button type="button" className={erpBtnGhost} onClick={applyMarlechaDefault}>
            <RotateCcw className="size-4" />
            Reset to Marlecha sample
          </button>
        </div>

        <input
          ref={fileRef}
          type="file"
          accept="image/*,application/pdf"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0]
            void handleUpload(f || null)
            e.target.value = ''
          }}
        />

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className={erpBtnPrimary}
            disabled={scanBusy}
            onClick={() => fileRef.current?.click()}
          >
            {scanBusy ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
            Upload &amp; scan
          </button>
          <button type="button" className={erpBtnGhost} disabled={previewBusy} onClick={() => void runPreview()}>
            {previewBusy ? <Loader2 className="size-4 animate-spin" /> : <Eye className="size-4" />}
            Preview 3-page PDF
          </button>
          <button type="button" className={erpBtnPrimary} disabled={saveBusy} onClick={() => void save()}>
            {saveBusy ? <Loader2 className="size-4 animate-spin" /> : saved ? <Check className="size-4" /> : <Save className="size-4" />}
            {saved ? 'Saved' : 'Done — save format'}
          </button>
        </div>

        {(scanBusy || scanStatus) && (
          <div className="mt-3 rounded-xl border border-[var(--color-slate-700,#e8e4df)] bg-[var(--color-slate-50,#faf9f7)] px-3 py-2">
            <div className="flex items-center gap-2 text-xs text-[var(--color-jewelry-black,#1a1814)]/70">
              {scanBusy ? <ScanLine className="size-4 shrink-0 animate-pulse" /> : <FileImage className="size-4 shrink-0" />}
              <span>{scanStatus}</span>
              {scanBusy && scanProgress > 0 ? <span className="font-mono">{scanProgress}%</span> : null}
            </div>
            {scanBusy ? (
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-black/10">
                <div
                  className="h-full rounded-full bg-[var(--kc-accent,#c41e3a)] transition-all"
                  style={{ width: `${Math.max(scanProgress, 8)}%` }}
                />
              </div>
            ) : null}
          </div>
        )}

        {referencePreview && !compact ? (
          <div className="mt-3">
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--color-jewelry-black,#1a1814)]/45">
              Uploaded reference
            </p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={referencePreview}
              alt="Uploaded invoice reference"
              className="max-h-[200px] w-full rounded-lg border border-[var(--color-slate-700,#e8e4df)] object-contain bg-white"
            />
          </div>
        ) : null}
      </div>

      <div className={erpCardCls}>
        <p className="mb-2 text-sm font-semibold text-[var(--color-jewelry-black,#1a1814)]">
          Edit format (notepad)
        </p>
        <p className="mb-3 text-xs leading-relaxed text-[var(--color-jewelry-black,#1a1814)]/55">
          Edit any line freely. Keep{' '}
          <code className="rounded bg-black/[0.04] px-1 font-mono text-[10px]">[COPY 1]</code>,{' '}
          <code className="rounded bg-black/[0.04] px-1 font-mono text-[10px]">[TABLE]</code>, and{' '}
          <code className="rounded bg-black/[0.04] px-1 font-mono text-[10px]">[TOTAL]</code> markers if you want
          structured parsing on save. Extra bill items are added as new table rows automatically — no extra columns
          or lines are injected.
        </p>
        <textarea
          className={`${erpInputCls} min-h-[${compact ? '240' : '360'}px] whitespace-pre-wrap font-mono text-[11px] leading-relaxed text-[var(--color-jewelry-black,#1a1814)]`}
          style={{ minHeight: compact ? 240 : 360 }}
          value={editText}
          onChange={(e) => {
            setEditText(e.target.value)
            setSaved(false)
          }}
          spellCheck={false}
        />
      </div>

      {previewUrl ? (
        <div className={erpCardCls}>
          <p className="mb-2 text-sm font-semibold text-[var(--color-jewelry-black,#1a1814)]">PDF preview</p>
          <iframe
            title="Tax invoice template preview"
            src={previewUrl}
            className="h-[min(70vh,520px)] w-full rounded-lg border border-[var(--color-slate-700,#e8e4df)] bg-white"
          />
        </div>
      ) : null}
    </div>
  )
}

'use client'

import { useCallback, useRef, useState } from 'react'
import axios from '@/lib/axios'
import { erpBtnGhost, erpBtnPrimary, erpCardCls, erpInputCls } from '@/components/reseller/erp/erp-ui'
import {
  DEFAULT_MARLECHA_SALES_INVOICE_TEMPLATE,
  normalizeSalesInvoiceTemplate,
  type ErpSalesInvoiceTemplateConfig,
} from '@/lib/erp-sales-invoice-template'
import { Eye, FileImage, Loader2, RotateCcw, Save, Upload } from 'lucide-react'

type Props = {
  value: ErpSalesInvoiceTemplateConfig
  onChange: (next: ErpSalesInvoiceTemplateConfig) => void
  onSave: () => Promise<void>
  busy?: boolean
  saved?: boolean
}

export function ErpSalesInvoiceTemplatePanel({ value, onChange, onSave, busy, saved }: Props) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [uploadBusy, setUploadBusy] = useState(false)
  const [jsonMode, setJsonMode] = useState(false)
  const [jsonText, setJsonText] = useState('')
  const [jsonErr, setJsonErr] = useState('')

  const patch = useCallback(
    (patch: Partial<ErpSalesInvoiceTemplateConfig>) => {
      onChange(normalizeSalesInvoiceTemplate({ ...value, ...patch }))
    },
    [onChange, value],
  )

  const onUploadReference = async (file: File) => {
    setUploadBusy(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await axios.post<{ url: string; fileName: string }>(
        '/api/reseller/erp/invoice-template/upload',
        fd,
        { headers: { 'Content-Type': 'multipart/form-data' } },
      )
      patch({
        referenceFileUrl: res.data.url,
        referenceFileName: res.data.fileName || file.name,
      })
    } catch {
      alert('Could not upload reference file. Try a JPG, PNG, or PDF under 8 MB.')
    } finally {
      setUploadBusy(false)
    }
  }

  const applyJson = () => {
    setJsonErr('')
    try {
      const parsed = JSON.parse(jsonText) as unknown
      onChange(normalizeSalesInvoiceTemplate(parsed))
      setJsonMode(false)
    } catch {
      setJsonErr('Invalid JSON — check commas and quotes.')
    }
  }

  const openJsonMode = () => {
    setJsonText(JSON.stringify(value, null, 2))
    setJsonErr('')
    setJsonMode(true)
  }

  return (
    <div className="space-y-4">
      <div className={erpCardCls}>
        <p className="mb-1 text-sm font-semibold text-[var(--color-jewelry-black,#1a1814)]">
          A4 tax invoice / delivery challan (PDF)
        </p>
        <p className="mb-3 text-xs leading-relaxed text-[var(--color-jewelry-black,#1a1814)]/55">
          Matches the B.N. Marlecha-style layout: 3 A4 pages (Original, Duplicate, Triplicate), bordered
          header, item table in kg, GST totals, terms, and bank block. Upload a sample bill photo or PDF
          for reference, then edit the text fields below like a notepad.
        </p>

        <div className="mb-3 flex flex-wrap gap-2">
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,application/pdf,.pdf"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) void onUploadReference(f)
              e.target.value = ''
            }}
          />
          <button
            type="button"
            className={erpBtnGhost}
            disabled={uploadBusy}
            onClick={() => fileRef.current?.click()}
          >
            {uploadBusy ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
            Upload sample (image / PDF)
          </button>
          <button
            type="button"
            className={erpBtnGhost}
            onClick={() => onChange({ ...DEFAULT_MARLECHA_SALES_INVOICE_TEMPLATE })}
          >
            <RotateCcw className="size-4" />
            Reset Marlecha defaults
          </button>
          <button type="button" className={erpBtnGhost} onClick={jsonMode ? () => setJsonMode(false) : openJsonMode}>
            <Eye className="size-4" />
            {jsonMode ? 'Visual editor' : 'Edit as JSON'}
          </button>
        </div>

        {value.referenceFileUrl ? (
          <div className="mb-4 rounded-xl border border-[var(--color-slate-700,#e8e4df)] bg-[var(--color-slate-900,#faf8f4)] p-3">
            <p className="mb-2 flex items-center gap-2 text-xs font-semibold text-[var(--color-jewelry-black,#1a1814)]/70">
              <FileImage className="size-4" />
              Reference: {value.referenceFileName || 'uploaded file'}
            </p>
            {value.referenceFileUrl.match(/\.pdf(\?|$)/i) ? (
              <a
                href={value.referenceFileUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs font-semibold text-[var(--kc-accent,#c41e3a)] underline"
              >
                Open PDF reference
              </a>
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={value.referenceFileUrl}
                alt="Invoice format reference"
                className="max-h-64 w-full rounded-lg border border-[var(--color-slate-700,#e8e4df)] object-contain bg-white"
              />
            )}
          </div>
        ) : null}

        {jsonMode ? (
          <div className="space-y-2">
            <textarea
              className={`${erpInputCls} min-h-[320px] font-mono text-[11px] leading-relaxed`}
              value={jsonText}
              onChange={(e) => setJsonText(e.target.value)}
              spellCheck={false}
            />
            {jsonErr ? <p className="text-xs text-rose-700">{jsonErr}</p> : null}
            <button type="button" className={erpBtnPrimary} onClick={applyJson}>
              Apply JSON
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <label className="block text-xs font-medium text-[var(--color-jewelry-black,#1a1814)]/60">
              Document title (centre header)
              <input
                className={`${erpInputCls} mt-1`}
                value={value.documentTitle}
                onChange={(e) => patch({ documentTitle: e.target.value })}
              />
            </label>

            <div className="grid gap-3 sm:grid-cols-3">
              {(['Page 1 — top right', 'Page 2 — top right', 'Page 3 — top right'] as const).map((label, i) => (
                <label key={label} className="text-xs font-medium text-[var(--color-jewelry-black,#1a1814)]/60">
                  {label}
                  <input
                    className={`${erpInputCls} mt-1 text-[11px]`}
                    value={value.copyLabels[i]}
                    onChange={(e) => {
                      const copyLabels = [...value.copyLabels] as [string, string, string]
                      copyLabels[i] = e.target.value
                      patch({ copyLabels })
                    }}
                  />
                </label>
              ))}
            </div>

            <label className="block text-xs font-medium text-[var(--color-jewelry-black,#1a1814)]/60">
              Terms &amp; conditions (one line per numbered point)
              <textarea
                className={`${erpInputCls} mt-1 min-h-[120px] py-2 text-xs leading-relaxed`}
                value={value.terms.join('\n')}
                onChange={(e) =>
                  patch({
                    terms: e.target.value
                      .split('\n')
                      .map((s) => s.trim())
                      .filter(Boolean),
                  })
                }
              />
            </label>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-xs font-medium text-[var(--color-jewelry-black,#1a1814)]/60">
                Electronic ref label (footer left)
                <input
                  className={`${erpInputCls} mt-1`}
                  value={value.electronicRefLabel}
                  onChange={(e) => patch({ electronicRefLabel: e.target.value })}
                />
              </label>
              <label className="text-xs font-medium text-[var(--color-jewelry-black,#1a1814)]/60">
                Minimum empty table rows
                <input
                  type="number"
                  min={4}
                  max={24}
                  className={`${erpInputCls} mt-1 tabular-nums`}
                  value={value.minTableRows}
                  onChange={(e) => patch({ minTableRows: Number(e.target.value) || 12 })}
                />
              </label>
            </div>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className={erpBtnPrimary} disabled={busy} onClick={() => void onSave()}>
          {busy ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
          Save invoice format
        </button>
        {saved ? <span className="text-xs font-medium text-emerald-600">Saved</span> : null}
      </div>
    </div>
  )
}

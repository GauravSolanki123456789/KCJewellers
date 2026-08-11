'use client'

import { useEffect, useState } from 'react'
import axios from '@/lib/axios'
import { erpBtnGhost, erpBtnPrimary, erpCardCls, erpInputCls } from '@/components/reseller/erp/erp-ui'
import {
  BILL_TEMPLATE_VARS,
  DEFAULT_BILL_TEMPLATE,
  DEFAULT_LABEL_PRN,
  LABEL_TEMPLATE_VARS,
  migratePrintFormats,
  type ErpPrintFormatsSettings,
} from '@/lib/erp-print-templates'
import { FileText, Loader2, RotateCcw, Save, Tag } from 'lucide-react'

export function ErpPrintFormatsWorkspace() {
  const [pf, setPf] = useState<ErpPrintFormatsSettings>(() => migratePrintFormats({}))
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(false)
  const [tab, setTab] = useState<'label' | 'bill'>('label')

  useEffect(() => {
    void axios
      .get<{ settings: { printFormats?: ErpPrintFormatsSettings } }>('/api/reseller/erp/settings')
      .then((res) => setPf(migratePrintFormats(res.data.settings?.printFormats)))
      .catch(() => {})
  }, [])

  const save = async () => {
    setBusy(true)
    setSaved(false)
    try {
      await axios.put('/api/reseller/erp/settings', { settings: { printFormats: pf } })
      setSaved(true)
    } catch {
      alert('Could not save print formats')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className={erpCardCls}>
        <p className="text-xs leading-relaxed text-[var(--color-jewelry-black,#1a1814)]/55">
          Edit templates like Notepad — use <code className="rounded bg-black/5 px-1">{`{{variable}}`}</code>{' '}
          placeholders. TSC barcode printer uses the label PRN (TSPL). Epson bill printer uses the receipt
          template below.
        </p>
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            className={`min-h-[40px] flex-1 rounded-xl text-sm font-semibold ${
              tab === 'label'
                ? 'bg-[var(--kc-accent,#c41e3a)] text-white'
                : 'border border-[var(--color-slate-700,#e8e4df)] bg-white text-[var(--color-jewelry-black,#1a1814)]'
            }`}
            onClick={() => setTab('label')}
          >
            <Tag className="mr-1 inline size-4" />
            Label (TSC)
          </button>
          <button
            type="button"
            className={`min-h-[40px] flex-1 rounded-xl text-sm font-semibold ${
              tab === 'bill'
                ? 'bg-[var(--kc-accent,#c41e3a)] text-white'
                : 'border border-[var(--color-slate-700,#e8e4df)] bg-white text-[var(--color-jewelry-black,#1a1814)]'
            }`}
            onClick={() => setTab('bill')}
          >
            <FileText className="mr-1 inline size-4" />
            Sales bill (Epson)
          </button>
        </div>
      </div>

      {tab === 'label' ? (
        <>
          <div className={erpCardCls}>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-semibold text-[var(--color-jewelry-black,#1a1814)]">
                TSC label PRN template
              </p>
              <button
                type="button"
                className={erpBtnGhost}
                onClick={() => setPf((p) => ({ ...p, labelPrnTemplate: DEFAULT_LABEL_PRN }))}
              >
                <RotateCcw className="size-4" />
                Reset sample
              </button>
            </div>
            <label className="mb-3 flex items-center gap-2 text-xs text-[var(--color-jewelry-black,#1a1814)]/60">
              <input
                type="checkbox"
                checked={pf.labelUsePrn !== false}
                onChange={(e) => setPf((p) => ({ ...p, labelUsePrn: e.target.checked }))}
              />
              Use this PRN template for barcode labels (recommended for TTP-244)
            </label>
            <textarea
              className={`${erpInputCls} min-h-[320px] font-mono text-[11px] leading-relaxed`}
              value={pf.labelPrnTemplate || ''}
              onChange={(e) => setPf((p) => ({ ...p, labelPrnTemplate: e.target.value }))}
              spellCheck={false}
            />
            <p className="mt-2 text-[10px] text-[var(--color-jewelry-black,#1a1814)]/45">
              Variables: {LABEL_TEMPLATE_VARS.map((v) => `{{${v}}}`).join(', ')}
            </p>
          </div>
        </>
      ) : (
        <>
          <div className={erpCardCls}>
            <p className="mb-3 text-sm font-semibold text-[var(--color-jewelry-black,#1a1814)]">Shop header</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-xs font-medium text-[var(--color-jewelry-black,#1a1814)]/60 sm:col-span-2">
                Shop name
                <input
                  className={`${erpInputCls} mt-1`}
                  value={pf.shopName || ''}
                  onChange={(e) => setPf((p) => ({ ...p, shopName: e.target.value }))}
                />
              </label>
              <label className="text-xs font-medium text-[var(--color-jewelry-black,#1a1814)]/60 sm:col-span-2">
                Address
                <textarea
                  className={`${erpInputCls} mt-1 min-h-[64px] py-2`}
                  value={pf.shopAddress || ''}
                  onChange={(e) => setPf((p) => ({ ...p, shopAddress: e.target.value }))}
                />
              </label>
              <label className="text-xs font-medium text-[var(--color-jewelry-black,#1a1814)]/60">
                Phone
                <input
                  className={`${erpInputCls} mt-1`}
                  value={pf.shopPhone || ''}
                  onChange={(e) => setPf((p) => ({ ...p, shopPhone: e.target.value }))}
                />
              </label>
              <label className="text-xs font-medium text-[var(--color-jewelry-black,#1a1814)]/60">
                GSTIN
                <input
                  className={`${erpInputCls} mt-1 font-mono`}
                  value={pf.shopGstin || ''}
                  onChange={(e) => setPf((p) => ({ ...p, shopGstin: e.target.value }))}
                />
              </label>
            </div>
          </div>
          <div className={erpCardCls}>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-semibold text-[var(--color-jewelry-black,#1a1814)]">
                Epson receipt template
              </p>
              <button
                type="button"
                className={erpBtnGhost}
                onClick={() => setPf((p) => ({ ...p, billTemplate: DEFAULT_BILL_TEMPLATE }))}
              >
                <RotateCcw className="size-4" />
                Reset sample
              </button>
            </div>
            <textarea
              className={`${erpInputCls} min-h-[280px] font-mono text-[11px] leading-relaxed`}
              value={pf.billTemplate || ''}
              onChange={(e) => setPf((p) => ({ ...p, billTemplate: e.target.value }))}
              spellCheck={false}
            />
            <p className="mt-2 text-[10px] text-[var(--color-jewelry-black,#1a1814)]/45">
              Variables: {BILL_TEMPLATE_VARS.map((v) => `{{${v}}}`).join(', ')} —{' '}
              <code className="rounded bg-black/5 px-1">{`{{lines_table}}`}</code> expands each scanned line.
            </p>
          </div>
        </>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className={erpBtnPrimary} disabled={busy} onClick={() => void save()}>
          {busy ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
          Save print formats
        </button>
        {saved ? <span className="text-xs font-medium text-emerald-600">Saved</span> : null}
      </div>
    </div>
  )
}

'use client'

import { useEffect, useState } from 'react'
import axios from '@/lib/axios'
import {
  getPrinterProfileById,
  getScaleProfileById,
  loadWorkstationSelection,
  migrateHardwareSettings,
  printerProfileSummary,
  saveWorkstationSelection,
  type ErpHardwareSettings,
  type ErpWorkstationSelection,
} from '@/lib/erp-hardware'
import { migratePrintFormats } from '@/lib/erp-print-templates'
import {
  ERP_QUOTE_OUTPUT_HINTS,
  ERP_QUOTE_OUTPUT_LABELS,
  ERP_QUOTE_OUTPUT_MODES,
  normalizeQuoteOutputMode,
  resolveQuoteOutputMode,
  type ErpQuoteOutputMode,
} from '@/lib/erp-quote-output'
import { erpCardCls, erpInputCls } from '@/components/reseller/erp/erp-ui'
import { Monitor } from 'lucide-react'
import Link from 'next/link'

type Props = {
  value: ErpWorkstationSelection
  onChange: (sel: ErpWorkstationSelection) => void
}

/** Per-PC device picks — saved in this browser only (Hardware settings). */
export function ErpWorkstationPanel({ value, onChange }: Props) {
  const [hw, setHw] = useState<ErpHardwareSettings | null>(null)
  const [shopQuoteMode, setShopQuoteMode] = useState<ErpQuoteOutputMode>('pdf')

  useEffect(() => {
    void axios
      .get<{ settings: { hardware?: ErpHardwareSettings; printFormats?: unknown } }>(
        '/api/reseller/erp/settings',
      )
      .then((res) => {
        setHw(migrateHardwareSettings(res.data.settings?.hardware))
        const pf = migratePrintFormats(
          res.data.settings?.printFormats as Parameters<typeof migratePrintFormats>[0],
        )
        setShopQuoteMode(normalizeQuoteOutputMode(pf.defaultQuoteOutputMode))
      })
      .catch(() => setHw(null))
  }, [])

  const effectiveQuoteMode = resolveQuoteOutputMode(value.quoteOutputMode, shopQuoteMode)

  const patch = (next: ErpWorkstationSelection) => {
    onChange(next)
    saveWorkstationSelection(next)
  }

  if (!hw?.printerProfiles?.length) {
    return (
      <div className={`${erpCardCls} border-amber-200/80 bg-amber-50/40`}>
        <p className="text-sm font-semibold text-[var(--color-jewelry-black,#1a1814)]">This workstation</p>
        <p className="mt-1 text-xs leading-relaxed text-[var(--color-jewelry-black,#1a1814)]/65">
          Add at least one label printer profile below, then pick which devices this PC uses.
        </p>
      </div>
    )
  }

  const printer =
    getPrinterProfileById(hw, value.printerProfileId) || hw.printerProfiles[0]
  const scale = getScaleProfileById(hw, value.scaleProfileId)

  return (
    <div className={`${erpCardCls} border-[var(--kc-accent,#c41e3a)]/15 bg-gradient-to-br from-white to-[var(--color-slate-900,#faf8f4)]`}>
      <div className="mb-4 flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[var(--kc-accent,#c41e3a)]/10 text-[var(--kc-accent,#c41e3a)]">
          <Monitor className="size-5" />
        </span>
        <div>
          <h2 className="text-sm font-semibold text-[var(--color-jewelry-black,#1a1814)]">This workstation</h2>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-xs font-medium text-[var(--color-jewelry-black,#1a1814)]/70">
          Label printer
          <select
            className={`${erpInputCls} mt-1.5`}
            value={value.printerProfileId || printer?.id || ''}
            onChange={(e) => patch({ ...value, printerProfileId: e.target.value || null })}
          >
            {(hw.printerProfiles || []).map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} — {printerProfileSummary(p)}
              </option>
            ))}
          </select>
        </label>

        <label className="text-xs font-medium text-[var(--color-jewelry-black,#1a1814)]/70">
          Weighing scale
          <select
            className={`${erpInputCls} mt-1.5`}
            value={value.scaleProfileId || scale?.id || ''}
            onChange={(e) => patch({ ...value, scaleProfileId: e.target.value || null })}
          >
            {(hw.scaleProfiles || []).map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} — {s.serial.port} @ {s.serial.baudRate}
              </option>
            ))}
          </select>
        </label>

        <label className="text-xs font-medium text-[var(--color-jewelry-black,#1a1814)]/70 sm:col-span-2">
          Generate quote on this PC
          <select
            className={`${erpInputCls} mt-1.5 max-w-md`}
            value={value.quoteOutputMode ?? ''}
            onChange={(e) => {
              const raw = e.target.value
              patch({
                ...value,
                quoteOutputMode: raw ? (normalizeQuoteOutputMode(raw) as ErpQuoteOutputMode) : null,
              })
            }}
          >
            <option value="">Shop default ({ERP_QUOTE_OUTPUT_LABELS[shopQuoteMode]})</option>
            {ERP_QUOTE_OUTPUT_MODES.map((mode) => (
              <option key={mode} value={mode}>
                {ERP_QUOTE_OUTPUT_LABELS[mode]}
              </option>
            ))}
          </select>
          <span className="mt-1.5 block text-[11px] leading-relaxed text-[var(--color-jewelry-black,#1a1814)]/55">
            Active:{' '}
            <strong className="font-semibold text-[var(--color-jewelry-black,#1a1814)]/80">
              {ERP_QUOTE_OUTPUT_LABELS[effectiveQuoteMode]}
            </strong>
            {' — '}
            {ERP_QUOTE_OUTPUT_HINTS[effectiveQuoteMode]}{' '}
            <Link href="/reseller/erp/print-formats" className="font-semibold text-[var(--kc-accent,#c41e3a)]">
              Shop default &amp; templates
            </Link>
          </span>
        </label>
      </div>
    </div>
  )
}

/** @deprecated Use ErpWorkstationPanel in Hardware settings only. */
export const ErpWorkstationBar = ErpWorkstationPanel

export function useErpWorkstationSelection(): [ErpWorkstationSelection, (s: ErpWorkstationSelection) => void] {
  const [sel, setSel] = useState<ErpWorkstationSelection>({ printerProfileId: null, scaleProfileId: null })
  useEffect(() => {
    setSel(loadWorkstationSelection())
  }, [])
  const update = (next: ErpWorkstationSelection) => {
    setSel(next)
    saveWorkstationSelection(next)
  }
  return [sel, update]
}

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
import { erpBtnGhost, erpCardCls } from '@/components/reseller/erp/erp-ui'
import { Monitor } from 'lucide-react'
import Link from 'next/link'

type Props = {
  value: ErpWorkstationSelection
  onChange: (sel: ErpWorkstationSelection) => void
}

export function ErpWorkstationBar({ value, onChange }: Props) {
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

  if (!hw?.printerProfiles?.length) {
    return (
      <div className={`${erpCardCls} text-xs text-[var(--color-jewelry-black,#1a1814)]/55`}>
        No label printer configured.{' '}
        <Link href="/reseller/erp/hardware" className="font-semibold text-[var(--kc-accent,#c41e3a)]">
          Set up Hardware
        </Link>{' '}
        first (USB · TSC or COM3 · 9600).
      </div>
    )
  }

  const printer =
    getPrinterProfileById(hw, value.printerProfileId) || hw.printerProfiles[0]
  const scale = getScaleProfileById(hw, value.scaleProfileId)

  return (
    <div className={`${erpCardCls} flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end`}>
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-[var(--color-jewelry-black,#1a1814)]/45">
        <Monitor className="size-4" />
        This workstation
      </div>
      <label className="min-w-[160px] flex-1 text-xs font-medium text-[var(--color-jewelry-black,#1a1814)]/60">
        Label printer
        <select
          className={`${erpBtnGhost} mt-1 w-full justify-start font-normal`}
          value={value.printerProfileId || printer?.id || ''}
          onChange={(e) => {
            const next = { ...value, printerProfileId: e.target.value || null }
            onChange(next)
            saveWorkstationSelection(next)
          }}
        >
          {(hw.printerProfiles || []).map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} — {printerProfileSummary(p)}
            </option>
          ))}
        </select>
      </label>
      <label className="min-w-[160px] flex-1 text-xs font-medium text-[var(--color-jewelry-black,#1a1814)]/60">
        Weighing scale
        <select
          className={`${erpBtnGhost} mt-1 w-full justify-start font-normal`}
          value={value.scaleProfileId || scale?.id || ''}
          onChange={(e) => {
            const next = { ...value, scaleProfileId: e.target.value || null }
            onChange(next)
            saveWorkstationSelection(next)
          }}
        >
          {(hw.scaleProfiles || []).map((s) => (
            <option key={s.id} value={s.id}>
              {s.name} — {s.serial.port} @ {s.serial.baudRate}
            </option>
          ))}
        </select>
      </label>
      <label className="min-w-[180px] flex-1 text-xs font-medium text-[var(--color-jewelry-black,#1a1814)]/60 sm:col-span-2">
        Generate quote on this PC
        <select
          className={`${erpBtnGhost} mt-1 w-full justify-start font-normal`}
          value={value.quoteOutputMode ?? ''}
          onChange={(e) => {
            const raw = e.target.value
            const next = {
              ...value,
              quoteOutputMode: raw ? (normalizeQuoteOutputMode(raw) as ErpQuoteOutputMode) : null,
            }
            onChange(next)
            saveWorkstationSelection(next)
          }}
        >
          <option value="">Shop default ({ERP_QUOTE_OUTPUT_LABELS[shopQuoteMode]})</option>
          {ERP_QUOTE_OUTPUT_MODES.map((mode) => (
            <option key={mode} value={mode}>
              {ERP_QUOTE_OUTPUT_LABELS[mode]}
            </option>
          ))}
        </select>
        <span className="mt-1 block text-[10px] leading-relaxed text-[var(--color-jewelry-black,#1a1814)]/45">
          Active: {ERP_QUOTE_OUTPUT_LABELS[effectiveQuoteMode]} — {ERP_QUOTE_OUTPUT_HINTS[effectiveQuoteMode]}{' '}
          <Link href="/reseller/erp/print-formats" className="font-semibold text-[var(--kc-accent,#c41e3a)]">
            Edit templates
          </Link>
        </span>
      </label>
    </div>
  )
}

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

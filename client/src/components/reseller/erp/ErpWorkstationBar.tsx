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
import { erpBtnGhost, erpCardCls } from '@/components/reseller/erp/erp-ui'
import { Monitor } from 'lucide-react'
import Link from 'next/link'

type Props = {
  value: ErpWorkstationSelection
  onChange: (sel: ErpWorkstationSelection) => void
}

export function ErpWorkstationBar({ value, onChange }: Props) {
  const [hw, setHw] = useState<ErpHardwareSettings | null>(null)

  useEffect(() => {
    void axios
      .get<{ settings: { hardware?: ErpHardwareSettings } }>('/api/reseller/erp/settings')
      .then((res) => setHw(migrateHardwareSettings(res.data.settings?.hardware)))
      .catch(() => setHw(null))
  }, [])

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

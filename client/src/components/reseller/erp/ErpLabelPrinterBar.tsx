'use client'

import { useCallback, useEffect, useState } from 'react'
import axios from '@/lib/axios'
import {
  getPrinterProfileById,
  loadWorkstationSelection,
  migrateHardwareSettings,
  normalizeComPort,
  serialSettingsLabel,
  type ErpHardwareSettings,
} from '@/lib/erp-hardware'
import {
  connectLabelPrinter,
  disconnectLabelPrinter,
  getLabelPrinterPort,
  isLabelPrinterConnected,
  webSerialSupported,
} from '@/lib/erp-serial-device'
import { erpBtnGhost, erpBtnPrimary, erpCardCls } from '@/components/reseller/erp/erp-ui'
import { Link2, Printer, Unlink } from 'lucide-react'

type Props = {
  printerProfileId: string | null
  onConnectionChange?: (connected: boolean) => void
}

export function ErpLabelPrinterBar({ printerProfileId, onConnectionChange }: Props) {
  const [hw, setHw] = useState<ErpHardwareSettings | null>(null)
  const [connected, setConnected] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [statusLine, setStatusLine] = useState<string | null>(null)

  useEffect(() => {
    void axios
      .get<{ settings: { hardware?: ErpHardwareSettings } }>('/api/reseller/erp/settings')
      .then((res) => setHw(migrateHardwareSettings(res.data.settings?.hardware)))
      .catch(() => setHw(null))
  }, [])

  useEffect(() => {
    setConnected(isLabelPrinterConnected())
  }, [])

  useEffect(() => {
    onConnectionChange?.(connected)
  }, [connected, onConnectionChange])

  const refreshStatus = useCallback((profileId: string | null) => {
    const sel = loadWorkstationSelection()
    const profile = getPrinterProfileById(hw || {}, profileId || sel.printerProfileId)
    if (profile?.connection === 'serial' && profile.serial) {
      setStatusLine(`${normalizeComPort(profile.serial.port)} · ${serialSettingsLabel(profile.serial)}`)
    } else if (profile?.connection === 'network') {
      setStatusLine(`${profile.network?.host || '—'}:${profile.network?.port || 9100}`)
    } else {
      setStatusLine(null)
    }
  }, [hw])

  useEffect(() => {
    refreshStatus(printerProfileId)
  }, [printerProfileId, refreshStatus])

  const disconnect = useCallback(async () => {
    await disconnectLabelPrinter()
    setConnected(false)
    setError(null)
  }, [])

  useEffect(() => {
    return () => {
      void disconnectLabelPrinter()
    }
  }, [])

  const connect = async (pickNew = false) => {
    setError(null)
    setBusy(true)
    if (!webSerialSupported()) {
      setError('Use Chrome or Edge on this PC for the TSC label printer.')
      setBusy(false)
      return
    }
    const sel = loadWorkstationSelection()
    const profile = getPrinterProfileById(hw || {}, printerProfileId || sel.printerProfileId)
    if (!profile) {
      setError('Add a TSC printer in Hardware settings first.')
      setBusy(false)
      return
    }
    if (profile.connection !== 'serial') {
      setError('Network printer — no USB connection needed here.')
      setBusy(false)
      return
    }
    try {
      if (pickNew) await disconnect()
      await connectLabelPrinter(profile.serial || { port: 'COM1', baudRate: 9600, dataBits: 8, parity: 'none', stopBits: 1 }, pickNew)
      setConnected(true)
      refreshStatus(printerProfileId)
    } catch (e) {
      setConnected(false)
      setError(e instanceof Error ? e.message : 'Could not connect to label printer')
    } finally {
      setBusy(false)
    }
  }

  const profile = getPrinterProfileById(hw || {}, printerProfileId)
  if (!hw?.printerProfiles?.length || profile?.connection === 'network') return null

  return (
    <div className={`${erpCardCls} flex flex-wrap items-center gap-3`}>
      <div className="flex items-center gap-2 text-sm font-semibold text-[var(--color-jewelry-black,#1a1814)]">
        <Printer className="size-4 text-[var(--kc-accent,#c41e3a)]" />
        Label printer
      </div>
      {connected ? (
        <>
          <span className="rounded-lg bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-800">
            Connected{statusLine ? ` · ${statusLine}` : ''}
          </span>
          <button type="button" className={erpBtnGhost} disabled={busy} onClick={() => void connect(true)}>
            Change USB device
          </button>
          <button type="button" className={erpBtnGhost} onClick={() => void disconnect()}>
            <Unlink className="size-4" />
            Disconnect
          </button>
        </>
      ) : (
        <button type="button" className={erpBtnPrimary} disabled={busy} onClick={() => void connect(false)}>
          <Link2 className="size-4" />
          {busy ? 'Connecting…' : 'Connect label printer'}
        </button>
      )}
      {error ? <span className="w-full text-xs text-red-600">{error}</span> : null}
      {!connected && !error ? (
        <span className="text-xs text-[var(--color-jewelry-black,#1a1814)]/55">
          Pick the TSC TTP-244 USB cable when Chrome asks — use a different USB port than the weighing scale.
        </span>
      ) : null}
    </div>
  )
}

export function useLabelPrinterReady(): boolean {
  return isLabelPrinterConnected() || getLabelPrinterPort() != null
}

'use client'

import { useCallback, useEffect, useState } from 'react'
import axios from '@/lib/axios'
import {
  DEFAULT_WINDOWS_USB_PRINTER,
  getPrinterProfileById,
  loadWorkstationSelection,
  migrateHardwareSettings,
  normalizeComPort,
  serialSettingsLabel,
  type ErpHardwareSettings,
} from '@/lib/erp-hardware'
import { checkLocalPrintAgent } from '@/lib/erp-local-print'
import {
  connectLabelPrinter,
  disconnectLabelPrinter,
  isLabelPrinterConnected,
  webSerialSupported,
} from '@/lib/erp-serial-device'
import { erpBtnGhost, erpBtnPrimary, erpCardCls } from '@/components/reseller/erp/erp-ui'
import { Link2, Printer, RefreshCw, Unlink } from 'lucide-react'

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

  const profile = getPrinterProfileById(hw || {}, printerProfileId)
  const isUsb = profile?.connection === 'usb'

  const refreshUsbAgent = useCallback(async () => {
    const ok = await checkLocalPrintAgent()
    setConnected(ok)
    if (ok) setError(null)
  }, [])

  useEffect(() => {
    void axios
      .get<{ settings: { hardware?: ErpHardwareSettings } }>('/api/reseller/erp/settings')
      .then((res) => setHw(migrateHardwareSettings(res.data.settings?.hardware)))
      .catch(() => setHw(null))
  }, [])

  useEffect(() => {
    if (isUsb) {
      void refreshUsbAgent()
      const t = setInterval(() => void refreshUsbAgent(), 4000)
      return () => clearInterval(t)
    }
    setConnected(isLabelPrinterConnected())
    return undefined
  }, [isUsb, refreshUsbAgent])

  useEffect(() => {
    onConnectionChange?.(connected)
  }, [connected, onConnectionChange])

  useEffect(() => {
    const p = getPrinterProfileById(hw || {}, printerProfileId)
    if (p?.connection === 'usb') {
      const name = p.windowsPrinter?.name || DEFAULT_WINDOWS_USB_PRINTER.name
      const hint = p.windowsPrinter?.portHint || DEFAULT_WINDOWS_USB_PRINTER.portHint
      setStatusLine(`${name} · ${hint}`)
    } else if (p?.connection === 'serial' && p.serial) {
      setStatusLine(`${normalizeComPort(p.serial.port)} · ${serialSettingsLabel(p.serial)}`)
    } else if (p?.connection === 'network') {
      setStatusLine(`${p.network?.host || '—'}:${p.network?.port || 9100}`)
    } else {
      setStatusLine(null)
    }
  }, [hw, printerProfileId])

  const disconnectSerial = useCallback(async () => {
    await disconnectLabelPrinter()
    setConnected(false)
    setError(null)
  }, [])

  useEffect(() => {
    if (!isUsb) {
      return () => {
        void disconnectLabelPrinter()
      }
    }
    return undefined
  }, [isUsb])

  const connectSerial = async (pickNew = false) => {
    setError(null)
    setBusy(true)
    if (!webSerialSupported()) {
      setError('Use Chrome or Edge on this PC for serial/COM printing.')
      setBusy(false)
      return
    }
    const sel = loadWorkstationSelection()
    const p = getPrinterProfileById(hw || {}, printerProfileId || sel.printerProfileId)
    if (!p || p.connection !== 'serial') {
      setError('Set label printer to Serial/COM in Hardware, or use USB (Windows) mode.')
      setBusy(false)
      return
    }
    try {
      if (pickNew) await disconnectSerial()
      await connectLabelPrinter(
        p.serial || { port: 'COM1', baudRate: 9600, dataBits: 8, parity: 'none', stopBits: 1 },
        pickNew,
      )
      setConnected(true)
    } catch (e) {
      setConnected(false)
      setError(e instanceof Error ? e.message : 'Could not connect to label printer')
    } finally {
      setBusy(false)
    }
  }

  if (!hw?.printerProfiles?.length || profile?.connection === 'network') return null

  if (isUsb) {
    return (
      <div className={`${erpCardCls} flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center`}>
        <div className="flex items-center gap-2 text-sm font-semibold text-[var(--color-jewelry-black,#1a1814)]">
          <Printer className="size-4 text-[var(--kc-accent,#c41e3a)]" />
          Label printer (USB)
        </div>
        {connected ? (
          <span className="rounded-lg bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-800">
            Print service ready{statusLine ? ` · ${statusLine}` : ''}
          </span>
        ) : (
          <span className="rounded-lg bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-900">
            Start print service on this PC
          </span>
        )}
        <button type="button" className={erpBtnGhost} disabled={busy} onClick={() => void refreshUsbAgent()}>
          <RefreshCw className={`size-4 ${busy ? 'animate-spin' : ''}`} />
          Refresh
        </button>
        {error ? <span className="w-full text-xs text-red-600">{error}</span> : null}
        {!connected ? (
          <div className="w-full rounded-xl border border-[var(--color-slate-700,#e8e4df)] bg-[var(--color-slate-900,#faf8f4)] px-3 py-2.5 text-xs leading-relaxed text-[var(--color-jewelry-black,#1a1814)]/70">
            <p className="font-semibold text-[var(--color-jewelry-black,#1a1814)]">Start print service on this PC (once per day):</p>
            <ol className="mt-1.5 list-decimal space-y-1 pl-4">
              <li>
                Copy the whole folder{' '}
                <code className="rounded bg-black/5 px-1">erp-print-service</code> to the Desktop (all 3
                files together — not just the .bat)
              </li>
              <li>
                Double-click <strong>START-KC-Label-Print.bat</strong> — window must show{' '}
                <strong>Listening on http://127.0.0.1:17888/</strong>
              </li>
              <li>
                No Node.js or Python needed. Printer port in Windows must be <strong>USB001</strong>
              </li>
              <li>Tap Refresh until green, then Generate barcodes</li>
            </ol>
          </div>
        ) : null}
      </div>
    )
  }

  return (
    <div className={`${erpCardCls} flex flex-wrap items-center gap-3`}>
      <div className="flex items-center gap-2 text-sm font-semibold text-[var(--color-jewelry-black,#1a1814)]">
        <Printer className="size-4 text-[var(--kc-accent,#c41e3a)]" />
        Label printer (COM)
      </div>
      {connected ? (
        <>
          <span className="rounded-lg bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-800">
            Connected{statusLine ? ` · ${statusLine}` : ''}
          </span>
          <button type="button" className={erpBtnGhost} disabled={busy} onClick={() => void connectSerial(true)}>
            Change device
          </button>
          <button type="button" className={erpBtnGhost} onClick={() => void disconnectSerial()}>
            <Unlink className="size-4" />
            Disconnect
          </button>
        </>
      ) : (
        <button type="button" className={erpBtnPrimary} disabled={busy} onClick={() => void connectSerial(false)}>
          <Link2 className="size-4" />
          {busy ? 'Connecting…' : 'Connect label printer'}
        </button>
      )}
      {error ? <span className="w-full text-xs text-red-600">{error}</span> : null}
    </div>
  )
}

export function useLabelPrinterReady(): boolean {
  return isLabelPrinterConnected()
}

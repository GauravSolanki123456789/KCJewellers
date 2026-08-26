'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import axios from '@/lib/axios'
import {
  getScaleProfileById,
  loadWorkstationSelection,
  migrateHardwareSettings,
  type ErpHardwareSettings,
} from '@/lib/erp-hardware'
import {
  closeSerialPort,
  openSerialPort,
  requestUserSerialPort,
  startScaleReader,
  webSerialSupported,
  type SerialPortLike,
} from '@/lib/erp-serial-device'
import { erpBtnGhost, erpBtnPrimary, erpCardCls } from '@/components/reseller/erp/erp-ui'
import { Link2, Scale, Unlink } from 'lucide-react'

type Props = {
  scaleProfileId: string | null
  onApplyWeight?: (grams: number) => void
  onLiveWeight?: (grams: number | null) => void
  onConnectionChange?: (connected: boolean) => void
  /** Mettler Toledo Print key → auto print label for focused weight row */
  onScalePrint?: (grams: number) => void
}

export function ErpWeighingScaleBar({
  scaleProfileId,
  onApplyWeight,
  onLiveWeight,
  onConnectionChange,
  onScalePrint,
}: Props) {
  const [hw, setHw] = useState<ErpHardwareSettings | null>(null)
  const [connected, setConnected] = useState(false)
  const [liveWeight, setLiveWeight] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [connecting, setConnecting] = useState(false)
  const portRef = useRef<SerialPortLike | null>(null)
  const stopReadRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    void axios
      .get<{ settings: { hardware?: ErpHardwareSettings } }>('/api/reseller/erp/settings')
      .then((res) => setHw(migrateHardwareSettings(res.data.settings?.hardware)))
      .catch(() => setHw(null))
  }, [])

  useEffect(() => {
    onLiveWeight?.(liveWeight)
  }, [liveWeight, onLiveWeight])

  useEffect(() => {
    onConnectionChange?.(connected)
  }, [connected, onConnectionChange])

  const disconnect = useCallback(async () => {
    stopReadRef.current?.()
    stopReadRef.current = null
    await closeSerialPort(portRef.current)
    portRef.current = null
    setConnected(false)
    setLiveWeight(null)
  }, [])

  useEffect(() => {
    return () => {
      void disconnect()
    }
  }, [disconnect])

  const connect = async () => {
    setError(null)
    if (!webSerialSupported()) {
      setError('Use Chrome or Edge on this PC for weighing scale.')
      return
    }
    const sel = loadWorkstationSelection()
    const profile = getScaleProfileById(hw || {}, scaleProfileId || sel.scaleProfileId)
    if (!profile) {
      setError('Add a scale in Hardware settings first.')
      return
    }
    setConnecting(true)
    try {
      await disconnect()
      const port = await requestUserSerialPort()
      try {
        await port.close()
      } catch {
        /* port may not be open yet */
      }
      await openSerialPort(port, profile.serial)
      portRef.current = port
      stopReadRef.current = await startScaleReader(
        port,
        {
          onWeight: (g) => setLiveWeight(g),
          onError: (m) => setError(m),
          onPrint: onScalePrint,
        },
        { brand: profile.brand || 'generic' },
      )
      setConnected(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not connect to scale')
    } finally {
      setConnecting(false)
    }
  }

  if (!hw?.scaleProfiles?.length) return null

  const profile = getScaleProfileById(hw, scaleProfileId || loadWorkstationSelection().scaleProfileId)
  const isMettler = profile?.brand === 'mettler_toledo'

  return (
    <div className={`${erpCardCls} space-y-2`}>
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-[var(--color-jewelry-black,#1a1814)]">
          <Scale className="size-4 text-[var(--kc-accent,#c41e3a)]" />
          Weighing scale
          {profile ? (
            <span className="text-[10px] font-normal text-[var(--color-jewelry-black,#1a1814)]/50">
              · {profile.name}
            </span>
          ) : null}
        </div>
        {connected ? (
          <>
            <span className="font-mono text-lg font-bold tabular-nums text-emerald-700">
              {liveWeight != null ? `${liveWeight.toFixed(3)} g` : '—'}
            </span>
            {onApplyWeight && liveWeight != null ? (
              <button type="button" className={erpBtnPrimary} onClick={() => onApplyWeight(liveWeight)}>
                Apply to row
              </button>
            ) : null}
            <button type="button" className={erpBtnGhost} onClick={() => void disconnect()}>
              <Unlink className="size-4" />
              Disconnect
            </button>
          </>
        ) : (
          <button type="button" className={erpBtnPrimary} disabled={connecting} onClick={() => void connect()}>
            <Link2 className="size-4" />
            {connecting ? 'Connecting…' : 'Connect scale'}
          </button>
        )}
      </div>
      <p className="text-[11px] leading-relaxed text-[var(--color-jewelry-black,#1a1814)]/55">
        {connected
          ? isMettler
            ? 'Click a weight cell, place the piece on the scale, then press Print on the Mettler device to print the label.'
            : 'Click a weight cell — live weight fills in. Press F1 or use Generate barcodes to print.'
          : 'Chrome will ask you to pick the COM port (e.g. USB-Serial Controller COM1). Use the same port as in Hardware settings.'}
      </p>
      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">{error}</p>
      ) : null}
    </div>
  )
}

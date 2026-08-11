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
}

export function ErpWeighingScaleBar({ scaleProfileId, onApplyWeight }: Props) {
  const [hw, setHw] = useState<ErpHardwareSettings | null>(null)
  const [connected, setConnected] = useState(false)
  const [liveWeight, setLiveWeight] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const portRef = useRef<SerialPortLike | null>(null)
  const stopReadRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    void axios
      .get<{ settings: { hardware?: ErpHardwareSettings } }>('/api/reseller/erp/settings')
      .then((res) => setHw(migrateHardwareSettings(res.data.settings?.hardware)))
      .catch(() => setHw(null))
  }, [])

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
    try {
      await disconnect()
      const port = await requestUserSerialPort()
      await openSerialPort(port, profile.serial)
      portRef.current = port
      stopReadRef.current = await startScaleReader(port, {
        onWeight: (g) => setLiveWeight(g),
        onError: (m) => setError(m),
      })
      setConnected(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not connect to scale')
    }
  }

  if (!hw?.scaleProfiles?.length) return null

  return (
    <div className={`${erpCardCls} flex flex-wrap items-center gap-3`}>
      <div className="flex items-center gap-2 text-sm font-semibold text-[var(--color-jewelry-black,#1a1814)]">
        <Scale className="size-4 text-[var(--kc-accent,#c41e3a)]" />
        Weighing scale
      </div>
      {connected ? (
        <>
          <span className="font-mono text-lg font-bold tabular-nums text-emerald-700">
            {liveWeight != null ? `${liveWeight.toFixed(3)} g` : '—'}
          </span>
          {onApplyWeight && liveWeight != null ? (
            <button type="button" className={erpBtnPrimary} onClick={() => onApplyWeight(liveWeight)}>
              Apply to selected row
            </button>
          ) : null}
          <button type="button" className={erpBtnGhost} onClick={() => void disconnect()}>
            <Unlink className="size-4" />
            Disconnect
          </button>
        </>
      ) : (
        <button type="button" className={erpBtnPrimary} onClick={() => void connect()}>
          <Link2 className="size-4" />
          Connect scale (pick COM port)
        </button>
      )}
      {error ? <span className="text-xs text-red-600">{error}</span> : null}
      {!connected ? (
        <span className="text-[10px] text-[var(--color-jewelry-black,#1a1814)]/45">
          Essae-style stream · 9600 8-N-1 · same as HyperTerminal
        </span>
      ) : null}
    </div>
  )
}

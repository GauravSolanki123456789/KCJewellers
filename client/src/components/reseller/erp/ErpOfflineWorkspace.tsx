'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import axios from '@/lib/axios'
import {
  CloudDownload,
  CloudUpload,
  Download,
  ExternalLink,
  Loader2,
  Wifi,
  WifiOff,
} from 'lucide-react'
import {
  captureOfflineSnapshotFromServer,
  getOfflineSnapshotMeta,
  listOfflineQueue,
  syncOfflineQueue,
  type OfflineQueueItem,
  type OfflineSnapshotMeta,
} from '@/lib/erp-offline-store'
import { erpBtnGhost, erpBtnPrimary, erpCardCls, erpErr } from '@/components/reseller/erp/erp-ui'
import { formatErpDateDdMmYyyy } from '@/lib/erp-date-format'

function formatWhen(iso?: string | null) {
  if (!iso) return 'Never'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return `${formatErpDateDdMmYyyy(iso)} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

export function ErpOfflineWorkspace() {
  const [online, setOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine)
  const [meta, setMeta] = useState<OfflineSnapshotMeta | null>(null)
  const [queue, setQueue] = useState<OfflineQueueItem[]>([])
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const mergeRef = useRef<HTMLInputElement>(null)

  const reload = useCallback(async () => {
    setMeta(await getOfflineSnapshotMeta())
    setQueue(await listOfflineQueue())
  }, [])

  useEffect(() => {
    void reload()
    const on = () => setOnline(true)
    const off = () => setOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => {
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
    }
  }, [reload])

  const downloadBlob = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  }

  const downloadExhibitionPack = async () => {
    setBusy(true)
    setErr(null)
    setMsg(null)
    try {
      const res = await axios.get('/api/reseller/erp/offline/exhibition-pack', { responseType: 'blob' })
      downloadBlob(res.data, `exhibition-pack-${new Date().toISOString().slice(0, 10)}.json`)
      await captureOfflineSnapshotFromServer()
      await reload()
      setMsg('Exhibition pack downloaded.')
    } catch (e) {
      setErr(erpErr(e))
    } finally {
      setBusy(false)
    }
  }

  const downloadExhibitionApp = async () => {
    setBusy(true)
    setErr(null)
    setMsg(null)
    try {
      const res = await axios.get('/api/reseller/erp/offline/exhibition-app', { responseType: 'blob' })
      downloadBlob(res.data, 'kc-exhibition-billing.html')
      setMsg('Exhibition app downloaded.')
    } catch (e) {
      setErr(erpErr(e))
    } finally {
      setBusy(false)
    }
  }

  const uploadReturnPack = async (file: File) => {
    setBusy(true)
    setErr(null)
    setMsg(null)
    try {
      const text = await file.text()
      const parsed = JSON.parse(text) as { queue?: unknown[]; returnQueue?: unknown[] }
      const queueItems = Array.isArray(parsed.queue)
        ? parsed.queue
        : Array.isArray(parsed.returnQueue)
          ? parsed.returnQueue
          : []
      if (!queueItems.length) {
        throw new Error('No bills or customers found in this return file.')
      }
      const res = await axios.post<{ ok: number; failed: number; results: { detail: string; ok: boolean }[] }>(
        '/api/reseller/erp/offline/exhibition-merge',
        { queue: queueItems, sourceFile: file.name },
      )
      const { ok, failed, results } = res.data
      if (failed === 0) {
        setMsg(`Merged ${ok} item(s) from exhibition.`)
      } else {
        setErr(
          `Merged ${ok}, ${failed} need attention. ${results
            .filter((r) => !r.ok)
            .map((r) => r.detail)
            .slice(0, 3)
            .join('; ')}`,
        )
      }
    } catch (e) {
      setErr(erpErr(e))
    } finally {
      setBusy(false)
    }
  }

  const mergeBrowserQueue = async () => {
    setBusy(true)
    setErr(null)
    setMsg(null)
    try {
      const result = await syncOfflineQueue()
      await reload()
      if (result.failed === 0) {
        setMsg(result.ok ? `Merged ${result.ok} browser item(s).` : 'Nothing pending to merge.')
      } else {
        setErr(`Merged ${result.ok}, ${result.failed} need attention.`)
      }
    } catch (e) {
      setErr(erpErr(e))
    } finally {
      setBusy(false)
    }
  }

  const appUrl = typeof window !== 'undefined' ? `${window.location.origin}/exhibition-kit/` : '/exhibition-kit/'

  return (
    <div className="space-y-4">
      <div className={erpCardCls}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-[#1a1814]/45">Exhibition</p>
            <h2 className="text-lg font-bold text-[#1a1814]">Offline stall kit</h2>
          </div>
          <span
            className={`inline-flex min-h-[36px] items-center gap-1.5 rounded-full px-3 text-xs font-semibold ${
              online ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-900'
            }`}
          >
            {online ? <Wifi className="size-3.5" /> : <WifiOff className="size-3.5" />}
            {online ? 'Online' : 'No network'}
          </span>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className={erpCardCls}>
          <p className="text-[10px] font-bold uppercase tracking-wide text-[#1a1814]/45">Step 1 · Shop</p>
          <p className="mt-1 text-sm font-semibold text-[#1a1814]">Download exhibition pack</p>
          <p className="mt-1 text-xs tabular-nums text-[#1a1814]/60">
            {meta ? `${meta.customerCount} customers · ${meta.pieceCount} barcodes` : '—'}
          </p>
          <button
            type="button"
            className={`${erpBtnPrimary} mt-3 w-full`}
            disabled={busy || !online}
            onClick={() => void downloadExhibitionPack()}
          >
            {busy ? <Loader2 className="size-4 animate-spin" /> : <CloudDownload className="size-4" />}
            Download pack
          </button>
        </div>

        <div className={erpCardCls}>
          <p className="text-[10px] font-bold uppercase tracking-wide text-[#1a1814]/45">Step 1 · Shop</p>
          <p className="mt-1 text-sm font-semibold text-[#1a1814]">Download exhibition app</p>
          <button
            type="button"
            className={`${erpBtnPrimary} mt-3 w-full`}
            disabled={busy || !online}
            onClick={() => void downloadExhibitionApp()}
          >
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
            Download app
          </button>
          <a
            href={appUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={`${erpBtnGhost} mt-2 inline-flex w-full justify-center text-xs`}
          >
            <ExternalLink className="size-3.5" />
            Open app
          </a>
        </div>

        <div className={erpCardCls}>
          <p className="text-[10px] font-bold uppercase tracking-wide text-[#1a1814]/45">Step 2 · Stall</p>
          <p className="mt-1 text-sm font-semibold text-[#1a1814]">Load pack in app</p>
        </div>

        <div className={erpCardCls}>
          <p className="text-[10px] font-bold uppercase tracking-wide text-[#1a1814]/45">Step 3 · Shop</p>
          <p className="mt-1 text-sm font-semibold text-[#1a1814]">Upload return file</p>
          <input
            ref={mergeRef}
            type="file"
            accept=".json,application/json"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) void uploadReturnPack(f)
              e.target.value = ''
            }}
          />
          <button
            type="button"
            className={`${erpBtnPrimary} mt-3 w-full`}
            disabled={busy || !online}
            onClick={() => mergeRef.current?.click()}
          >
            {busy ? <Loader2 className="size-4 animate-spin" /> : <CloudUpload className="size-4" />}
            Upload return pack
          </button>
        </div>
      </div>

      {msg ? (
        <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{msg}</p>
      ) : null}
      {err ? <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">{err}</p> : null}

      {queue.length > 0 ? (
        <div className={erpCardCls}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-semibold text-[#1a1814]">Browser queue ({queue.length})</p>
            <button type="button" className={erpBtnGhost} disabled={busy || !online} onClick={() => void mergeBrowserQueue()}>
              Merge browser queue
            </button>
          </div>
        </div>
      ) : null}

      <p className="text-center text-[11px] text-[#1a1814]/45">Last pack cache: {formatWhen(meta?.capturedAt)}</p>
    </div>
  )
}

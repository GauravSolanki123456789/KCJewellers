'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import axios from '@/lib/axios'
import {
  CloudDownload,
  CloudUpload,
  Download,
  ExternalLink,
  HardDrive,
  Loader2,
  Smartphone,
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
import { resellerErpModulePath } from '@/lib/reseller-erp-modules'
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

  const downloadExhibitionPack = async () => {
    setBusy(true)
    setErr(null)
    setMsg(null)
    try {
      const res = await axios.get('/api/reseller/erp/offline/exhibition-pack', { responseType: 'blob' })
      const url = URL.createObjectURL(res.data)
      const a = document.createElement('a')
      a.href = url
      a.download = `exhibition-pack-${new Date().toISOString().slice(0, 10)}.json`
      a.click()
      URL.revokeObjectURL(url)
      await captureOfflineSnapshotFromServer()
      await reload()
      setMsg('Exhibition pack downloaded. Copy this file and the exhibition app to your pendrive.')
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
        setMsg(`Merged ${ok} item(s) from exhibition. Your live ERP is updated.`)
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
            <p className="mt-1 max-w-2xl text-sm leading-relaxed text-[#1a1814]/70">
              At the shop: download the pack + app to a pendrive. At the stall: install the app, load the pack, bill
              offline. Back at the shop: upload the return file here — duplicates are blocked automatically.
            </p>
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
          <p className="mt-1 text-xs text-[#1a1814]/60">
            {meta ? `${meta.customerCount} customers · ${meta.pieceCount} barcodes` : 'Customers + stock snapshot'}
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
          <p className="mt-1 text-xs text-[#1a1814]/60">Works on laptop &amp; phone — save to pendrive</p>
          <a href="/exhibition-kit/" download="index.html" className={`${erpBtnGhost} mt-3 inline-flex w-full justify-center`}>
            <Download className="size-4" />
            Save app (HTML)
          </a>
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
          <p className="mt-1 flex items-center gap-1.5 text-sm font-semibold text-[#1a1814]">
            <HardDrive className="size-4 text-emerald-700" />
            Load pack in app
          </p>
          <p className="mt-1 text-xs text-[#1a1814]/60">
            Copy pendrive to stall PC/phone → open app → upload pack → scan &amp; bill
          </p>
          <Link href={resellerErpModulePath('billing')} className={`${erpBtnGhost} mt-3 inline-flex w-full justify-center`}>
            Scan &amp; bill (online)
          </Link>
        </div>

        <div className={erpCardCls}>
          <p className="text-[10px] font-bold uppercase tracking-wide text-[#1a1814]/45">Step 3 · Shop</p>
          <p className="mt-1 text-sm font-semibold text-[#1a1814]">Upload return file</p>
          <p className="mt-1 text-xs text-[#1a1814]/60">Export from exhibition app → merge here</p>
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

      <div className={`${erpCardCls} flex flex-wrap items-center gap-3 text-sm text-[#1a1814]/75`}>
        <Smartphone className="size-5 shrink-0 text-emerald-700" />
        <p>
          Estimate numbers continue from your shop (e.g. after ESTIMATE-002 the app uses ESTIMATE-003). Each bill gets a
          unique offline ID so nothing duplicates when you merge.
        </p>
      </div>

      {msg ? <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{msg}</p> : null}
      {err ? <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">{err}</p> : null}

      {queue.length > 0 ? (
        <div className={erpCardCls}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-semibold text-[#1a1814]">Browser queue ({queue.length})</p>
            <button type="button" className={erpBtnGhost} disabled={busy || !online} onClick={() => void mergeBrowserQueue()}>
              Merge browser queue
            </button>
          </div>
          <p className="mt-1 text-xs text-[#1a1814]/55">Items saved in this browser before Wi-Fi returned.</p>
        </div>
      ) : null}

      <p className="text-center text-[11px] text-[#1a1814]/45">
        Last pack cache: {formatWhen(meta?.capturedAt)}
      </p>
    </div>
  )
}

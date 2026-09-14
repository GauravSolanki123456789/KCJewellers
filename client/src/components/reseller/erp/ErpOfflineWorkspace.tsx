'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { CloudOff, Loader2, RefreshCw, Trash2, Wifi, WifiOff } from 'lucide-react'
import {
  captureOfflineSnapshotFromServer,
  getOfflineSnapshotMeta,
  listOfflineQueue,
  registerErpOfflineSw,
  removeOfflineQueueItem,
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

  const reload = useCallback(async () => {
    setMeta(await getOfflineSnapshotMeta())
    setQueue(await listOfflineQueue())
  }, [])

  useEffect(() => {
    void registerErpOfflineSw()
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

  const prepare = async () => {
    setBusy(true)
    setErr(null)
    setMsg(null)
    try {
      const next = await captureOfflineSnapshotFromServer()
      setMeta(next)
      setMsg(
        `This device is ready. ${next.customerCount} customers and ${next.pieceCount} barcodes cached. Keep this browser tab — do not close Chrome until you are back on Wi-Fi.`,
      )
      await reload()
    } catch (e) {
      setErr(erpErr(e))
    } finally {
      setBusy(false)
    }
  }

  const merge = async () => {
    setBusy(true)
    setErr(null)
    setMsg(null)
    try {
      const result = await syncOfflineQueue()
      await reload()
      if (result.failed === 0) {
        setMsg(
          result.ok
            ? `Merged ${result.ok} item(s) into the live ERP. Bill numbers are now the real SALE / SCB / ESTIMATE numbers.`
            : 'Nothing pending to merge.',
        )
      } else {
        setErr(
          `Merged ${result.ok}, ${result.failed} need attention (already sold, or a customer could not be created). See the list below.`,
        )
      }
    } catch (e) {
      setErr(erpErr(e))
    } finally {
      setBusy(false)
    }
  }

  const dropItem = async (id: string) => {
    await removeOfflineQueueItem(id)
    await reload()
  }

  return (
    <div className="space-y-4">
      <div className={erpCardCls}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-[#1a1814]/45">Exhibition kit</p>
            <h2 className="text-lg font-bold text-[#1a1814]">Work without Wi-Fi</h2>
            <p className="mt-1 max-w-2xl text-sm leading-relaxed text-[#1a1814]/70">
              Before a stall or when the connection is still up, cache this shop on this laptop or phone. You can then
              scan barcodes, save customers, estimates and bills on this device. When Wi-Fi returns, merge — new work
              is added next to the data that was already in the ERP.
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

      <div className="grid gap-3 sm:grid-cols-3">
        <div className={erpCardCls}>
          <p className="text-[10px] font-bold uppercase tracking-wide text-[#1a1814]/45">Last cache</p>
          <p className="mt-1 text-sm font-bold text-[#1a1814]">{formatWhen(meta?.capturedAt)}</p>
        </div>
        <div className={erpCardCls}>
          <p className="text-[10px] font-bold uppercase tracking-wide text-[#1a1814]/45">Customers · barcodes</p>
          <p className="mt-1 text-sm font-bold tabular-nums text-[#1a1814]">
            {meta ? `${meta.customerCount} · ${meta.pieceCount}` : '—'}
          </p>
        </div>
        <div className={erpCardCls}>
          <p className="text-[10px] font-bold uppercase tracking-wide text-[#1a1814]/45">Waiting to merge</p>
          <p className="mt-1 text-xl font-bold tabular-nums text-[#1a1814]">{queue.length}</p>
        </div>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <button type="button" className={erpBtnPrimary} disabled={busy || !online} onClick={() => void prepare()}>
          {busy ? <Loader2 className="size-4 animate-spin" /> : <CloudOff className="size-4" />}
          Prepare this device
        </button>
        <button type="button" className={erpBtnGhost} disabled={busy || !online || queue.length === 0} onClick={() => void merge()}>
          {busy ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
          Merge into live ERP
        </button>
        <Link href={resellerErpModulePath('billing')} className={erpBtnGhost}>
          Open Scan &amp; bill
        </Link>
      </div>

      {msg ? <p className="text-sm font-medium text-emerald-800">{msg}</p> : null}
      {err ? <p className="text-sm font-medium text-rose-700">{err}</p> : null}

      <div className={`${erpCardCls} space-y-2 text-sm text-[#1a1814]/80`}>
        <p className="font-semibold text-[#1a1814]">How to use it</p>
        <ol className="list-decimal space-y-1.5 pl-5">
          <li>On Wi-Fi at the shop, open this tab and tap <strong>Prepare this device</strong>.</li>
          <li>Leave Chrome open on this same laptop/phone (sleep is OK; closing the tab is not).</li>
          <li>
            At the exhibition, use <Link className="font-semibold text-emerald-800 underline" href={resellerErpModulePath('billing')}>Scan &amp; bill</Link>{' '}
            as usual. Estimates, cash/GST bills and new customers stay on this device until merge.
          </li>
          <li>Back on Wi-Fi, tap <strong>Merge into live ERP</strong>. Existing bills are kept; exhibition work is added.</li>
        </ol>
        <p className="pt-1 text-xs text-[#1a1814]/60">
          If Wi-Fi drops for a few hours and you already used ERP today, the last cache is reused automatically. Pieces
          already billed stay blocked on this device so the same barcode is not billed twice before merge.
        </p>
      </div>

      <div className={erpCardCls}>
        <p className="mb-3 text-sm font-semibold text-[#1a1814]">Pending on this device</p>
        {queue.length === 0 ? (
          <p className="text-sm text-[#1a1814]/55">Nothing waiting. After an exhibition this list should be empty.</p>
        ) : (
          <ul className="space-y-2">
            {queue.map((item) => (
              <li
                key={item.id}
                className="flex flex-wrap items-start justify-between gap-2 rounded-xl border border-[#e8e4df] bg-[#faf8f4] px-3 py-2.5"
              >
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-[#1a1814]">
                    {item.type === 'customer' ? 'Customer' : item.type === 'estimate' ? 'Estimate' : 'Bill'}
                    {item.localBillNumber ? ` · ${item.localBillNumber}` : ''}
                    {item.serverBillNumber ? ` → ${item.serverBillNumber}` : ''}
                  </p>
                  <p className="text-xs text-[#1a1814]/60">{formatWhen(item.createdAt)}</p>
                  {item.error ? <p className="mt-1 text-xs font-medium text-rose-700">{item.error}</p> : null}
                </div>
                {item.status === 'error' ? (
                  <button type="button" className={erpBtnGhost} onClick={() => void dropItem(item.id)}>
                    <Trash2 className="size-3.5" />
                    Discard
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

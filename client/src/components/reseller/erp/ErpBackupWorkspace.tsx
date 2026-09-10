'use client'

import { useState } from 'react'
import axios from '@/lib/axios'
import { Download, HardDrive, Loader2 } from 'lucide-react'
import { erpBtnPrimary, erpCardCls, erpErr } from '@/components/reseller/erp/erp-ui'

function filenameFromDisposition(header: string | undefined, fallback: string): string {
  if (!header) return fallback
  const star = /filename\*=UTF-8''([^;]+)/i.exec(header)
  if (star?.[1]) {
    try {
      return decodeURIComponent(star[1].trim())
    } catch {
      /* ignore */
    }
  }
  const plain = /filename="([^"]+)"/i.exec(header) || /filename=([^;]+)/i.exec(header)
  return plain?.[1]?.trim().replace(/^"|"$/g, '') || fallback
}

export function ErpBackupWorkspace() {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const downloadBackup = async () => {
    if (busy) return
    setBusy(true)
    setErr(null)
    try {
      const res = await axios.get('/api/reseller/erp/backup', { responseType: 'blob', timeout: 120000 })
      const blob = res.data instanceof Blob ? res.data : new Blob([res.data], { type: 'application/json' })
      const fallback = `erp-backup-${new Date().toISOString().slice(0, 10)}.json`
      const name = filenameFromDisposition(res.headers['content-disposition'], fallback)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = name
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch (e) {
      setErr(erpErr(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={`${erpCardCls} space-y-4`}>
      <div className="flex items-start gap-3">
        <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-emerald-50 ring-1 ring-emerald-200">
          <HardDrive className="size-5 text-emerald-800" aria-hidden />
        </div>
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-[var(--color-jewelry-black,#1a1814)]">ERP data backup</h2>
        </div>
      </div>

      <button
        type="button"
        className={`${erpBtnPrimary} min-h-[44px] w-full sm:w-auto`}
        disabled={busy}
        onClick={() => void downloadBackup()}
      >
        {busy ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
        {busy ? 'Preparing backup…' : 'Download backup'}
      </button>

      {err ? (
        <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-900">{err}</p>
      ) : null}
    </div>
  )
}

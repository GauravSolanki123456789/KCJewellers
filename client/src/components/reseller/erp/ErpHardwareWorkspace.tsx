'use client'

import { useEffect, useState } from 'react'
import axios from '@/lib/axios'
import { erpBtnPrimary, erpCardCls, erpInputCls } from '@/components/reseller/erp/erp-ui'
import { Loader2, Printer, Save, Wifi } from 'lucide-react'

type HardwareSettings = {
  labelPrinter?: { type?: string; address?: string }
  billingPrinter?: { type?: string; address?: string }
  scanner?: { mode?: string; suffix?: string }
  companyCode?: string
}

export function ErpHardwareWorkspace() {
  const [hw, setHw] = useState<HardwareSettings>({
    labelPrinter: { type: 'network', address: '' },
    billingPrinter: { type: 'network', address: '' },
    scanner: { mode: 'USB wedge', suffix: 'Enter' },
    companyCode: 'KC925',
  })
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(false)
  const [testMsg, setTestMsg] = useState<string | null>(null)

  useEffect(() => {
    void axios
      .get<{ settings: { hardware?: HardwareSettings } }>('/api/reseller/erp/settings')
      .then((res) => {
        const h = res.data.settings?.hardware
        if (h) setHw((prev) => ({ ...prev, ...h }))
      })
      .catch(() => {})
  }, [])

  const save = async () => {
    setBusy(true)
    setSaved(false)
    try {
      await axios.put('/api/reseller/erp/settings', { settings: { hardware: hw } })
      setSaved(true)
    } catch {
      alert('Could not save hardware settings')
    } finally {
      setBusy(false)
    }
  }

  const testPrint = async () => {
    setTestMsg(null)
    try {
      const res = await axios.post<{ printerConfigured: boolean; results: unknown[] }>(
        '/api/reseller/erp/print/barcodes',
        {
          piece_ids: [],
          batch_id: null,
        },
      )
      void res
      setTestMsg('Save hardware first, then generate barcodes from Products.')
    } catch (e) {
      setTestMsg('Configure label printer IP/port, save, then use Generate barcodes in Products.')
    }
  }

  return (
    <div className="space-y-4">
      <div className={erpCardCls}>
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-[var(--color-jewelry-black,#1a1814)]">
          <Printer className="size-4 text-[var(--kc-accent,#c41e3a)]" />
          Barcode / label printer
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-xs font-medium text-[var(--color-jewelry-black,#1a1814)]/60">
            Connection type
            <select
              className={`${erpInputCls} mt-1`}
              value={hw.labelPrinter?.type || 'network'}
              onChange={(e) =>
                setHw((h) => ({ ...h, labelPrinter: { ...h.labelPrinter, type: e.target.value } }))
              }
            >
              <option value="network">Network (TCP 9100)</option>
              <option value="usb">USB</option>
            </select>
          </label>
          <label className="text-xs font-medium text-[var(--color-jewelry-black,#1a1814)]/60">
            Printer IP / address
            <input
              className={`${erpInputCls} mt-1`}
              placeholder="192.168.1.50"
              value={hw.labelPrinter?.address || ''}
              onChange={(e) =>
                setHw((h) => ({ ...h, labelPrinter: { ...h.labelPrinter, address: e.target.value } }))
              }
            />
          </label>
          <label className="text-xs font-medium text-[var(--color-jewelry-black,#1a1814)]/60 sm:col-span-2">
            Company code on label
            <input
              className={`${erpInputCls} mt-1`}
              value={hw.companyCode || ''}
              onChange={(e) => setHw((h) => ({ ...h, companyCode: e.target.value }))}
            />
          </label>
        </div>
      </div>

      <div className={erpCardCls}>
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-[var(--color-jewelry-black,#1a1814)]">
          <Wifi className="size-4 text-[var(--kc-accent,#c41e3a)]" />
          Billing printer
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-xs font-medium text-[var(--color-jewelry-black,#1a1814)]/60">
            Type
            <select
              className={`${erpInputCls} mt-1`}
              value={hw.billingPrinter?.type || 'network'}
              onChange={(e) =>
                setHw((h) => ({ ...h, billingPrinter: { ...h.billingPrinter, type: e.target.value } }))
              }
            >
              <option value="network">Network</option>
              <option value="usb">USB</option>
            </select>
          </label>
          <label className="text-xs font-medium text-[var(--color-jewelry-black,#1a1814)]/60">
            Address
            <input
              className={`${erpInputCls} mt-1`}
              placeholder="192.168.1.51"
              value={hw.billingPrinter?.address || ''}
              onChange={(e) =>
                setHw((h) => ({ ...h, billingPrinter: { ...h.billingPrinter, address: e.target.value } }))
              }
            />
          </label>
        </div>
      </div>

      <div className={erpCardCls}>
        <p className="mb-2 text-sm font-semibold text-[var(--color-jewelry-black,#1a1814)]">Scanner</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-xs font-medium text-[var(--color-jewelry-black,#1a1814)]/60">
            Mode
            <input
              className={`${erpInputCls} mt-1`}
              value={hw.scanner?.mode || ''}
              onChange={(e) => setHw((h) => ({ ...h, scanner: { ...h.scanner, mode: e.target.value } }))}
            />
          </label>
          <label className="text-xs font-medium text-[var(--color-jewelry-black,#1a1814)]/60">
            Scan suffix
            <input
              className={`${erpInputCls} mt-1`}
              value={hw.scanner?.suffix || ''}
              onChange={(e) => setHw((h) => ({ ...h, scanner: { ...h.scanner, suffix: e.target.value } }))}
            />
          </label>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className={erpBtnPrimary} disabled={busy} onClick={() => void save()}>
          {busy ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
          Save hardware
        </button>
        {saved ? <span className="text-xs font-medium text-emerald-600">Saved</span> : null}
        <button type="button" className="text-xs font-semibold text-[var(--kc-accent,#c41e3a)]" onClick={() => void testPrint()}>
          Test connection
        </button>
        {testMsg ? <span className="text-xs text-[var(--color-jewelry-black,#1a1814)]/55">{testMsg}</span> : null}
      </div>
    </div>
  )
}

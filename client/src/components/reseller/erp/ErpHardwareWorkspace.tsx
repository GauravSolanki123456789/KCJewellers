'use client'

import { useCallback, useEffect, useState } from 'react'
import axios from '@/lib/axios'
import {
  DEFAULT_SERIAL,
  migrateHardwareSettings,
  newProfileId,
  normalizeComPort,
  type ErpHardwareSettings,
  type ErpPrinterProfile,
  type ErpScaleProfile,
  type ErpSerialSettings,
} from '@/lib/erp-hardware'
import { ErpWorkstationPanel, useErpWorkstationSelection } from '@/components/reseller/erp/ErpWorkstationBar'
import { erpBtnPrimary, erpCardCls, erpInputCls, erpErr, erpMonoUrl } from '@/components/reseller/erp/erp-ui'
import type { ErpStockPiece } from '@/components/reseller/erp/erp-ui'
import { useAuth } from '@/hooks/useAuth'
import type { WholesaleUserFields } from '@/lib/customer-tier'
import {
  connectLabelPrinter,
  sendTsplOverSerial,
  webSerialSupported,
} from '@/lib/erp-serial-device'
import { checkLocalPrintAgent, printViaLocalAgent, resolveWindowsPrinterName } from '@/lib/erp-local-print'
import { printErpTestReceipt } from '@/lib/erp-billing-print'
import { kcPoshRfidHealthUrl, kcPoshRfidInventoryUrl } from '@/lib/api-base'
import { Loader2, Plus, Printer, Radio, Save, Scale, Trash2, Wifi } from 'lucide-react'

function SerialFields({
  value,
  onChange,
}: {
  value: ErpSerialSettings
  onChange: (v: ErpSerialSettings) => void
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="text-xs font-medium text-[var(--color-jewelry-black,#1a1814)]/60">
        COM port
        <input
          className={`${erpInputCls} mt-1 font-mono`}
          placeholder="COM3"
          value={value.port}
          onChange={(e) => onChange({ ...value, port: e.target.value })}
        />
      </label>
      <label className="text-xs font-medium text-[var(--color-jewelry-black,#1a1814)]/60">
        Baud rate
        <select
          className={`${erpInputCls} mt-1`}
          value={value.baudRate}
          onChange={(e) => onChange({ ...value, baudRate: Number(e.target.value) })}
        >
          {[2400, 4800, 9600, 19200, 38400, 115200].map((b) => (
            <option key={b} value={b}>
              {b}
            </option>
          ))}
        </select>
      </label>
      <label className="text-xs font-medium text-[var(--color-jewelry-black,#1a1814)]/60">
        Data bits
        <select
          className={`${erpInputCls} mt-1`}
          value={value.dataBits}
          onChange={(e) => onChange({ ...value, dataBits: Number(e.target.value) as 7 | 8 })}
        >
          <option value={8}>8</option>
          <option value={7}>7</option>
        </select>
      </label>
      <label className="text-xs font-medium text-[var(--color-jewelry-black,#1a1814)]/60">
        Parity
        <select
          className={`${erpInputCls} mt-1`}
          value={value.parity}
          onChange={(e) =>
            onChange({ ...value, parity: e.target.value as ErpSerialSettings['parity'] })
          }
        >
          <option value="none">None</option>
          <option value="even">Even</option>
          <option value="odd">Odd</option>
        </select>
      </label>
      <label className="text-xs font-medium text-[var(--color-jewelry-black,#1a1814)]/60 sm:col-span-2">
        Stop bits
        <select
          className={`${erpInputCls} mt-1 max-w-xs`}
          value={value.stopBits}
          onChange={(e) => onChange({ ...value, stopBits: Number(e.target.value) as 1 | 2 })}
        >
          <option value={1}>1</option>
          <option value={2}>2</option>
        </select>
      </label>
    </div>
  )
}

export function ErpHardwareWorkspace() {
  const auth = useAuth()
  const rfidEnabled = !!(auth.user as WholesaleUserFields | null)?.reseller_rfid_enabled
  const [hw, setHw] = useState<ErpHardwareSettings>(() =>
    migrateHardwareSettings({ companyCode: 'KC925', printerProfiles: [], scaleProfiles: [] }),
  )
  const [workstation, setWorkstation] = useErpWorkstationSelection()
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(false)
  const [testMsg, setTestMsg] = useState<string | null>(null)
  const [testingId, setTestingId] = useState<string | null>(null)
  const [rfidSyncBusy, setRfidSyncBusy] = useState(false)
  const [rfidLookup, setRfidLookup] = useState('')
  const [rfidLookupBusy, setRfidLookupBusy] = useState(false)
  const [rfidLookupResult, setRfidLookupResult] = useState<{
    found: boolean
    piece: ErpStockPiece | null
    lookup_by?: 'rfid' | 'barcode' | null
    rfid_tag?: string | null
    barcode?: string | null
    query?: string
  } | null>(null)
  const runRfidLookup = useCallback((raw: string) => {
    const q = raw.trim()
    if (!q) return
    setRfidLookupBusy(true)
    void axios
      .get<{
        found: boolean
        piece: ErpStockPiece | null
        lookup_by?: 'rfid' | 'barcode' | null
        rfid_tag?: string | null
        barcode?: string | null
        query?: string
      }>('/api/reseller/erp/rfid/lookup', { params: { q } })
      .then((res) => setRfidLookupResult(res.data))
      .catch(() =>
        setRfidLookupResult({ found: false, piece: null, lookup_by: null, query: q, barcode: q, rfid_tag: null }),
      )
      .finally(() => setRfidLookupBusy(false))
  }, [])
  const [epsonTestBusy, setEpsonTestBusy] = useState(false)

  useEffect(() => {
    void axios
      .get<{ settings: { hardware?: ErpHardwareSettings } }>('/api/reseller/erp/settings')
      .then((res) => {
        setHw(migrateHardwareSettings(res.data.settings?.hardware))
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

  const updatePrinter = (id: string, patch: Partial<ErpPrinterProfile>) => {
    setHw((h) => ({
      ...h,
      printerProfiles: (h.printerProfiles || []).map((p) => (p.id === id ? { ...p, ...patch } : p)),
    }))
  }

  const addPrinter = () => {
    const p: ErpPrinterProfile = {
      id: newProfileId(),
      name: `Printer ${(hw.printerProfiles?.length || 0) + 1}`,
      connection: 'usb',
      windowsPrinter: { name: 'TSC TTP-244 Pro', portHint: 'USB001' },
      labelFormat: 'prn',
      isDefault: !(hw.printerProfiles?.length || 0),
    }
    setHw((h) => ({ ...h, printerProfiles: [...(h.printerProfiles || []), p] }))
  }

  const removePrinter = (id: string) => {
    setHw((h) => {
      const next = (h.printerProfiles || []).filter((p) => p.id !== id)
      if (next.length && !next.some((p) => p.isDefault)) next[0].isDefault = true
      return { ...h, printerProfiles: next }
    })
  }

  const setDefaultPrinter = (id: string) => {
    setHw((h) => ({
      ...h,
      printerProfiles: (h.printerProfiles || []).map((p) => ({ ...p, isDefault: p.id === id })),
    }))
  }

  const updateScale = (id: string, patch: Partial<ErpScaleProfile>) => {
    setHw((h) => ({
      ...h,
      scaleProfiles: (h.scaleProfiles || []).map((p) => (p.id === id ? { ...p, ...patch } : p)),
    }))
  }

  const addScale = () => {
    const p: ErpScaleProfile = {
      id: newProfileId(),
      name: `Scale ${(hw.scaleProfiles?.length || 0) + 1}`,
      serial: { ...DEFAULT_SERIAL },
      brand: 'essae',
      isDefault: !(hw.scaleProfiles?.length || 0),
    }
    setHw((h) => ({ ...h, scaleProfiles: [...(h.scaleProfiles || []), p] }))
  }

  const addMettlerScale = () => {
    const p: ErpScaleProfile = {
      id: newProfileId(),
      name: 'Mettler Toledo JSB15005',
      serial: { port: 'COM3', baudRate: 9600, dataBits: 8, parity: 'none', stopBits: 1 },
      brand: 'mettler_toledo',
      isDefault: !(hw.scaleProfiles?.length || 0),
    }
    setHw((h) => ({ ...h, scaleProfiles: [...(h.scaleProfiles || []), p] }))
  }

  const removeScale = (id: string) => {
    setHw((h) => {
      const next = (h.scaleProfiles || []).filter((p) => p.id !== id)
      if (next.length && !next.some((p) => p.isDefault)) next[0].isDefault = true
      return { ...h, scaleProfiles: next }
    })
  }

  const testPrinter = useCallback(async (profile: ErpPrinterProfile) => {
    setTestingId(profile.id)
    setTestMsg(null)
    try {
      if (profile.connection === 'usb') {
        if (!(await checkLocalPrintAgent())) {
          setTestMsg('Copy erp-print-service folder to Desktop, run START-KC-Label-Print.bat, then try Test print again.')
          return
        }
        const res = await axios.post<{ tspl?: string; error?: string }>(
          '/api/reseller/erp/print/test-label',
          { printer_profile_id: profile.id },
        )
        if (!res.data.tspl) throw new Error(res.data.error || 'No test label generated')
        const printerName = resolveWindowsPrinterName(null, profile.id, {
          connection: 'usb',
          windowsPrinter: profile.windowsPrinter,
        })
        await printViaLocalAgent([res.data.tspl], printerName)
        setTestMsg(`Test label sent · USB · ${printerName}.`)
        return
      }

      if (profile.connection === 'serial') {
        if (!webSerialSupported()) {
          setTestMsg('Use Chrome or Edge on this PC, then pick the COM port when prompted.')
          return
        }
        const serial = profile.serial || DEFAULT_SERIAL
        const port = await connectLabelPrinter(serial, true)
        const res = await axios.post<{ tspl?: string; error?: string }>(
          '/api/reseller/erp/print/test-label',
          { printer_profile_id: profile.id },
        )
        if (!res.data.tspl) throw new Error(res.data.error || 'No test label generated')
        await sendTsplOverSerial(port, res.data.tspl)
        setTestMsg(`Test label sent · ${normalizeComPort(serial.port)} · ${serial.baudRate} 8-N-1.`)
        return
      }

      const res = await axios.post<{ printed?: boolean; message?: string; error?: string }>(
        '/api/reseller/erp/print/test-label',
        { printer_profile_id: profile.id, send_to_printer: true },
      )
      if (res.data.error) throw new Error(res.data.error)
      setTestMsg(res.data.message || 'Test label sent to network printer.')
    } catch (e) {
      setTestMsg(erpErr(e))
    } finally {
      setTestingId(null)
    }
  }, [])

  return (
    <div className="space-y-4">
      <ErpWorkstationPanel value={workstation} onChange={setWorkstation} />

      {rfidEnabled ? (
        <div className={erpCardCls}>
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-[var(--color-jewelry-black,#1a1814)]">
            <Radio className="size-4 text-[var(--kc-accent,#c41e3a)]" />
            RFID API
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-xs font-medium text-[var(--color-jewelry-black,#1a1814)]/70">
              KC API key
              <input
                className={`${erpInputCls} mt-1 font-mono text-xs`}
                type="password"
                autoComplete="off"
                placeholder="bnmarlecha-8f3a9c2e1b7d4f6a"
                value={hw.poshRfid?.apiKey || ''}
                onChange={(e) =>
                  setHw((h) => ({
                    ...h,
                    poshRfid: { ...(h.poshRfid || {}), apiKey: e.target.value },
                  }))
                }
              />
            </label>
            <label className="text-xs font-medium text-[var(--color-jewelry-black,#1a1814)]/70">
              Store / showroom ID
              <input
                className={`${erpInputCls} mt-1 font-mono text-xs`}
                placeholder="BNMARLECHA-001"
                value={hw.poshRfid?.storeId || ''}
                onChange={(e) =>
                  setHw((h) => ({
                    ...h,
                    poshRfid: { ...(h.poshRfid || {}), storeId: e.target.value },
                  }))
                }
              />
            </label>
          </div>

          <div className="mt-3 space-y-2 text-xs">
            <div>
              <p className="mb-1 font-medium text-[var(--color-jewelry-black,#1a1814)]/55">Inventory URL</p>
              <p className={erpMonoUrl}>{kcPoshRfidInventoryUrl()}</p>
            </div>
            <div>
              <p className="mb-1 font-medium text-[var(--color-jewelry-black,#1a1814)]/55">Health check</p>
              <p className={erpMonoUrl}>{kcPoshRfidHealthUrl()}</p>
            </div>
            <p className="text-[var(--color-jewelry-black,#1a1814)]/55">
              Headers: <span className="font-mono">X-Api-Key</span> · <span className="font-mono">X-Store-Id</span>
            </p>
          </div>

          <label className="mt-4 block text-xs font-medium text-[var(--color-jewelry-black,#1a1814)]/70">
            Posh API base URL
            <input
              className={`${erpInputCls} mt-1 font-mono text-xs`}
              placeholder="https://api.poshrfid.example/v1"
              value={hw.poshRfid?.apiUrl || ''}
              onChange={(e) =>
                setHw((h) => ({
                  ...h,
                  poshRfid: { ...(h.poshRfid || {}), apiUrl: e.target.value },
                }))
              }
            />
          </label>
          <button
            type="button"
            className={`${erpBtnPrimary} mt-3`}
            disabled={rfidSyncBusy}
            onClick={() => {
              setRfidSyncBusy(true)
              void axios
                .post('/api/reseller/erp/rfid/sync-inventory')
                .then(() => setTestMsg('RFID inventory synced to Posh.'))
                .catch((e) => setTestMsg(erpErr(e)))
                .finally(() => setRfidSyncBusy(false))
            }}
          >
            {rfidSyncBusy ? <Loader2 className="size-4 animate-spin" /> : <Radio className="size-4" />}
            Sync linked stock to RFID gun
          </button>

          <div className="mt-5 border-t border-[var(--color-slate-700,#e8e4df)] pt-4">
            <p className="mb-2 text-sm font-semibold text-[var(--color-jewelry-black,#1a1814)]">RFID tag lookup</p>
            <p className="mb-3 text-xs text-[var(--color-jewelry-black,#1a1814)]/60">
              Scan or type an RFID tag <span className="font-medium">or product barcode</span> to see linked stock details.
            </p>
            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                className={erpInputCls}
                placeholder="RFID tag e.g. B1238 or barcode e.g. FS001"
                value={rfidLookup}
                onChange={(e) => setRfidLookup(e.target.value.toUpperCase())}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && rfidLookup.trim()) runRfidLookup(rfidLookup)
                }}
              />
              <button
                type="button"
                className={erpBtnPrimary}
                disabled={rfidLookupBusy || !rfidLookup.trim()}
                onClick={() => runRfidLookup(rfidLookup)}
              >
                {rfidLookupBusy ? <Loader2 className="size-4 animate-spin" /> : 'Lookup'}
              </button>
            </div>
            {rfidLookupResult ? (
              <div
                className={`mt-3 rounded-xl border px-3 py-3 text-sm ${
                  rfidLookupResult.found && rfidLookupResult.piece
                    ? 'border-emerald-300 bg-white shadow-sm'
                    : 'border-amber-300 bg-amber-50'
                }`}
              >
                {!rfidLookupResult.found || !rfidLookupResult.piece ? (
                  <p className="text-[var(--color-jewelry-black,#1a1814)]">
                    No in-stock piece found for{' '}
                    <span className="font-mono font-semibold">
                      {rfidLookupResult.query || rfidLookupResult.barcode || rfidLookup}
                    </span>
                    .
                  </p>
                ) : (
                  <div className="space-y-1.5 text-[var(--color-jewelry-black,#1a1814)]">
                    <p className="font-mono text-base font-bold tracking-wide">{rfidLookupResult.piece.barcode}</p>
                    <p className="text-sm font-semibold">
                      {rfidLookupResult.piece.product_name || rfidLookupResult.piece.item_code || '—'}
                    </p>
                    <p className="text-xs text-[var(--color-jewelry-black,#1a1814)]/75">
                      {rfidLookupResult.piece.avg_weight ?? '—'}g · {rfidLookupResult.piece.purity ?? '—'} purity ·{' '}
                      {rfidLookupResult.piece.metal_type || '—'} · {rfidLookupResult.piece.status}
                    </p>
                    {rfidLookupResult.piece.sku ? (
                      <p className="text-xs text-[var(--color-jewelry-black,#1a1814)]/70">
                        SKU {rfidLookupResult.piece.sku}
                        {rfidLookupResult.piece.style_code ? ` · ${rfidLookupResult.piece.style_code}` : ''}
                      </p>
                    ) : null}
                    {rfidLookupResult.piece.rfid_tag ? (
                      <p className="text-xs font-mono font-semibold text-emerald-800">
                        RFID {rfidLookupResult.piece.rfid_tag}
                      </p>
                    ) : rfidLookupResult.lookup_by === 'barcode' ? (
                      <p className="text-xs text-[var(--color-jewelry-black,#1a1814)]/55">No RFID tag linked yet.</p>
                    ) : null}
                  </div>
                )}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className={erpCardCls}>
        <label className="block text-xs font-medium text-[var(--color-jewelry-black,#1a1814)]/60">
          Default company code on labels
          <input
            className={`${erpInputCls} mt-1 max-w-xs font-mono`}
            value={hw.companyCode || ''}
            onChange={(e) => setHw((h) => ({ ...h, companyCode: e.target.value }))}
          />
        </label>
      </div>

      <div className={erpCardCls}>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-sm font-semibold text-[var(--color-jewelry-black,#1a1814)]">
            <Printer className="size-4 text-[var(--kc-accent,#c41e3a)]" />
            Barcode / label printers
          </div>
          <button type="button" className={erpBtnPrimary} onClick={addPrinter}>
            <Plus className="size-4" />
            Add printer
          </button>
        </div>

        <div className="space-y-4">
          {(hw.printerProfiles || []).map((p) => (
            <div
              key={p.id}
              className="rounded-xl border border-[var(--color-slate-700,#e8e4df)] bg-[var(--color-slate-900,#f7f4ef)]/40 p-3"
            >
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <input
                  className={`${erpInputCls} min-w-[140px] flex-1 font-semibold`}
                  value={p.name}
                  onChange={(e) => updatePrinter(p.id, { name: e.target.value })}
                />
                <label className="flex items-center gap-1.5 text-xs text-[var(--color-jewelry-black,#1a1814)]/60">
                  <input
                    type="radio"
                    name="default-printer"
                    checked={!!p.isDefault}
                    onChange={() => setDefaultPrinter(p.id)}
                  />
                  Default
                </label>
                <button
                  type="button"
                  className="text-xs font-semibold text-[var(--kc-accent,#c41e3a)]"
                  disabled={testingId === p.id}
                  onClick={() => void testPrinter(p)}
                >
                  {testingId === p.id ? 'Testing…' : 'Test print'}
                </button>
                {(hw.printerProfiles?.length || 0) > 1 ? (
                  <button
                    type="button"
                    className="ml-auto text-rose-600"
                    aria-label="Remove printer"
                    onClick={() => removePrinter(p.id)}
                  >
                    <Trash2 className="size-4" />
                  </button>
                ) : null}
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="text-xs font-medium text-[var(--color-jewelry-black,#1a1814)]/60">
                  Connection
                  <select
                    className={`${erpInputCls} mt-1`}
                    value={p.connection}
                    onChange={(e) => {
                      const connection = e.target.value as 'network' | 'serial' | 'usb'
                      updatePrinter(p.id, {
                        connection,
                        network:
                          connection === 'network'
                            ? p.network || { host: '192.168.1.50', port: 9100 }
                            : p.network,
                        serial:
                          connection === 'serial'
                            ? p.serial || { ...DEFAULT_SERIAL }
                            : p.serial,
                        windowsPrinter:
                          connection === 'usb'
                            ? p.windowsPrinter || { name: 'TSC TTP-244 Pro', portHint: 'USB001' }
                            : p.windowsPrinter,
                      })
                    }}
                  >
                    <option value="usb">USB (Windows · USB001)</option>
                    <option value="network">Network (TCP 9100)</option>
                    <option value="serial">Serial / COM</option>
                  </select>
                </label>
                <label className="text-xs font-medium text-[var(--color-jewelry-black,#1a1814)]/60">
                  Label format
                  <select
                    className={`${erpInputCls} mt-1`}
                    value={p.labelFormat || 'tspl'}
                    onChange={(e) =>
                      updatePrinter(p.id, { labelFormat: e.target.value as 'tspl' | 'prn' })
                    }
                  >
                    <option value="tspl">TSPL (TSC / thermal)</option>
                    <option value="prn">PRN template (Print formats)</option>
                  </select>
                </label>
              </div>

              {p.connection === 'network' ? (
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <label className="text-xs font-medium text-[var(--color-jewelry-black,#1a1814)]/60">
                    Printer IP
                    <input
                      className={`${erpInputCls} mt-1 font-mono`}
                      placeholder="192.168.1.50"
                      value={p.network?.host || ''}
                      onChange={(e) =>
                        updatePrinter(p.id, {
                          network: { host: e.target.value, port: p.network?.port || 9100 },
                        })
                      }
                    />
                  </label>
                  <label className="text-xs font-medium text-[var(--color-jewelry-black,#1a1814)]/60">
                    Port
                    <input
                      type="number"
                      className={`${erpInputCls} mt-1 font-mono`}
                      value={p.network?.port || 9100}
                      onChange={(e) =>
                        updatePrinter(p.id, {
                          network: { host: p.network?.host || '', port: Number(e.target.value) || 9100 },
                        })
                      }
                    />
                  </label>
                </div>
              ) : p.connection === 'usb' ? (
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <label className="text-xs font-medium text-[var(--color-jewelry-black,#1a1814)]/60">
                    Windows printer name
                    <input
                      className={`${erpInputCls} mt-1 font-mono`}
                      placeholder="TSC TTP-244 Pro"
                      value={p.windowsPrinter?.name || ''}
                      onChange={(e) =>
                        updatePrinter(p.id, {
                          windowsPrinter: {
                            name: e.target.value,
                            portHint: p.windowsPrinter?.portHint || 'USB001',
                          },
                        })
                      }
                    />
                  </label>
                  <label className="text-xs font-medium text-[var(--color-jewelry-black,#1a1814)]/60">
                    Windows port (reference)
                    <input
                      className={`${erpInputCls} mt-1 font-mono`}
                      placeholder="USB001"
                      value={p.windowsPrinter?.portHint || ''}
                      onChange={(e) =>
                        updatePrinter(p.id, {
                          windowsPrinter: {
                            name: p.windowsPrinter?.name || 'TSC TTP-244 Pro',
                            portHint: e.target.value,
                          },
                        })
                      }
                    />
                  </label>
                </div>
              ) : (
                <div className="mt-3">
                  <p className="mb-2 text-[10px] font-medium uppercase tracking-wide text-[var(--color-jewelry-black,#1a1814)]/45">
                    Serial settings (e.g. 9600 · 8 · None · 1 stop · COM3)
                  </p>
                  <SerialFields
                    value={p.serial || DEFAULT_SERIAL}
                    onChange={(serial) => updatePrinter(p.id, { serial })}
                  />
                </div>
              )}

              <label className="mt-3 block text-xs font-medium text-[var(--color-jewelry-black,#1a1814)]/60">
                Company code override (optional)
                <input
                  className={`${erpInputCls} mt-1 max-w-xs font-mono`}
                  placeholder={hw.companyCode || 'KC925'}
                  value={p.companyCode || ''}
                  onChange={(e) => updatePrinter(p.id, { companyCode: e.target.value })}
                />
              </label>
            </div>
          ))}
        </div>
      </div>

      <div className={erpCardCls}>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-sm font-semibold text-[var(--color-jewelry-black,#1a1814)]">
            <Scale className="size-4 text-[var(--kc-accent,#c41e3a)]" />
            Weighing machines
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={erpBtnPrimary} onClick={addMettlerScale}>
              <Plus className="size-4" />
              Mettler Toledo preset
            </button>
            <button type="button" className={erpBtnPrimary} onClick={addScale}>
              <Plus className="size-4" />
              Add scale
            </button>
          </div>
        </div>
        <p className="mb-3 text-[11px] text-[var(--color-jewelry-black,#1a1814)]/55">
          Each PC picks its own scale in &quot;This workstation&quot; above. Use Essae on one counter and Mettler
          Toledo JSB15005 on another — connect via USB‑serial, then choose the COM port in Chrome.
        </p>

        <div className="space-y-4">
          {(hw.scaleProfiles || []).map((s) => (
            <div
              key={s.id}
              className="rounded-xl border border-[var(--color-slate-700,#e8e4df)] bg-[var(--color-slate-900,#f7f4ef)]/40 p-3"
            >
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <input
                  className={`${erpInputCls} min-w-[140px] flex-1 font-semibold`}
                  value={s.name}
                  onChange={(e) => updateScale(s.id, { name: e.target.value })}
                />
                <label className="flex items-center gap-1.5 text-xs text-[var(--color-jewelry-black,#1a1814)]/60">
                  <input
                    type="radio"
                    name="default-scale"
                    checked={!!s.isDefault}
                    onChange={() =>
                      setHw((h) => ({
                        ...h,
                        scaleProfiles: (h.scaleProfiles || []).map((x) => ({
                          ...x,
                          isDefault: x.id === s.id,
                        })),
                      }))
                    }
                  />
                  Default
                </label>
                {(hw.scaleProfiles?.length || 0) > 1 ? (
                  <button
                    type="button"
                    className="ml-auto text-rose-600"
                    aria-label="Remove scale"
                    onClick={() => removeScale(s.id)}
                  >
                    <Trash2 className="size-4" />
                  </button>
                ) : null}
              </div>
              <label className="mb-3 block text-xs font-medium text-[var(--color-jewelry-black,#1a1814)]/60">
                Brand / protocol
                <select
                  className={`${erpInputCls} mt-1 max-w-xs`}
                  value={s.brand || 'essae'}
                  onChange={(e) =>
                    updateScale(s.id, { brand: e.target.value as ErpScaleProfile['brand'] })
                  }
                >
                  <option value="essae">Essae (continuous weight stream)</option>
                  <option value="mettler_toledo">Mettler Toledo MT-SICS (JSB15005)</option>
                  <option value="generic">Generic decimal stream</option>
                </select>
              </label>
              {s.brand === 'mettler_toledo' ? (
                <p className="mb-2 text-[10px] text-[var(--color-jewelry-black,#1a1814)]/50">
                  Default 9600 8N1. Enable continuous output on the scale (Settings → Interface → RS232).
                </p>
              ) : null}
              <SerialFields
                value={s.serial}
                onChange={(serial) => updateScale(s.id, { serial })}
              />
            </div>
          ))}
        </div>
      </div>

      <div className={erpCardCls}>
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-[var(--color-jewelry-black,#1a1814)]">
          <Wifi className="size-4 text-[var(--kc-accent,#c41e3a)]" />
          Epson billing printer
        </div>
        <p className="mb-3 text-[10px] text-[var(--color-jewelry-black,#1a1814)]/45">
          Receipt printer for sales bills — separate from TSC barcode labels. Default IP from Epson
          self-test: 192.168.0.198
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-xs font-medium text-[var(--color-jewelry-black,#1a1814)]/60">
            Type
            <select
              className={`${erpInputCls} mt-1`}
              value={hw.billingPrinter?.type || 'windows'}
              onChange={(e) =>
                setHw((h) => ({
                  ...h,
                  billingPrinter: {
                    ...h.billingPrinter,
                    type: e.target.value as 'network' | 'serial' | 'windows',
                  },
                }))
              }
            >
              <option value="windows">Windows (this PC — recommended)</option>
              <option value="network">Network IP (server on same LAN)</option>
              <option value="serial">Serial / COM</option>
            </select>
          </label>
          {hw.billingPrinter?.type === 'windows' || !hw.billingPrinter?.type ? (
            <label className="text-xs font-medium text-[var(--color-jewelry-black,#1a1814)]/60 sm:col-span-2">
              Windows printer name
              <input
                className={`${erpInputCls} mt-1 font-mono`}
                placeholder="EPSON TM-m30III Receipt"
                value={hw.billingPrinter?.windowsPrinterName || ''}
                onChange={(e) =>
                  setHw((h) => ({
                    ...h,
                    billingPrinter: {
                      ...h.billingPrinter,
                      type: h.billingPrinter?.type || 'windows',
                      windowsPrinterName: e.target.value,
                    },
                  }))
                }
              />
            </label>
          ) : (
            <>
              <label className="text-xs font-medium text-[var(--color-jewelry-black,#1a1814)]/60">
                IP address
                <input
                  className={`${erpInputCls} mt-1 font-mono`}
                  placeholder="192.168.0.198"
                  value={hw.billingPrinter?.address || ''}
                  onChange={(e) =>
                    setHw((h) => ({
                      ...h,
                      billingPrinter: { ...h.billingPrinter, address: e.target.value },
                    }))
                  }
                />
              </label>
              <label className="text-xs font-medium text-[var(--color-jewelry-black,#1a1814)]/60">
                Port
                <input
                  type="number"
                  className={`${erpInputCls} mt-1 font-mono`}
                  value={hw.billingPrinter?.port || 9100}
                  onChange={(e) =>
                    setHw((h) => ({
                      ...h,
                      billingPrinter: {
                        ...h.billingPrinter,
                        port: Number(e.target.value) || 9100,
                      },
                    }))
                  }
                />
              </label>
            </>
          )}
        </div>
        <button
          type="button"
          className={`${erpBtnPrimary} mt-3`}
          disabled={epsonTestBusy}
          onClick={() => {
            setEpsonTestBusy(true)
            void printErpTestReceipt()
              .then((msg) => setTestMsg(msg))
              .catch((e) => setTestMsg(e instanceof Error ? e.message : 'Epson test print failed'))
              .finally(() => setEpsonTestBusy(false))
          }}
        >
          {epsonTestBusy ? <Loader2 className="size-4 animate-spin" /> : <Printer className="size-4" />}
          Test Epson receipt
        </button>
      </div>

      <div className={erpCardCls}>
        <p className="mb-2 text-sm font-semibold text-[var(--color-jewelry-black,#1a1814)]">Scanner</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-xs font-medium text-[var(--color-jewelry-black,#1a1814)]/60">
            Mode
            <input
              className={`${erpInputCls} mt-1`}
              value={hw.scanner?.mode || 'USB wedge'}
              onChange={(e) =>
                setHw((h) => ({ ...h, scanner: { ...h.scanner, mode: e.target.value } }))
              }
            />
          </label>
          <label className="text-xs font-medium text-[var(--color-jewelry-black,#1a1814)]/60">
            Scan suffix
            <input
              className={`${erpInputCls} mt-1`}
              value={hw.scanner?.suffix || 'Enter'}
              onChange={(e) =>
                setHw((h) => ({ ...h, scanner: { ...h.scanner, suffix: e.target.value } }))
              }
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
        {testMsg ? (
          <span className="text-xs text-[var(--color-jewelry-black,#1a1814)]/70">{testMsg}</span>
        ) : null}
      </div>
    </div>
  )
}

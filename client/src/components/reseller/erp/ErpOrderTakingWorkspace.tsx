'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import axios from '@/lib/axios'
import { Camera, Loader2, Plus, ScanBarcode, Trash2, Download, X } from 'lucide-react'
import { useErpModuleSession } from '@/hooks/useErpModuleSession'
import { ErpCustomerSuggestField } from '@/components/reseller/erp/ErpCustomerSuggestField'
import { ErpCameraScannerModal } from '@/components/reseller/erp/ErpCameraScannerModal'
import {
  erpBtnGhost,
  erpBtnPrimary,
  erpCardCls,
  erpErr,
  erpInputCls,
  type ErpCustomer,
  type ErpProductHit,
} from '@/components/reseller/erp/erp-ui'
import { normalizeCatalogImageSrc } from '@/lib/normalize-image-url'
import { downloadOrderTakingExcel } from '@/lib/erp-order-taking-excel'
import { appAlert, appConfirm } from '@/lib/app-notice'

type SelectionLine = {
  id: string
  barcode: string
  style_code: string
  sku: string
  product_name: string
  item_code: string
  attributes: string
  size: string
  weight_gm: number | null
  qty: number
  image_url: string
}

type SessionSnap = {
  customerId: number | null
  customerName: string
  lines: SelectionLine[]
}

function lineId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function attrsOf(p: ErpProductHit): string {
  return [p.attr_color, p.attr_stone].filter(Boolean).join(' · ')
}

function todayIso(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function ErpOrderTakingWorkspace() {
  const [customerId, setCustomerId] = useState<number | null>(null)
  const [customerName, setCustomerName] = useState('')
  const [scanCode, setScanCode] = useState('')
  const [qty, setQty] = useState('1')
  const [hit, setHit] = useState<ErpProductHit | null>(null)
  const [lines, setLines] = useState<SelectionLine[]>([])
  const [busy, setBusy] = useState(false)
  const [exportBusy, setExportBusy] = useState(false)
  const [scanErr, setScanErr] = useState<string | null>(null)
  const [cameraOpen, setCameraOpen] = useState(false)
  const scanRef = useRef<HTMLInputElement>(null)
  const qtyRef = useRef<HTMLInputElement>(null)
  const restoredRef = useRef(false)

  const restored = useErpModuleSession<SessionSnap>(
    'order-taking',
    () => ({ customerId, customerName, lines }),
    [customerId, customerName, lines],
  )

  useEffect(() => {
    if (restoredRef.current || !restored) return
    restoredRef.current = true
    if (restored.customerId) setCustomerId(restored.customerId)
    if (restored.customerName) setCustomerName(restored.customerName)
    if (Array.isArray(restored.lines)) setLines(restored.lines)
  }, [restored])

  const focusScan = useCallback(() => {
    window.setTimeout(() => scanRef.current?.focus(), 30)
  }, [])

  const resetScanSlot = useCallback(() => {
    setScanCode('')
    setQty('1')
    setHit(null)
    setScanErr(null)
    focusScan()
  }, [focusScan])

  const lookup = useCallback(async (raw: string) => {
    const code = String(raw || '').trim()
    if (!code) return
    setBusy(true)
    setScanErr(null)
    try {
      const res = await axios.get<{ product: ErpProductHit }>(
        '/api/reseller/erp/products/lookup',
        { params: { code, for_order: '1' } },
      )
      const p = res.data.product
      if (!p) {
        setScanErr('Product not found')
        setHit(null)
        return
      }
      setHit(p)
      setScanCode(p.barcode || code)
      setQty('1')
      window.setTimeout(() => {
        qtyRef.current?.focus()
        qtyRef.current?.select()
      }, 40)
    } catch (e) {
      setHit(null)
      setScanErr(erpErr(e) || 'Product not found')
      focusScan()
    } finally {
      setBusy(false)
    }
  }, [focusScan])

  const addToSelection = useCallback(() => {
    if (!hit) {
      setScanErr('Scan a barcode first')
      return
    }
    const n = Math.max(1, Math.round(Number(String(qty).replace(/[^\d.]/g, '')) || 1))
    const barcode = String(hit.barcode || scanCode || '').trim()
    if (!barcode) {
      setScanErr('Missing barcode')
      return
    }
    const image = String(hit.image_url || '')
    setLines((prev) => {
      const existing = prev.find((l) => l.barcode.toLowerCase() === barcode.toLowerCase())
      if (existing) {
        return prev.map((l) =>
          l.barcode.toLowerCase() === barcode.toLowerCase() ? { ...l, qty: l.qty + n } : l,
        )
      }
      return [
        ...prev,
        {
          id: lineId(),
          barcode,
          style_code: String(hit.style_code || ''),
          sku: String(hit.sku || ''),
          product_name: String(hit.product_name || hit.name || hit.item_code || ''),
          item_code: String(hit.item_code || ''),
          attributes: attrsOf(hit),
          size: String(hit.size || ''),
          weight_gm:
            hit.net_weight != null && Number.isFinite(Number(hit.net_weight))
              ? Number(hit.net_weight)
              : hit.gross_weight != null && Number.isFinite(Number(hit.gross_weight))
                ? Number(hit.gross_weight)
                : null,
          qty: n,
          image_url: image,
        },
      ]
    })
    resetScanSlot()
  }, [hit, qty, scanCode, resetScanSlot])

  const removeLine = async (id: string) => {
    setLines((prev) => prev.filter((l) => l.id !== id))
  }

  const clearAll = async () => {
    if (!lines.length) return
    if (!(await appConfirm('Clear the whole selection?'))) return
    setLines([])
    resetScanSlot()
  }

  const exportExcel = async () => {
    if (!customerId && !customerName.trim()) {
      appAlert('Select a customer first.', 'error')
      return
    }
    if (!lines.length) {
      appAlert('Add at least one scanned item.', 'error')
      return
    }
    setExportBusy(true)
    try {
      await downloadOrderTakingExcel({
        customerName: customerName.trim() || 'Customer',
        dateIso: todayIso(),
        lines: lines.map((l) => ({
          barcode: l.barcode,
          style_code: l.style_code,
          sku: l.sku,
          product_name: l.product_name,
          item_code: l.item_code,
          attributes: l.attributes,
          size: l.size,
          weight_gm: l.weight_gm,
          qty: l.qty,
          image_url: l.image_url,
        })),
      })
    } catch (e) {
      appAlert(e instanceof Error ? e.message : 'Excel export failed', 'error')
    } finally {
      setExportBusy(false)
    }
  }

  const previewSrc = hit?.image_url ? normalizeCatalogImageSrc(hit.image_url) : ''
  const totalQty = lines.reduce((s, l) => s + (l.qty || 0), 0)

  return (
    <div className="space-y-4">
      <div className={`${erpCardCls} flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between`}>
        <div>
          <p className="text-sm font-semibold text-[var(--color-jewelry-black,#1a1814)]">Order taking</p>
          <p className="text-xs text-[var(--color-jewelry-black,#1a1814)]/55">
            Choose customer, scan tag, set quantity, export photo Excel.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className={erpBtnGhost} onClick={() => void clearAll()} disabled={!lines.length}>
            <Trash2 className="size-4" />
            Clear all
          </button>
          <button type="button" className={erpBtnPrimary} onClick={() => void exportExcel()} disabled={exportBusy}>
            {exportBusy ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
            Export Excel
          </button>
        </div>
      </div>

      <div className={erpCardCls}>
        <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-[var(--color-jewelry-black,#1a1814)]/50">
          Customer
        </p>
        <ErpCustomerSuggestField
          customerId={customerId}
          customerName={customerName}
          placeholder="Type name, mobile or GSTIN…"
          onQueryChange={(q) => {
            setCustomerName(q)
            setCustomerId(null)
          }}
          onSelect={(c: ErpCustomer) => {
            setCustomerId(c.id)
            setCustomerName(c.name)
            focusScan()
          }}
          onClearLink={() => setCustomerId(null)}
        />
      </div>

      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <div className="space-y-3">
          <div className={erpCardCls}>
            <div className="mb-2 flex items-center justify-between">
              <p className="text-xs font-semibold text-[var(--color-jewelry-black,#1a1814)]">Scan barcode</p>
              <button
                type="button"
                className="inline-flex size-10 items-center justify-center rounded-lg border border-[#e8e4df] bg-white text-[var(--color-jewelry-black,#1a1814)]"
                aria-label="Open camera scanner"
                onClick={() => setCameraOpen(true)}
              >
                <Camera className="size-4" />
              </button>
            </div>
            <div className="flex gap-2">
              <input
                ref={scanRef}
                className={erpInputCls}
                placeholder="Scan or type barcode…"
                value={scanCode}
                onChange={(e) => setScanCode(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    void lookup(scanCode)
                  }
                }}
                autoComplete="off"
              />
              <button
                type="button"
                className={erpBtnGhost}
                disabled={busy}
                onClick={() => void lookup(scanCode)}
              >
                {busy ? <Loader2 className="size-4 animate-spin" /> : <ScanBarcode className="size-4" />}
              </button>
            </div>
            {scanErr ? <p className="mt-2 text-xs font-medium text-rose-700">{scanErr}</p> : null}
          </div>

          <div className={erpCardCls}>
            <p className="mb-2 text-xs font-semibold text-[var(--color-jewelry-black,#1a1814)]">Quantity</p>
            <div className="flex gap-2">
              <input
                ref={qtyRef}
                className={`${erpInputCls} tabular-nums`}
                inputMode="numeric"
                value={qty}
                onChange={(e) => setQty(e.target.value.replace(/[^\d]/g, '').slice(0, 5))}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    addToSelection()
                  }
                }}
              />
              <button type="button" className={erpBtnPrimary} onClick={addToSelection} disabled={!hit}>
                <Plus className="size-4" />
                Add
              </button>
            </div>
            <p className="mt-2 text-[11px] text-[var(--color-jewelry-black,#1a1814)]/50">
              After Add, scan is cleared and the cursor returns to barcode.
            </p>
          </div>

          {hit ? (
            <div className={erpCardCls}>
              <div className="mb-2 flex items-center justify-between">
                <p className="text-xs font-semibold text-[var(--color-jewelry-black,#1a1814)]">Product details</p>
                <button
                  type="button"
                  className="inline-flex size-9 items-center justify-center rounded-lg text-[var(--color-jewelry-black,#1a1814)]/55"
                  aria-label="Clear scanned product"
                  onClick={resetScanSlot}
                >
                  <X className="size-4" />
                </button>
              </div>
              <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-sm text-[var(--color-jewelry-black,#1a1814)]">
                <dt className="text-[11px] uppercase tracking-wide text-[var(--color-jewelry-black,#1a1814)]/45">Barcode</dt>
                <dd className="font-medium tabular-nums">{hit.barcode || '—'}</dd>
                <dt className="text-[11px] uppercase tracking-wide text-[var(--color-jewelry-black,#1a1814)]/45">Style</dt>
                <dd>{hit.style_code || '—'}</dd>
                <dt className="text-[11px] uppercase tracking-wide text-[var(--color-jewelry-black,#1a1814)]/45">SKU</dt>
                <dd>{hit.sku || '—'}</dd>
                <dt className="text-[11px] uppercase tracking-wide text-[var(--color-jewelry-black,#1a1814)]/45">Name</dt>
                <dd>{hit.product_name || hit.name || '—'}</dd>
                <dt className="text-[11px] uppercase tracking-wide text-[var(--color-jewelry-black,#1a1814)]/45">Size</dt>
                <dd>{hit.size || '—'}</dd>
                <dt className="text-[11px] uppercase tracking-wide text-[var(--color-jewelry-black,#1a1814)]/45">Weight</dt>
                <dd className="tabular-nums">
                  {hit.net_weight != null ? `${Number(hit.net_weight)} g` : '—'}
                </dd>
              </dl>
            </div>
          ) : null}
        </div>

        <div className={`${erpCardCls} flex min-h-[220px] items-center justify-center bg-[#faf8f4]`}>
          {previewSrc ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={previewSrc}
              alt={hit?.product_name || hit?.name || 'Product'}
              className="max-h-[360px] w-full object-contain"
            />
          ) : (
            <p className="px-4 text-center text-sm text-[var(--color-jewelry-black,#1a1814)]/45">
              Scan a barcode to load the catalogue photo
            </p>
          )}
        </div>
      </div>

      <div className={erpCardCls}>
        <div className="mb-3 flex items-center justify-between gap-2">
          <p className="text-sm font-semibold text-[var(--color-jewelry-black,#1a1814)]">Selection list</p>
          <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-900">
            Total qty: {totalQty}
          </span>
        </div>
        {lines.length === 0 ? (
          <p className="py-6 text-center text-sm text-[var(--color-jewelry-black,#1a1814)]/45">
            No items yet. Scan, set quantity, then Add.
          </p>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {lines.map((l) => {
              const src = l.image_url ? normalizeCatalogImageSrc(l.image_url) : ''
              return (
                <li
                  key={l.id}
                  className="flex gap-3 rounded-xl border border-[#e8e4df] bg-white p-2"
                >
                  <div className="size-16 shrink-0 overflow-hidden rounded-lg bg-[#faf8f4]">
                    {src ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={src} alt={l.product_name} className="size-full object-cover" />
                    ) : (
                      <div className="flex size-full items-center justify-center text-[10px] text-[var(--color-jewelry-black,#1a1814)]/40">
                        No photo
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-[var(--color-jewelry-black,#1a1814)]">
                      {l.product_name || l.barcode}
                    </p>
                    <p className="truncate text-[11px] text-[var(--color-jewelry-black,#1a1814)]/50">
                      {l.style_code} {l.sku} {l.weight_gm != null ? `· ${l.weight_gm} g` : ''}
                    </p>
                    <p className="mt-1 text-xs font-semibold tabular-nums text-[var(--color-jewelry-black,#1a1814)]">
                      Qty {l.qty}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg text-rose-600"
                    aria-label="Remove"
                    onClick={() => void removeLine(l.id)}
                  >
                    <Trash2 className="size-4" />
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      <ErpCameraScannerModal
        open={cameraOpen}
        onClose={() => setCameraOpen(false)}
        onScan={(code) => {
          setCameraOpen(false)
          setScanCode(code)
          void lookup(code)
        }}
      />
    </div>
  )
}

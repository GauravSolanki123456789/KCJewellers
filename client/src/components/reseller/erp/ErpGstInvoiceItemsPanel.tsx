'use client'

import { useCallback, useEffect, useState } from 'react'
import axios from '@/lib/axios'
import { erpBtnGhost, erpBtnPrimary, erpCardCls, erpErr, erpInputCls } from '@/components/reseller/erp/erp-ui'
import { Loader2, Plus, Save, Trash2 } from 'lucide-react'

export type GstInvoiceItem = {
  id: string
  name: string
  hsn: string
}

const DEFAULT_ITEMS: GstInvoiceItem[] = [
  { id: 'silver-jewellery', name: 'SILVER JEWELLERY', hsn: '711311' },
  { id: 'silver-bar', name: 'SILVER BAR', hsn: '710692' },
  { id: 'silver-articles', name: 'SILVER ARTICLES', hsn: '711411' },
  { id: 'gift-items', name: 'GIFT ITEMS', hsn: '711311' },
  { id: 'grains', name: 'GRAINS', hsn: '710692' },
]

function newId() {
  return `item-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
}

export function ErpGstInvoiceItemsPanel() {
  const [items, setItems] = useState<GstInvoiceItem[]>(DEFAULT_ITEMS)
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [msg, setMsg] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await axios.get<{ settings?: { gst?: { invoiceItems?: GstInvoiceItem[] } } }>(
        '/api/reseller/erp/settings',
      )
      const saved = res.data.settings?.gst?.invoiceItems
      if (Array.isArray(saved) && saved.length) {
        setItems(saved.map((it) => ({ id: it.id || newId(), name: it.name || '', hsn: it.hsn || '' })))
      }
    } catch {
      /* keep defaults */
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const save = async () => {
    setBusy(true)
    setErr(null)
    setMsg(null)
    try {
      const res = await axios.get<{ settings?: Record<string, unknown> }>('/api/reseller/erp/settings')
      const settings = res.data.settings || {}
      const gst = (settings.gst as Record<string, unknown>) || {}
      await axios.put('/api/reseller/erp/settings', {
        settings: {
          ...settings,
          gst: {
            ...gst,
            invoiceItems: items.filter((it) => it.name.trim() && it.hsn.trim()),
          },
        },
      })
      setMsg('Invoice item categories saved.')
    } catch (e) {
      setErr(erpErr(e))
    } finally {
      setBusy(false)
    }
  }

  const addRow = () => {
    setItems((prev) => [...prev, { id: newId(), name: '', hsn: '' }])
  }

  const updateRow = (id: string, patch: Partial<GstInvoiceItem>) => {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)))
  }

  const removeRow = (id: string) => {
    setItems((prev) => prev.filter((it) => it.id !== id))
  }

  if (loading) {
    return (
      <div className={`${erpCardCls} flex items-center gap-2 text-sm text-[var(--color-jewelry-black,#1a1814)]/55`}>
        <Loader2 className="size-4 animate-spin" />
        Loading invoice items…
      </div>
    )
  }

  return (
    <div className={`${erpCardCls} space-y-3`}>
      <div>
        <p className="text-sm font-semibold text-[var(--color-jewelry-black,#1a1814)]">Invoice item categories</p>
        <p className="mt-1 text-xs text-[var(--color-jewelry-black,#1a1814)]/55">
          Define item names and HSN codes for tax invoices. Assign each Style + SKU in Design master — billing groups
          lines by item name automatically.
        </p>
      </div>
      <div className="overflow-x-auto rounded-xl border border-[var(--color-slate-700,#e8e4df)]">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--color-slate-700,#e8e4df)] bg-[var(--color-slate-900,#faf8f4)] text-left text-[10px] font-semibold uppercase tracking-wide text-[var(--color-jewelry-black,#1a1814)]/55">
              <th className="px-3 py-2">Item name (on invoice)</th>
              <th className="px-3 py-2 w-28">HSN</th>
              <th className="px-3 py-2 w-12" />
            </tr>
          </thead>
          <tbody>
            {items.map((it) => (
              <tr key={it.id} className="border-b border-[var(--color-slate-700,#e8e4df)]/60">
                <td className="px-2 py-1.5">
                  <input
                    className={erpInputCls}
                    value={it.name}
                    placeholder="e.g. SILVER JEWELLERY"
                    onChange={(e) => updateRow(it.id, { name: e.target.value.toUpperCase() })}
                  />
                </td>
                <td className="px-2 py-1.5">
                  <input
                    className={erpInputCls}
                    value={it.hsn}
                    placeholder="711311"
                    onChange={(e) => updateRow(it.id, { hsn: e.target.value.trim() })}
                  />
                </td>
                <td className="px-2 py-1.5">
                  <button
                    type="button"
                    className="rounded-lg p-2 text-rose-600 hover:bg-rose-50"
                    onClick={() => removeRow(it.id)}
                    aria-label="Remove"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="button" className={erpBtnGhost} onClick={addRow}>
          <Plus className="size-4" />
          Add item
        </button>
        <button type="button" className={erpBtnPrimary} disabled={busy} onClick={() => void save()}>
          {busy ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
          Save items
        </button>
      </div>
      {msg ? <p className="text-xs font-medium text-emerald-700">{msg}</p> : null}
      {err ? <p className="text-xs font-medium text-rose-600">{err}</p> : null}
    </div>
  )
}

export async function fetchGstInvoiceItems(): Promise<GstInvoiceItem[]> {
  try {
    const res = await axios.get<{ settings?: { gst?: { invoiceItems?: GstInvoiceItem[] } } }>(
      '/api/reseller/erp/settings',
    )
    const saved = res.data.settings?.gst?.invoiceItems
    if (Array.isArray(saved) && saved.length) return saved
  } catch {
    /* ignore */
  }
  return DEFAULT_ITEMS
}

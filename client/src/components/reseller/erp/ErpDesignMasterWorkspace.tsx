'use client'

import { useCallback, useEffect, useState } from 'react'
import axios from '@/lib/axios'
import { erpBtnGhost, erpBtnPrimary, erpCardCls, erpErr, erpInputCls } from '@/components/reseller/erp/erp-ui'
import { Layers, Loader2, Plus, Save, Download } from 'lucide-react'

type DesignSku = {
  id: number
  style_id: number
  style_code?: string
  sku: string
  product_name?: string | null
  purity?: number | null
  metal_type?: string | null
  wastage_pct?: number | null
  mc_rate?: number | null
  mc_rate_slab_r?: number | null
  mc_rate_slab_w?: number | null
  mc_rate_slab_f?: number | null
  metal_slab_r_pct?: number | null
  metal_slab_w_pct?: number | null
  metal_slab_f_pct?: number | null
  mc_type?: string | null
}

type DesignStyle = {
  id: number
  style_code: string
  style_name?: string | null
  skus: DesignSku[]
}

const NUM_FIELDS: { key: string; label: string }[] = [
  { key: 'wastage_pct', label: 'Wast %' },
  { key: 'mc_rate', label: 'MC' },
  { key: 'mc_rate_slab_r', label: 'MC R' },
  { key: 'mc_rate_slab_w', label: 'MC W' },
  { key: 'mc_rate_slab_f', label: 'MC F' },
  { key: 'metal_slab_r_pct', label: 'Met R%' },
  { key: 'metal_slab_w_pct', label: 'Met W%' },
  { key: 'metal_slab_f_pct', label: 'Met F%' },
]

export function ErpDesignMasterWorkspace() {
  const [tree, setTree] = useState<DesignStyle[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedStyleId, setSelectedStyleId] = useState<number | null>(null)
  const [selectedSkuId, setSelectedSkuId] = useState<number | null>(null)
  const [draft, setDraft] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [newStyleCode, setNewStyleCode] = useState('')
  const [newSku, setNewSku] = useState('')
  const [seedBusy, setSeedBusy] = useState(false)

  const reload = useCallback(async () => {
    setLoading(true)
    try {
      const res = await axios.get<{ tree: DesignStyle[] }>('/api/reseller/erp/design-master/tree')
      const t = res.data.tree || []
      setTree(t)
      if (!selectedStyleId && t[0]?.id) setSelectedStyleId(t[0].id)
    } catch {
      setTree([])
    } finally {
      setLoading(false)
    }
  }, [selectedStyleId])

  useEffect(() => {
    void reload()
  }, [reload])

  const selectedStyle = tree.find((s) => s.id === selectedStyleId) || null
  const selectedSku = selectedStyle?.skus.find((s) => s.id === selectedSkuId) || null

  useEffect(() => {
    if (selectedSku) {
      setDraft({
        product_name: selectedSku.product_name ?? '',
        purity: selectedSku.purity != null ? String(selectedSku.purity) : '',
        metal_type: selectedSku.metal_type ?? '',
        wastage_pct: selectedSku.wastage_pct != null ? String(selectedSku.wastage_pct) : '',
        mc_rate: selectedSku.mc_rate != null ? String(selectedSku.mc_rate) : '',
        mc_rate_slab_r: selectedSku.mc_rate_slab_r != null ? String(selectedSku.mc_rate_slab_r) : '',
        mc_rate_slab_w: selectedSku.mc_rate_slab_w != null ? String(selectedSku.mc_rate_slab_w) : '',
        mc_rate_slab_f: selectedSku.mc_rate_slab_f != null ? String(selectedSku.mc_rate_slab_f) : '',
        metal_slab_r_pct: selectedSku.metal_slab_r_pct != null ? String(selectedSku.metal_slab_r_pct) : '',
        metal_slab_w_pct: selectedSku.metal_slab_w_pct != null ? String(selectedSku.metal_slab_w_pct) : '',
        metal_slab_f_pct: selectedSku.metal_slab_f_pct != null ? String(selectedSku.metal_slab_f_pct) : '',
        mc_type: selectedSku.mc_type ?? '',
      })
    } else {
      setDraft({})
    }
  }, [selectedSku])

  const saveSku = async () => {
    if (!selectedSku?.id) return
    setBusy(true)
    setMsg('')
    try {
      const res = await axios.put(`/api/reseller/erp/design-master/skus/${selectedSku.id}`, draft)
      setMsg(
        res.data.stockPiecesUpdated
          ? `Saved — ${res.data.stockPiecesUpdated} stock piece(s) updated.`
          : 'Saved.',
      )
      await reload()
    } catch (e) {
      setMsg(erpErr(e))
    } finally {
      setBusy(false)
    }
  }

  const seedFromStock = async (overwrite = false) => {
    const label = overwrite
      ? 'Replace all design defaults with values from your current stock?'
      : 'Import style + SKU pairs from uploaded stock? Existing SKU fields stay unless empty.'
    if (!window.confirm(label)) return
    setSeedBusy(true)
    setMsg('')
    try {
      const res = await axios.post<{
        totalStockPairs: number
        stylesCreated: number
        skusCreated: number
        skusUpdated: number
      }>('/api/reseller/erp/design-master/seed-from-stock', { overwrite })
      setMsg(
        `Imported ${res.data.totalStockPairs} pair(s) — ${res.data.stylesCreated} new styles, ${res.data.skusCreated} new SKUs, ${res.data.skusUpdated} updated.`,
      )
      await reload()
    } catch (e) {
      alert(erpErr(e))
    } finally {
      setSeedBusy(false)
    }
  }

  const addStyle = async () => {
    const code = newStyleCode.trim()
    if (!code) return
    setBusy(true)
    try {
      await axios.post('/api/reseller/erp/design-master/styles', { style_code: code, style_name: code })
      setNewStyleCode('')
      await reload()
    } catch (e) {
      alert(erpErr(e))
    } finally {
      setBusy(false)
    }
  }

  const addSku = async () => {
    if (!selectedStyle) return
    const sku = newSku.trim()
    if (!sku) return
    setBusy(true)
    try {
      await axios.post('/api/reseller/erp/design-master/skus', {
        style_code: selectedStyle.style_code,
        sku,
      })
      setNewSku('')
      await reload()
    } catch (e) {
      alert(erpErr(e))
    } finally {
      setBusy(false)
    }
  }

  if (loading) {
    return (
      <p className="flex items-center gap-2 py-8 text-sm text-[var(--color-jewelry-black,#1a1814)]/55">
        <Loader2 className="size-4 animate-spin" />
        Loading design master…
      </p>
    )
  }

  return (
    <div className="space-y-4">
      <div className={`${erpCardCls} flex flex-wrap items-center justify-between gap-2`}>
        <div>
          <p className="flex items-center gap-2 text-sm font-semibold text-[var(--color-jewelry-black,#1a1814)]">
            <Layers className="size-4 text-emerald-700" />
            Design master
          </p>
          <p className="text-xs text-[var(--color-jewelry-black,#1a1814)]/55">
            Set default MC, wastage & metal slabs per Style + SKU. Stock uploads and new rows autofill from here.
            Saving updates all in-stock pieces with that SKU.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className={erpBtnPrimary}
            disabled={seedBusy}
            onClick={() => void seedFromStock(false)}
          >
            {seedBusy ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
            Import from stock
          </button>
          <input
            className={`${erpInputCls} w-36 text-xs`}
            placeholder="New style code"
            value={newStyleCode}
            onChange={(e) => setNewStyleCode(e.target.value.toUpperCase())}
          />
          <button type="button" className={erpBtnGhost} disabled={busy} onClick={() => void addStyle()}>
            <Plus className="size-4" />
            Style
          </button>
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        <div className={erpCardCls}>
          <p className="mb-2 text-xs font-semibold uppercase text-[var(--color-jewelry-black,#1a1814)]/45">Styles</p>
          <ul className="max-h-[420px] space-y-1 overflow-y-auto">
            {tree.length === 0 ? (
              <li className="text-xs text-[var(--color-jewelry-black,#1a1814)]/45">Add a style to begin.</li>
            ) : (
              tree.map((s) => (
                <li key={s.id}>
                  <button
                    type="button"
                    className={`w-full rounded-lg px-3 py-2 text-left text-sm ${
                      selectedStyleId === s.id
                        ? 'bg-emerald-100 font-semibold text-emerald-950'
                        : 'hover:bg-[var(--color-slate-900,#f7f4ef)]'
                    }`}
                    onClick={() => {
                      setSelectedStyleId(s.id)
                      setSelectedSkuId(null)
                    }}
                  >
                    {s.style_code}
                    <span className="ml-1 text-[10px] opacity-60">({s.skus.length} SKU)</span>
                  </button>
                </li>
              ))
            )}
          </ul>
        </div>

        <div className={erpCardCls}>
          <p className="mb-2 text-xs font-semibold uppercase text-[var(--color-jewelry-black,#1a1814)]/45">SKUs</p>
          {selectedStyle ? (
            <>
              <div className="mb-2 flex gap-1">
                <input
                  className={`${erpInputCls} flex-1 text-xs`}
                  placeholder="New SKU"
                  value={newSku}
                  onChange={(e) => setNewSku(e.target.value.toUpperCase())}
                />
                <button type="button" className={erpBtnGhost} disabled={busy} onClick={() => void addSku()}>
                  <Plus className="size-4" />
                </button>
              </div>
              <ul className="max-h-[380px] space-y-1 overflow-y-auto">
                {selectedStyle.skus.map((sk) => (
                  <li key={sk.id}>
                    <button
                      type="button"
                      className={`w-full rounded-lg px-3 py-2 text-left text-sm ${
                        selectedSkuId === sk.id
                          ? 'bg-amber-100 font-semibold text-amber-950'
                          : 'hover:bg-[var(--color-slate-900,#f7f4ef)]'
                      }`}
                      onClick={() => setSelectedSkuId(sk.id)}
                    >
                      {sk.sku}
                    </button>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="text-xs text-[var(--color-jewelry-black,#1a1814)]/45">Select a style.</p>
          )}
        </div>

        <div className={erpCardCls}>
          <p className="mb-2 text-xs font-semibold uppercase text-[var(--color-jewelry-black,#1a1814)]/45">
            Calculation defaults
          </p>
          {selectedSku ? (
            <div className="space-y-2">
              <div className="grid grid-cols-2 gap-2">
                {NUM_FIELDS.map(({ key, label }) => (
                  <label key={key} className="block text-[10px] font-semibold uppercase text-[var(--color-jewelry-black,#1a1814)]/45">
                    {label}
                    <input
                      className={`${erpInputCls} mt-0.5 text-xs`}
                      inputMode="decimal"
                      value={draft[key] ?? ''}
                      onChange={(e) => setDraft((d) => ({ ...d, [key]: e.target.value }))}
                    />
                  </label>
                ))}
                <label className="block text-[10px] font-semibold uppercase text-[var(--color-jewelry-black,#1a1814)]/45">
                  MCType
                  <input
                    className={`${erpInputCls} mt-0.5 text-xs`}
                    value={draft.mc_type ?? ''}
                    onChange={(e) => setDraft((d) => ({ ...d, mc_type: e.target.value }))}
                  />
                </label>
                <label className="block text-[10px] font-semibold uppercase text-[var(--color-jewelry-black,#1a1814)]/45">
                  Purity
                  <input
                    className={`${erpInputCls} mt-0.5 text-xs`}
                    value={draft.purity ?? ''}
                    onChange={(e) => setDraft((d) => ({ ...d, purity: e.target.value }))}
                  />
                </label>
              </div>
              {msg ? <p className="text-xs text-emerald-800">{msg}</p> : null}
              <button type="button" className={erpBtnPrimary} disabled={busy} onClick={() => void saveSku()}>
                {busy ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
                Save & update stock
              </button>
            </div>
          ) : (
            <p className="text-xs text-[var(--color-jewelry-black,#1a1814)]/45">Select a SKU to edit defaults.</p>
          )}
        </div>
      </div>
    </div>
  )
}

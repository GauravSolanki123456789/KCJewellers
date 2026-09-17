'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useErpModuleSession } from '@/hooks/useErpModuleSession'
import axios from '@/lib/axios'
import {
  erpBtnGhost,
  erpBtnPrimary,
  erpCardCls,
  erpErr,
  erpInputCls,
  erpListItemSelected,
  erpListItemSelectedAlt,
} from '@/components/reseller/erp/erp-ui'
import { fetchGstInvoiceItems, type GstInvoiceItem } from '@/components/reseller/erp/ErpGstInvoiceItemsPanel'
import { Layers, Loader2, Pencil, Plus, Save, Download, Trash2, X, Check } from 'lucide-react'
import { appConfirm } from '@/lib/app-notice'

type SizeVariant = {
  size_label: string
  fixed_price_mrp: number | null
}

type CatalogProductName = {
  name: string
  image_url?: string | null
  mc_rate?: number | null
  mc_type?: string | null
  wastage_pct?: number | null
  purity?: number | null
  metal_type?: string | null
  fixed_price?: number | null
  sizes?: { size_label: string; fixed_price_mrp?: number | null }[]
  box_options?: { label: string; box_charges: number; fixed_price?: number | null }[]
  finish_options?: { label: string; stone_charges: number; fixed_price?: number | null }[]
}

type DesignSku = {
  id: number
  style_id: number
  style_code?: string
  sku: string
  product_name?: string | null
  product_names?: CatalogProductName[]
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
  invoice_item_name?: string | null
  hsn_code?: string | null
  fixed_price?: number | null
  size_variants?: SizeVariant[]
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
  const [invoiceItems, setInvoiceItems] = useState<GstInvoiceItem[]>([])
  const [styleInvoiceDraft, setStyleInvoiceDraft] = useState({ name: '', hsn: '' })
  const [sizeVariants, setSizeVariants] = useState<SizeVariant[]>([])
  const [productNames, setProductNames] = useState<CatalogProductName[]>([])
  const [newProductName, setNewProductName] = useState('')
  const [catalogBusy, setCatalogBusy] = useState(false)
  const [styleCatalogBusy, setStyleCatalogBusy] = useState(false)
  const [editingStyleId, setEditingStyleId] = useState<number | null>(null)
  const [styleRenameDraft, setStyleRenameDraft] = useState('')
  const [editingSkuId, setEditingSkuId] = useState<number | null>(null)
  const [skuRenameDraft, setSkuRenameDraft] = useState('')
  const stylesListRef = useRef<HTMLUListElement>(null)
  const stylesScrollTopRef = useRef(0)
  const skusListRef = useRef<HTMLUListElement>(null)
  const skusScrollTopRef = useRef(0)

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

  type DesignMasterSession = {
    selectedStyleId: number | null
    selectedSkuId: number | null
    draft: Record<string, string>
    sizeVariants: SizeVariant[]
    productNames: CatalogProductName[]
  }

  const sessionRestore = useErpModuleSession<DesignMasterSession>(
    'design-master',
    () => ({ selectedStyleId, selectedSkuId, draft, sizeVariants, productNames }),
    [selectedStyleId, selectedSkuId, draft, sizeVariants, productNames],
  )
  const sessionAppliedRef = useRef(false)

  useEffect(() => {
    if (sessionAppliedRef.current || !sessionRestore || loading) return
    sessionAppliedRef.current = true
    if (sessionRestore.selectedStyleId != null) setSelectedStyleId(sessionRestore.selectedStyleId)
    if (sessionRestore.selectedSkuId != null) setSelectedSkuId(sessionRestore.selectedSkuId)
    if (sessionRestore.draft) setDraft(sessionRestore.draft)
    if (sessionRestore.sizeVariants?.length) setSizeVariants(sessionRestore.sizeVariants)
    if (sessionRestore.productNames?.length) setProductNames(sessionRestore.productNames)
  }, [sessionRestore, loading])

  const selectedStyle = tree.find((s) => s.id === selectedStyleId) || null
  const selectedSku = selectedStyle?.skus.find((s) => s.id === selectedSkuId) || null

  useEffect(() => {
    void fetchGstInvoiceItems().then(setInvoiceItems)
  }, [])

  useEffect(() => {
    const el = stylesListRef.current
    if (el) el.scrollTop = stylesScrollTopRef.current
  }, [selectedStyleId])

  useEffect(() => {
    const el = skusListRef.current
    if (el) el.scrollTop = skusScrollTopRef.current
  }, [selectedSkuId])

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
        invoice_item_name: selectedSku.invoice_item_name ?? '',
        hsn_code: selectedSku.hsn_code ?? '',
        fixed_price: selectedSku.fixed_price != null ? String(selectedSku.fixed_price) : '',
      })
      setSizeVariants(
        (selectedSku.size_variants || []).map((sv) => ({
          size_label: sv.size_label,
          fixed_price_mrp: sv.fixed_price_mrp ?? null,
        })),
      )
      setProductNames(
        (selectedSku.product_names || []).map((p) => ({
          name: p.name,
          image_url: p.image_url ?? null,
        })),
      )
    } else {
      setDraft({})
      setSizeVariants([])
      setProductNames([])
    }
  }, [selectedSku])

  useEffect(() => {
    if (selectedStyle) {
      setStyleInvoiceDraft({ name: '', hsn: '' })
    }
  }, [selectedStyleId, selectedStyle?.style_code])

  const applyStyleInvoiceItem = async () => {
    if (!selectedStyle?.id || !styleInvoiceDraft.name) return
    setBusy(true)
    setMsg('')
    try {
      const res = await axios.put<{ updated: number }>(
        `/api/reseller/erp/design-master/styles/${selectedStyle.id}/invoice-item`,
        {
          invoice_item_name: styleInvoiceDraft.name,
          hsn_code: styleInvoiceDraft.hsn,
        },
      )
      setMsg(`Applied "${styleInvoiceDraft.name}" to ${res.data.updated} SKU(s).`)
      await reload()
    } catch (e) {
      setMsg(erpErr(e))
    } finally {
      setBusy(false)
    }
  }

  const saveSku = async () => {
    if (!selectedSku?.id) return
    setBusy(true)
    setMsg('')
    try {
      const payload = {
        ...draft,
        size_variants: sizeVariants
          .filter((sv) => sv.size_label.trim())
          .map((sv) => ({
            size_label: sv.size_label.trim(),
            fixed_price_mrp: sv.fixed_price_mrp,
          })),
        product_names: productNames
          .filter((p) => p.name.trim())
          .map((p) => ({
            name: p.name.trim(),
            image_url: p.image_url ?? null,
          })),
      }
      const res = await axios.put(`/api/reseller/erp/design-master/skus/${selectedSku.id}`, payload)
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

  const renameStyle = async (styleId: number) => {
    const code = styleRenameDraft.trim().toUpperCase()
    if (!code) return
    setBusy(true)
    try {
      await axios.put(`/api/reseller/erp/design-master/styles/${styleId}`, {
        style_code: code,
        style_name: code,
      })
      setEditingStyleId(null)
      setStyleRenameDraft('')
      await reload()
    } catch (e) {
      alert(erpErr(e))
    } finally {
      setBusy(false)
    }
  }

  const deleteStyle = async (style: DesignStyle) => {
    if (!await appConfirm(`Delete style "${style.style_code}" and all its SKUs?`)) return
    setBusy(true)
    try {
      await axios.delete(`/api/reseller/erp/design-master/styles/${style.id}`)
      if (selectedStyleId === style.id) {
        setSelectedStyleId(null)
        setSelectedSkuId(null)
      }
      await reload()
    } catch (e) {
      alert(erpErr(e))
    } finally {
      setBusy(false)
    }
  }

  const renameSku = async (skuId: number) => {
    const sku = skuRenameDraft.trim().toUpperCase()
    if (!sku) return
    setBusy(true)
    try {
      await axios.put(`/api/reseller/erp/design-master/skus/${skuId}`, { sku })
      setEditingSkuId(null)
      setSkuRenameDraft('')
      await reload()
    } catch (e) {
      alert(erpErr(e))
    } finally {
      setBusy(false)
    }
  }

  const deleteSku = async (sku: DesignSku) => {
    if (!await appConfirm(`Delete SKU "${sku.sku}"?`)) return
    setBusy(true)
    try {
      await axios.delete(`/api/reseller/erp/design-master/skus/${sku.id}`)
      if (selectedSkuId === sku.id) setSelectedSkuId(null)
      await reload()
    } catch (e) {
      alert(erpErr(e))
    } finally {
      setBusy(false)
    }
  }

  const addSizeVariant = () => {
    setSizeVariants((prev) => [...prev, { size_label: '', fixed_price_mrp: null }])
  }

  const updateSizeVariant = (idx: number, patch: Partial<SizeVariant>) => {
    setSizeVariants((prev) => prev.map((sv, i) => (i === idx ? { ...sv, ...patch } : sv)))
  }

  const removeSizeVariant = (idx: number) => {
    setSizeVariants((prev) => prev.filter((_, i) => i !== idx))
  }

  const addProductName = (raw?: string) => {
    const name = (raw ?? newProductName).trim().toUpperCase()
    if (!name) return
    setProductNames((prev) => {
      if (prev.some((p) => p.name.trim().toUpperCase() === name)) return prev
      return [...prev, { name, image_url: null }]
    })
    setNewProductName('')
  }

  const removeProductName = (idx: number) => {
    setProductNames((prev) => prev.filter((_, i) => i !== idx))
  }

  const loadStyleCatalog = async () => {
    if (!selectedStyle) return
    if (
      !await appConfirm(
        `Import all catalogue SKUs and products under style "${selectedStyle.style_code}"? New SKUs will be created; existing SKUs get updated product names.`,
      )
    ) {
      return
    }
    setStyleCatalogBusy(true)
    setMsg('')
    try {
      const res = await axios.post<{
        style_code: string
        skuCount: number
        skusCreated: number
        skusUpdated: number
      }>('/api/reseller/erp/design-master/import-style-catalog', {
        style_id: selectedStyle.id,
      })
      setMsg(
        `Style "${res.data.style_code}": ${res.data.skuCount} catalogue SKU(s) — ${res.data.skusCreated} created, ${res.data.skusUpdated} updated.`,
      )
      await reload()
    } catch (e) {
      setMsg(erpErr(e))
    } finally {
      setStyleCatalogBusy(false)
    }
  }

  const loadCatalogProducts = async () => {
    if (!selectedStyle || !selectedSku) return
    setCatalogBusy(true)
    setMsg('')
    try {
      const res = await axios.get<{ products: CatalogProductName[] }>(
        '/api/reseller/erp/design-master/catalog-products',
        { params: { style_code: selectedStyle.style_code, sku: selectedSku.sku, detailed: '1' } },
      )
      const incoming = res.data.products || []
      if (!incoming.length) {
        setMsg('No catalogue products found for this style + SKU.')
        return
      }
      setProductNames(incoming.map((p) => ({ ...p, name: p.name.trim() })))
      const first = incoming[0]
      if (first) {
        setDraft((d) => ({
          ...d,
          mc_rate: first.mc_rate != null ? String(first.mc_rate) : d.mc_rate,
          mc_type: first.mc_type || d.mc_type,
          wastage_pct: first.wastage_pct != null ? String(first.wastage_pct) : d.wastage_pct,
          purity: first.purity != null ? String(first.purity) : d.purity,
          metal_type: first.metal_type || d.metal_type,
        }))
      }
      setSizeVariants([])
      setMsg(`Loaded ${incoming.length} catalogue product(s) with MC, sizes & variants. Save to keep.`)
    } catch (e) {
      setMsg(erpErr(e))
    } finally {
      setCatalogBusy(false)
    }
  }

  const seedFromStock = async (overwrite = false) => {
    const label = overwrite
      ? 'Replace all design defaults with values from your current stock?'
      : 'Import style + SKU pairs from uploaded stock? Existing SKU fields stay unless empty.'
    if (!await appConfirm(label)) return
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

      <div className="grid min-h-[min(720px,calc(100vh-11rem))] gap-3 lg:grid-cols-3 lg:items-stretch">
        <div className={`${erpCardCls} flex min-h-0 flex-col`}>
          <div className="mb-2 flex shrink-0 flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-semibold uppercase text-[var(--color-jewelry-black,#1a1814)]/45">Styles</p>
            {selectedStyle ? (
              <button
                type="button"
                className={erpBtnGhost}
                disabled={styleCatalogBusy}
                onClick={() => void loadStyleCatalog()}
              >
                {styleCatalogBusy ? <Loader2 className="size-3.5 animate-spin" /> : <Download className="size-3.5" />}
                Load style catalogue
              </button>
            ) : null}
          </div>
          <ul
            ref={stylesListRef}
            className="min-h-0 flex-1 space-y-1 overflow-y-auto overscroll-contain"
            onScroll={(e) => {
              stylesScrollTopRef.current = e.currentTarget.scrollTop
            }}
          >
            {tree.length === 0 ? (
              <li className="text-xs text-[var(--color-jewelry-black,#1a1814)]/45">Add a style to begin.</li>
            ) : (
              tree.map((s) => (
                <li key={s.id}>
                  {editingStyleId === s.id ? (
                    <div className="flex items-center gap-1 rounded-lg border border-amber-200 bg-amber-50/60 px-2 py-1.5">
                      <input
                        className={`${erpInputCls} flex-1 text-xs`}
                        value={styleRenameDraft}
                        onChange={(e) => setStyleRenameDraft(e.target.value.toUpperCase())}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') void renameStyle(s.id)
                          if (e.key === 'Escape') setEditingStyleId(null)
                        }}
                        autoFocus
                      />
                      <button type="button" className={erpBtnGhost} onClick={() => void renameStyle(s.id)}>
                        <Check className="size-3.5" />
                      </button>
                      <button type="button" className={erpBtnGhost} onClick={() => setEditingStyleId(null)}>
                        <X className="size-3.5" />
                      </button>
                    </div>
                  ) : (
                    <div
                      className={`flex items-center gap-1 rounded-lg px-1 py-0.5 ${
                        selectedStyleId === s.id ? erpListItemSelected : ''
                      }`}
                    >
                      <button
                        type="button"
                        className={`min-w-0 flex-1 rounded-lg px-2 py-2 text-left text-sm text-[var(--color-jewelry-black,#1a1814)] ${
                          selectedStyleId === s.id ? '' : 'hover:bg-[var(--color-slate-900,#f7f4ef)]'
                        }`}
                        onClick={() => {
                          if (stylesListRef.current) {
                            stylesScrollTopRef.current = stylesListRef.current.scrollTop
                          }
                          setSelectedStyleId(s.id)
                          setSelectedSkuId(null)
                        }}
                      >
                        {s.style_code}
                        <span className="ml-1 text-[10px] opacity-60">({s.skus.length} SKU)</span>
                      </button>
                      <button
                        type="button"
                        className={erpBtnGhost}
                        title="Rename style"
                        onClick={() => {
                          setEditingStyleId(s.id)
                          setStyleRenameDraft(s.style_code)
                        }}
                      >
                        <Pencil className="size-3.5" />
                      </button>
                      <button
                        type="button"
                        className={`${erpBtnGhost} text-red-700`}
                        title="Delete style"
                        onClick={() => void deleteStyle(s)}
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </div>
                  )}
                </li>
              ))
            )}
          </ul>
        </div>

        <div className={`${erpCardCls} flex min-h-0 flex-col`}>
          <p className="mb-2 shrink-0 text-xs font-semibold uppercase text-[var(--color-jewelry-black,#1a1814)]/45">SKUs</p>
          {selectedStyle ? (
            <>
              <div className="mb-3 rounded-lg border border-emerald-200 bg-emerald-50/50 p-2.5">
                <p className="mb-1.5 text-[10px] font-semibold uppercase text-emerald-900/70">
                  Style invoice item (all SKUs)
                </p>
                <select
                  className={`${erpInputCls} text-xs`}
                  value={styleInvoiceDraft.name}
                  onChange={(e) => {
                    const name = e.target.value
                    const item = invoiceItems.find((it) => it.name === name)
                    setStyleInvoiceDraft({
                      name,
                      hsn: item?.hsn ?? styleInvoiceDraft.hsn,
                    })
                  }}
                >
                  <option value="">— Select for all SKUs —</option>
                  {invoiceItems.map((it) => (
                    <option key={it.id} value={it.name}>
                      {it.name} ({it.hsn})
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className={`${erpBtnGhost} mt-2 w-full text-xs`}
                  disabled={busy || !styleInvoiceDraft.name}
                  onClick={() => void applyStyleInvoiceItem()}
                >
                  Apply to all SKUs in {selectedStyle.style_code}
                </button>
              </div>
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
              <ul
                ref={skusListRef}
                className="min-h-0 flex-1 space-y-1 overflow-y-auto overscroll-contain"
                onScroll={(e) => {
                  skusScrollTopRef.current = e.currentTarget.scrollTop
                }}
              >
                {selectedStyle.skus.map((sk) => (
                  <li key={sk.id}>
                    {editingSkuId === sk.id ? (
                      <div className="flex items-center gap-1 rounded-lg border border-amber-200 bg-amber-50/60 px-2 py-1.5">
                        <input
                          className={`${erpInputCls} flex-1 text-xs`}
                          value={skuRenameDraft}
                          onChange={(e) => setSkuRenameDraft(e.target.value.toUpperCase())}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') void renameSku(sk.id)
                            if (e.key === 'Escape') setEditingSkuId(null)
                          }}
                          autoFocus
                        />
                        <button type="button" className={erpBtnGhost} onClick={() => void renameSku(sk.id)}>
                          <Check className="size-3.5" />
                        </button>
                        <button type="button" className={erpBtnGhost} onClick={() => setEditingSkuId(null)}>
                          <X className="size-3.5" />
                        </button>
                      </div>
                    ) : (
                      <div
                        className={`flex items-center gap-1 rounded-lg px-1 py-0.5 ${
                          selectedSkuId === sk.id ? erpListItemSelectedAlt : ''
                        }`}
                      >
                        <button
                          type="button"
                          className={`min-w-0 flex-1 rounded-lg px-2 py-2 text-left text-sm text-[var(--color-jewelry-black,#1a1814)] ${
                            selectedSkuId === sk.id ? '' : 'hover:bg-[var(--color-slate-900,#f7f4ef)]'
                          }`}
                          onClick={() => {
                            if (skusListRef.current) {
                              skusScrollTopRef.current = skusListRef.current.scrollTop
                            }
                            setSelectedSkuId(sk.id)
                          }}
                        >
                          {sk.sku}
                        </button>
                        <button
                          type="button"
                          className={erpBtnGhost}
                          title="Rename SKU"
                          onClick={() => {
                            setEditingSkuId(sk.id)
                            setSkuRenameDraft(sk.sku)
                          }}
                        >
                          <Pencil className="size-3.5" />
                        </button>
                        <button
                          type="button"
                          className={`${erpBtnGhost} text-red-700`}
                          title="Delete SKU"
                          onClick={() => void deleteSku(sk)}
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="text-xs text-[var(--color-jewelry-black,#1a1814)]/45">Select a style.</p>
          )}
        </div>

        <div className={`${erpCardCls} flex min-h-0 flex-col`}>
          <p className="mb-2 shrink-0 text-xs font-semibold uppercase text-[var(--color-jewelry-black,#1a1814)]/45">
            Calculation defaults
          </p>
          {selectedSku ? (
            <div className="min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain">
              <label className="block text-[10px] font-semibold uppercase text-[var(--color-jewelry-black,#1a1814)]/45">
                Invoice item (GST)
                <select
                  className={`${erpInputCls} mt-0.5 text-xs`}
                  value={draft.invoice_item_name ?? ''}
                  onChange={(e) => {
                    const name = e.target.value
                    const item = invoiceItems.find((it) => it.name === name)
                    setDraft((d) => ({
                      ...d,
                      invoice_item_name: name,
                      hsn_code: item?.hsn ?? d.hsn_code ?? '',
                    }))
                  }}
                >
                  <option value="">— Default from metal —</option>
                  {invoiceItems.map((it) => (
                    <option key={it.id} value={it.name}>
                      {it.name} ({it.hsn})
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-[10px] font-semibold uppercase text-[var(--color-jewelry-black,#1a1814)]/45">
                HSN code
                <input
                  className={`${erpInputCls} mt-0.5 text-xs`}
                  value={draft.hsn_code ?? ''}
                  onChange={(e) => setDraft((d) => ({ ...d, hsn_code: e.target.value }))}
                />
              </label>
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
                <label className="col-span-2 block text-[10px] font-semibold uppercase text-[var(--color-jewelry-black,#1a1814)]/45">
                  Fixed price (₹) — gift / MRP base when no size
                  <input
                    className={`${erpInputCls} mt-0.5 text-xs`}
                    inputMode="decimal"
                    placeholder="e.g. 90"
                    value={draft.fixed_price ?? ''}
                    onChange={(e) => setDraft((d) => ({ ...d, fixed_price: e.target.value }))}
                  />
                </label>
              </div>

              <div className="rounded-lg border border-[var(--color-slate-900,#e8e4dc)] p-2">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <p className="text-[10px] font-semibold uppercase text-[var(--color-jewelry-black,#1a1814)]/45">
                    Product names (from catalogue)
                  </p>
                  <button
                    type="button"
                    className={erpBtnGhost}
                    disabled={catalogBusy}
                    onClick={() => void loadCatalogProducts()}
                  >
                    {catalogBusy ? <Loader2 className="size-3.5 animate-spin" /> : <Download className="size-3.5" />}
                    Load catalogue
                  </button>
                </div>
                <p className="mb-2 text-[10px] text-[var(--color-jewelry-black,#1a1814)]/45">
                  Each product keeps its own MC, wastage, sizes, box and GP/Standard — not shared across the SKU.
                </p>
                <div className="mb-2 flex gap-1">
                  <input
                    className={`${erpInputCls} flex-1 text-xs`}
                    placeholder="Add product name"
                    value={newProductName}
                    onChange={(e) => setNewProductName(e.target.value.toUpperCase())}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        addProductName()
                      }
                    }}
                  />
                  <button type="button" className={erpBtnGhost} onClick={() => addProductName()}>
                    <Plus className="size-3.5" />
                  </button>
                </div>
                {productNames.length === 0 ? (
                  <p className="text-[10px] text-[var(--color-jewelry-black,#1a1814)]/45">
                    No product names yet. Load from catalogue or add them here.
                  </p>
                ) : (
                  <ul className="max-h-40 space-y-1 overflow-y-auto">
                    {productNames.map((p, idx) => (
                      <li
                        key={`${p.name}-${idx}`}
                        className="flex items-center gap-2 rounded-lg border border-[var(--color-slate-700,#e8e4df)] bg-white px-2 py-1.5"
                      >
                        {p.image_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={p.image_url} alt="" className="size-8 rounded object-cover" />
                        ) : (
                          <span className="size-8 rounded bg-[var(--color-slate-900,#faf8f4)]" />
                        )}
                        <span className="min-w-0 flex-1 truncate text-xs font-semibold text-[var(--color-jewelry-black,#1a1814)]">
                          {p.name}
                        </span>
                        <button
                          type="button"
                          className={`${erpBtnGhost} text-red-700`}
                          onClick={() => removeProductName(idx)}
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="rounded-lg border border-[var(--color-slate-900,#e8e4dc)] p-2">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p className="text-[10px] font-semibold uppercase text-[var(--color-jewelry-black,#1a1814)]/45">
                    Size variants (label + MRP)
                  </p>
                  <button type="button" className={erpBtnGhost} onClick={addSizeVariant}>
                    <Plus className="size-3.5" />
                    Size
                  </button>
                </div>
                {sizeVariants.length === 0 ? (
                  <p className="text-[10px] text-[var(--color-jewelry-black,#1a1814)]/45">
                    Add sizes like No1 stand / 3x2.5 in with different MRPs. Slab R/W/F discounts apply at billing.
                  </p>
                ) : (
                  <div className="space-y-1.5">
                    {sizeVariants.map((sv, idx) => (
                      <div key={`sv-${idx}`} className="grid grid-cols-[1fr_88px_28px] gap-1">
                        <input
                          className={`${erpInputCls} text-xs`}
                          placeholder="Size label"
                          value={sv.size_label}
                          onChange={(e) => updateSizeVariant(idx, { size_label: e.target.value })}
                        />
                        <input
                          className={`${erpInputCls} text-xs`}
                          inputMode="decimal"
                          placeholder="MRP ₹"
                          value={sv.fixed_price_mrp != null ? String(sv.fixed_price_mrp) : ''}
                          onChange={(e) => {
                            const v = e.target.value
                            updateSizeVariant(idx, {
                              fixed_price_mrp: v === '' ? null : Number(v),
                            })
                          }}
                        />
                        <button
                          type="button"
                          className={`${erpBtnGhost} text-red-700`}
                          onClick={() => removeSizeVariant(idx)}
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
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

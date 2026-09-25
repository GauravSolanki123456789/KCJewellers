'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import axios from '@/lib/axios'
import { ScanBarcode, Printer, Save, Tag } from 'lucide-react'
import {
  erpBtnGhost,
  erpBtnPrimary,
  erpCardCls,
  erpErr,
  erpInputCls,
  type ErpStockPiece,
} from '@/components/reseller/erp/erp-ui'
import {
  TAG_EDIT_STATUS_OPTIONS,
  buildTagEditUpdatePayload,
  tagEditFormFromPiece,
  visibleTagEditFields,
  type TagEditFieldDef,
  type TagEditFieldKey,
} from '@/lib/erp-tag-editing-fields'
import { printStockLabels } from '@/lib/erp-print-labels'
import { useErpWorkstationSelection } from '@/components/reseller/erp/ErpWorkstationBar'

type Toast = { tone: 'ok' | 'err'; message: string }

export function ErpTagEditingWorkspace() {
  const scanRef = useRef<HTMLInputElement>(null)
  const [scan, setScan] = useState('')
  const [piece, setPiece] = useState<ErpStockPiece | null>(null)
  const [visibleFields, setVisibleFields] = useState<TagEditFieldDef[]>([])
  const [form, setForm] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState<Toast | null>(null)
  const [workstation] = useErpWorkstationSelection()

  const focusScan = useCallback(() => {
    requestAnimationFrame(() => scanRef.current?.focus())
  }, [])

  useEffect(() => {
    focusScan()
  }, [focusScan])

  useEffect(() => {
    if (!toast) return
    const t = window.setTimeout(() => setToast(null), 3200)
    return () => window.clearTimeout(t)
  }, [toast])

  const clearForm = useCallback(() => {
    setPiece(null)
    setVisibleFields([])
    setForm({})
    setScan('')
    focusScan()
  }, [focusScan])

  const onScanSubmit = async () => {
    const code = scan.trim()
    if (!code || busy) return
    setBusy(true)
    setToast(null)
    try {
      const res = await axios.get<{ found: boolean; piece: ErpStockPiece | null }>(
        '/api/reseller/erp/tag-editing/lookup',
        { params: { barcode: code } },
      )
      if (!res.data.found || !res.data.piece) {
        setToast({ tone: 'err', message: 'Barcode not found — scan again.' })
        setScan('')
        focusScan()
        return
      }
      const p = res.data.piece
      const fields = visibleTagEditFields(p)
      const keys = fields.map((f) => f.key)
      setPiece(p)
      setVisibleFields(fields)
      setForm(tagEditFormFromPiece(p, keys))
      setScan('')
    } catch (e) {
      setToast({ tone: 'err', message: erpErr(e) })
      focusScan()
    } finally {
      setBusy(false)
    }
  }

  const persist = useCallback(async (): Promise<ErpStockPiece | null> => {
    if (!piece) return null
    const keys = visibleFields.map((f) => f.key)
    const fields = buildTagEditUpdatePayload(form, keys)
    const res = await axios.patch<{ success: boolean; piece: ErpStockPiece }>(
      `/api/reseller/erp/tag-editing/${piece.id}`,
      { fields },
    )
    return res.data.piece
  }, [piece, visibleFields, form])

  const saveOnly = async () => {
    if (!piece || busy) return
    setBusy(true)
    setToast(null)
    try {
      await persist()
      setToast({ tone: 'ok', message: 'Tag saved.' })
      clearForm()
    } catch (e) {
      setToast({ tone: 'err', message: erpErr(e) })
      focusScan()
    } finally {
      setBusy(false)
    }
  }

  const saveAndPrint = useCallback(async () => {
    if (!piece || busy) return
    setBusy(true)
    setToast(null)
    try {
      const updated = await persist()
      const id = updated?.id ?? piece.id
      const printRes = await printStockLabels({
        pieceIds: [id],
        printerProfileId: workstation.printerProfileId,
      })
      if (!printRes.ok) {
        setToast({ tone: 'err', message: printRes.message || 'Saved but print failed.' })
      } else {
        setToast({ tone: 'ok', message: 'Saved & sent to printer.' })
      }
      clearForm()
    } catch (e) {
      setToast({ tone: 'err', message: erpErr(e) })
      focusScan()
    } finally {
      setBusy(false)
    }
  }, [piece, busy, persist, workstation.printerProfileId, clearForm])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'F1') return
      if (!piece) return
      e.preventDefault()
      if (!busy) void saveAndPrint()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [piece, busy, saveAndPrint])

  const setField = (key: TagEditFieldKey, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  return (
    <div className="space-y-4">
      {toast ? (
        <div
          role="status"
          className={`rounded-xl border px-3 py-2 text-sm font-medium ${
            toast.tone === 'ok'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-950'
              : 'border-rose-200 bg-rose-50 text-rose-950'
          }`}
        >
          {toast.message}
        </div>
      ) : null}

      <div className={erpCardCls}>
        <div className="mb-3 flex items-center gap-2">
          <ScanBarcode className="size-5 text-[var(--kc-accent,#c41e3a)]" aria-hidden />
          <h2 className="text-base font-semibold text-[var(--color-jewelry-black,#1a1814)]">Scan barcode</h2>
        </div>
        <p className="mb-3 text-xs leading-relaxed text-[var(--color-jewelry-black,#1a1814)]/60">
          Scan or type a tag barcode, then press Enter. When the form is open, press{' '}
          <kbd className="rounded border border-[var(--color-slate-700,#e8e4df)] bg-[var(--color-slate-900,#faf8f4)] px-1.5 py-0.5 font-mono text-[11px]">
            F1
          </kbd>{' '}
          to save and print.
        </p>
        <input
          ref={scanRef}
          className={`${erpInputCls} font-mono text-base`}
          placeholder="Scan barcode…"
          value={scan}
          disabled={busy}
          onChange={(e) => setScan(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              void onScanSubmit()
            }
          }}
        />
      </div>

      {piece && visibleFields.length > 0 ? (
        <div className={erpCardCls}>
          <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="flex items-center gap-2 text-sm font-semibold text-[var(--color-jewelry-black,#1a1814)]">
                <Tag className="size-4 text-emerald-700" aria-hidden />
                {piece.barcode}
              </p>
              <p className="mt-0.5 text-xs text-[var(--color-jewelry-black,#1a1814)]/55">
                {visibleFields.length} fields · ID {piece.id}
                {piece.locked ? ' · Reserved (lane)' : ''}
              </p>
            </div>
            <button type="button" className={erpBtnGhost} disabled={busy} onClick={clearForm}>
              Clear
            </button>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {visibleFields.map((field) => (
              <label
                key={field.key}
                className="text-xs font-semibold uppercase tracking-wide text-[var(--color-jewelry-black,#1a1814)]/70"
              >
                {field.label}
                {field.kind === 'status' ? (
                  <select
                    className={`${erpInputCls} mt-1`}
                    value={form[field.key] ?? ''}
                    disabled={busy}
                    onChange={(e) => setField(field.key, e.target.value)}
                  >
                    {TAG_EDIT_STATUS_OPTIONS.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    className={`${erpInputCls} mt-1 ${field.kind === 'number' ? 'tabular-nums' : ''}`}
                    type={field.kind === 'number' ? 'text' : 'text'}
                    inputMode={field.kind === 'number' ? 'decimal' : 'text'}
                    value={form[field.key] ?? ''}
                    disabled={busy}
                    onChange={(e) => setField(field.key, e.target.value)}
                  />
                )}
              </label>
            ))}
          </div>

          <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            <button
              type="button"
              className={erpBtnPrimary}
              disabled={busy}
              onClick={() => void saveAndPrint()}
            >
              <Printer className="size-4" aria-hidden />
              Save &amp; print (F1)
            </button>
            <button type="button" className={erpBtnGhost} disabled={busy} onClick={() => void saveOnly()}>
              <Save className="size-4" aria-hidden />
              Save only
            </button>
          </div>
        </div>
      ) : piece && visibleFields.length === 0 ? (
        <div className={erpCardCls}>
          <p className="text-sm text-[var(--color-jewelry-black,#1a1814)]/70">
            Tag found but has no editable field values in the database.
          </p>
          <button type="button" className={`${erpBtnGhost} mt-3`} onClick={clearForm}>
            Scan another
          </button>
        </div>
      ) : null}
    </div>
  )
}

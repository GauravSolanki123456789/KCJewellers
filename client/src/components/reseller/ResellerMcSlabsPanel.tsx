'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import axios from '@/lib/axios'
import {
  mergeMcSlabRows,
  parseMcSlabSheetRows,
  slabOptionsFromUploadedRows,
  type UploadedMcSlabOption,
  type UploadedMcSlabRow,
  UPLOADED_MC_SLAB_LABELS,
} from '@/lib/reseller-mc-slabs'
import { FileSpreadsheet, Loader2, Save, Trash2, Upload } from 'lucide-react'

const EXCEL_ACCEPT =
  '.xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv'

const SLAB_KEYS = Object.keys(UPLOADED_MC_SLAB_LABELS)

const cellInputCls =
  'kc-upload-input w-full min-w-0 rounded-lg border border-[var(--color-slate-700,#e8e4df)] bg-white px-2 py-2 text-xs text-[var(--color-jewelry-black,#1a1814)] shadow-sm outline-none transition focus:border-[var(--kc-accent,#c41e3a)]/45 focus:ring-1 focus:ring-[var(--kc-accent,#c41e3a)]/20'

function formatWhen(iso: string | null | undefined): string {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}

function parseNumInput(raw: string): number | null {
  const n = Number(String(raw).replace(/,/g, '').trim())
  return Number.isFinite(n) ? n : null
}

function activeSlabKeys(rows: UploadedMcSlabRow[]): string[] {
  return SLAB_KEYS.filter((key) => rows.some((row) => row.rates?.[key] != null))
}

export function ResellerMcSlabsPanel() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [savingEdits, setSavingEdits] = useState(false)
  const [clearing, setClearing] = useState(false)
  const [enabled, setEnabled] = useState(false)
  const [rows, setRows] = useState<UploadedMcSlabRow[]>([])
  const [draftRows, setDraftRows] = useState<UploadedMcSlabRow[]>([])
  const [slabOptions, setSlabOptions] = useState<UploadedMcSlabOption[]>([])
  const [uploadedAt, setUploadedAt] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const dirty = useMemo(() => JSON.stringify(rows) !== JSON.stringify(draftRows), [rows, draftRows])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const { data } = await axios.get<{
        enabled?: boolean
        rows?: UploadedMcSlabRow[]
        slabOptions?: UploadedMcSlabOption[]
        uploadedAt?: string | null
      }>('/api/reseller/mc-slabs')
      setEnabled(!!data.enabled)
      const loaded = Array.isArray(data.rows) ? data.rows : []
      setRows(loaded)
      setDraftRows(loaded.map((r) => ({ ...r, rates: { ...r.rates } })))
      setSlabOptions(
        Array.isArray(data.slabOptions) ? data.slabOptions : slabOptionsFromUploadedRows(loaded),
      )
      setUploadedAt(data.uploadedAt ?? null)
    } catch (e: unknown) {
      const msg =
        e && typeof e === 'object' && 'response' in e
          ? (e as { response?: { data?: { error?: string } } }).response?.data?.error
          : null
      setError(msg || 'Could not load MC slabs')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const persistRows = async (nextRows: UploadedMcSlabRow[], successMsg: string) => {
    await axios.put('/api/reseller/mc-slabs', { rows: nextRows })
    setRows(nextRows)
    setDraftRows(nextRows.map((r) => ({ ...r, rates: { ...r.rates } })))
    setSlabOptions(slabOptionsFromUploadedRows(nextRows))
    setUploadedAt(new Date().toISOString())
    setMessage(successMsg)
  }

  const parseExcelFile = async (file: File): Promise<UploadedMcSlabRow[]> => {
    const XLSX = await import('xlsx')
    const buf = await file.arrayBuffer()
    const wb = XLSX.read(buf, { type: 'array' })
    const sheet = wb.Sheets[wb.SheetNames[0]]
    const sheetRows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '' })
    const parsed = parseMcSlabSheetRows(sheetRows as unknown[][])
    return parsed.rows
  }

  const handleFile = async (file: File | null) => {
    if (!file) return
    setError(null)
    setMessage(null)
    setSaving(true)
    try {
      const parsedRows = await parseExcelFile(file)
      const baseRows = draftRows.length ? draftRows : rows
      const { rows: mergedRows, added, updated } = mergeMcSlabRows(baseRows, parsedRows)
      const parts: string[] = []
      if (added) parts.push(`${added} new`)
      if (updated) parts.push(`${updated} updated`)
      const detail = parts.length ? ` (${parts.join(', ')})` : ''
      await persistRows(
        mergedRows,
        `Saved ${mergedRows.length} slab rule${mergedRows.length === 1 ? '' : 's'}${detail}.`,
      )
    } catch (e: unknown) {
      const msg =
        e && typeof e === 'object' && 'response' in e
          ? (e as { response?: { data?: { error?: string } } }).response?.data?.error
          : e instanceof Error
            ? e.message
            : null
      setError(msg || 'Could not save MC slabs')
    } finally {
      setSaving(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const handleSaveEdits = async () => {
    setError(null)
    setMessage(null)
    setSavingEdits(true)
    try {
      const sanitized = draftRows
        .map((row) => ({
          ...row,
          sku: row.sku.trim(),
          styleCode: row.styleCode.trim(),
          mcType: row.mcType.trim() || 'MC/GM',
          metalType: row.metalType?.trim() || null,
        }))
        .filter((row) => row.sku && row.styleCode && Object.keys(row.rates).length > 0)
      if (!sanitized.length) {
        setError('At least one valid row is required (SKU, Style, and one slab rate).')
        return
      }
      await persistRows(sanitized, 'Changes saved.')
    } catch (e: unknown) {
      const msg =
        e && typeof e === 'object' && 'response' in e
          ? (e as { response?: { data?: { error?: string } } }).response?.data?.error
          : e instanceof Error
            ? e.message
            : null
      setError(msg || 'Could not save changes')
    } finally {
      setSavingEdits(false)
    }
  }

  const handleClear = async () => {
    if (!window.confirm('Remove all uploaded MC slab rules? Shared links will no longer show MC rates.')) return
    setClearing(true)
    setError(null)
    setMessage(null)
    try {
      await axios.delete('/api/reseller/mc-slabs')
      setRows([])
      setDraftRows([])
      setSlabOptions([])
      setUploadedAt(null)
      setMessage('MC slabs cleared.')
    } catch (e: unknown) {
      const msg =
        e && typeof e === 'object' && 'response' in e
          ? (e as { response?: { data?: { error?: string } } }).response?.data?.error
          : null
      setError(msg || 'Could not clear MC slabs')
    } finally {
      setClearing(false)
    }
  }

  const updateRowField = (index: number, field: keyof UploadedMcSlabRow, value: string | number | null) => {
    setDraftRows((prev) =>
      prev.map((row, i) => {
        if (i !== index) return row
        if (field === 'wtFrom' || field === 'wtTo') {
          const n = typeof value === 'number' ? value : parseNumInput(String(value ?? ''))
          return { ...row, [field]: n ?? row[field] }
        }
        if (field === 'metalType') {
          return { ...row, metalType: value ? String(value) : null }
        }
        return { ...row, [field]: String(value ?? '') }
      }),
    )
  }

  const updateRowRate = (index: number, slabKey: string, raw: string) => {
    setDraftRows((prev) =>
      prev.map((row, i) => {
        if (i !== index) return row
        const rates = { ...row.rates }
        const trimmed = raw.trim()
        if (!trimmed) {
          delete rates[slabKey]
        } else {
          const n = parseNumInput(trimmed)
          if (n != null) rates[slabKey] = n
        }
        return { ...row, rates }
      }),
    )
  }

  const filteredRows = useMemo(() => {
    const q = filter.trim().toLowerCase()
    if (!q) return draftRows.map((row, index) => ({ row, index }))
    return draftRows
      .map((row, index) => ({ row, index }))
      .filter(({ row }) => {
        const hay = [row.sku, row.styleCode, row.metalType, row.mcType].join(' ').toLowerCase()
        return hay.includes(q)
      })
  }, [draftRows, filter])

  const visibleSlabKeys = useMemo(() => activeSlabKeys(draftRows), [draftRows])

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-[var(--color-jewelry-black,#1a1814)]/60">
        <Loader2 className="size-8 animate-spin" aria-hidden />
      </div>
    )
  }

  if (!enabled) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <FileSpreadsheet className="mx-auto size-12 text-[var(--color-jewelry-black,#1a1814)]/30" />
        <h2 className="mt-4 text-xl font-semibold text-[var(--color-jewelry-black,#1a1814)]">
          Upload slabs not enabled
        </h2>
        <p className="mt-2 text-sm text-[var(--color-jewelry-black,#1a1814)]/65">
          Ask KC admin to enable &quot;Allow MC slab uploads&quot; for your reseller account (Admin → B2B clients →
          Edit reseller).
        </p>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="kc-profile-card rounded-2xl p-5 sm:p-6">
        <h2 className="text-base font-semibold text-[var(--color-jewelry-black,#1a1814)]">Upload MC slab Excel</h2>

        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
          <input
            ref={fileRef}
            type="file"
            accept={EXCEL_ACCEPT}
            className="sr-only"
            id="mc-slab-file"
            onChange={(e) => void handleFile(e.target.files?.[0] ?? null)}
          />
          <label
            htmlFor="mc-slab-file"
            className={`inline-flex min-h-[44px] cursor-pointer items-center justify-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold transition ${
              saving
                ? 'pointer-events-none bg-[var(--color-slate-800,#e8e4df)] text-[var(--color-jewelry-black,#1a1814)]/40'
                : 'kc-btn-theme'
            }`}
          >
            {saving ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : (
              <Upload className="size-4" aria-hidden />
            )}
            {saving ? 'Uploading…' : 'Choose Excel file'}
          </label>
          {rows.length > 0 ? (
            <button
              type="button"
              disabled={clearing || saving || savingEdits}
              onClick={() => void handleClear()}
              className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-red-300/80 bg-red-50 px-4 py-2.5 text-sm font-medium text-red-700 transition hover:bg-red-100 disabled:opacity-50"
            >
              {clearing ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
              Clear all
            </button>
          ) : null}
        </div>

        <p className="kc-upload-hint mt-3 text-[11px]">
          Required columns: SKU, StyleCode, WT_FROM, WT_TO, slab columns, MCType, MetalType. New uploads are{' '}
          <strong className="font-semibold text-[var(--color-jewelry-black,#1a1814)]/75">added</strong> to existing
          rules — use Clear all only when you want to start over.
        </p>

        {message ? (
          <p className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm text-emerald-800">
            {message}
          </p>
        ) : null}
        {error ? (
          <p className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-800">{error}</p>
        ) : null}
      </div>

      <div className="kc-profile-card rounded-2xl p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-wide text-[var(--color-jewelry-black,#1a1814)]/70">
              Current rules
            </h3>
            <p className="mt-0.5 text-xs text-[var(--color-jewelry-black,#1a1814)]/50">
              Last upload: {formatWhen(uploadedAt)}
              {draftRows.length > 0 ? (
                <span className="text-[var(--color-jewelry-black,#1a1814)]/65">
                  {' '}
                  · {draftRows.length} rule{draftRows.length === 1 ? '' : 's'}
                </span>
              ) : null}
            </p>
          </div>
          {dirty ? (
            <button
              type="button"
              disabled={savingEdits || saving}
              onClick={() => void handleSaveEdits()}
              className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-[var(--kc-accent,#c41e3a)] px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:opacity-95 disabled:opacity-50"
            >
              {savingEdits ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
              Save changes
            </button>
          ) : null}
        </div>

        {slabOptions.length > 0 ? (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {slabOptions.map((o) => (
              <span
                key={o.key}
                className="rounded-full border border-[var(--kc-accent,#c41e3a)]/25 bg-[var(--kc-accent,#c41e3a)]/8 px-2.5 py-0.5 text-[11px] font-medium text-[var(--kc-accent,#c41e3a)]"
              >
                {o.label}
              </span>
            ))}
          </div>
        ) : null}

        {draftRows.length === 0 ? (
          <p className="mt-4 text-sm text-[var(--color-jewelry-black,#1a1814)]/55">No slab rules uploaded yet.</p>
        ) : (
          <>
            <div className="mt-4">
              <input
                type="search"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="Filter by SKU or style (e.g. PITARA, BANGLE)"
                className={`${cellInputCls} max-w-md text-sm`}
              />
            </div>

            <p className="mt-3 text-[11px] text-[var(--color-jewelry-black,#1a1814)]/55">
              Tap any cell to edit SKU, style, weight range, slab rates, MC type, or metal.
            </p>

            <div className="mt-3 -mx-1 overflow-x-auto pb-1">
              <table className="w-full min-w-[720px] border-collapse text-left text-xs">
                <thead>
                  <tr className="border-b border-[var(--color-slate-700,#e8e4df)] text-[var(--color-jewelry-black,#1a1814)]/55">
                    <th className="min-w-[5.5rem] px-1.5 py-2 font-medium">SKU</th>
                    <th className="min-w-[5.5rem] px-1.5 py-2 font-medium">Style</th>
                    <th className="min-w-[4rem] px-1.5 py-2 font-medium">From gm</th>
                    <th className="min-w-[4rem] px-1.5 py-2 font-medium">To gm</th>
                    {visibleSlabKeys.map((key) => (
                      <th key={key} className="min-w-[4.25rem] px-1.5 py-2 font-medium">
                        {UPLOADED_MC_SLAB_LABELS[key]}
                      </th>
                    ))}
                    <th className="min-w-[4.5rem] px-1.5 py-2 font-medium">MC type</th>
                    <th className="min-w-[4rem] px-1.5 py-2 font-medium">Metal</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.map(({ row, index }) => (
                    <tr
                      key={`${row.sku}-${row.styleCode}-${index}`}
                      className="border-b border-[var(--color-slate-800,#f0ece6)] align-top"
                    >
                      <td className="px-1.5 py-1.5">
                        <input
                          type="text"
                          value={row.sku}
                          onChange={(e) => updateRowField(index, 'sku', e.target.value)}
                          className={`${cellInputCls} min-w-[5.5rem] font-medium uppercase`}
                          aria-label={`SKU row ${index + 1}`}
                        />
                      </td>
                      <td className="px-1.5 py-1.5">
                        <input
                          type="text"
                          value={row.styleCode}
                          onChange={(e) => updateRowField(index, 'styleCode', e.target.value)}
                          className={`${cellInputCls} min-w-[5.5rem] uppercase`}
                          aria-label={`Style row ${index + 1}`}
                        />
                      </td>
                      <td className="px-1.5 py-1.5">
                        <input
                          type="number"
                          step="any"
                          inputMode="decimal"
                          value={row.wtFrom}
                          onChange={(e) => updateRowField(index, 'wtFrom', e.target.value)}
                          className={`${cellInputCls} min-w-[4rem] tabular-nums`}
                          aria-label={`Weight from row ${index + 1}`}
                        />
                      </td>
                      <td className="px-1.5 py-1.5">
                        <input
                          type="number"
                          step="any"
                          inputMode="decimal"
                          value={row.wtTo}
                          onChange={(e) => updateRowField(index, 'wtTo', e.target.value)}
                          className={`${cellInputCls} min-w-[4rem] tabular-nums`}
                          aria-label={`Weight to row ${index + 1}`}
                        />
                      </td>
                      {visibleSlabKeys.map((key) => (
                        <td key={key} className="px-1.5 py-1.5">
                          <input
                            type="number"
                            step="any"
                            inputMode="decimal"
                            value={row.rates[key] ?? ''}
                            onChange={(e) => updateRowRate(index, key, e.target.value)}
                            placeholder="—"
                            className={`${cellInputCls} min-w-[4.25rem] tabular-nums`}
                            aria-label={`${UPLOADED_MC_SLAB_LABELS[key]} row ${index + 1}`}
                          />
                        </td>
                      ))}
                      <td className="px-1.5 py-1.5">
                        <input
                          type="text"
                          value={row.mcType}
                          onChange={(e) => updateRowField(index, 'mcType', e.target.value)}
                          className={`${cellInputCls} min-w-[4.5rem]`}
                          aria-label={`MC type row ${index + 1}`}
                        />
                      </td>
                      <td className="px-1.5 py-1.5">
                        <input
                          type="text"
                          value={row.metalType ?? ''}
                          onChange={(e) => updateRowField(index, 'metalType', e.target.value)}
                          className={`${cellInputCls} min-w-[4rem] uppercase`}
                          aria-label={`Metal row ${index + 1}`}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {filter && filteredRows.length === 0 ? (
              <p className="mt-3 text-sm text-[var(--color-jewelry-black,#1a1814)]/55">No rows match your filter.</p>
            ) : null}

            {dirty ? (
              <div className="sticky bottom-[calc(var(--kc-mobile-nav-stack,0px)+0.75rem)] z-10 mt-4 sm:static">
                <button
                  type="button"
                  disabled={savingEdits || saving}
                  onClick={() => void handleSaveEdits()}
                  className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl bg-[var(--kc-accent,#c41e3a)] px-4 py-3 text-sm font-semibold text-white shadow-md transition hover:opacity-95 disabled:opacity-50 sm:max-w-xs"
                >
                  {savingEdits ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
                  Save changes
                </button>
              </div>
            ) : null}
          </>
        )}
      </div>
    </div>
  )
}

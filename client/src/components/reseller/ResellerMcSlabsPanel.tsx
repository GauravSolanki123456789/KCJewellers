'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import axios from '@/lib/axios'
import {
  parseMcSlabSheetRows,
  type UploadedMcSlabOption,
  type UploadedMcSlabRow,
  UPLOADED_MC_SLAB_LABELS,
} from '@/lib/reseller-mc-slabs'
import { FileSpreadsheet, Loader2, Trash2, Upload } from 'lucide-react'

const EXCEL_ACCEPT =
  '.xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv'

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

export function ResellerMcSlabsPanel() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [clearing, setClearing] = useState(false)
  const [enabled, setEnabled] = useState(false)
  const [rows, setRows] = useState<UploadedMcSlabRow[]>([])
  const [slabOptions, setSlabOptions] = useState<UploadedMcSlabOption[]>([])
  const [uploadedAt, setUploadedAt] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [previewRows, setPreviewRows] = useState<UploadedMcSlabRow[] | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

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
      setRows(Array.isArray(data.rows) ? data.rows : [])
      setSlabOptions(Array.isArray(data.slabOptions) ? data.slabOptions : [])
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
      setPreviewRows(parsedRows)
      await axios.put('/api/reseller/mc-slabs', { rows: parsedRows })
      setRows(parsedRows)
      setSlabOptions(
        Object.keys(UPLOADED_MC_SLAB_LABELS)
          .filter((key) => parsedRows.some((r) => r.rates?.[key] != null))
          .map((key) => ({ key, label: UPLOADED_MC_SLAB_LABELS[key] || key })),
      )
      setUploadedAt(new Date().toISOString())
      setMessage(`Saved ${parsedRows.length} slab rule${parsedRows.length === 1 ? '' : 's'}.`)
      setPreviewRows(null)
    } catch (e: unknown) {
      const msg =
        e && typeof e === 'object' && 'response' in e
          ? (e as { response?: { data?: { error?: string } } }).response?.data?.error
          : e instanceof Error
            ? e.message
            : null
      setError(msg || 'Could not save MC slabs')
      setPreviewRows(null)
    } finally {
      setSaving(false)
      if (fileRef.current) fileRef.current.value = ''
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
      setSlabOptions([])
      setUploadedAt(null)
      setPreviewRows(null)
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

  const displayRows = previewRows ?? rows

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="kc-profile-card rounded-2xl p-5 sm:p-6">
        <h2 className="text-base font-semibold text-[var(--color-jewelry-black,#1a1814)]">Upload MC slab Excel</h2>
        <p className="mt-2 text-sm leading-relaxed text-[var(--color-jewelry-black,#1a1814)]/60">
          Upload your weight-range making charge sheet (SKU, StyleCode, WT_FROM, WT_TO, Slab C / Slab 2 / etc.). When
          you generate a WhatsApp catalogue link and pick a slab, customers see MC and MCTYPE on each product.
        </p>

        <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center">
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
              disabled={clearing || saving}
              onClick={() => void handleClear()}
              className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-red-300/80 bg-red-50 px-4 py-2.5 text-sm font-medium text-red-700 transition hover:bg-red-100 disabled:opacity-50"
            >
              {clearing ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
              Clear all
            </button>
          ) : null}
        </div>

        <p className="kc-upload-hint mt-3 text-[11px]">
          Required columns: SKU, StyleCode, WT_FROM, WT_TO, plus slab columns (Slab C, Slab 2, Slab R, R Quote, etc.),
          MCType, MetalType.
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
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-[var(--color-jewelry-black,#1a1814)]/70">
            Current rules
          </h3>
          <span className="text-xs text-[var(--color-jewelry-black,#1a1814)]/50">
            Last upload: {formatWhen(uploadedAt)}
          </span>
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

        {displayRows.length === 0 ? (
          <p className="mt-4 text-sm text-[var(--color-jewelry-black,#1a1814)]/55">No slab rules uploaded yet.</p>
        ) : (
          <div className="mt-4 -mx-1 overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-[var(--color-slate-700,#e8e4df)] text-[var(--color-jewelry-black,#1a1814)]/55">
                  <th className="px-2 py-2 font-medium">SKU</th>
                  <th className="px-2 py-2 font-medium">Style</th>
                  <th className="px-2 py-2 font-medium">Wt range</th>
                  <th className="px-2 py-2 font-medium">Slab C</th>
                  <th className="px-2 py-2 font-medium">Slab 2</th>
                  <th className="px-2 py-2 font-medium">Slab R</th>
                  <th className="px-2 py-2 font-medium">MC type</th>
                  <th className="px-2 py-2 font-medium">Metal</th>
                </tr>
              </thead>
              <tbody>
                {displayRows.slice(0, 50).map((row, i) => (
                  <tr
                    key={`${row.sku}-${row.styleCode}-${i}`}
                    className="border-b border-[var(--color-slate-800,#f0ece6)] text-[var(--color-jewelry-black,#1a1814)]"
                  >
                    <td className="px-2 py-2 font-medium">{row.sku}</td>
                    <td className="px-2 py-2">{row.styleCode}</td>
                    <td className="px-2 py-2 tabular-nums">
                      {row.wtFrom}–{row.wtTo} gm
                    </td>
                    <td className="px-2 py-2 tabular-nums">{row.rates.slab_c ?? '—'}</td>
                    <td className="px-2 py-2 tabular-nums">{row.rates.slab_2 ?? '—'}</td>
                    <td className="px-2 py-2 tabular-nums">{row.rates.slab_r ?? '—'}</td>
                    <td className="px-2 py-2">{row.mcType}</td>
                    <td className="px-2 py-2">{row.metalType || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {displayRows.length > 50 ? (
              <p className="mt-2 px-2 text-[11px] text-[var(--color-jewelry-black,#1a1814)]/45">
                Showing first 50 of {displayRows.length} rules.
              </p>
            ) : null}
          </div>
        )}
      </div>
    </div>
  )
}

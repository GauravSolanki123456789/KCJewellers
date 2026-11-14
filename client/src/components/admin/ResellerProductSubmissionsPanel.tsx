'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import axios from '@/lib/axios'
import {
  submissionImageDiskKey,
  submissionPreviewImageUrl,
  submissionStatusLabel,
  submissionStatusTone,
  submissionToPayload,
  RESELLER_PRODUCT_IMAGE_ACCEPT,
  RESELLER_PRODUCT_IMAGE_MAX_BYTES,
  RESELLER_PRODUCT_IMAGE_MAX_LABEL,
  type ResellerProductSubmission,
  type ResellerSubmissionStatus,
} from '@/lib/reseller-products'
import { KC_ADMIN_INBOX_REFRESH_EVENT } from '@/lib/admin-inbox-summary'
import { optimizedCatalogThumbSrc } from '@/lib/catalog-image-next'
import { Check, ChevronDown, ChevronRight, ImagePlus, Loader2, Package, Pencil, Trash2, X } from 'lucide-react'

const FILTERS = [
  { key: 'pending', label: 'Pending' },
  { key: 'approved', label: 'Approved' },
  { key: 'rejected', label: 'Rejected' },
  { key: '', label: 'All' },
] as const

function formatWhen(iso: string): string {
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

export function ResellerProductSubmissionsPanel() {
  const [rows, setRows] = useState<ResellerProductSubmission[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<string>('pending')
  const [actingId, setActingId] = useState<number | null>(null)
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [editRow, setEditRow] = useState<ResellerProductSubmission | null>(null)
  const [expandedApprovedBatchIds, setExpandedApprovedBatchIds] = useState<Set<string>>(new Set())

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = filter ? { submission_status: filter } : {}
      const res = await axios.get<ResellerProductSubmission[]>('/api/admin/reseller-product-submissions', {
        params,
      })
      setRows(Array.isArray(res.data) ? res.data : [])
      setSelected(new Set())
    } catch {
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [filter])

  useEffect(() => {
    void load()
  }, [load])

  const pendingRows = useMemo(() => rows.filter((r) => r.submission_status === 'pending'), [rows])
  const pendingIds = useMemo(() => pendingRows.map((r) => r.id), [pendingRows])

  /** Group pending rows by Excel batch (batch_id) for batch-wise admin review. */
  const pendingGroups = useMemo(() => {
    const map = new Map<string, { batchId: string; label: string; rows: ResellerProductSubmission[] }>()
    for (const row of pendingRows) {
      const batchId = row.batch_id || `single-${row.id}`
      const label = row.batch_label || (row.batch_id ? 'Excel batch' : 'Single product')
      const existing = map.get(batchId)
      if (existing) existing.rows.push(row)
      else map.set(batchId, { batchId: row.batch_id || batchId, label, rows: [row] })
    }
    return [...map.values()].sort(
      (a, b) =>
        new Date(b.rows[0]?.batch_submitted_at || b.rows[0]?.created_at || 0).getTime() -
        new Date(a.rows[0]?.batch_submitted_at || a.rows[0]?.created_at || 0).getTime(),
    )
  }, [pendingRows])

  const approvedGroups = useMemo(() => {
    const approved = rows.filter((r) => r.submission_status === 'approved' && r.batch_id)
    const map = new Map<string, { batchId: string; label: string; rows: ResellerProductSubmission[] }>()
    for (const row of approved) {
      const batchId = row.batch_id as string
      const label = row.batch_label || 'Excel batch'
      const existing = map.get(batchId)
      if (existing) existing.rows.push(row)
      else map.set(batchId, { batchId, label, rows: [row] })
    }
    return [...map.values()].sort(
      (a, b) =>
        new Date(b.rows[0]?.created_at || 0).getTime() - new Date(a.rows[0]?.created_at || 0).getTime(),
    )
  }, [rows])

  const approvedOrphanRows = useMemo(
    () => rows.filter((r) => r.submission_status === 'approved' && !r.batch_id),
    [rows],
  )

  const toggleApprovedBatch = (batchId: string) => {
    setExpandedApprovedBatchIds((prev) => {
      const next = new Set(prev)
      if (next.has(batchId)) next.delete(batchId)
      else next.add(batchId)
      return next
    })
  }

  const toggleSelect = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const selectAllPending = () => {
    setSelected(new Set(pendingIds))
  }

  const approve = async (id: number) => {
    setActingId(id)
    try {
      await axios.post(`/api/admin/reseller-product-submissions/${id}/approve`, {})
      window.dispatchEvent(new Event(KC_ADMIN_INBOX_REFRESH_EVENT))
      await load()
    } catch (e: unknown) {
      const msg =
        e && typeof e === 'object' && 'response' in e
          ? (e as { response?: { data?: { error?: string } } }).response?.data?.error
          : null
      alert(msg || 'Approve failed')
    } finally {
      setActingId(null)
    }
  }

  const bulkApprove = async () => {
    const ids = [...selected].filter((id) => pendingRows.some((r) => r.id === id))
    if (!ids.length) return
    if (!window.confirm(`Approve ${ids.length} product(s)? They will go live on the public KC site.`)) return
    setActingId(-1)
    try {
      await axios.post('/api/admin/reseller-product-submissions/bulk-approve', { ids })
      window.dispatchEvent(new Event(KC_ADMIN_INBOX_REFRESH_EVENT))
      await load()
    } catch {
      alert('Bulk approve failed')
    } finally {
      setActingId(null)
    }
  }

  const republishBatch = async (batchId: string, count: number) => {
    if (!batchId || batchId.startsWith('single-')) return
    if (
      !window.confirm(
        `Re-sync all ${count} approved products in this batch? This updates catalogue placement and hides duplicate gift rows (e.g. old GOLD NOTE copies).`,
      )
    ) {
      return
    }
    setActingId(-3)
    try {
      const res = await axios.post<{ republished?: { id: number }[]; errors?: { error: string }[] }>(
        `/api/admin/reseller-product-submissions/batch/${batchId}/republish`,
        {},
      )
      const n = res.data.republished?.length ?? 0
      const errN = res.data.errors?.length ?? 0
      alert(
        errN > 0
          ? `Re-synced ${n} product(s). ${errN} row(s) had errors.`
          : `Re-synced ${n} product(s). Duplicate placements in wrong SKU should now be hidden.`,
      )
      await load()
    } catch {
      alert('Batch re-sync failed')
    } finally {
      setActingId(null)
    }
  }

  const approveBatch = async (batchId: string, count: number) => {
    if (!batchId || batchId.startsWith('single-')) return
    if (!window.confirm(`Approve all ${count} products in this Excel batch? They will go live on kcjewellers.co.in.`)) return
    setActingId(-2)
    try {
      await axios.post(`/api/admin/reseller-product-submissions/batch/${batchId}/approve`, {})
      window.dispatchEvent(new Event(KC_ADMIN_INBOX_REFRESH_EVENT))
      await load()
    } catch (e: unknown) {
      const msg =
        e && typeof e === 'object' && 'response' in e
          ? (e as { response?: { data?: { error?: string } } }).response?.data?.error
          : null
      alert(msg || 'Batch approve failed')
    } finally {
      setActingId(null)
    }
  }

  const deleteBatch = async (batchId: string, count: number, opts?: { approved?: boolean }) => {
    if (!batchId || batchId.startsWith('single-')) return
    const approved = opts?.approved === true
    if (
      !window.confirm(
        approved
          ? `Delete this Excel batch (${count} live products)? Products will be hidden from the catalogue and their uploaded photos will be removed from the server.`
          : `Delete all ${count} items in this Excel batch? Uploaded photos for these products will be removed.`,
      )
    )
      return
    setActingId(-4)
    try {
      await axios.delete(`/api/admin/reseller-product-submissions/batch/${batchId}`, {
        params: approved ? { delete_live_product: '1' } : {},
      })
      window.dispatchEvent(new Event(KC_ADMIN_INBOX_REFRESH_EVENT))
      await load()
    } catch (e: unknown) {
      const msg =
        e && typeof e === 'object' && 'response' in e
          ? (e as { response?: { data?: { error?: string } } }).response?.data?.error
          : null
      alert(msg || 'Batch delete failed')
    } finally {
      setActingId(null)
    }
  }

  const reject = async (id: number) => {
    const notes = window.prompt('Rejection note (optional):') ?? ''
    setActingId(id)
    try {
      await axios.post(`/api/admin/reseller-product-submissions/${id}/reject`, {
        review_notes: notes || undefined,
      })
      window.dispatchEvent(new Event(KC_ADMIN_INBOX_REFRESH_EVENT))
      await load()
    } catch {
      alert('Reject failed')
    } finally {
      setActingId(null)
    }
  }

  const remove = async (id: number, live: boolean) => {
    if (!window.confirm(live ? 'Delete submission and hide live product?' : 'Delete this submission?')) return
    setActingId(id)
    try {
      await axios.delete(`/api/admin/reseller-product-submissions/${id}`, {
        params: live ? { delete_live_product: '1' } : {},
      })
      window.dispatchEvent(new Event(KC_ADMIN_INBOX_REFRESH_EVENT))
      await load()
    } catch {
      alert('Delete failed')
    } finally {
      setActingId(null)
    }
  }

  return (
    <section className="relative mb-8 rounded-2xl border border-amber-500/25 bg-slate-900/40 p-4 sm:p-6">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-amber-400 flex items-center gap-2">
            <Package className="size-5" />
            Reseller product uploads
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            Approve to publish on kcjewellers.co.in (style category auto-published). Edit or delete anytime.
          </p>
        </div>
        {selected.size > 0 && filter === 'pending' ? (
          <button
            type="button"
            disabled={actingId === -1}
            onClick={() => void bulkApprove()}
            className="flex min-h-[40px] items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
          >
            {actingId === -1 ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
            Approve {selected.size} selected
          </button>
        ) : null}
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        {FILTERS.map(({ key, label }) => (
          <button
            key={key || 'all'}
            type="button"
            onClick={() => setFilter(key)}
            className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
              filter === key ? 'bg-amber-500/25 text-amber-300 ring-1 ring-amber-500/40' : 'bg-slate-800 text-slate-400 hover:text-slate-200'
            }`}
          >
            {label}
          </button>
        ))}
        {filter === 'pending' && pendingIds.length > 1 ? (
          <button
            type="button"
            onClick={selectAllPending}
            className="rounded-full px-3 py-1.5 text-xs font-medium text-slate-400 underline-offset-2 hover:underline"
          >
            Select all pending
          </button>
        ) : null}
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="size-8 animate-spin text-slate-500" />
        </div>
      ) : rows.length === 0 ? (
        <p className="py-8 text-center text-sm text-slate-500">No reseller product submissions.</p>
      ) : filter === 'pending' ? (
        <div className="space-y-6">
          {pendingGroups.map((group) => {
            const isExcelBatch = group.batchId && !group.batchId.startsWith('single-')
            return (
              <div key={group.batchId} className="rounded-xl border border-slate-800 bg-slate-950/30 p-3 sm:p-4">
                <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm font-semibold text-slate-200">{group.label}</p>
                    <p className="text-xs text-slate-500">
                      {group.rows.length} product{group.rows.length === 1 ? '' : 's'}
                      {group.rows[0]?.submitter_business_name
                        ? ` · ${group.rows[0].submitter_business_name}`
                        : ''}
                      {group.rows[0]?.batch_submitted_at
                        ? ` · sent ${formatWhen(group.rows[0].batch_submitted_at)}`
                        : ''}
                    </p>
                  </div>
                  {isExcelBatch ? (
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={actingId === -2}
                        onClick={() => void approveBatch(group.batchId, group.rows.length)}
                        className="flex min-h-[36px] items-center justify-center gap-2 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
                      >
                        {actingId === -2 ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
                        Approve entire batch
                      </button>
                      <button
                        type="button"
                        disabled={actingId === -4}
                        onClick={() => void deleteBatch(group.batchId, group.rows.length)}
                        className="flex min-h-[36px] items-center justify-center gap-2 rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-1.5 text-xs font-semibold text-rose-200 disabled:opacity-60"
                      >
                        {actingId === -4 ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
                        Delete entire batch
                      </button>
                    </div>
                  ) : null}
                </div>
                <ul className="space-y-3">
                  {group.rows.map((row) => (
                    <AdminSubmissionRow
                      key={row.id}
                      row={row}
                      acting={actingId === row.id}
                      selected={selected.has(row.id)}
                      onToggleSelect={() => toggleSelect(row.id)}
                      onApprove={() => void approve(row.id)}
                      onReject={() => void reject(row.id)}
                      onEdit={() => setEditRow(row)}
                      onDelete={() => void remove(row.id, row.submission_status === 'approved')}
                    />
                  ))}
                </ul>
              </div>
            )
          })}
        </div>
      ) : filter === 'approved' && (approvedGroups.length > 0 || approvedOrphanRows.length > 0) ? (
        <div className="space-y-3">
          {approvedGroups.map((group) => {
            const open = expandedApprovedBatchIds.has(group.batchId)
            return (
              <div key={group.batchId} className="rounded-xl border border-slate-800 bg-slate-950/30 overflow-hidden">
                <button
                  type="button"
                  onClick={() => toggleApprovedBatch(group.batchId)}
                  className="flex w-full items-start justify-between gap-3 p-3 text-left sm:p-4"
                >
                  <div className="flex min-w-0 items-start gap-2">
                    {open ? (
                      <ChevronDown className="mt-0.5 size-4 shrink-0 text-amber-400/80" aria-hidden />
                    ) : (
                      <ChevronRight className="mt-0.5 size-4 shrink-0 text-amber-400/80" aria-hidden />
                    )}
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-200">{group.label}</p>
                      <p className="text-xs text-slate-500">
                        {group.rows.length} live product{group.rows.length === 1 ? '' : 's'}
                      </p>
                    </div>
                  </div>
                  <span className="shrink-0 text-[11px] font-medium text-amber-300/90">{open ? 'Hide' : 'Open'}</span>
                </button>
                {open ? (
                  <div className="border-t border-slate-800 px-3 pb-3 sm:px-4 sm:pb-4">
                    <div className="mb-3 flex flex-wrap justify-end gap-2 pt-3">
                      <button
                        type="button"
                        disabled={actingId === -3}
                        onClick={() => void republishBatch(group.batchId, group.rows.length)}
                        className="flex min-h-[36px] items-center justify-center gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-xs font-semibold text-amber-200 disabled:opacity-60"
                      >
                        {actingId === -3 ? <Loader2 className="size-3.5 animate-spin" /> : null}
                        Re-sync batch placements
                      </button>
                      <button
                        type="button"
                        disabled={actingId === -4}
                        onClick={() => void deleteBatch(group.batchId, group.rows.length, { approved: true })}
                        className="flex min-h-[36px] items-center justify-center gap-2 rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-1.5 text-xs font-semibold text-rose-200 disabled:opacity-60"
                      >
                        {actingId === -4 ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
                        Delete entire batch
                      </button>
                    </div>
                    <ul className="space-y-3">
                      {group.rows.map((row) => (
                        <AdminSubmissionRow
                          key={row.id}
                          row={row}
                          acting={actingId === row.id}
                          selected={selected.has(row.id)}
                          onToggleSelect={() => toggleSelect(row.id)}
                          onApprove={() => void approve(row.id)}
                          onReject={() => void reject(row.id)}
                          onEdit={() => setEditRow(row)}
                          onDelete={() => void remove(row.id, row.submission_status === 'approved')}
                        />
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            )
          })}
          {approvedOrphanRows.length > 0 ? (
            <ul className="space-y-3">
              {approvedOrphanRows.map((row) => (
                <AdminSubmissionRow
                  key={row.id}
                  row={row}
                  acting={actingId === row.id}
                  selected={selected.has(row.id)}
                  onToggleSelect={() => toggleSelect(row.id)}
                  onApprove={() => void approve(row.id)}
                  onReject={() => void reject(row.id)}
                  onEdit={() => setEditRow(row)}
                  onDelete={() => void remove(row.id, true)}
                />
              ))}
            </ul>
          ) : null}
        </div>
      ) : (
        <ul className="space-y-3">
          {rows.map((row) => (
            <AdminSubmissionRow
              key={row.id}
              row={row}
              acting={actingId === row.id}
              selected={selected.has(row.id)}
              onToggleSelect={() => toggleSelect(row.id)}
              onApprove={() => void approve(row.id)}
              onReject={() => void reject(row.id)}
              onEdit={() => setEditRow(row)}
              onDelete={() => void remove(row.id, row.submission_status === 'approved')}
            />
          ))}
        </ul>
      )}

      {editRow ? (
        <EditSubmissionModal row={editRow} onClose={() => setEditRow(null)} onSaved={() => void load()} />
      ) : null}
    </section>
  )
}

function AdminSubmissionRow({
  row,
  acting,
  selected,
  onToggleSelect,
  onApprove,
  onReject,
  onEdit,
  onDelete,
}: {
  row: ResellerProductSubmission
  acting: boolean
  selected: boolean
  onToggleSelect: () => void
  onApprove: () => void
  onReject: () => void
  onEdit: () => void
  onDelete: () => void
}) {
  const diskKey = submissionImageDiskKey(row)
  const displayCode = diskKey || row.barcode || row.sku || ''
  const imgRaw = submissionPreviewImageUrl(row)
  const img = imgRaw ? optimizedCatalogThumbSrc(imgRaw, 160) || imgRaw : ''
  const status = row.submission_status as ResellerSubmissionStatus
  const isPending = status === 'pending'

  return (
    <li className="flex gap-3 rounded-xl border border-slate-800 bg-slate-950/50 p-3 sm:p-4">
      {isPending ? (
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggleSelect}
          className="mt-1 size-4 shrink-0 rounded border-slate-600"
          aria-label="Select for bulk approve"
        />
      ) : (
        <span className="mt-1 size-4 shrink-0" />
      )}
      <div className="size-16 shrink-0 overflow-hidden rounded-lg bg-slate-800 sm:size-20">
        {img ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={img} alt="" className="size-full object-cover" />
        ) : (
          <div className="flex size-full items-center justify-center text-slate-600">
            <Package className="size-6" />
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <p className="font-medium text-slate-200">{row.product_name || displayCode}</p>
            <p className="text-xs text-slate-500">
              {row.style_code} › {row.sku}
              {row.metal_type ? ` · ${row.metal_type}` : ''}
              {row.fixed_price != null && Number(row.fixed_price) > 0 ? ` · ₹${row.fixed_price}` : ''}
            </p>
            <p className="text-xs text-slate-600">
              {row.submitter_business_name || row.submitter_email || `User #${row.submitted_by_user_id}`} ·{' '}
              {formatWhen(row.created_at)}
            </p>
          </div>
          <span
            className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase ${submissionStatusTone(status)}`}
          >
            {submissionStatusLabel(status)}
          </span>
        </div>
        {row.review_notes ? <p className="mt-2 text-xs text-rose-400">{row.review_notes}</p> : null}
        <div className="mt-3 flex flex-wrap gap-2">
          {isPending ? (
            <>
              <ActionBtn tone="emerald" onClick={onApprove} disabled={acting} icon={Check} label="Approve & go live" />
              <ActionBtn tone="rose" onClick={onReject} disabled={acting} icon={X} label="Reject" />
            </>
          ) : null}
          <ActionBtn tone="slate" onClick={onEdit} disabled={acting} icon={Pencil} label="Edit" />
          <ActionBtn tone="slate" onClick={onDelete} disabled={acting} icon={Trash2} label="Delete" />
        </div>
      </div>
    </li>
  )
}

function ActionBtn({
  onClick,
  disabled,
  icon: Icon,
  label,
  tone,
}: {
  onClick: () => void
  disabled: boolean
  icon: typeof Check
  label: string
  tone: 'emerald' | 'rose' | 'slate'
}) {
  const cls =
    tone === 'emerald'
      ? 'bg-emerald-600 text-white hover:bg-emerald-500'
      : tone === 'rose'
        ? 'bg-rose-600 text-white hover:bg-rose-500'
        : 'bg-slate-800 text-slate-200 hover:bg-slate-700'
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`inline-flex min-h-[36px] items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium disabled:opacity-50 ${cls}`}
    >
      {disabled ? <Loader2 className="size-3.5 animate-spin" /> : <Icon className="size-3.5" />}
      {label}
    </button>
  )
}

const adminEditInputCls =
  'kc-upload-input w-full rounded-xl border border-[var(--color-slate-700,#e8e4df)] bg-white px-3 py-2.5 text-sm text-[var(--color-jewelry-black,#1a1814)] shadow-sm outline-none'

function AdminSubmissionImageSlot({
  label,
  existingUrl,
  file,
  onPick,
  inputRef,
}: {
  label: string
  existingUrl: string
  file: File | null
  onPick: (f: File | null) => void
  inputRef: RefObject<HTMLInputElement | null>
}) {
  const preview = file ? URL.createObjectURL(file) : existingUrl
  return (
    <div className="rounded-xl border border-[var(--color-slate-700,#e8e4df)] bg-[var(--color-slate-900,#f7f4ef)] p-3">
      <p className="text-xs font-medium text-[var(--color-jewelry-black,#1a1814)]">{label}</p>
      <div className="mt-2 flex items-center gap-3">
        <div className="size-16 shrink-0 overflow-hidden rounded-lg bg-white ring-1 ring-[var(--color-slate-700,#e8e4df)]">
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview} alt="" className="size-full object-cover" />
          ) : (
            <div className="flex size-full items-center justify-center text-[var(--color-jewelry-black,#1a1814)]/25">
              <ImagePlus className="size-5" />
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="min-h-[40px] flex-1 rounded-lg border border-[var(--color-slate-700,#e8e4df)] bg-white px-3 py-2 text-xs font-medium text-[var(--color-jewelry-black,#1a1814)] transition hover:bg-[var(--color-slate-900,#f7f4ef)]"
        >
          {file ? 'Change file' : existingUrl ? 'Replace' : 'Upload'}
        </button>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept={RESELLER_PRODUCT_IMAGE_ACCEPT}
        className="sr-only"
        onChange={(e) => onPick(e.target.files?.[0] ?? null)}
      />
    </div>
  )
}

function EditSubmissionModal({
  row,
  onClose,
  onSaved,
}: {
  row: ResellerProductSubmission
  onClose: () => void
  onSaved: () => void
}) {
  const payload = submissionToPayload(row)
  const [form, setForm] = useState(payload)
  const [notes, setNotes] = useState(row.review_notes || '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [primaryFile, setPrimaryFile] = useState<File | null>(null)
  const [secondaryFile, setSecondaryFile] = useState<File | null>(null)
  const [boxFile, setBoxFile] = useState<File | null>(null)
  const primaryRef = useRef<HTMLInputElement>(null)
  const secondaryRef = useRef<HTMLInputElement>(null)
  const boxRef = useRef<HTMLInputElement>(null)

  const existingPrimary = submissionPreviewImageUrl(row)
  const existingSecondary = String(row.secondary_image_url || '').trim()
  const existingBox = String(row.box_image_url || '').trim()
  const isLive = row.submission_status === 'approved'

  const validateImage = (file: File | null): string | null => {
    if (!file) return null
    if (file.size > RESELLER_PRODUCT_IMAGE_MAX_BYTES) {
      return `Image too large (max ${RESELLER_PRODUCT_IMAGE_MAX_LABEL})`
    }
    return null
  }

  const save = async () => {
    setError(null)
    for (const f of [primaryFile, secondaryFile, boxFile]) {
      const err = validateImage(f)
      if (err) {
        setError(err)
        return
      }
    }
    setSaving(true)
    try {
      const fd = new FormData()
      fd.append('product', JSON.stringify(form))
      fd.append('review_notes', notes)
      if (primaryFile) fd.append('primaryImage', primaryFile, primaryFile.name || 'front.webp')
      if (secondaryFile) fd.append('secondaryImage', secondaryFile, secondaryFile.name || 'back.webp')
      if (boxFile) fd.append('boxImage', boxFile, boxFile.name || 'box.webp')
      await axios.put(`/api/admin/reseller-product-submissions/${row.id}`, fd)
      onSaved()
      onClose()
    } catch (e: unknown) {
      const msg =
        e && typeof e === 'object' && 'response' in e
          ? (e as { response?: { data?: { error?: string } } }).response?.data?.error
          : null
      setError(msg || 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  const field = (label: string, key: keyof typeof form) => (
    <label className="block">
      <span className="kc-upload-label text-xs font-medium text-[var(--color-jewelry-black,#1a1814)]">
        {label}
      </span>
      <input
        className={`${adminEditInputCls} mt-1`}
        value={String(form[key] ?? '')}
        onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
      />
    </label>
  )

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
    >
      <div className="kc-upload-card flex max-h-[92dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl shadow-2xl sm:max-w-xl sm:rounded-2xl">
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-[var(--color-slate-700,#e8e4df)] px-4 py-4 sm:px-5">
          <div className="min-w-0">
            <h3 className="text-lg font-semibold text-[var(--color-jewelry-black,#1a1814)]">Edit submission</h3>
            <p className="kc-upload-hint mt-0.5 truncate text-xs">
              {row.product_name || row.barcode || row.sku}
              {isLive ? ' · updates live catalogue when saved' : ''}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-[var(--color-slate-700,#e8e4df)] text-[var(--color-jewelry-black,#1a1814)]/70 hover:bg-[var(--color-slate-900,#f7f4ef)]"
            aria-label="Close"
          >
            <X className="size-5" />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4 sm:px-5">
          {isLive ? (
            <p className="rounded-xl border border-emerald-500/25 bg-emerald-50 px-3 py-2.5 text-xs leading-relaxed text-emerald-950">
              Approved products sync to the live site. New front, back, or box photos replace files on the server and
              appear in the catalogue after save.
            </p>
          ) : null}
          {error ? (
            <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-900">
              {error}
            </p>
          ) : null}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {field('StyleCode', 'styleCode')}
            {field('SKU', 'sku')}
            {field('Barcode', 'barcode')}
            {field('Product name', 'name')}
            {field('Metal type', 'metalType')}
            {field('Fixed price', 'fixedPrice')}
            {field('Item code', 'itemCode')}
          </div>

          <div>
            <p className="kc-upload-label mb-2 text-xs font-semibold text-[var(--color-jewelry-black,#1a1814)]">
              Photos
            </p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <AdminSubmissionImageSlot
                label="Front"
                existingUrl={existingPrimary}
                file={primaryFile}
                onPick={setPrimaryFile}
                inputRef={primaryRef}
              />
              <AdminSubmissionImageSlot
                label="Back"
                existingUrl={existingSecondary}
                file={secondaryFile}
                onPick={setSecondaryFile}
                inputRef={secondaryRef}
              />
              <AdminSubmissionImageSlot
                label="Box"
                existingUrl={existingBox}
                file={boxFile}
                onPick={setBoxFile}
                inputRef={boxRef}
              />
            </div>
          </div>

          <label className="block">
            <span className="kc-upload-label text-xs font-medium text-[var(--color-jewelry-black,#1a1814)]">
              Admin notes
            </span>
            <textarea
              className={`${adminEditInputCls} mt-1 min-h-[72px] resize-y`}
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </label>
        </div>

        <div className="flex shrink-0 gap-2 border-t border-[var(--color-slate-700,#e8e4df)] px-4 py-4 sm:px-5">
          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] flex-1 rounded-xl border border-[var(--color-slate-700,#e8e4df)] bg-white py-2.5 text-sm font-medium text-[var(--color-jewelry-black,#1a1814)]"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => void save()}
            className="min-h-[44px] flex-1 rounded-xl bg-[var(--kc-accent,#c41e3a)] py-2.5 text-sm font-semibold text-white disabled:opacity-60"
          >
            {saving ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </div>
    </div>
  )
}

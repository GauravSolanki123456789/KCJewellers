'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import axios from '@/lib/axios'
import {
  productImageUrl,
  submissionStatusLabel,
  submissionStatusTone,
  submissionToPayload,
  type ResellerProductSubmission,
  type ResellerSubmissionStatus,
} from '@/lib/reseller-products'
import { KC_ADMIN_INBOX_REFRESH_EVENT } from '@/lib/admin-inbox-summary'
import { Check, Loader2, Package, Pencil, Trash2, X } from 'lucide-react'

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
      await axios.post(`/api/admin/reseller-product-submissions/${id}/approve`)
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

  const approveBatch = async (batchId: string, count: number) => {
    if (!batchId || batchId.startsWith('single-')) return
    if (!window.confirm(`Approve all ${count} products in this Excel batch? They will go live on kcjewellers.co.in.`)) return
    setActingId(-2)
    try {
      await axios.post(`/api/admin/reseller-product-submissions/batch/${batchId}/approve`)
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
    <section className="mb-8 rounded-2xl border border-amber-500/25 bg-slate-900/40 p-4 sm:p-6">
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
                    <button
                      type="button"
                      disabled={actingId === -2}
                      onClick={() => void approveBatch(group.batchId, group.rows.length)}
                      className="flex min-h-[36px] items-center justify-center gap-2 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
                    >
                      {actingId === -2 ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
                      Approve entire batch
                    </button>
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
  const sku = row.barcode || row.web_product_sku || row.sku || ''
  const img = row.image_url || (sku ? productImageUrl(sku) : '')
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
            <p className="font-medium text-slate-200">{row.product_name || sku}</p>
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

  const save = async () => {
    setSaving(true)
    try {
      await axios.put(`/api/admin/reseller-product-submissions/${row.id}`, {
        product: form,
        review_notes: notes,
      })
      onSaved()
      onClose()
    } catch (e: unknown) {
      const msg =
        e && typeof e === 'object' && 'response' in e
          ? (e as { response?: { data?: { error?: string } } }).response?.data?.error
          : null
      alert(msg || 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  const field = (label: string, key: keyof typeof form) => (
    <label className="block text-xs">
      <span className="text-slate-400">{label}</span>
      <input
        className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-2 py-2 text-sm text-slate-100"
        value={String(form[key] ?? '')}
        onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
      />
    </label>
  )

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-t-2xl border border-slate-700 bg-slate-950 p-4 sm:rounded-2xl sm:p-6">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-slate-100">Edit submission</h3>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-white">
            <X className="size-5" />
          </button>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {field('StyleCode', 'styleCode')}
          {field('SKU', 'sku')}
          {field('Barcode', 'barcode')}
          {field('ProductName', 'name')}
          {field('MetalType', 'metalType')}
          {field('FixedPrice', 'fixedPrice')}
          {field('ItemCode', 'itemCode')}
        </div>
        <label className="mt-3 block text-xs">
          <span className="text-slate-400">Admin notes</span>
          <textarea
            className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-2 py-2 text-sm text-slate-100"
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </label>
        <div className="mt-6 flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-xl border border-slate-600 py-2.5 text-sm text-slate-300"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => void save()}
            className="flex-1 rounded-xl bg-amber-600 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
          >
            {saving ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </div>
    </div>
  )
}

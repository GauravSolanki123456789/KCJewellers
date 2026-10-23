'use client'

import { Loader2, Plus, Trash2 } from 'lucide-react'
import { erpBtnGhost, erpBtnPrimary, erpCardCls, erpErr, erpInputCls } from '@/components/reseller/erp/erp-ui'
import axios from '@/lib/axios'
import { appConfirm } from '@/lib/app-notice'

export type NarrationRow = { id: number; label: string; sort_order: number }

type Props = {
  kind: 'credit' | 'debit'
  enabled: boolean
  options: NarrationRow[]
  busy: boolean
  isAdmin: boolean
  shadowUnlocked: boolean
  toggleBusy: boolean
  newLabel: string
  editId: number | null
  editLabel: string
  onNewLabel: (v: string) => void
  onEditId: (id: number | null) => void
  onEditLabel: (v: string) => void
  onReload: () => Promise<void>
  onEnabledChange: (enabled: boolean) => void
  onToggleBusy: (v: boolean) => void
}

export function ErpNoteNarrationsSection({
  kind,
  enabled,
  options,
  busy,
  isAdmin,
  shadowUnlocked,
  toggleBusy,
  newLabel,
  editId,
  editLabel,
  onNewLabel,
  onEditId,
  onEditLabel,
  onReload,
  onEnabledChange,
  onToggleBusy,
}: Props) {
  const title = kind === 'credit' ? 'Credit note narrations' : 'Debit note narrations'
  const apiBase =
    kind === 'credit' ? '/api/reseller/erp/credit-note-narrations' : '/api/reseller/erp/debit-note-narrations'

  const addOption = async () => {
    const label = newLabel.trim()
    if (!label || !isAdmin) return
    try {
      await axios.post(apiBase, { label })
      onNewLabel('')
      await onReload()
    } catch (e) {
      alert(erpErr(e))
    }
  }

  const saveEdit = async () => {
    if (editId == null || !isAdmin) return
    const label = editLabel.trim()
    if (!label) return
    try {
      await axios.put(`${apiBase}/${editId}`, { label })
      onEditId(null)
      onEditLabel('')
      await onReload()
    } catch (e) {
      alert(erpErr(e))
    }
  }

  const removeOption = async (row: NarrationRow) => {
    if (!shadowUnlocked || !isAdmin) return
    const ok = await appConfirm(`Delete narration “${row.label}”?`)
    if (!ok) return
    try {
      await axios.delete(`${apiBase}/${row.id}`)
      await onReload()
    } catch (e) {
      alert(erpErr(e))
    }
  }

  const toggleEnabled = async () => {
    if (!shadowUnlocked || !isAdmin) return
    onToggleBusy(true)
    try {
      const res = await axios.put<{ enabled: boolean }>(`${apiBase}/settings/enabled`, { enabled: !enabled })
      onEnabledChange(res.data.enabled === true)
    } catch (e) {
      alert(erpErr(e))
    } finally {
      onToggleBusy(false)
    }
  }

  return (
    <div className={`${erpCardCls} space-y-4`}>
      <p className="text-sm font-semibold text-[var(--color-jewelry-black,#1a1814)]">{title}</p>
      <p className="text-xs leading-relaxed text-[var(--color-jewelry-black,#1a1814)]/55">
        When turned on, staff must pick a narration when issuing {kind === 'credit' ? 'credit' : 'debit'} notes. It
        appears on the note PDF.
      </p>
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--color-slate-700,#e8e4df)] bg-[var(--color-slate-900,#f7f4ef)]/40 px-3 py-2.5">
        <p className="text-sm text-[var(--color-jewelry-black,#1a1814)]">
          {enabled ? 'On — narration required on issue.' : 'Off — narration hidden (default).'}
        </p>
        {shadowUnlocked ? (
          <button type="button" className={erpBtnGhost} disabled={toggleBusy} onClick={() => void toggleEnabled()}>
            {toggleBusy ? <Loader2 className="size-4 animate-spin" /> : enabled ? 'Turn off' : 'Turn on'}
          </button>
        ) : (
          <p className="text-xs text-[var(--color-jewelry-black,#1a1814)]/45">Unlock Jainav mode to change this.</p>
        )}
      </div>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <label className="min-w-0 flex-1 text-xs text-[var(--color-jewelry-black,#1a1814)]/55">
          New narration
          <input
            className={`${erpInputCls} mt-1`}
            value={newLabel}
            onChange={(e) => onNewLabel(e.target.value)}
            placeholder={kind === 'credit' ? 'e.g. ADJUSTMENT AGAINST RETURN' : 'e.g. SHORT WEIGHT RECOVERED'}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void addOption()
            }}
          />
        </label>
        <button type="button" className={erpBtnPrimary} onClick={() => void addOption()} disabled={!newLabel.trim()}>
          <Plus className="size-4" aria-hidden />
          Add
        </button>
      </div>
      {busy ? (
        <div className="flex justify-center py-6">
          <Loader2 className="size-6 animate-spin text-[var(--color-jewelry-black,#1a1814)]/35" />
        </div>
      ) : options.length === 0 ? (
        <p className="py-4 text-center text-sm text-[var(--color-jewelry-black,#1a1814)]/45">No options yet.</p>
      ) : (
        <ul className="divide-y divide-[var(--color-slate-700,#e8e4df)] rounded-xl border border-[var(--color-slate-700,#e8e4df)]">
          {options.map((row) => (
            <li key={row.id} className="flex flex-wrap items-center gap-2 px-3 py-2.5">
              {editId === row.id ? (
                <>
                  <input
                    className={`${erpInputCls} min-w-[12rem] flex-1`}
                    value={editLabel}
                    onChange={(e) => onEditLabel(e.target.value)}
                    autoFocus
                  />
                  <button type="button" className={erpBtnPrimary} onClick={() => void saveEdit()}>
                    Save
                  </button>
                  <button
                    type="button"
                    className={erpBtnGhost}
                    onClick={() => {
                      onEditId(null)
                      onEditLabel('')
                    }}
                  >
                    Cancel
                  </button>
                </>
              ) : (
                <>
                  <span className="min-w-0 flex-1 text-sm font-medium text-[var(--color-jewelry-black,#1a1814)]">
                    {row.label}
                  </span>
                  <button
                    type="button"
                    className={erpBtnGhost}
                    onClick={() => {
                      onEditId(row.id)
                      onEditLabel(row.label)
                    }}
                  >
                    Edit
                  </button>
                  {shadowUnlocked ? (
                    <button
                      type="button"
                      className="inline-flex min-h-[44px] items-center gap-1 rounded-xl border border-red-200 bg-red-50 px-3 text-sm font-semibold text-red-800"
                      onClick={() => void removeOption(row)}
                    >
                      <Trash2 className="size-4" aria-hidden />
                      Delete
                    </button>
                  ) : null}
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

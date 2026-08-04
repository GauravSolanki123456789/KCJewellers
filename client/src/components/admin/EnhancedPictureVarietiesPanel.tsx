'use client'

import { useCallback, useMemo, useState } from 'react'
import { Loader2, Plus, Trash2 } from 'lucide-react'
import SaveFeedbackButton from '@/components/ui/SaveFeedbackButton'
import { useSaveFeedback } from '@/hooks/useSaveFeedback'
import {
  createAdminEnhancedVariety,
  deleteAdminEnhancedVariety,
  patchAdminEnhancedVariety,
  type EnhancedPictureVariety,
} from '@/lib/reseller-enhanced-pictures'

type Props = {
  userId: number
  templateKey: string
  varieties: EnhancedPictureVariety[]
  onReload: () => Promise<void> | void
  selectedVarietyKey: string | null
  onSelectVariety: (key: string | null) => void
}

export default function EnhancedPictureVarietiesPanel({
  userId,
  templateKey,
  varieties,
  onReload,
  selectedVarietyKey,
  onSelectVariety,
}: Props) {
  const [busy, setBusy] = useState(false)
  const [newLabel, setNewLabel] = useState('')
  const saveFb = useSaveFeedback()

  const sorted = useMemo(
    () => [...varieties].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)),
    [varieties],
  )

  const addVariety = useCallback(async () => {
    const label = newLabel.trim()
    if (!label) return
    setBusy(true)
    try {
      await createAdminEnhancedVariety(userId, {
        template_key: templateKey,
        variety_label: label,
      })
      setNewLabel('')
      await onReload()
    } catch (e: unknown) {
      alert(
        (e as { response?: { data?: { error?: string } } })?.response?.data?.error ||
          'Could not add variety',
      )
    } finally {
      setBusy(false)
    }
  }, [newLabel, onReload, templateKey, userId])

  const toggleEnabled = async (v: EnhancedPictureVariety) => {
    if (!v.id) return
    setBusy(true)
    try {
      await patchAdminEnhancedVariety(v.id, { is_enabled: !v.is_enabled })
      await onReload()
    } finally {
      setBusy(false)
    }
  }

  const remove = async (v: EnhancedPictureVariety) => {
    if (!v.id) return
    if (!window.confirm(`Delete variety "${v.variety_label}"?`)) return
    setBusy(true)
    try {
      await deleteAdminEnhancedVariety(v.id)
      if (selectedVarietyKey === v.variety_key) onSelectVariety(null)
      await onReload()
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="rounded-2xl border border-[var(--color-slate-700,#e8e4df)] bg-white p-4 sm:p-5">
      <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-sm font-semibold text-[var(--color-jewelry-black,#1a1814)]">
            Product varieties
          </h3>
          <p className="text-xs text-[var(--color-jewelry-black,#1a1814)]/55">
            Add types under this template (idols, bangles, plates…). Reseller staff pick a variety; sample
            photos update when you test a prompt.
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          value={newLabel}
          onChange={(e) => setNewLabel(e.target.value)}
          placeholder="e.g. Solid idols, Flexi kada, Bowl sets"
          className="min-h-[44px] flex-1 rounded-xl border border-[var(--color-slate-700,#e8e4df)] px-3 py-2 text-sm text-[var(--color-jewelry-black,#1a1814)]"
        />
        <SaveFeedbackButton
          type="button"
          disabled={busy || !newLabel.trim()}
          saving={saveFb.saving}
          saved={saveFb.saved}
          onClick={() => void addVariety()}
          className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-emerald-700 px-4 text-sm font-semibold text-white disabled:opacity-50"
        >
          {busy ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
          Add variety
        </SaveFeedbackButton>
      </div>

      {sorted.length ? (
        <ul className="mt-4 space-y-2">
          {sorted.map((v) => {
            const selected = selectedVarietyKey === v.variety_key
            return (
              <li
                key={v.variety_key}
                className={`rounded-xl border p-3 ${
                  selected
                    ? 'border-[var(--kc-accent,#c41e3a)] bg-[var(--kc-accent,#c41e3a)]/5'
                    : 'border-[var(--color-slate-700,#e8e4df)]'
                }`}
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <button
                    type="button"
                    onClick={() => onSelectVariety(selected ? null : v.variety_key)}
                    className="min-w-0 flex-1 text-left"
                  >
                    <p className="text-sm font-semibold text-[var(--color-jewelry-black,#1a1814)]">
                      {v.variety_label}
                    </p>
                    <p className="mt-0.5 font-mono text-[10px] text-[var(--color-jewelry-black,#1a1814)]/45">
                      {v.variety_key}
                    </p>
                    {(v.sample_source_image_url || v.sample_result_image_url) && (
                      <div className="mt-2 flex gap-2">
                        {v.sample_source_image_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={v.sample_source_image_url}
                            alt=""
                            className="size-14 rounded-lg object-cover ring-1 ring-[var(--color-slate-700,#e8e4df)]"
                          />
                        ) : null}
                        {v.sample_result_image_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={v.sample_result_image_url}
                            alt=""
                            className="size-14 rounded-lg object-cover ring-1 ring-emerald-500/30"
                          />
                        ) : null}
                      </div>
                    )}
                  </button>
                  <div className="flex shrink-0 flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void toggleEnabled(v)}
                      className={`min-h-[36px] rounded-lg px-3 text-xs font-semibold ${
                        v.is_enabled
                          ? 'bg-emerald-600 text-white'
                          : 'border border-[var(--color-slate-700,#e8e4df)] text-[var(--color-jewelry-black,#1a1814)]/60'
                      }`}
                    >
                      {v.is_enabled ? 'Enabled for reseller' : 'Disabled'}
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void remove(v)}
                      className="inline-flex min-h-[36px] items-center gap-1 rounded-lg border border-rose-200 px-3 text-xs font-semibold text-rose-700"
                    >
                      <Trash2 className="size-3.5" />
                      Delete
                    </button>
                  </div>
                </div>
              </li>
            )
          })}
        </ul>
      ) : (
        <p className="mt-3 text-xs text-[var(--color-jewelry-black,#1a1814)]/45">
          No varieties yet — add product types your reseller staff can choose.
        </p>
      )}
    </section>
  )
}

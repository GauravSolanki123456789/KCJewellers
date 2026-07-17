'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import axios from '@/lib/axios'
import AdminGuard from '@/components/AdminGuard'
import { ArrowLeft, Clock, Loader2, Plus, Save, Trash2 } from 'lucide-react'
import type { SharedCatalogExpiryOption } from '@/lib/shared-catalog-api'

type SettingsPayload = {
  options: SharedCatalogExpiryOption[]
  maxExpiryDays: number
}

function SharedCatalogSettingsContent() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [options, setOptions] = useState<SharedCatalogExpiryOption[]>([])
  const [maxExpiryDays, setMaxExpiryDays] = useState(30)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const { data } = await axios.get<SettingsPayload>('/api/admin/shared-catalog-settings', {
        withCredentials: true,
      })
      setOptions(Array.isArray(data.options) ? data.options : [])
      setMaxExpiryDays(data.maxExpiryDays ?? 30)
    } catch {
      setError('Could not load shared catalogue settings.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const updateOption = (index: number, patch: Partial<SharedCatalogExpiryOption>) => {
    setOptions((prev) => prev.map((o, i) => (i === index ? { ...o, ...patch } : o)))
  }

  const addOption = () => {
    setOptions((prev) => [...prev, { label: '3 days', hours: 72 }])
  }

  const removeOption = (index: number) => {
    setOptions((prev) => prev.filter((_, i) => i !== index))
  }

  const save = async () => {
    setSaving(true)
    setError(null)
    setSuccess(null)
    try {
      const cleaned = options
        .map((o) => ({
          label: String(o.label || '').trim(),
          hours: parseInt(String(o.hours), 10),
        }))
        .filter((o) => o.label && Number.isFinite(o.hours) && o.hours > 0)
      if (!cleaned.length) {
        setError('Add at least one expiry option.')
        return
      }
      await axios.patch(
        '/api/admin/shared-catalog-settings',
        { options: cleaned, maxExpiryDays },
        { withCredentials: true },
      )
      setSuccess('Saved. Resellers and KC staff will see these options when creating share links.')
      await load()
    } catch (e: unknown) {
      const msg =
        (e as { response?: { data?: { error?: string } } })?.response?.data?.error ||
        'Save failed.'
      setError(msg)
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-slate-400">
        <Loader2 className="size-6 animate-spin" aria-hidden />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <main className="mx-auto max-w-2xl px-4 py-6 md:py-8">
        <Link
          href="/admin"
          className="mb-4 inline-flex items-center gap-2 text-sm text-slate-500 transition hover:text-amber-400"
        >
          <ArrowLeft className="size-4" aria-hidden />
          Admin dashboard
        </Link>

        <div className="mb-6 flex items-center gap-3">
          <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/10 p-2.5">
            <Clock className="size-6 text-emerald-400" aria-hidden />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-slate-100">Shared catalogue links</h1>
            <p className="text-sm text-slate-500">Expiry dropdown options for WhatsApp / web brochures</p>
          </div>
        </div>

        {error ? (
          <p className="mb-4 rounded-xl border border-rose-500/30 bg-rose-950/40 px-3 py-2 text-sm text-rose-200">
            {error}
          </p>
        ) : null}
        {success ? (
          <p className="mb-4 rounded-xl border border-emerald-500/30 bg-emerald-950/30 px-3 py-2 text-sm text-emerald-200">
            {success}
          </p>
        ) : null}

        <div className="space-y-5 rounded-2xl border border-slate-800 bg-slate-900/40 p-4 sm:p-5">
          <div>
            <label htmlFor="max-expiry-days" className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
              Maximum link lifetime (days)
            </label>
            <input
              id="max-expiry-days"
              type="number"
              min={1}
              max={90}
              value={maxExpiryDays}
              onChange={(e) => setMaxExpiryDays(Number(e.target.value) || 30)}
              className="min-h-[44px] w-full max-w-[160px] rounded-xl border border-slate-700 bg-slate-900/60 px-3 text-sm text-slate-100 outline-none focus:border-emerald-500/50"
            />
          </div>

          <div>
            <div className="mb-3 flex items-center justify-between gap-2">
              <p className="text-sm font-semibold text-slate-200">Link expires in — options</p>
              <button
                type="button"
                onClick={addOption}
                className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-slate-700 px-2.5 text-xs font-medium text-slate-300 hover:bg-slate-800"
              >
                <Plus className="size-3.5" aria-hidden />
                Add
              </button>
            </div>

            <div className="space-y-2">
              {options.map((opt, index) => (
                <div
                  key={`expiry-${index}`}
                  className="flex flex-col gap-2 rounded-xl border border-slate-800 bg-slate-950/50 p-3 sm:flex-row sm:items-center"
                >
                  <div className="min-w-0 flex-1">
                    <label className="mb-1 block text-[10px] uppercase tracking-wide text-slate-600">
                      Label
                    </label>
                    <input
                      value={opt.label}
                      onChange={(e) => updateOption(index, { label: e.target.value })}
                      placeholder="e.g. 24 days"
                      className="min-h-[40px] w-full rounded-lg border border-slate-700 bg-slate-900/60 px-3 text-sm text-slate-100"
                    />
                  </div>
                  <div className="w-full sm:w-28">
                    <label className="mb-1 block text-[10px] uppercase tracking-wide text-slate-600">
                      Hours
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={2160}
                      value={opt.hours}
                      onChange={(e) => updateOption(index, { hours: Number(e.target.value) || 1 })}
                      className="min-h-[40px] w-full rounded-lg border border-slate-700 bg-slate-900/60 px-3 text-sm text-slate-100"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => removeOption(index)}
                    disabled={options.length <= 1}
                    className="inline-flex min-h-[40px] items-center justify-center gap-1 rounded-lg border border-rose-500/30 px-3 text-xs text-rose-300 hover:bg-rose-950/40 disabled:opacity-40"
                    aria-label="Remove option"
                  >
                    <Trash2 className="size-3.5" aria-hidden />
                    Remove
                  </button>
                </div>
              ))}
            </div>
          </div>

          <button
            type="button"
            disabled={saving}
            onClick={() => void save()}
            className="inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-emerald-600 px-4 text-sm font-bold text-white hover:opacity-90 disabled:opacity-60 sm:w-auto"
          >
            {saving ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Save className="size-4" aria-hidden />}
            Save settings
          </button>
        </div>
      </main>
    </div>
  )
}

export default function AdminSharedCatalogSettingsPage() {
  return (
    <AdminGuard>
      <SharedCatalogSettingsContent />
    </AdminGuard>
  )
}

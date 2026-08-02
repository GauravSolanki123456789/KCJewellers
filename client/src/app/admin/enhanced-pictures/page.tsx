'use client'

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import {
  ArrowLeft,
  CheckCircle2,
  Loader2,
  Sparkles,
  Trash2,
  Upload,
} from 'lucide-react'
import AdminGuard from '@/components/AdminGuard'
import {
  activateAdminEnhancedPrompt,
  deleteAdminEnhancedPrompt,
  fetchAdminEnhancedPrompts,
  patchAdminEnhancedPrompt,
  testGenerateAdminEnhanced,
  type EnhancedPicturePrompt,
} from '@/lib/reseller-enhanced-pictures'

function AdminEnhancedPicturesInner() {
  const searchParams = useSearchParams()
  const userId = parseInt(String(searchParams.get('userId') || ''), 10)

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [businessName, setBusinessName] = useState('')
  const [email, setEmail] = useState('')
  const [enabled, setEnabled] = useState(false)
  const [prompts, setPrompts] = useState<EnhancedPicturePrompt[]>([])
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [name, setName] = useState('Idols test')
  const [promptText, setPromptText] = useState('')
  const [negativePrompt, setNegativePrompt] = useState('')
  const [sourcePreview, setSourcePreview] = useState<string | null>(null)
  const [sourceFile, setSourceFile] = useState<File | null>(null)
  const [resultUrl, setResultUrl] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [statusMsg, setStatusMsg] = useState('')

  const selected = useMemo(
    () => prompts.find((p) => p.id === selectedId) || null,
    [prompts, selectedId],
  )

  const load = useCallback(async () => {
    if (!userId) {
      setError('Open this page from B2B clients → Edit reseller → Manage prompts.')
      setLoading(false)
      return
    }
    setLoading(true)
    setError('')
    try {
      const data = await fetchAdminEnhancedPrompts(userId)
      setBusinessName(data.user.business_name || '')
      setEmail(data.user.email || '')
      setEnabled(!!data.user.reseller_enhanced_pictures_enabled)
      setPrompts(data.prompts)
      const active = data.prompts.find((p) => p.is_active) || data.prompts[0]
      if (active) {
        setSelectedId(active.id)
        setName(active.name)
        setPromptText(active.prompt_text)
        setNegativePrompt(active.negative_prompt || '')
        setResultUrl(active.test_result_image_url || null)
        setSourcePreview(active.test_source_image_url || null)
      }
    } catch (e: unknown) {
      const msg =
        (e as { response?: { data?: { error?: string } }; message?: string })?.response?.data
          ?.error ||
        (e as { message?: string })?.message ||
        'Failed to load prompts'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }, [userId])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (!selected) return
    setName(selected.name)
    setPromptText(selected.prompt_text)
    setNegativePrompt(selected.negative_prompt || '')
    if (selected.test_result_image_url) setResultUrl(selected.test_result_image_url)
    if (selected.test_source_image_url) setSourcePreview(selected.test_source_image_url)
  }, [selected])

  const onPickFile = (file: File | null) => {
    setSourceFile(file)
    if (sourcePreview && sourcePreview.startsWith('blob:')) URL.revokeObjectURL(sourcePreview)
    setSourcePreview(file ? URL.createObjectURL(file) : null)
  }

  const runTest = async (saveAsNew: boolean) => {
    if (!userId || !sourceFile) {
      setStatusMsg('Upload a sample idol photo first.')
      return
    }
    if (!promptText.trim()) {
      setStatusMsg('Prompt text is required.')
      return
    }
    setBusy(true)
    setStatusMsg(saveAsNew ? 'Testing as new prompt…' : 'Generating studio test…')
    try {
      const data = await testGenerateAdminEnhanced({
        userId,
        image: sourceFile,
        promptText,
        negativePrompt,
        name,
        promptId: saveAsNew ? null : selectedId,
        saveAsNew,
      })
      setResultUrl(data.result_image_url)
      setSourcePreview(data.source_image_url)
      await load()
      setSelectedId(data.prompt.id)
      setStatusMsg('Test image ready. Activate this prompt when you are happy with it.')
    } catch (e: unknown) {
      const msg =
        (e as { response?: { data?: { error?: string } }; message?: string })?.response?.data
          ?.error ||
        (e as { message?: string })?.message ||
        'Generation failed'
      setStatusMsg(msg)
    } finally {
      setBusy(false)
    }
  }

  const saveEdits = async () => {
    if (!selectedId) return
    setBusy(true)
    setStatusMsg('Saving prompt…')
    try {
      await patchAdminEnhancedPrompt(selectedId, {
        name,
        prompt_text: promptText,
        negative_prompt: negativePrompt,
      })
      await load()
      setStatusMsg('Prompt saved.')
    } catch (e: unknown) {
      setStatusMsg(
        (e as { response?: { data?: { error?: string } } })?.response?.data?.error ||
          'Save failed',
      )
    } finally {
      setBusy(false)
    }
  }

  const activate = async () => {
    if (!selectedId) return
    setBusy(true)
    try {
      await activateAdminEnhancedPrompt(selectedId)
      await load()
      setStatusMsg('This prompt is now active for the reseller studio.')
    } catch (e: unknown) {
      setStatusMsg(
        (e as { response?: { data?: { error?: string } } })?.response?.data?.error ||
          'Activate failed',
      )
    } finally {
      setBusy(false)
    }
  }

  const remove = async (id: number) => {
    if (!confirm('Delete this test prompt?')) return
    setBusy(true)
    try {
      await deleteAdminEnhancedPrompt(id)
      await load()
      setStatusMsg('Prompt deleted.')
    } catch (e: unknown) {
      setStatusMsg(
        (e as { response?: { data?: { error?: string } } })?.response?.data?.error ||
          'Delete failed',
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto max-w-6xl px-4 py-6 md:py-8">
        <div className="mb-6 flex flex-wrap items-start gap-3">
          <Link
            href="/admin/b2b-clients"
            className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-slate-700 text-slate-200 hover:bg-slate-900"
            aria-label="Back to B2B clients"
          >
            <ArrowLeft className="size-5" />
          </Link>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-amber-400/90">
              Enhanced pictures
            </p>
            <h1 className="mt-1 text-xl font-semibold text-white md:text-2xl">
              Prompt lab · Idols / Frames
            </h1>
            <p className="mt-1 text-sm text-slate-400">
              {businessName || email || (userId ? `User #${userId}` : 'No reseller selected')}
              {enabled ? (
                <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-medium text-emerald-300">
                  <CheckCircle2 className="size-3" /> Subscription on
                </span>
              ) : (
                <span className="ml-2 text-[11px] text-amber-300/90">
                  Subscription off — enable toggle on reseller profile first
                </span>
              )}
            </p>
          </div>
        </div>

        {loading ? (
          <p className="text-slate-400">Loading…</p>
        ) : error ? (
          <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
            {error}
          </div>
        ) : (
          <div className="grid gap-5 lg:grid-cols-[240px_minmax(0,1fr)]">
            <aside className="space-y-2">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Saved prompts
              </p>
              {prompts.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setSelectedId(p.id)}
                  className={`w-full rounded-xl border px-3 py-2.5 text-left transition ${
                    selectedId === p.id
                      ? 'border-amber-400/60 bg-amber-400/10'
                      : 'border-slate-800 bg-slate-900/60 hover:border-slate-600'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-sm font-medium text-slate-100">{p.name}</span>
                    {p.is_active ? (
                      <span className="shrink-0 rounded-full bg-emerald-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-300">
                        ACTIVE
                      </span>
                    ) : p.is_test ? (
                      <span className="shrink-0 text-[10px] text-slate-500">test</span>
                    ) : null}
                  </div>
                  <p className="mt-1 line-clamp-2 text-[11px] text-slate-500">{p.prompt_text}</p>
                </button>
              ))}
            </aside>

            <div className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <label className="block rounded-2xl border border-dashed border-slate-700 bg-slate-900/50 p-4">
                  <span className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-amber-400/90">
                    <Upload className="size-3.5" /> Sample photo
                  </span>
                  {sourcePreview ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={sourcePreview}
                      alt="Sample"
                      className="mb-3 aspect-square w-full rounded-xl object-cover"
                    />
                  ) : (
                    <div className="mb-3 flex aspect-square items-center justify-center rounded-xl bg-slate-950 text-sm text-slate-500">
                      Drop or choose an idol photo
                    </div>
                  )}
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/gif"
                    className="block w-full text-xs text-slate-400 file:mr-3 file:rounded-lg file:border-0 file:bg-amber-400/90 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-slate-950"
                    onChange={(e) => onPickFile(e.target.files?.[0] || null)}
                  />
                </label>
                <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-4">
                  <span className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-amber-400/90">
                    <Sparkles className="size-3.5" /> Studio result
                  </span>
                  {resultUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={resultUrl}
                      alt="Generated"
                      className="aspect-square w-full rounded-xl object-cover"
                    />
                  ) : (
                    <div className="flex aspect-square items-center justify-center rounded-xl bg-slate-950 text-sm text-slate-500">
                      Run a test to preview
                    </div>
                  )}
                </div>
              </div>

              <label className="block">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  Prompt name
                </span>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="mt-1.5 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-slate-100 outline-none focus:border-amber-400/60"
                />
              </label>
              <label className="block">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  Master prompt
                </span>
                <textarea
                  value={promptText}
                  onChange={(e) => setPromptText(e.target.value)}
                  rows={14}
                  className="mt-1.5 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 font-mono text-[12px] leading-relaxed text-slate-200 outline-none focus:border-amber-400/60"
                />
              </label>
              <label className="block">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  Negative prompt
                </span>
                <textarea
                  value={negativePrompt}
                  onChange={(e) => setNegativePrompt(e.target.value)}
                  rows={6}
                  className="mt-1.5 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 font-mono text-[12px] leading-relaxed text-slate-200 outline-none focus:border-amber-400/60"
                />
              </label>

              {statusMsg ? (
                <p className="rounded-xl border border-slate-800 bg-slate-900/80 px-3 py-2 text-sm text-slate-300">
                  {statusMsg}
                </p>
              ) : null}

              <div className="flex flex-wrap gap-2 pb-8">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void runTest(false)}
                  className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-amber-400 px-4 py-2.5 text-sm font-semibold text-slate-950 disabled:opacity-50"
                >
                  {busy ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
                  Test this prompt
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void runTest(true)}
                  className="inline-flex min-h-[44px] items-center justify-center rounded-xl border border-slate-600 px-4 py-2.5 text-sm font-medium text-slate-100 disabled:opacity-50"
                >
                  Test &amp; save as new
                </button>
                <button
                  type="button"
                  disabled={busy || !selectedId}
                  onClick={() => void saveEdits()}
                  className="inline-flex min-h-[44px] items-center justify-center rounded-xl border border-slate-600 px-4 py-2.5 text-sm font-medium text-slate-100 disabled:opacity-50"
                >
                  Save edits
                </button>
                <button
                  type="button"
                  disabled={busy || !selectedId || selected?.is_active}
                  onClick={() => void activate()}
                  className="inline-flex min-h-[44px] items-center justify-center rounded-xl border border-emerald-500/40 bg-emerald-500/15 px-4 py-2.5 text-sm font-semibold text-emerald-200 disabled:opacity-50"
                >
                  Activate for reseller
                </button>
                {selected && !selected.is_active ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void remove(selected.id)}
                    className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl border border-rose-500/40 px-4 py-2.5 text-sm font-medium text-rose-200 disabled:opacity-50"
                  >
                    <Trash2 className="size-4" />
                    Delete test
                  </button>
                ) : null}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default function AdminEnhancedPicturesPage() {
  return (
    <AdminGuard>
      <Suspense
        fallback={
          <div className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-400">
            Loading…
          </div>
        }
      >
        <AdminEnhancedPicturesInner />
      </Suspense>
    </AdminGuard>
  )
}

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
  Coins,
  Plus,
} from 'lucide-react'
import AdminGuard from '@/components/AdminGuard'
import { PhotoImportControls } from '@/components/reseller/PhotoImportControls'
import { CanvasAspectPicker } from '@/components/reseller/CanvasAspectPicker'
import {
  activateAdminEnhancedPrompt,
  adminSaveEnhancedPayment,
  adminSaveEnhancedPlans,
  adminSetEnhancedCredits,
  deleteAdminEnhancedPrompt,
  fetchAdminEnhancedPrompts,
  patchAdminEnhancedPrompt,
  testGenerateAdminEnhanced,
  type EnhancedCreditPlan,
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
  const [credits, setCredits] = useState(0)
  const [creditInput, setCreditInput] = useState('4')
  const [addCreditsInput, setAddCreditsInput] = useState('50')
  const [plans, setPlans] = useState<EnhancedCreditPlan[]>([])
  const [razorpayEnabled, setRazorpayEnabled] = useState(false)
  const [bankDetails, setBankDetails] = useState('')
  const [paymentQrUrl, setPaymentQrUrl] = useState<string | null>(null)
  const [qrFile, setQrFile] = useState<File | null>(null)
  const [prompts, setPrompts] = useState<EnhancedPicturePrompt[]>([])
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [name, setName] = useState('Idols test')
  const [promptText, setPromptText] = useState('')
  const [negativePrompt, setNegativePrompt] = useState('')
  const [aspectRatio, setAspectRatio] = useState('1:1')
  const [includeCanvasText, setIncludeCanvasText] = useState(false)
  const [canvasText, setCanvasText] = useState('')
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
      setCredits(data.user.credits ?? 0)
      setCreditInput(String(data.user.credits ?? 0))
      setRazorpayEnabled(!!data.user.razorpay_enabled)
      setBankDetails(data.user.bank_details || '')
      setPaymentQrUrl(data.user.payment_qr_url || null)
      setPlans(
        (data.plans || []).map((p) => ({
          id: p.id,
          name: p.name,
          credits: Number(p.credits),
          price_inr: Number(p.price_inr),
          sort_order: p.sort_order,
          is_active: p.is_active !== false,
        })),
      )
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
      setError(
        (e as { response?: { data?: { error?: string } }; message?: string })?.response?.data
          ?.error ||
          (e as { message?: string })?.message ||
          'Failed to load prompts',
      )
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
      setStatusMsg('Upload or take a sample idol photo first.')
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
        aspectRatio,
        canvasText: includeCanvasText ? canvasText.trim() : undefined,
      })
      setResultUrl(data.result_image_url)
      setSourcePreview(data.source_image_url)
      await load()
      setSelectedId(data.prompt.id)
      setStatusMsg('Test image ready. Activate this prompt when you are happy with it.')
    } catch (e: unknown) {
      setStatusMsg(
        (e as { response?: { data?: { error?: string } }; message?: string })?.response?.data
          ?.error ||
          (e as { message?: string })?.message ||
          'Generation failed',
      )
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
        (e as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Save failed',
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

  const saveCreditsSet = async () => {
    if (!userId) return
    setBusy(true)
    try {
      const next = await adminSetEnhancedCredits(userId, {
        credits: parseInt(creditInput, 10) || 0,
        note: 'Admin set balance',
      })
      setCredits(next)
      setStatusMsg(`Credits set to ${next}.`)
    } catch (e: unknown) {
      setStatusMsg(
        (e as { response?: { data?: { error?: string } } })?.response?.data?.error ||
          'Could not update credits',
      )
    } finally {
      setBusy(false)
    }
  }

  const saveCreditsAdd = async () => {
    if (!userId) return
    setBusy(true)
    try {
      const next = await adminSetEnhancedCredits(userId, {
        add: parseInt(addCreditsInput, 10) || 0,
        note: 'Admin top-up',
      })
      setCredits(next)
      setCreditInput(String(next))
      setStatusMsg(`Credits updated to ${next}.`)
    } catch (e: unknown) {
      setStatusMsg(
        (e as { response?: { data?: { error?: string } } })?.response?.data?.error ||
          'Could not add credits',
      )
    } finally {
      setBusy(false)
    }
  }

  const savePlans = async () => {
    if (!userId) return
    setBusy(true)
    try {
      const saved = await adminSaveEnhancedPlans(userId, plans)
      setPlans(saved)
      setStatusMsg('Credit plans saved.')
    } catch (e: unknown) {
      setStatusMsg(
        (e as { response?: { data?: { error?: string } } })?.response?.data?.error ||
          'Could not save plans',
      )
    } finally {
      setBusy(false)
    }
  }

  const savePayment = async () => {
    if (!userId) return
    setBusy(true)
    try {
      const data = await adminSaveEnhancedPayment(userId, {
        razorpayEnabled,
        bankDetails,
        qrFile,
      })
      setPaymentQrUrl(data.payment?.payment_qr_url || paymentQrUrl)
      setQrFile(null)
      setStatusMsg('Payment settings saved.')
      await load()
    } catch (e: unknown) {
      setStatusMsg(
        (e as { response?: { data?: { error?: string } } })?.response?.data?.error ||
          'Could not save payment settings',
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="kc-reseller-upload-panel min-h-screen bg-[var(--color-slate-950,#faf8f4)] pb-12 text-[var(--color-jewelry-black,#1a1814)]">
      <div className="mx-auto max-w-6xl px-4 py-6 md:py-8">
        <div className="mb-6 flex flex-wrap items-start gap-3">
          <Link
            href="/admin/b2b-clients"
            className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-[var(--color-slate-700,#e8e4df)] bg-white text-[var(--color-jewelry-black,#1a1814)]"
            aria-label="Back"
          >
            <ArrowLeft className="size-5" />
          </Link>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--kc-accent,#c41e3a)]">
              Enhanced pictures
            </p>
            <h1 className="mt-1 text-xl font-semibold text-[var(--color-jewelry-black,#1a1814)] md:text-2xl">
              Prompt lab · Idols / Frames
            </h1>
            <p className="mt-1 text-sm text-[var(--color-jewelry-black,#1a1814)]/65">
              {businessName || email || (userId ? `User #${userId}` : 'No reseller')}
              {enabled ? (
                <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-800">
                  <CheckCircle2 className="size-3" /> Subscription on
                </span>
              ) : (
                <span className="ml-2 text-[11px] font-medium text-amber-800">Subscription off</span>
              )}
              <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-[var(--color-slate-900,#f7f4ef)] px-2 py-0.5 text-[11px] font-bold">
                <Coins className="size-3 text-[var(--kc-accent,#c41e3a)]" />
                {credits} credits
              </span>
            </p>
          </div>
        </div>

        {loading ? (
          <p className="text-[var(--color-jewelry-black,#1a1814)]/60">Loading…</p>
        ) : error ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
            {error}
          </div>
        ) : (
          <div className="space-y-6">
            {/* Credits / plans / payment */}
            <section className="rounded-2xl border border-[var(--color-slate-700,#e8e4df)] bg-white p-4">
              <h2 className="text-sm font-semibold text-[var(--color-jewelry-black,#1a1814)]">
                Credits & top-up (admin)
              </h2>
              <p className="mt-1 text-xs text-[var(--color-jewelry-black,#1a1814)]/55">
                New accounts start with 4 free credits. 1 credit = 1 image. Only you can add credits.
              </p>
              <div className="mt-3 flex flex-wrap items-end gap-2">
                <label className="text-xs">
                  Set balance
                  <input
                    value={creditInput}
                    onChange={(e) => setCreditInput(e.target.value)}
                    className="mt-1 block w-28 rounded-lg border border-[var(--color-slate-700,#e8e4df)] px-2 py-2 text-sm"
                  />
                </label>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void saveCreditsSet()}
                  className="rounded-lg border border-[var(--color-slate-700,#e8e4df)] px-3 py-2 text-sm font-semibold"
                >
                  Set
                </button>
                <label className="text-xs">
                  Add credits
                  <input
                    value={addCreditsInput}
                    onChange={(e) => setAddCreditsInput(e.target.value)}
                    className="mt-1 block w-28 rounded-lg border border-[var(--color-slate-700,#e8e4df)] px-2 py-2 text-sm"
                  />
                </label>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void saveCreditsAdd()}
                  className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white"
                >
                  Add
                </button>
              </div>

              <div className="mt-4 space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-jewelry-black,#1a1814)]/50">
                    Credit plans
                  </p>
                  <button
                    type="button"
                    onClick={() =>
                      setPlans((p) => [
                        ...p,
                        { name: 'Custom', credits: 100, price_inr: 1499, is_active: true },
                      ])
                    }
                    className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--kc-accent,#c41e3a)]"
                  >
                    <Plus className="size-3.5" /> Add plan
                  </button>
                </div>
                {plans.map((p, idx) => (
                  <div key={idx} className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                    <input
                      value={p.name}
                      onChange={(e) =>
                        setPlans((all) =>
                          all.map((x, i) => (i === idx ? { ...x, name: e.target.value } : x)),
                        )
                      }
                      placeholder="Name"
                      className="rounded-lg border border-[var(--color-slate-700,#e8e4df)] px-2 py-2 text-sm"
                    />
                    <input
                      type="number"
                      value={p.credits}
                      onChange={(e) =>
                        setPlans((all) =>
                          all.map((x, i) =>
                            i === idx ? { ...x, credits: parseInt(e.target.value, 10) || 0 } : x,
                          ),
                        )
                      }
                      placeholder="Credits"
                      className="rounded-lg border border-[var(--color-slate-700,#e8e4df)] px-2 py-2 text-sm"
                    />
                    <input
                      type="number"
                      value={p.price_inr}
                      onChange={(e) =>
                        setPlans((all) =>
                          all.map((x, i) =>
                            i === idx ? { ...x, price_inr: parseFloat(e.target.value) || 0 } : x,
                          ),
                        )
                      }
                      placeholder="₹"
                      className="rounded-lg border border-[var(--color-slate-700,#e8e4df)] px-2 py-2 text-sm"
                    />
                    <button
                      type="button"
                      onClick={() => setPlans((all) => all.filter((_, i) => i !== idx))}
                      className="rounded-lg border border-rose-200 px-2 py-2 text-xs font-semibold text-rose-700 sm:col-auto"
                    >
                      Remove
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void savePlans()}
                  className="rounded-lg border border-[var(--color-slate-700,#e8e4df)] px-3 py-2 text-sm font-semibold"
                >
                  Save plans
                </button>
              </div>

              <div className="mt-4 space-y-2 border-t border-[var(--color-slate-700,#e8e4df)] pt-4">
                <label className="flex items-center justify-between gap-3">
                  <span className="text-sm font-semibold">Allow Razorpay payments</span>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={razorpayEnabled}
                    onClick={() => setRazorpayEnabled((v) => !v)}
                    className={`relative h-7 w-12 rounded-full ${
                      razorpayEnabled ? 'bg-violet-500' : 'bg-slate-300'
                    }`}
                  >
                    <span
                      className={`absolute top-0.5 size-6 rounded-full bg-white shadow transition ${
                        razorpayEnabled ? 'left-5' : 'left-0.5'
                      }`}
                    />
                  </button>
                </label>
                <label className="block text-xs">
                  Bank / UPI details shown to staff
                  <textarea
                    value={bankDetails}
                    onChange={(e) => setBankDetails(e.target.value)}
                    rows={3}
                    className="mt-1 w-full rounded-lg border border-[var(--color-slate-700,#e8e4df)] px-2 py-2 text-sm"
                    placeholder="Account name, number, IFSC, UPI ID…"
                  />
                </label>
                <label className="block text-xs">
                  Payment QR image
                  <input
                    type="file"
                    accept="image/*"
                    className="mt-1 block w-full text-xs"
                    onChange={(e) => setQrFile(e.target.files?.[0] || null)}
                  />
                </label>
                {paymentQrUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={paymentQrUrl} alt="QR" className="mt-2 max-h-32 rounded-lg border" />
                ) : null}
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void savePayment()}
                  className="rounded-lg bg-[var(--kc-accent,#c41e3a)] px-3 py-2 text-sm font-semibold text-white"
                >
                  Save payment settings
                </button>
              </div>
            </section>

            <div className="grid gap-5 lg:grid-cols-[240px_minmax(0,1fr)]">
              <aside className="space-y-2">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--color-jewelry-black,#1a1814)]/50">
                  Saved prompts
                </p>
                {prompts.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setSelectedId(p.id)}
                    className={`w-full rounded-xl border px-3 py-2.5 text-left ${
                      selectedId === p.id
                        ? 'border-[var(--kc-accent,#c41e3a)] bg-[var(--kc-accent,#c41e3a)]/8'
                        : 'border-[var(--color-slate-700,#e8e4df)] bg-white'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-sm font-medium">{p.name}</span>
                      {p.is_active ? (
                        <span className="rounded-full bg-emerald-600 px-1.5 py-0.5 text-[10px] font-bold text-white">
                          ACTIVE
                        </span>
                      ) : null}
                    </div>
                  </button>
                ))}
              </aside>

              <div className="space-y-4">
                <CanvasAspectPicker value={aspectRatio} onChange={setAspectRatio} label="Canvas aspect" />

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="rounded-2xl border border-[var(--color-slate-700,#e8e4df)] bg-white p-4">
                    <p className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-[var(--color-jewelry-black,#1a1814)]/50">
                      Sample photo
                    </p>
                    <PhotoImportControls
                      previewUrl={sourcePreview}
                      onPick={onPickFile}
                      emptyLabel="Take or upload an idol photo"
                    />
                  </div>
                  <div className="rounded-2xl border border-[var(--color-slate-700,#e8e4df)] bg-white p-4">
                    <span className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-[var(--color-jewelry-black,#1a1814)]/50">
                      <Sparkles className="size-3.5" /> Studio result
                    </span>
                    {resultUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={resultUrl}
                        alt="Generated"
                        className="aspect-square w-full rounded-xl object-contain"
                      />
                    ) : (
                      <div className="flex aspect-square items-center justify-center rounded-xl bg-[var(--color-slate-900,#f7f4ef)] text-sm text-[var(--color-jewelry-black,#1a1814)]/50">
                        Run a test to preview
                      </div>
                    )}
                  </div>
                </div>

                <div className="rounded-2xl border border-[var(--color-slate-700,#e8e4df)] bg-white p-4">
                  <label className="flex cursor-pointer items-start gap-3">
                    <input
                      type="checkbox"
                      checked={includeCanvasText}
                      onChange={(e) => setIncludeCanvasText(e.target.checked)}
                      className="mt-1 size-4"
                    />
                    <span>
                      <span className="block text-sm font-semibold">
                        Add text bottom of the visual canvas
                      </span>
                      <span className="text-xs text-[var(--color-jewelry-black,#1a1814)]/55">
                        Optional — preview how barcode / label text looks
                      </span>
                    </span>
                  </label>
                  {includeCanvasText ? (
                    <input
                      value={canvasText}
                      onChange={(e) => setCanvasText(e.target.value)}
                      placeholder="e.g. GANESH-SFIDOL001"
                      className="mt-3 w-full rounded-xl border border-[var(--color-slate-700,#e8e4df)] px-3 py-2.5 text-sm"
                    />
                  ) : null}
                </div>

                <label className="block">
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-[var(--color-jewelry-black,#1a1814)]/50">
                    Prompt name
                  </span>
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="mt-1.5 w-full rounded-xl border border-[var(--color-slate-700,#e8e4df)] bg-white px-3 py-2.5 text-sm"
                  />
                </label>
                <label className="block">
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-[var(--color-jewelry-black,#1a1814)]/50">
                    Master prompt
                  </span>
                  <textarea
                    value={promptText}
                    onChange={(e) => setPromptText(e.target.value)}
                    rows={12}
                    className="mt-1.5 w-full rounded-xl border border-[var(--color-slate-700,#e8e4df)] bg-white px-3 py-2.5 font-mono text-[12px]"
                  />
                </label>
                <label className="block">
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-[var(--color-jewelry-black,#1a1814)]/50">
                    Negative prompt
                  </span>
                  <textarea
                    value={negativePrompt}
                    onChange={(e) => setNegativePrompt(e.target.value)}
                    rows={5}
                    className="mt-1.5 w-full rounded-xl border border-[var(--color-slate-700,#e8e4df)] bg-white px-3 py-2.5 font-mono text-[12px]"
                  />
                </label>

                {statusMsg ? (
                  <p className="rounded-xl border border-[var(--color-slate-700,#e8e4df)] bg-[var(--color-slate-900,#f7f4ef)] px-3 py-2 text-sm">
                    {statusMsg}
                  </p>
                ) : null}

                <div className="flex flex-wrap gap-2 pb-8">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void runTest(false)}
                    className="kc-btn-theme inline-flex min-h-[44px] items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold disabled:opacity-50"
                  >
                    {busy ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
                    Test this prompt
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void runTest(true)}
                    className="inline-flex min-h-[44px] items-center rounded-xl border border-[var(--color-slate-700,#e8e4df)] bg-white px-4 py-2.5 text-sm font-semibold"
                  >
                    Test &amp; save as new
                  </button>
                  <button
                    type="button"
                    disabled={busy || !selectedId}
                    onClick={() => void saveEdits()}
                    className="inline-flex min-h-[44px] items-center rounded-xl border border-[var(--color-slate-700,#e8e4df)] bg-white px-4 py-2.5 text-sm font-semibold"
                  >
                    Save edits
                  </button>
                  <button
                    type="button"
                    disabled={busy || !selectedId || selected?.is_active}
                    onClick={() => void activate()}
                    className="inline-flex min-h-[44px] items-center rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
                  >
                    Activate for reseller
                  </button>
                  {selected && !selected.is_active ? (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void remove(selected.id)}
                      className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-rose-300 bg-rose-50 px-4 py-2.5 text-sm font-semibold text-rose-800"
                    >
                      <Trash2 className="size-4" />
                      Delete test
                    </button>
                  ) : null}
                </div>
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
          <div className="flex min-h-screen items-center justify-center bg-[var(--color-slate-950,#faf8f4)] text-[var(--color-jewelry-black,#1a1814)]/60">
            Loading…
          </div>
        }
      >
        <AdminEnhancedPicturesInner />
      </Suspense>
    </AdminGuard>
  )
}

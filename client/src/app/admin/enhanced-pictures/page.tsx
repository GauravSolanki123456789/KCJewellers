'use client'

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import {
  ArrowLeft,
  CheckCircle2,
  Loader2,
  Coins,
  Plus,
} from 'lucide-react'
import AdminGuard from '@/components/AdminGuard'
import SaveFeedbackButton from '@/components/ui/SaveFeedbackButton'
import { useSaveFeedback } from '@/hooks/useSaveFeedback'
import PromptLabWorkspace from '@/components/admin/PromptLabWorkspace'
import { defaultBackgroundForTemplate } from '@/lib/enhanced-studio-defaults'
import {
  adminSaveEnhancedPayment,
  adminSaveEnhancedPlans,
  adminSetEnhancedCredits,
  fetchAdminEnhancedPrompts,
  patchAdminEnhancedAiSettings,
  DEFAULT_OVERLAY_SETTINGS,
  type EnhancedAiSettings,
  type EnhancedCreditPlan,
  type EnhancedOverlaySettings,
  type EnhancedPicturePrompt,
  type EnhancedPictureTemplate,
  type EnhancedTemplateShowcase as EnhancedTemplateShowcaseData,
} from '@/lib/reseller-enhanced-pictures'
import type { StudioGenerationOptions } from '@/components/reseller/EnhancedStudioOptions'
import { splitMasterAndNegative } from '@/lib/prompt-formatting'

type LoadPreserveOpts = {
  templateKey?: string
  selectedId?: number | null
  varietyKey?: string | null
  /** Refresh data without blanking the whole page (save / test / activate). */
  silent?: boolean
  /** Keep local Style · background / visualization picks after silent reload. */
  keepStudioPrefs?: boolean
}

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
  const [templates, setTemplates] = useState<EnhancedPictureTemplate[]>([])
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
  const [aiProvider, setAiProvider] = useState<'gemini' | 'replicate'>('gemini')
  const [geminiModel, setGeminiModel] = useState('gemini-2.5-flash-image')
  const [geminiBatchEnabled, setGeminiBatchEnabled] = useState(false)
  const [studioPipelineEnabled, setStudioPipelineEnabled] = useState(true)
  const [replicateModel, setReplicateModel] = useState('black-forest-labs/flux-kontext-pro')
  const [geminiApiKeyInput, setGeminiApiKeyInput] = useState('')
  const [replicateTokenInput, setReplicateTokenInput] = useState('')
  const [aiSettingsMeta, setAiSettingsMeta] = useState<EnhancedAiSettings | null>(null)
  const [lastTestAi, setLastTestAi] = useState<{ provider?: string; model?: string } | null>(null)
  const [templateKey, setTemplateKey] = useState('idols')
  const [templateLabel, setTemplateLabel] = useState('Idols / Frames')
  const [selectedVarietyKey, setSelectedVarietyKey] = useState<string | null>(null)
  const [workflowHighlightsText, setWorkflowHighlightsText] = useState('')
  const [systemResolutions, setSystemResolutions] = useState('2K, 4K High Definition')
  const [systemRatios, setSystemRatios] = useState('1:1')
  const [sampleLabel, setSampleLabel] = useState('Sample cinematic design')
  const [outputLabel, setOutputLabel] = useState('Professional output')
  const [outputSubtitle, setOutputSubtitle] = useState('4K hyper-realistic studio rendering')
  const [footerNote, setFooterNote] = useState('Preserves source details perfectly')
  const [overlaySettings, setOverlaySettings] = useState<EnhancedOverlaySettings>(DEFAULT_OVERLAY_SETTINGS)
  const [generationOptions, setGenerationOptions] = useState<StudioGenerationOptions>({
    backgroundPreset: 'charcoal',
    visualization: 'studio',
    renderQuality: '2k',
    applyWatermark: false,
    applyInfoText: false,
  })

  const stickyTemplateKeyRef = useRef<string | null>(null)
  const stickySelectedIdRef = useRef<number | null>(null)
  const stickyVarietyKeyRef = useRef<string | null>(null)

  const plansSave = useSaveFeedback()
  const paymentSave = useSaveFeedback()
  const aiSave = useSaveFeedback()

  const applyShowcaseToForm = useCallback((s: EnhancedTemplateShowcaseData) => {
    setWorkflowHighlightsText((s.workflow_highlights || []).join('\n'))
    setSystemResolutions(s.system_resolutions || '2K, 4K High Definition')
    setSystemRatios(s.system_ratios || '1:1')
    setSampleLabel(s.sample_label || 'Sample cinematic design')
    setOutputLabel(s.output_label || 'Professional output')
    setOutputSubtitle(s.output_subtitle || '4K hyper-realistic studio rendering')
    setFooterNote(s.footer_note || 'Preserves source details perfectly')
  }, [])

  const applyPromptToForm = useCallback((p: EnhancedPicturePrompt) => {
    const split = splitMasterAndNegative(p.prompt_text, p.negative_prompt || '')
    setName(p.name)
    setPromptText(split.promptText)
    setNegativePrompt(split.negativePrompt)
    if (p.test_result_image_url) setResultUrl(p.test_result_image_url)
    if (p.test_source_image_url) setSourcePreview(p.test_source_image_url)
  }, [])

  const applyTemplateShowcase = useCallback(
    (key: string, list: EnhancedPictureTemplate[]) => {
      const tpl = list.find((t) => t.key === key)
      if (tpl?.showcase) applyShowcaseToForm(tpl.showcase)
    },
    [applyShowcaseToForm],
  )

  const selectPrompt = useCallback(
    (p: EnhancedPicturePrompt) => {
      stickySelectedIdRef.current = p.id
      setSelectedId(p.id)
      applyPromptToForm(p)
    },
    [applyPromptToForm],
  )

  const selectTemplate = useCallback(
    (key: string, list?: EnhancedPictureTemplate[], promptList?: EnhancedPicturePrompt[]) => {
      const tpls = list ?? templates
      const prmpts = promptList ?? prompts
      stickyTemplateKeyRef.current = key
      setTemplateKey(key)
      const tpl = tpls.find((t) => t.key === key)
      if (tpl?.label) setTemplateLabel(tpl.label)
      if (tpl) {
        setGenerationOptions((g) => ({
          ...g,
          backgroundPreset: defaultBackgroundForTemplate(tpl.key, tpl.label),
        }))
      }
      setSelectedVarietyKey(null)
      applyTemplateShowcase(key, tpls)
      const first = prmpts.find((p) => p.template_key === key)
      if (first) {
        selectPrompt(first)
      } else {
        stickySelectedIdRef.current = null
        setSelectedId(null)
        setName('')
        setPromptText('')
        setNegativePrompt('')
        setResultUrl(null)
      }
    },
    [templates, prompts, applyTemplateShowcase, selectPrompt],
  )

  const activeTemplate = useMemo(
    () => templates.find((t) => t.key === templateKey) || templates[0] || null,
    [templates, templateKey],
  )

  const load = useCallback(
    async (preserve?: LoadPreserveOpts) => {
      if (!userId) {
        setError('Open this page from B2B clients → Edit reseller → Manage prompts.')
        setLoading(false)
        return
      }
      if (!preserve?.silent) setLoading(true)
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
        const nextTemplates = data.templates || []
        setTemplates(nextTemplates)
        if (data.ai_settings) {
          setAiSettingsMeta(data.ai_settings)
          setAiProvider(data.ai_settings.provider)
          setGeminiModel(data.ai_settings.gemini_model)
          setReplicateModel(data.ai_settings.replicate_model)
          setGeminiBatchEnabled(data.ai_settings.gemini_batch_enabled === true)
          setStudioPipelineEnabled(data.ai_settings.studio_pipeline_enabled !== false)
        }
        if (data.overlay_settings) {
          const os = { ...DEFAULT_OVERLAY_SETTINGS, ...data.overlay_settings }
          setOverlaySettings(os)
          if (!preserve?.keepStudioPrefs) {
            const sp = os.studio_prefs
            setGenerationOptions((g) => ({
              ...g,
              backgroundPreset: sp?.backgroundPreset || g.backgroundPreset,
              visualization: sp?.visualization || g.visualization,
              renderQuality: sp?.renderQuality || g.renderQuality,
              applyWatermark: sp?.apply_watermark ?? os.watermark_enabled ?? g.applyWatermark,
              applyInfoText: sp?.apply_info_text ?? os.info_text_enabled ?? g.applyInfoText,
            }))
          }
        }

        const defaultKey =
          nextTemplates.find((t) => t.key === 'idols')?.key ?? nextTemplates[0]?.key ?? 'idols'
        const preserveKey =
          preserve?.templateKey ?? stickyTemplateKeyRef.current ?? defaultKey
        const tpl =
          nextTemplates.find((t) => t.key === preserveKey) ?? nextTemplates[0] ?? null
        const resolvedKey = tpl?.key ?? preserveKey

        stickyTemplateKeyRef.current = resolvedKey
        setTemplateKey(resolvedKey)
        if (tpl?.label) setTemplateLabel(tpl.label)
        if (tpl?.showcase) applyShowcaseToForm(tpl.showcase)

        const preserveSelectedId =
          preserve?.selectedId !== undefined
            ? preserve.selectedId
            : stickySelectedIdRef.current

        let prompt: EnhancedPicturePrompt | null = null
        if (preserveSelectedId != null) {
          prompt =
            data.prompts.find(
              (p) => p.id === preserveSelectedId && p.template_key === resolvedKey,
            ) ?? null
        }
        if (!prompt) {
          prompt =
            data.prompts.find((p) => p.is_active && p.template_key === resolvedKey) ??
            data.prompts.find((p) => p.template_key === resolvedKey) ??
            null
        }

        if (prompt) {
          stickySelectedIdRef.current = prompt.id
          setSelectedId(prompt.id)
          applyPromptToForm(prompt)
          const nextVarietyKey =
            preserve?.varietyKey !== undefined
              ? preserve.varietyKey
              : prompt.variety_key || stickyVarietyKeyRef.current
          stickyVarietyKeyRef.current = nextVarietyKey
          setSelectedVarietyKey(nextVarietyKey)
        } else {
          stickySelectedIdRef.current = null
          stickyVarietyKeyRef.current = null
          setSelectedId(null)
          setSelectedVarietyKey(null)
        }
      } catch (e: unknown) {
        setError(
          (e as { response?: { data?: { error?: string } }; message?: string })?.response?.data
            ?.error ||
            (e as { message?: string })?.message ||
            'Failed to load prompts',
        )
      } finally {
        if (!preserve?.silent) setLoading(false)
      }
    },
    [userId, applyShowcaseToForm, applyPromptToForm],
  )

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (!statusMsg) return
    const t = window.setTimeout(() => setStatusMsg(''), 12000)
    return () => window.clearTimeout(t)
  }, [statusMsg])

  const onPickFile = (file: File | null) => {
    setSourceFile(file)
    if (sourcePreview && sourcePreview.startsWith('blob:')) URL.revokeObjectURL(sourcePreview)
    setSourcePreview(file ? URL.createObjectURL(file) : null)
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

  const savePlans = () =>
    plansSave.runSave(async () => {
      if (!userId) return
      try {
        const saved = await adminSaveEnhancedPlans(userId, plans)
        setPlans(saved)
        setStatusMsg('Credit plans saved.')
      } catch (e: unknown) {
        setStatusMsg(
          (e as { response?: { data?: { error?: string } } })?.response?.data?.error ||
            'Could not save plans',
        )
        throw e
      }
    })

  const savePayment = () =>
    paymentSave.runSave(async () => {
      if (!userId) return
      try {
        const data = await adminSaveEnhancedPayment(userId, {
          razorpayEnabled,
          bankDetails,
          qrFile,
        })
        setPaymentQrUrl(data.payment?.payment_qr_url || paymentQrUrl)
        setQrFile(null)
        setStatusMsg('Payment settings saved.')
        await load({ templateKey, selectedId, silent: true })
      } catch (e: unknown) {
        setStatusMsg(
          (e as { response?: { data?: { error?: string } } })?.response?.data?.error ||
            'Could not save payment settings',
        )
        throw e
      }
    })

  const saveAiSettings = () =>
    aiSave.runSave(async () => {
      if (!userId) return
      setStatusMsg('Saving AI model settings…')
      try {
        const saved = await patchAdminEnhancedAiSettings(userId, {
          provider: aiProvider,
          gemini_model: geminiModel.trim(),
          replicate_model: replicateModel.trim(),
          gemini_api_key: geminiApiKeyInput.trim() || undefined,
          replicate_api_token: replicateTokenInput.trim() || undefined,
          gemini_batch_enabled: geminiBatchEnabled,
          studio_pipeline_enabled: studioPipelineEnabled,
        })
        setAiSettingsMeta(saved)
        setGeminiApiKeyInput('')
        setReplicateTokenInput('')
        setStatusMsg(
          `AI settings saved — ${saved.provider === 'replicate' ? 'Replicate' : 'Gemini'} · ${saved.provider === 'replicate' ? saved.replicate_model : saved.gemini_model}`,
        )
      } catch (e: unknown) {
        setStatusMsg(
          (e as { response?: { data?: { error?: string } } })?.response?.data?.error ||
            'Could not save AI settings',
        )
        throw e
      }
    })

  const clearSavedGeminiKey = async () => {
    if (!userId || !confirm('Remove saved Gemini API key for this reseller?')) return
    setBusy(true)
    try {
      const saved = await patchAdminEnhancedAiSettings(userId, { clear_gemini_api_key: true })
      setAiSettingsMeta(saved)
      setGeminiApiKeyInput('')
      setStatusMsg('Saved Gemini key cleared. Server .env key will be used if set.')
    } catch (e: unknown) {
      setStatusMsg(
        (e as { response?: { data?: { error?: string } } })?.response?.data?.error ||
          'Could not clear Gemini key',
      )
    } finally {
      setBusy(false)
    }
  }

  const clearSavedReplicateToken = async () => {
    if (!userId || !confirm('Remove saved Replicate token for this reseller?')) return
    setBusy(true)
    try {
      const saved = await patchAdminEnhancedAiSettings(userId, { clear_replicate_api_token: true })
      setAiSettingsMeta(saved)
      setReplicateTokenInput('')
      setStatusMsg('Saved Replicate token cleared. Server .env token will be used if set.')
    } catch (e: unknown) {
      setStatusMsg(
        (e as { response?: { data?: { error?: string } } })?.response?.data?.error ||
          'Could not clear Replicate token',
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
              Prompt lab · {activeTemplate?.label || 'Idols / Frames'}
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
                <SaveFeedbackButton
                  type="button"
                  disabled={busy}
                  saving={plansSave.saving}
                  saved={plansSave.saved}
                  onClick={() => void savePlans()}
                  className="rounded-lg border border-[var(--color-slate-700,#e8e4df)] px-3 py-2 text-sm font-semibold"
                >
                  Save plans
                </SaveFeedbackButton>
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
                <SaveFeedbackButton
                  type="button"
                  disabled={busy}
                  saving={paymentSave.saving}
                  saved={paymentSave.saved}
                  onClick={() => void savePayment()}
                  className="rounded-lg bg-[var(--kc-accent,#c41e3a)] px-3 py-2 text-sm font-semibold text-white"
                >
                  Save payment settings
                </SaveFeedbackButton>
              </div>
            </section>

            <section className="rounded-2xl border border-[var(--color-slate-700,#e8e4df)] bg-white p-4 sm:p-5">
              <h2 className="text-sm font-semibold text-[var(--color-jewelry-black,#1a1814)]">
                AI model settings
              </h2>
              <p className="mt-1 text-xs leading-relaxed text-[var(--color-jewelry-black,#1a1814)]/55">
                Choose Gemini or Replicate for this reseller&apos;s studio. Test below, then save when
                happy. Reseller staff use the saved provider automatically.
              </p>

              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <label className="block text-xs font-semibold uppercase tracking-wide text-[var(--color-jewelry-black,#1a1814)]/50">
                  Provider
                  <select
                    value={aiProvider}
                    onChange={(e) => setAiProvider(e.target.value as 'gemini' | 'replicate')}
                    className="mt-1.5 w-full rounded-xl border border-[var(--color-slate-700,#e8e4df)] bg-white px-3 py-2.5 text-sm font-medium text-[var(--color-jewelry-black,#1a1814)]"
                  >
                    <option value="gemini">Google Gemini (image)</option>
                    <option value="replicate">Replicate</option>
                  </select>
                </label>

                {aiProvider === 'gemini' ? (
                  <label className="block text-xs font-semibold uppercase tracking-wide text-[var(--color-jewelry-black,#1a1814)]/50">
                    Gemini model
                    <input
                      list="gemini-models"
                      value={geminiModel}
                      onChange={(e) => setGeminiModel(e.target.value)}
                      className="mt-1.5 w-full rounded-xl border border-[var(--color-slate-700,#e8e4df)] bg-white px-3 py-2.5 font-mono text-sm"
                      placeholder="gemini-3.1-flash-lite-image"
                    />
                    <datalist id="gemini-models">
                      {(aiSettingsMeta?.gemini_model_presets || []).map((m) => (
                        <option key={m} value={m} />
                      ))}
                    </datalist>
                  </label>
                ) : (
                  <label className="block text-xs font-semibold uppercase tracking-wide text-[var(--color-jewelry-black,#1a1814)]/50">
                    Replicate model
                    <input
                      list="replicate-models"
                      value={replicateModel}
                      onChange={(e) => setReplicateModel(e.target.value)}
                      className="mt-1.5 w-full rounded-xl border border-[var(--color-slate-700,#e8e4df)] bg-white px-3 py-2.5 font-mono text-sm"
                      placeholder="black-forest-labs/flux-kontext-pro"
                    />
                    <datalist id="replicate-models">
                      {(aiSettingsMeta?.replicate_model_presets || []).map((m) => (
                        <option key={m} value={m} />
                      ))}
                    </datalist>
                  </label>
                )}
              </div>

              {aiProvider === 'gemini' ? (
                <label className="mt-4 block text-xs font-semibold uppercase tracking-wide text-[var(--color-jewelry-black,#1a1814)]/50">
                  Gemini API key (optional)
                  <input
                    type="password"
                    value={geminiApiKeyInput}
                    onChange={(e) => setGeminiApiKeyInput(e.target.value)}
                    autoComplete="off"
                    placeholder={
                      aiSettingsMeta?.gemini_api_key_masked
                        ? `Saved ${aiSettingsMeta.gemini_api_key_masked} — paste to replace`
                        : aiSettingsMeta?.server_gemini_configured
                          ? 'Using server .env GEMINI_API_KEY'
                          : 'Paste AIza… key'
                    }
                    className="mt-1.5 w-full rounded-xl border border-[var(--color-slate-700,#e8e4df)] bg-white px-3 py-2.5 font-mono text-sm"
                  />
                  {aiSettingsMeta?.gemini_api_key_masked ? (
                    <button
                      type="button"
                      onClick={() => void clearSavedGeminiKey()}
                      className="mt-2 text-xs font-semibold text-rose-700 underline-offset-2 hover:underline"
                    >
                      Clear saved Gemini key
                    </button>
                  ) : null}
                </label>
              ) : null}

              {aiProvider === 'gemini' ? (
                <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-xl border border-emerald-200/80 bg-emerald-50/60 px-4 py-3">
                  <input
                    type="checkbox"
                    checked={geminiBatchEnabled}
                    onChange={(e) => setGeminiBatchEnabled(e.target.checked)}
                    className="mt-1 size-4 rounded border-[var(--color-slate-700,#e8e4df)]"
                  />
                  <span>
                    <span className="block text-sm font-semibold text-[var(--color-jewelry-black,#1a1814)]">
                      Allow economy batch queue (optional)
                    </span>
                    <span className="mt-0.5 block text-xs leading-relaxed text-[var(--color-jewelry-black,#1a1814)]/60">
                      Off by default — staff use Fast mode (~30–90s). When on, staff can opt into
                      slower batch (~50% lower AI cost).
                    </span>
                  </span>
                </label>
              ) : null}

              <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-xl border border-emerald-200/80 bg-emerald-50/60 px-4 py-3">
                <input
                  type="checkbox"
                  checked={studioPipelineEnabled}
                  onChange={(e) => setStudioPipelineEnabled(e.target.checked)}
                  className="mt-1 size-4 rounded border-[var(--color-slate-700,#e8e4df)]"
                />
                <span>
                  <span className="block text-sm font-semibold text-[var(--color-jewelry-black,#1a1814)]">
                    4-step studio pipeline (recommended)
                  </span>
                  <span className="mt-0.5 block text-xs leading-relaxed text-[var(--color-jewelry-black,#1a1814)]/60">
                    Cutout → spatial lock → composite/relight → AI upscale. Needs a Replicate token
                    for rembg + upscale (Gemini/Replicate still used for the main generate step).
                  </span>
                </span>
              </label>

              {aiProvider === 'replicate' ? (
                <label className="mt-4 block text-xs font-semibold uppercase tracking-wide text-[var(--color-jewelry-black,#1a1814)]/50">
                  Replicate API token (optional)
                  <input
                    type="password"
                    value={replicateTokenInput}
                    onChange={(e) => setReplicateTokenInput(e.target.value)}
                    autoComplete="off"
                    placeholder={
                      aiSettingsMeta?.replicate_api_token_masked
                        ? `Saved ${aiSettingsMeta.replicate_api_token_masked} — paste to replace`
                        : aiSettingsMeta?.server_replicate_configured
                          ? 'Using server .env REPLICATE_API_TOKEN'
                          : 'Paste r8_… token from replicate.com/account/api-tokens'
                    }
                    className="mt-1.5 w-full rounded-xl border border-[var(--color-slate-700,#e8e4df)] bg-white px-3 py-2.5 font-mono text-sm"
                  />
                  {aiSettingsMeta?.replicate_api_token_masked ? (
                    <button
                      type="button"
                      onClick={() => void clearSavedReplicateToken()}
                      className="mt-2 text-xs font-semibold text-rose-700 underline-offset-2 hover:underline"
                    >
                      Clear saved Replicate token
                    </button>
                  ) : null}
                  <p className="mt-2 text-[11px] leading-relaxed text-[var(--color-jewelry-black,#1a1814)]/55">
                    Recommended: <span className="font-mono">black-forest-labs/flux-kontext-pro</span>{' '}
                    for idol photos with your sample image + prompt. Create a token at{' '}
                    <a
                      href="https://replicate.com/account/api-tokens"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-semibold text-[var(--kc-accent,#c41e3a)] underline-offset-2 hover:underline"
                    >
                      replicate.com/account/api-tokens
                    </a>
                    .
                  </p>
                </label>
              ) : null}

              <div className="mt-4 flex flex-wrap items-center gap-2">
                <SaveFeedbackButton
                  type="button"
                  disabled={busy}
                  saving={aiSave.saving}
                  saved={aiSave.saved}
                  onClick={() => void saveAiSettings()}
                  className="rounded-xl bg-[var(--kc-accent,#c41e3a)] px-4 py-2.5 text-sm font-semibold text-white"
                >
                  Save AI settings
                </SaveFeedbackButton>
                {lastTestAi?.provider ? (
                  <span className="rounded-full bg-emerald-50 px-3 py-1 text-[11px] font-medium text-emerald-900 ring-1 ring-emerald-200">
                    Last test: {lastTestAi.provider} · {lastTestAi.model}
                  </span>
                ) : null}
              </div>
            </section>

            {userId ? (
              <PromptLabWorkspace
                userId={userId}
                templates={templates}
                prompts={prompts}
                templateKey={templateKey}
                templateLabel={templateLabel}
                selectedVarietyKey={selectedVarietyKey}
                selectedId={selectedId}
                name={name}
                promptText={promptText}
                negativePrompt={negativePrompt}
                workflowHighlightsText={workflowHighlightsText}
                systemResolutions={systemResolutions}
                systemRatios={systemRatios}
                sampleLabel={sampleLabel}
                outputLabel={outputLabel}
                outputSubtitle={outputSubtitle}
                footerNote={footerNote}
                aspectRatio={aspectRatio}
                includeCanvasText={includeCanvasText}
                canvasText={canvasText}
                sourcePreview={sourcePreview}
                sourceFile={sourceFile}
                resultUrl={resultUrl}
                aiProvider={aiProvider}
                geminiModel={geminiModel}
                geminiApiKeyInput={geminiApiKeyInput}
                replicateModel={replicateModel}
                replicateTokenInput={replicateTokenInput}
                onTemplateKey={setTemplateKey}
                onTemplateLabel={setTemplateLabel}
                onSelectedVarietyKey={setSelectedVarietyKey}
                onSelectedId={setSelectedId}
                onName={setName}
                onPromptText={setPromptText}
                onNegativePrompt={setNegativePrompt}
                onWorkflowHighlightsText={setWorkflowHighlightsText}
                onSystemResolutions={setSystemResolutions}
                onSystemRatios={setSystemRatios}
                onSampleLabel={setSampleLabel}
                onOutputLabel={setOutputLabel}
                onOutputSubtitle={setOutputSubtitle}
                onFooterNote={setFooterNote}
                onAspectRatio={setAspectRatio}
                onIncludeCanvasText={setIncludeCanvasText}
                onCanvasText={setCanvasText}
                onPickFile={onPickFile}
                onResultUrl={setResultUrl}
                onSourcePreview={setSourcePreview}
                onReload={load}
                onStatus={setStatusMsg}
                onLastTestAi={setLastTestAi}
                statusMessage={statusMsg}
                overlaySettings={overlaySettings}
                onOverlaySettingsChange={setOverlaySettings}
                generationOptions={generationOptions}
                onGenerationOptionsChange={setGenerationOptions}
              />
            ) : null}
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

'use client'

import { useMemo, useState } from 'react'
import {
  Eye,
  EyeOff,
  Loader2,
  Plus,
  Sparkles,
  Trash2,
} from 'lucide-react'
import SaveFeedbackButton from '@/components/ui/SaveFeedbackButton'
import { useSaveFeedback } from '@/hooks/useSaveFeedback'
import { PhotoImportControls } from '@/components/reseller/PhotoImportControls'
import { CanvasAspectPicker } from '@/components/reseller/CanvasAspectPicker'
import EnhancedTemplateShowcase from '@/components/reseller/EnhancedTemplateShowcase'
import {
  activateAdminEnhancedPrompt,
  createAdminEnhancedTemplate,
  createAdminEnhancedVariety,
  deleteAdminEnhancedPrompt,
  deleteAdminEnhancedTemplate,
  deleteAdminEnhancedVariety,
  patchAdminEnhancedVariety,
  patchAdminEnhancedTemplateShowcase,
  saveAdminEnhancedPromptLab,
  testGenerateAdminEnhanced,
  type EnhancedPicturePrompt,
  type EnhancedPictureTemplate,
  type EnhancedPictureVariety,
  type EnhancedTemplateShowcase as ShowcaseData,
} from '@/lib/reseller-enhanced-pictures'
import {
  parseWorkflowHighlightsText,
  removeEmptyPromptLines,
  splitMasterAndNegative,
} from '@/lib/prompt-formatting'

const PROMPT_CLASS =
  'mt-1.5 w-full resize-y rounded-xl border border-[var(--color-slate-700,#e8e4df)] bg-white px-3 py-2.5 font-mono text-[12px] leading-relaxed whitespace-pre-wrap text-[var(--color-jewelry-black,#1a1814)]'

type Props = {
  userId: number
  templates: EnhancedPictureTemplate[]
  prompts: EnhancedPicturePrompt[]
  templateKey: string
  selectedVarietyKey: string | null
  selectedId: number | null
  name: string
  promptText: string
  negativePrompt: string
  workflowHighlightsText: string
  systemResolutions: string
  systemRatios: string
  sampleLabel: string
  outputLabel: string
  outputSubtitle: string
  footerNote: string
  aspectRatio: string
  includeCanvasText: boolean
  canvasText: string
  sourcePreview: string | null
  sourceFile: File | null
  resultUrl: string | null
  aiProvider: 'gemini' | 'replicate'
  geminiModel: string
  geminiApiKeyInput: string
  replicateModel: string
  replicateTokenInput: string
  onTemplateKey: (key: string) => void
  onSelectedVarietyKey: (key: string | null) => void
  onSelectedId: (id: number | null) => void
  onName: (v: string) => void
  onPromptText: (v: string) => void
  onNegativePrompt: (v: string) => void
  onWorkflowHighlightsText: (v: string) => void
  onSystemResolutions: (v: string) => void
  onSystemRatios: (v: string) => void
  onSampleLabel: (v: string) => void
  onOutputLabel: (v: string) => void
  onOutputSubtitle: (v: string) => void
  onFooterNote: (v: string) => void
  onAspectRatio: (v: string) => void
  onIncludeCanvasText: (v: boolean) => void
  onCanvasText: (v: string) => void
  onPickFile: (file: File | null) => void
  onResultUrl: (url: string | null) => void
  onSourcePreview: (url: string | null) => void
  onReload: (opts?: {
    templateKey?: string
    selectedId?: number | null
    varietyKey?: string | null
    silent?: boolean
  }) => Promise<void>
  onStatus: (msg: string) => void
  onLastTestAi: (v: { provider?: string; model?: string } | null) => void
  statusMessage?: string
}

export default function PromptLabWorkspace(props: Props) {
  const {
    userId,
    templates,
    prompts,
    templateKey,
    selectedVarietyKey,
    selectedId,
    name,
    promptText,
    negativePrompt,
    workflowHighlightsText,
    systemResolutions,
    systemRatios,
    sampleLabel,
    outputLabel,
    outputSubtitle,
    footerNote,
    aspectRatio,
    includeCanvasText,
    canvasText,
    sourcePreview,
    sourceFile,
    resultUrl,
    onTemplateKey,
    onSelectedVarietyKey,
    onSelectedId,
    onName,
    onPromptText,
    onNegativePrompt,
    onWorkflowHighlightsText,
    onSystemResolutions,
    onSystemRatios,
    onSampleLabel,
    onOutputLabel,
    onOutputSubtitle,
    onFooterNote,
    onAspectRatio,
    onIncludeCanvasText,
    onCanvasText,
    onPickFile,
    onResultUrl,
    onSourcePreview,
    onReload,
    onStatus,
    onLastTestAi,
    statusMessage,
  } = props

  const [busy, setBusy] = useState(false)
  const [newSubLabel, setNewSubLabel] = useState('')
  const saveFb = useSaveFeedback()

  const activeTemplate = useMemo(
    () => templates.find((t) => t.key === templateKey) || templates[0] || null,
    [templates, templateKey],
  )
  const subtemplates = activeTemplate?.varieties || activeTemplate?.subtemplates || []
  const templateEnabled = activeTemplate?.is_enabled !== false

  const promptsForScope = useMemo(() => {
    return prompts.filter((p) => {
      if (p.template_key !== templateKey) return false
      if (selectedVarietyKey) return (p.variety_key || '') === selectedVarietyKey
      return !p.variety_key
    })
  }, [prompts, templateKey, selectedVarietyKey])

  const selectedPrompt = prompts.find((p) => p.id === selectedId) || null

  const showcasePreview: ShowcaseData = {
    template_key: templateKey,
    workflow_highlights: parseWorkflowHighlightsText(workflowHighlightsText),
    system_resolutions: systemResolutions,
    system_ratios: systemRatios,
    sample_label: sampleLabel,
    output_label: outputLabel,
    output_subtitle: outputSubtitle,
    footer_note: footerNote,
    sample_source_image_url: activeTemplate?.showcase?.sample_source_image_url,
    sample_result_image_url: activeTemplate?.showcase?.sample_result_image_url,
  }

  const selectTemplate = (key: string) => {
    onTemplateKey(key)
    onSelectedVarietyKey(null)
    const tPrompts = prompts.filter((p) => p.template_key === key && !p.variety_key)
    const active = tPrompts.find((p) => p.is_active) || tPrompts[0] || null
    if (active) {
      onSelectedId(active.id)
      onName(active.name)
      onPromptText(active.prompt_text)
      onNegativePrompt(active.negative_prompt || '')
    } else {
      onSelectedId(null)
    }
    const t = templates.find((x) => x.key === key)
    if (t?.showcase) {
      onWorkflowHighlightsText((t.showcase.workflow_highlights || []).join('\n'))
      onSystemResolutions(t.showcase.system_resolutions || '2K, 4K High Definition')
      onSystemRatios(t.showcase.system_ratios || '1:1')
      onSampleLabel(t.showcase.sample_label || 'Sample cinematic design')
      onOutputLabel(t.showcase.output_label || 'Professional output')
      onOutputSubtitle(t.showcase.output_subtitle || '4K hyper-realistic studio rendering')
      onFooterNote(t.showcase.footer_note || 'Preserves source details perfectly')
    }
  }

  const selectSubtemplate = (v: EnhancedPictureVariety | null) => {
    const key = v?.variety_key || null
    onSelectedVarietyKey(key)
    const scoped = prompts.filter((p) => {
      if (p.template_key !== templateKey) return false
      if (key) return (p.variety_key || '') === key
      return !p.variety_key
    })
    const active = scoped.find((p) => p.is_active) || scoped[0] || null
    if (active) {
      onSelectedId(active.id)
      onName(active.name)
      onPromptText(active.prompt_text)
      onNegativePrompt(active.negative_prompt || '')
      if (active.test_source_image_url) onSourcePreview(active.test_source_image_url)
      if (active.test_result_image_url) onResultUrl(active.test_result_image_url)
    } else {
      onSelectedId(null)
      onName(v ? v.variety_label : activeTemplate?.label || 'Studio prompt')
    }
    if (v?.sample_source_image_url) onSourcePreview(v.sample_source_image_url)
    if (v?.sample_result_image_url) onResultUrl(v.sample_result_image_url)
  }

  const addTemplate = async () => {
    const label = window.prompt('New template name', 'White Layouts')?.trim()
    if (!label) return
    setBusy(true)
    try {
      const created = await createAdminEnhancedTemplate(userId, { label })
      await onReload({ templateKey: created.key, selectedId: created.prompt.id })
      onStatus(`Template "${label}" created.`)
    } catch (e: unknown) {
      onStatus(
        (e as { response?: { data?: { error?: string } } })?.response?.data?.error ||
          'Could not create template',
      )
    } finally {
      setBusy(false)
    }
  }

  const removeTemplate = async () => {
    if (!activeTemplate) return
    if (activeTemplate.key === 'idols') {
      onStatus('Cannot delete Idols / Frames — toggle “Show to reseller” off instead.')
      return
    }
    if (!window.confirm(`Delete template "${activeTemplate.label}" and all its sub-templates?`)) {
      return
    }
    setBusy(true)
    try {
      await deleteAdminEnhancedTemplate(userId, activeTemplate.key)
      await onReload({ templateKey: 'idols', silent: true })
      onStatus('Template deleted.')
    } catch (e: unknown) {
      onStatus(
        (e as { response?: { data?: { error?: string } } })?.response?.data?.error ||
          'Delete failed',
      )
    } finally {
      setBusy(false)
    }
  }

  const addSubtemplate = async () => {
    const label = newSubLabel.trim()
    if (!label) return
    setBusy(true)
    try {
      const v = await createAdminEnhancedVariety(userId, {
        template_key: templateKey,
        variety_label: label,
      })
      setNewSubLabel('')
      await onReload({ templateKey, selectedId, silent: true })
      onSelectedVarietyKey(v.variety_key)
      onName(label)
      onStatus(`Sub-template "${label}" added.`)
    } catch (e: unknown) {
      onStatus(
        (e as { response?: { data?: { error?: string } } })?.response?.data?.error ||
          'Could not add sub-template',
      )
    } finally {
      setBusy(false)
    }
  }

  const toggleSubAccess = async (v: EnhancedPictureVariety) => {
    if (!v.id) return
    setBusy(true)
    try {
      await patchAdminEnhancedVariety(v.id, { is_enabled: !v.is_enabled })
      await onReload({ templateKey, selectedId, silent: true })
    } finally {
      setBusy(false)
    }
  }

  const deleteSub = async (v: EnhancedPictureVariety) => {
    if (!v.id) return
    if (!window.confirm(`Delete sub-template "${v.variety_label}"?`)) return
    setBusy(true)
    try {
      await deleteAdminEnhancedVariety(v.id)
      if (selectedVarietyKey === v.variety_key) onSelectedVarietyKey(null)
      await onReload({ templateKey, selectedId, silent: true })
    } finally {
      setBusy(false)
    }
  }

  const saveChanges = () =>
    saveFb.runSave(async () => {
      try {
        const split = splitMasterAndNegative(promptText, negativePrompt)
        const data = await saveAdminEnhancedPromptLab(userId, {
          template_key: templateKey,
          variety_key: selectedVarietyKey,
          prompt_id: selectedId,
          name: name || 'Studio prompt',
          prompt_text: split.promptText,
          negative_prompt: split.negativePrompt,
          workflow_highlights: parseWorkflowHighlightsText(workflowHighlightsText),
          system_resolutions: systemResolutions,
          system_ratios: systemRatios,
          sample_label: sampleLabel,
          output_label: outputLabel,
          output_subtitle: outputSubtitle,
          footer_note: footerNote,
          template_enabled: templateEnabled,
          activate: true,
        })
        onName(data.prompt.name)
        await onReload({
          templateKey,
          selectedId: data.prompt.id,
          varietyKey: data.variety_key ?? selectedVarietyKey,
          silent: true,
        })
        onStatus(
          selectedVarietyKey
            ? `Saved & activated. Sub-template renamed to “${data.prompt.name}”.`
            : 'Saved & activated for reseller.',
        )
      } catch (e: unknown) {
        onStatus(
          (e as { response?: { data?: { error?: string } }; message?: string })?.response?.data
            ?.error ||
            (e as { message?: string })?.message ||
            'Save failed — please try again.',
        )
        throw e
      }
    })

  const toggleTemplateAccess = async () => {
    setBusy(true)
    try {
      await patchAdminEnhancedTemplateShowcase(userId, {
        template_key: templateKey,
        is_enabled: !templateEnabled,
      })
      await onReload({ templateKey, selectedId, silent: true })
      onStatus(
        !templateEnabled
          ? 'Template visible to reseller.'
          : 'Template hidden from reseller.',
      )
    } catch (e: unknown) {
      onStatus(
        (e as { response?: { data?: { error?: string } } })?.response?.data?.error ||
          'Could not update access',
      )
    } finally {
      setBusy(false)
    }
  }

  const runTest = async () => {
    if (!sourceFile) {
      onStatus('Upload or take a sample photo first.')
      return
    }
    if (!promptText.trim()) {
      onStatus('Master prompt is required.')
      return
    }
    setBusy(true)
    onStatus('Testing prompt — generating studio shot (usually 45–90 seconds)…')
    try {
      const split = splitMasterAndNegative(promptText, negativePrompt)
      const data = await testGenerateAdminEnhanced({
        userId,
        image: sourceFile,
        promptText: split.promptText,
        negativePrompt: split.negativePrompt,
        name,
        promptId: selectedId,
        saveAsNew: false,
        templateKey,
        varietyKey: selectedVarietyKey || undefined,
        aspectRatio,
        canvasText: includeCanvasText ? canvasText.trim() : undefined,
        aiProvider: props.aiProvider,
        geminiModel: props.geminiModel,
        geminiApiKey: props.geminiApiKeyInput.trim() || undefined,
        replicateModel: props.replicateModel,
        replicateApiToken: props.replicateTokenInput.trim() || undefined,
      })
      onResultUrl(data.result_image_url)
      onSourcePreview(data.source_image_url)
      onLastTestAi({ provider: data.ai_provider, model: data.ai_model })
      await onReload({
        templateKey,
        selectedId: data.prompt.id,
        varietyKey: selectedVarietyKey,
        silent: true,
      })
      onStatus('Test complete — preview updated below. Click Save changes to activate for reseller.')
    } catch (e: unknown) {
      onStatus(
        (e as { response?: { data?: { error?: string } }; message?: string })?.response?.data
          ?.error ||
          (e as { message?: string })?.message ||
          'Test failed',
      )
    } finally {
      setBusy(false)
    }
  }

  const restoreFormatting = () => {
    const split = splitMasterAndNegative(promptText, negativePrompt)
    onPromptText(removeEmptyPromptLines(split.promptText))
    onNegativePrompt(removeEmptyPromptLines(split.negativePrompt))
    onStatus('Empty lines removed — your wording and line breaks are unchanged. Click Save changes to persist.')
  }

  const samplePreview =
    sourcePreview ||
    subtemplates.find((v) => v.variety_key === selectedVarietyKey)?.sample_source_image_url ||
    activeTemplate?.showcase?.sample_source_image_url ||
    null
  const resultPreview =
    resultUrl ||
    subtemplates.find((v) => v.variety_key === selectedVarietyKey)?.sample_result_image_url ||
    activeTemplate?.showcase?.sample_result_image_url ||
    null

  return (
    <section className="space-y-4">
      {statusMessage ? (
        <div
          role="status"
          className={`rounded-xl border px-4 py-3 text-sm font-medium ${
            /fail|error|required|could not/i.test(statusMessage)
              ? 'border-rose-200 bg-rose-50 text-rose-900'
              : /complete|saved|activated|added|deleted|ready|updated|cleared/i.test(statusMessage)
                ? 'border-emerald-200 bg-emerald-100 text-emerald-900'
                : 'border-[var(--color-slate-700,#e8e4df)] bg-[var(--color-slate-900,#f7f4ef)] text-[var(--color-jewelry-black,#1a1814)]'
          }`}
        >
          {statusMessage}
        </div>
      ) : null}
      <div className="rounded-2xl border border-[var(--color-slate-700,#e8e4df)] bg-white p-4 sm:p-5">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-base font-semibold text-[var(--color-jewelry-black,#1a1814)]">
              Prompt Lab
            </h2>
            <p className="mt-1 text-xs leading-relaxed text-[var(--color-jewelry-black,#1a1814)]/60">
              Templates on top → sub-templates inside each. Edit prompts in one place, then Save
              changes. Toggle what this reseller can see.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => void toggleTemplateAccess()}
              className={`inline-flex min-h-[40px] items-center gap-1.5 rounded-xl px-3 text-xs font-bold uppercase tracking-wide ${
                templateEnabled
                  ? 'border border-emerald-200 bg-emerald-50 text-emerald-900'
                  : 'border border-rose-200 bg-rose-50 text-rose-800'
              }`}
            >
              {templateEnabled ? <Eye className="size-3.5" /> : <EyeOff className="size-3.5" />}
              {templateEnabled ? 'Shown to reseller' : 'Hidden from reseller'}
            </button>
          </div>
        </div>

        {/* Templates */}
        <div className="mt-4">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--color-jewelry-black,#1a1814)]/50">
            1 · Templates
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {templates.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => selectTemplate(t.key)}
                className={`min-h-[44px] rounded-xl border px-3 py-2 text-left text-sm font-semibold transition ${
                  templateKey === t.key
                    ? 'border-emerald-700 bg-emerald-50 text-emerald-950 shadow-sm ring-1 ring-emerald-700/25'
                    : 'border-[var(--color-slate-700,#e8e4df)] bg-white text-[var(--color-jewelry-black,#1a1814)] hover:border-emerald-200'
                }`}
              >
                <span
                  className={`block ${
                    templateKey === t.key
                      ? 'text-emerald-950'
                      : 'text-[var(--color-jewelry-black,#1a1814)]'
                  }`}
                >
                  {t.label}
                </span>
                {t.is_enabled === false ? (
                  <span className="text-[10px] font-medium text-rose-700">Hidden</span>
                ) : null}
              </button>
            ))}
            <button
              type="button"
              disabled={busy}
              onClick={() => void addTemplate()}
              className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-dashed border-[var(--color-slate-700,#e8e4df)] px-3 text-sm font-semibold text-[var(--color-jewelry-black,#1a1814)]/70"
            >
              <Plus className="size-4" />
              New template
            </button>
            {activeTemplate && activeTemplate.key !== 'idols' ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => void removeTemplate()}
                className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 px-3 text-sm font-semibold text-rose-800"
              >
                <Trash2 className="size-4" />
                Delete template
              </button>
            ) : null}
          </div>
        </div>

        {/* Sub-templates */}
        <div className="mt-5">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--color-jewelry-black,#1a1814)]/50">
            2 · Sub-templates inside {activeTemplate?.label || 'template'}
          </p>
          <p className="mt-1 text-xs text-[var(--color-jewelry-black,#1a1814)]/55">
            e.g. Kada, Bracelet, Ring under White Layouts. Toggle access per sub-template.
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => selectSubtemplate(null)}
              className={`min-h-[40px] rounded-xl px-3 text-sm font-semibold ${
                !selectedVarietyKey
                  ? 'border border-emerald-700 bg-emerald-700 text-white shadow-sm'
                  : 'border border-[var(--color-slate-700,#e8e4df)] bg-white text-[var(--color-jewelry-black,#1a1814)]'
              }`}
            >
              Default (no sub-template)
            </button>
            {subtemplates.map((v) => (
              <div key={v.variety_key} className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => selectSubtemplate(v)}
                  className={`min-h-[40px] rounded-xl px-3 text-sm font-semibold ${
                    selectedVarietyKey === v.variety_key
                      ? 'border border-emerald-700 bg-emerald-700 text-white shadow-sm'
                      : 'border border-[var(--color-slate-700,#e8e4df)] bg-white text-[var(--color-jewelry-black,#1a1814)] hover:border-emerald-200'
                  }`}
                >
                  {v.variety_label}
                  {v.is_enabled === false ? (
                    <span className="ml-1 text-[10px] opacity-80">off</span>
                  ) : null}
                </button>
                <button
                  type="button"
                  title={v.is_enabled === false ? 'Enable for reseller' : 'Hide from reseller'}
                  onClick={() => void toggleSubAccess(v)}
                  className="flex size-9 items-center justify-center rounded-lg border border-[var(--color-slate-700,#e8e4df)] text-[var(--color-jewelry-black,#1a1814)]/60"
                >
                  {v.is_enabled === false ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                </button>
                <button
                  type="button"
                  title="Delete sub-template"
                  onClick={() => void deleteSub(v)}
                  className="flex size-9 items-center justify-center rounded-lg border border-rose-200 text-rose-700"
                >
                  <Trash2 className="size-3.5" />
                </button>
              </div>
            ))}
          </div>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <input
              value={newSubLabel}
              onChange={(e) => setNewSubLabel(e.target.value)}
              placeholder="e.g. Flexi kada, Bowl sets"
              className="min-h-[44px] flex-1 rounded-xl border border-[var(--color-slate-700,#e8e4df)] px-3 text-sm"
            />
            <button
              type="button"
              disabled={busy || !newSubLabel.trim()}
              onClick={() => void addSubtemplate()}
              className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl bg-emerald-700 px-4 text-sm font-semibold text-white disabled:opacity-50"
            >
              <Plus className="size-4" />
              Add sub-template
            </button>
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="space-y-4 rounded-2xl border border-[var(--color-slate-700,#e8e4df)] bg-white p-4 sm:p-5">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--color-jewelry-black,#1a1814)]/50">
            3 · Edit everything · save once
          </p>

          <label className="block text-xs font-semibold uppercase tracking-wide text-[var(--color-jewelry-black,#1a1814)]/50">
            Prompt name
            <input
              value={name}
              onChange={(e) => onName(e.target.value)}
              className="mt-1.5 w-full rounded-xl border border-[var(--color-slate-700,#e8e4df)] px-3 py-2.5 text-sm normal-case"
            />
          </label>

          <label className="block text-xs font-semibold uppercase tracking-wide text-[var(--color-jewelry-black,#1a1814)]/50">
            Master prompt
            <span className="ml-1 rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold normal-case text-emerald-900">
              AI
            </span>
            <textarea
              value={promptText}
              onChange={(e) => onPromptText(e.target.value)}
              rows={12}
              spellCheck={false}
              className={PROMPT_CLASS}
            />
          </label>

          <label className="block text-xs font-semibold uppercase tracking-wide text-[var(--color-jewelry-black,#1a1814)]/50">
            Negative prompt
            <span className="ml-1 rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold normal-case text-emerald-900">
              AI
            </span>
            <textarea
              value={negativePrompt}
              onChange={(e) => onNegativePrompt(e.target.value)}
              rows={6}
              spellCheck={false}
              className={PROMPT_CLASS}
            />
          </label>

          <label className="block text-xs font-semibold uppercase tracking-wide text-[var(--color-jewelry-black,#1a1814)]/50">
            Workflow highlights
            <span className="ml-1 rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold normal-case text-emerald-900">
              AI
            </span>
            <span className="ml-1 font-normal normal-case text-[var(--color-jewelry-black,#1a1814)]/45">
              (one per line)
            </span>
            <textarea
              value={workflowHighlightsText}
              onChange={(e) => onWorkflowHighlightsText(e.target.value)}
              rows={4}
              className={`${PROMPT_CLASS} text-sm`}
            />
          </label>

          <details className="rounded-xl border border-[var(--color-slate-700,#e8e4df)] bg-[var(--color-slate-900,#f7f4ef)]/50 px-3 py-2">
            <summary className="cursor-pointer text-xs font-semibold text-[var(--color-jewelry-black,#1a1814)]/60">
              Reseller card labels (preview only)
            </summary>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className="block text-xs font-semibold text-[var(--color-jewelry-black,#1a1814)]/50">
                Resolutions
                <input
                  value={systemResolutions}
                  onChange={(e) => onSystemResolutions(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-[var(--color-slate-700,#e8e4df)] px-2 py-2 text-sm"
                />
              </label>
              <label className="block text-xs font-semibold text-[var(--color-jewelry-black,#1a1814)]/50">
                Ratios
                <input
                  value={systemRatios}
                  onChange={(e) => onSystemRatios(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-[var(--color-slate-700,#e8e4df)] px-2 py-2 text-sm"
                />
              </label>
              <label className="block text-xs font-semibold text-[var(--color-jewelry-black,#1a1814)]/50">
                Sample label
                <input
                  value={sampleLabel}
                  onChange={(e) => onSampleLabel(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-[var(--color-slate-700,#e8e4df)] px-2 py-2 text-sm"
                />
              </label>
              <label className="block text-xs font-semibold text-[var(--color-jewelry-black,#1a1814)]/50">
                Output label
                <input
                  value={outputLabel}
                  onChange={(e) => onOutputLabel(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-[var(--color-slate-700,#e8e4df)] px-2 py-2 text-sm"
                />
              </label>
              <label className="block text-xs font-semibold text-[var(--color-jewelry-black,#1a1814)]/50 sm:col-span-2">
                Output subtitle
                <input
                  value={outputSubtitle}
                  onChange={(e) => onOutputSubtitle(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-[var(--color-slate-700,#e8e4df)] px-2 py-2 text-sm"
                />
              </label>
              <label className="block text-xs font-semibold text-[var(--color-jewelry-black,#1a1814)]/50 sm:col-span-2">
                Footer note
                <input
                  value={footerNote}
                  onChange={(e) => onFooterNote(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-[var(--color-slate-700,#e8e4df)] px-2 py-2 text-sm"
                />
              </label>
            </div>
          </details>

          <CanvasAspectPicker value={aspectRatio} onChange={onAspectRatio} label="Canvas aspect" />

          <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-[var(--color-slate-700,#e8e4df)] px-3 py-3">
            <input
              type="checkbox"
              checked={includeCanvasText}
              onChange={(e) => onIncludeCanvasText(e.target.checked)}
              className="mt-1 size-4"
            />
            <span>
              <span className="block text-sm font-semibold text-[var(--color-jewelry-black,#1a1814)]">
                Add text bottom of canvas (test only)
              </span>
              {includeCanvasText ? (
                <input
                  value={canvasText}
                  onChange={(e) => onCanvasText(e.target.value)}
                  placeholder="e.g. GANESH-SFIDOL001"
                  className="mt-2 w-full rounded-lg border border-[var(--color-slate-700,#e8e4df)] px-2 py-2 text-sm"
                />
              ) : null}
            </span>
          </label>

          <div className="flex flex-wrap gap-2">
            <SaveFeedbackButton
              type="button"
              disabled={busy}
              saving={saveFb.saving}
              saved={saveFb.saved}
              onClick={() => void saveChanges()}
              className="inline-flex min-h-[48px] flex-1 items-center justify-center rounded-xl bg-emerald-700 px-4 text-sm font-semibold text-white sm:flex-none"
            >
              Save changes
            </SaveFeedbackButton>
            <button
              type="button"
              disabled={busy}
              onClick={() => void runTest()}
              className="kc-btn-theme inline-flex min-h-[48px] flex-1 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold disabled:opacity-50 sm:flex-none"
            >
              {busy ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
              Test prompt
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={restoreFormatting}
              title="Removes blank lines only — does not change your wording or existing line breaks"
              className="inline-flex min-h-[48px] items-center rounded-xl border border-[var(--color-slate-700,#e8e4df)] bg-white px-3 text-xs font-semibold text-[var(--color-jewelry-black,#1a1814)] hover:bg-[var(--color-slate-900,#f7f4ef)]"
            >
              Fix line breaks
            </button>
            {selectedPrompt && !selectedPrompt.is_active ? (
              <button
                type="button"
                disabled={busy}
                onClick={async () => {
                  if (!selectedId) return
                  setBusy(true)
                  try {
                    await activateAdminEnhancedPrompt(selectedId)
                    await onReload({ templateKey, selectedId, silent: true })
                    onStatus('Activated for reseller.')
                  } finally {
                    setBusy(false)
                  }
                }}
                className="inline-flex min-h-[48px] items-center rounded-xl border border-emerald-200 bg-emerald-50 px-3 text-xs font-bold text-emerald-900"
              >
                Activate
              </button>
            ) : null}
            {selectedPrompt && !selectedPrompt.is_active ? (
              <button
                type="button"
                disabled={busy}
                onClick={async () => {
                  if (!selectedId) return
                  if (!window.confirm('Delete this unused prompt?')) return
                  setBusy(true)
                  try {
                    await deleteAdminEnhancedPrompt(selectedId)
                    await onReload({ templateKey, selectedId: null, silent: true })
                  } finally {
                    setBusy(false)
                  }
                }}
                className="inline-flex min-h-[48px] items-center gap-1 rounded-xl border border-rose-200 bg-rose-50 px-3 text-xs font-bold text-rose-800"
              >
                <Trash2 className="size-3.5" />
                Delete prompt
              </button>
            ) : null}
          </div>

          {promptsForScope.length > 1 ? (
            <div>
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-[var(--color-jewelry-black,#1a1814)]/45">
                Versions for this scope
              </p>
              <div className="flex flex-wrap gap-2">
                {promptsForScope.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => {
                      onSelectedId(p.id)
                      onName(p.name)
                      onPromptText(p.prompt_text)
                      onNegativePrompt(p.negative_prompt || '')
                    }}
                    className={`rounded-lg border px-2.5 py-1.5 text-xs font-semibold ${
                      selectedId === p.id
                        ? 'border-[var(--kc-accent,#047857)] bg-[var(--kc-accent,#047857)]/10 text-[var(--color-jewelry-black,#1a1814)]'
                        : 'border-[var(--color-slate-700,#e8e4df)] bg-white text-[var(--color-jewelry-black,#1a1814)]'
                    }`}
                  >
                    {p.name}
                    {p.is_active ? ' · ACTIVE' : ''}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </div>

        <div className="space-y-4">
          <div className="rounded-2xl border border-[var(--color-slate-700,#e8e4df)] bg-white p-4">
            <p className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-[var(--color-jewelry-black,#1a1814)]/50">
              Sample → output (what reseller sees)
            </p>
            <EnhancedTemplateShowcase
              data={showcasePreview}
              sampleImageUrl={samplePreview}
              resultImageUrl={resultPreview}
            />
          </div>
          <div className="rounded-2xl border border-[var(--color-slate-700,#e8e4df)] bg-white p-4">
            <p className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-[var(--color-jewelry-black,#1a1814)]/50">
              Test sample photo
            </p>
            <PhotoImportControls
              previewUrl={sourcePreview}
              onPick={onPickFile}
              emptyLabel="Take or upload a product photo"
            />
          </div>
        </div>
      </div>
    </section>
  )
}

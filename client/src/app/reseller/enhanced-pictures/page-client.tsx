'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import {
  ArrowLeft,
  Check,
  Download,
  Loader2,
  Sparkles,
  Package,
  Archive,
  Coins,
} from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { useCustomerTier } from '@/context/CustomerTierContext'
import { CUSTOMER_TIER } from '@/lib/customer-tier'
import { PROFILE_PATH, RESELLER_PRODUCTS_PATH } from '@/lib/routes'
import { PhotoImportControls } from '@/components/reseller/PhotoImportControls'
import { CanvasAspectPicker } from '@/components/reseller/CanvasAspectPicker'
import EnhancedTemplateShowcase from '@/components/reseller/EnhancedTemplateShowcase'
import EnhancedStudioOptions, {
  type StudioGenerationOptions,
} from '@/components/reseller/EnhancedStudioOptions'
import { EnhancedRecentJobsPanel } from '@/components/reseller/EnhancedRecentJobsPanel'
import {
  attachEnhancedPicture,
  createEnhancedTopupOrder,
  enhancedPicturesZipUrl,
  fetchBarcodeHints,
  fetchEnhancedBootstrap,
  fetchEnhancedJobs,
  fetchEnhancedJobStatus,
  fetchProductLookup,
  generateEnhancedPicture,
  cancelEnhancedJob,
  deleteEnhancedJob,
  verifyEnhancedTopup,
  DEFAULT_OVERLAY_SETTINGS,
  type EnhancedBarcodeHint,
  type EnhancedCreditPlan,
  type EnhancedOverlaySettings,
  type EnhancedPictureTemplate,
  type EnhancedRecentJob,
} from '@/lib/reseller-enhanced-pictures'

type RazorpayCtor = new (opts: Record<string, unknown>) => { open: () => void }

function getRazorpay(): RazorpayCtor | null {
  if (typeof window === 'undefined') return null
  return (window as unknown as { Razorpay?: RazorpayCtor }).Razorpay || null
}

function normalizeStem(raw: string) {
  return String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/_+/g, '-')
}

function loadRazorpay(): Promise<boolean> {
  if (typeof window === 'undefined') return Promise.resolve(false)
  if (getRazorpay()) return Promise.resolve(true)
  return new Promise((resolve) => {
    const s = document.createElement('script')
    s.src = 'https://checkout.razorpay.com/v1/checkout.js'
    s.onload = () => resolve(!!getRazorpay())
    s.onerror = () => resolve(false)
    document.body.appendChild(s)
  })
}

function formatBatchStateLabel(state: string | null | undefined) {
  if (!state) return null
  return state
    .replace(/^JOB_STATE_/, '')
    .replace(/^BATCH_STATE_/, '')
    .replace(/_/g, ' ')
    .toLowerCase()
}

export default function ResellerEnhancedPicturesPageClient() {
  const auth = useAuth()
  const { customerTier, tierReady } = useCustomerTier()

  const [enabled, setEnabled] = useState(false)
  const [templates, setTemplates] = useState<EnhancedPictureTemplate[]>([])
  const [activePromptName, setActivePromptName] = useState<string | null>(null)
  const [aiModelLabel, setAiModelLabel] = useState<string | null>(null)
  const [geminiBatchAllowed, setGeminiBatchAllowed] = useState(false)
  const [economyBatchMode, setEconomyBatchMode] = useState(false)
  const [hints, setHints] = useState<EnhancedBarcodeHint[]>([])
  const [credits, setCredits] = useState(0)
  const [plans, setPlans] = useState<EnhancedCreditPlan[]>([])
  const [razorpayEnabled, setRazorpayEnabled] = useState(false)
  const [paymentQrUrl, setPaymentQrUrl] = useState<string | null>(null)
  const [bankDetails, setBankDetails] = useState<string | null>(null)
  const [showTopup, setShowTopup] = useState(false)
  const [bootstrapLoading, setBootstrapLoading] = useState(true)
  const [bootstrapReady, setBootstrapReady] = useState(false)
  const [templateKey, setTemplateKey] = useState('idols')
  const [varietyKey, setVarietyKey] = useState<string | null>(null)
  const [aspectRatio, setAspectRatio] = useState('1:1')
  const [includeCanvasText, setIncludeCanvasText] = useState(false)
  const [canvasText, setCanvasText] = useState('')
  const [overlaySettings, setOverlaySettings] = useState<EnhancedOverlaySettings>(DEFAULT_OVERLAY_SETTINGS)
  const [generationOptions, setGenerationOptions] = useState<StudioGenerationOptions>({
    backgroundPreset: 'charcoal',
    visualization: 'studio',
    applyWatermark: false,
    applyInfoText: false,
  })
  const [photoType, setPhotoType] = useState<'front' | 'back'>('front')
  const [barcodeStem, setBarcodeStem] = useState('')
  const [mrpRateBehindBox, setMrpRateBehindBox] = useState('')
  const [showMrpField, setShowMrpField] = useState(false)
  const [lookupLabel, setLookupLabel] = useState<string | null>(null)
  const [sourceFile, setSourceFile] = useState<File | null>(null)
  const [sourcePreview, setSourcePreview] = useState<string | null>(null)
  const [resultUrl, setResultUrl] = useState<string | null>(null)
  const [jobId, setJobId] = useState<number | null>(null)
  const [downloadName, setDownloadName] = useState('')
  const [attachMsg, setAttachMsg] = useState('')
  const [busy, setBusy] = useState(false)
  const [phase, setPhase] = useState<'idle' | 'preparing' | 'batch' | 'done'>('idle')
  const [batchState, setBatchState] = useState<string | null>(null)
  const [batchMessage, setBatchMessage] = useState('')
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState('')
  const [recentJobs, setRecentJobs] = useState<EnhancedRecentJob[]>([])
  const [jobsLoading, setJobsLoading] = useState(true)
  const [jobsRefreshing, setJobsRefreshing] = useState(false)
  const [actionJobId, setActionJobId] = useState<number | null>(null)
  const pollGenerationRef = useRef(0)

  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      setEconomyBatchMode(window.localStorage.getItem('kc-enhanced-economy-batch') === '1')
    } catch {
      /* ignore */
    }
  }, [])

  const toggleEconomyBatchMode = useCallback((next: boolean) => {
    setEconomyBatchMode(next)
    try {
      window.localStorage.setItem('kc-enhanced-economy-batch', next ? '1' : '0')
    } catch {
      /* ignore */
    }
  }, [])

  const authReady = auth.hasChecked === true
  const subscriptionOn = Boolean(
    auth.isAuthenticated &&
      customerTier === CUSTOMER_TIER.RESELLER &&
      (auth.user as { reseller_enhanced_pictures_enabled?: boolean })
        ?.reseller_enhanced_pictures_enabled,
  )

  const load = useCallback(async () => {
    if (!auth.isAuthenticated || customerTier !== CUSTOMER_TIER.RESELLER) {
      setBootstrapLoading(false)
      setBootstrapReady(true)
      return
    }
    setBootstrapLoading(true)
    try {
      const data = await fetchEnhancedBootstrap({ jobLimit: 15, includeHints: true })
      setEnabled(data.enabled)
      setTemplates(data.templates || [])
      setActivePromptName(data.active_prompt?.name || null)
      if (data.ai_settings) {
        const ai = data.ai_settings
        setGeminiBatchAllowed(!!ai.gemini_batch_enabled)
        setAiModelLabel(
          ai.provider === 'replicate'
            ? `Replicate · ${ai.replicate_model}`
            : `Gemini · ${ai.gemini_model}`,
        )
      } else {
        setAiModelLabel(null)
        setGeminiBatchAllowed(false)
      }
      setCredits(data.credits ?? 0)
      setPlans(data.plans || [])
      setRazorpayEnabled(!!data.razorpay_enabled)
      setPaymentQrUrl(data.payment_qr_url || null)
      setBankDetails(data.bank_details || null)
      if (data.templates?.[0]?.key) setTemplateKey(data.templates[0].key)
      setHints(data.hints || [])
      setRecentJobs(data.jobs || [])
      if (data.overlay_settings) {
        setOverlaySettings({ ...DEFAULT_OVERLAY_SETTINGS, ...data.overlay_settings })
        setGenerationOptions((g) => ({
          ...g,
          applyWatermark: !!data.overlay_settings?.watermark_enabled,
          applyInfoText: !!data.overlay_settings?.info_text_enabled,
        }))
      }
      setJobsLoading(false)
    } catch (e: unknown) {
      setError(
        (e as { response?: { data?: { error?: string } } })?.response?.data?.error ||
          'Could not load Enhanced Pictures',
      )
    } finally {
      setBootstrapLoading(false)
      setBootstrapReady(true)
    }
  }, [auth.isAuthenticated, customerTier])

  const loadRecentJobs = useCallback(
    async (silent = false) => {
      if (!auth.isAuthenticated || customerTier !== CUSTOMER_TIER.RESELLER) return
      if (silent) setJobsRefreshing(true)
      else setJobsLoading(true)
      try {
        const list = await fetchEnhancedJobs(15)
        setRecentJobs(list)
      } catch {
        /* non-blocking */
      } finally {
        setJobsLoading(false)
        setJobsRefreshing(false)
      }
    },
    [auth.isAuthenticated, customerTier],
  )

  useEffect(() => {
    if (authReady && tierReady) void load()
  }, [authReady, tierReady, load])

  useEffect(() => {
    const hasPending = recentJobs.some((j) =>
      ['batch_queued', 'batch_processing', 'processing'].includes(j.status),
    )
    if (!hasPending || !subscriptionOn || !enabled) return
    const timer = window.setInterval(() => {
      void loadRecentJobs(true)
    }, 15000)
    return () => window.clearInterval(timer)
  }, [recentJobs, subscriptionOn, enabled, loadRecentJobs])

  useEffect(() => {
    return () => {
      if (sourcePreview?.startsWith('blob:')) URL.revokeObjectURL(sourcePreview)
    }
  }, [sourcePreview])

  const suggestedFilename = useMemo(() => {
    const stem = normalizeStem(barcodeStem)
    if (!stem) return ''
    return photoType === 'back' ? `${stem}_secondary.webp` : `${stem}.webp`
  }, [barcodeStem, photoType])

  const templateLabels = useMemo(() => {
    const map: Record<string, string> = {}
    for (const t of templates) map[t.key] = t.label
    return map
  }, [templates])

  const activeTemplate = useMemo(
    () => templates.find((t) => t.key === templateKey) || templates[0] || null,
    [templates, templateKey],
  )

  const activeVariety = useMemo(() => {
    const list = activeTemplate?.varieties || []
    if (!list.length) return null
    if (varietyKey) return list.find((v) => v.variety_key === varietyKey) || list[0]
    return list[0]
  }, [activeTemplate, varietyKey])

  const showcaseSampleUrl = useMemo(() => {
    if (sourcePreview) return sourcePreview
    return activeVariety?.sample_source_image_url || activeTemplate?.showcase?.sample_source_image_url || null
  }, [sourcePreview, activeVariety, activeTemplate])

  const previewOverlayLines = useMemo(() => {
    const lines = overlaySettings.info_text_lines || []
    const variety = activeVariety?.variety_label || ''
    const sku = normalizeStem(barcodeStem) || lookupLabel || ''
    return lines.map((line) =>
      line
        .replace(/\{variety\}/gi, variety)
        .replace(/\{template\}/gi, activeTemplate?.label || '')
        .replace(/\{sku\}/gi, sku)
        .replace(/\{style_code\}/gi, sku)
        .replace(/\{weight\}/gi, '— g')
        .replace(/\{product_name\}/gi, lookupLabel || '')
        .replace(/\{barcode\}/gi, sku),
    )
  }, [overlaySettings.info_text_lines, activeVariety, activeTemplate, barcodeStem, lookupLabel])

  const showcaseResultUrl = useMemo(() => {
    if (resultUrl) return resultUrl
    return activeVariety?.sample_result_image_url || activeTemplate?.showcase?.sample_result_image_url || null
  }, [resultUrl, activeVariety, activeTemplate])

  useEffect(() => {
    const q = String(barcodeStem || '').trim()
    if (q.length < 3) {
      setShowMrpField(false)
      setLookupLabel(null)
      return
    }
    const t = window.setTimeout(() => {
      void fetchProductLookup(q)
        .then((data) => {
          if (!data.found || !data.product) {
            setShowMrpField(false)
            setLookupLabel(null)
            return
          }
          const p = data.product
          setLookupLabel(p.product_name || p.item_code || p.web_product_sku || p.stem)
          setShowMrpField(!!p.show_mrp_field)
          if (p.mrp_rate_behind_box != null && Number(p.mrp_rate_behind_box) > 0) {
            setMrpRateBehindBox(String(p.mrp_rate_behind_box))
          } else if (!p.show_mrp_field) {
            setMrpRateBehindBox('')
          }
          if (p.stem && !barcodeStem.includes('-')) {
            /* keep user stem if they typed item code like SFIDOL009-001 */
          }
        })
        .catch(() => {
          setShowMrpField(false)
          setLookupLabel(null)
        })
    }, 400)
    return () => window.clearTimeout(t)
  }, [barcodeStem])

  const onPick = (file: File | null) => {
    if (sourcePreview?.startsWith('blob:')) URL.revokeObjectURL(sourcePreview)
    setSourceFile(file)
    setSourcePreview(file ? URL.createObjectURL(file) : null)
    setResultUrl(null)
    setJobId(null)
    setAttachMsg('')
    setError('')
    setPhase('idle')
  }

  const abortPolling = useCallback(() => {
    pollGenerationRef.current += 1
  }, [])

  const pollBatchJob = useCallback(async (id: number, isEconomyBatch = false) => {
    const token = ++pollGenerationRef.current
    const maxAttempts = isEconomyBatch ? 360 : 90
    const pollMs = isEconomyBatch ? 2500 : 2000
    for (let i = 0; i < maxAttempts; i += 1) {
      if (pollGenerationRef.current !== token) return
      await new Promise((r) => setTimeout(r, pollMs))
      if (pollGenerationRef.current !== token) return
      try {
        const job = await fetchEnhancedJobStatus(id)
        if (pollGenerationRef.current !== token) return
        setBatchState(job.batch_state || job.status || null)
        setProgress(Math.min(92, 18 + i * (isEconomyBatch ? 0.25 : 0.85)))
        if (job.status === 'completed' && job.result_image_url) {
          setResultUrl(job.result_image_url)
          setDownloadName(job.download_filename || suggestedFilename || 'studio-shot.webp')
          setPhase('done')
          setProgress(100)
          setError('')
          setAttachMsg('Studio shot ready! Download below or attach to a barcode.')
          setBusy(false)
          void loadRecentJobs(true)
          const h = await fetchBarcodeHints().catch(() => null)
          if (h) setHints(h)
          const boot = await fetchEnhancedBootstrap({ jobLimit: 5, includeHints: false }).catch(() => null)
          if (boot && typeof boot.credits === 'number') setCredits(boot.credits)
          return
        }
        if (job.status === 'failed' || job.status === 'cancelled') {
          setPhase('idle')
          setBusy(false)
          if (job.status === 'cancelled') {
            setAttachMsg('Job stopped. Your credit was refunded.')
            setError('')
          } else {
            setError(job.error_message || 'Generation failed. Your credit was refunded if charged.')
          }
          void loadRecentJobs(true)
          return
        }
      } catch {
        /* keep polling */
      }
    }
    if (pollGenerationRef.current !== token) return
    setPhase('idle')
    setBusy(false)
    setError(
      isEconomyBatch
        ? 'Still processing in Gemini Batch queue. Check Recent studio jobs below — we keep tracking in the background.'
        : 'Still processing — check Recent studio jobs below. Your image usually appears within a minute.',
    )
    void loadRecentJobs(true)
  }, [suggestedFilename, loadRecentJobs])

  const handleSelectRecentJob = useCallback(
    (job: EnhancedRecentJob) => {
      setJobId(job.id)
      setTemplateKey(job.template_key)
      setPhotoType(job.photo_type === 'back' ? 'back' : 'front')
      if (job.barcode_stem) setBarcodeStem(job.barcode_stem)
      setError('')

      if (job.status === 'completed' && job.result_image_url) {
        setResultUrl(job.result_image_url)
        setDownloadName(
          job.download_filename ||
            (job.barcode_stem
              ? job.photo_type === 'back'
                ? `${normalizeStem(job.barcode_stem)}_secondary.webp`
                : `${normalizeStem(job.barcode_stem)}.webp`
              : 'studio-shot.webp'),
        )
        setPhase('done')
        setBusy(false)
        setAttachMsg(
          job.attached_sku
            ? `Attached to ${job.attached_sku}.`
            : 'Loaded from recent jobs. Download or attach to product.',
        )
        window.setTimeout(() => {
          document.getElementById('studio-preview')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
        }, 80)
        return
      }

      if (job.status === 'failed') {
        setPhase('idle')
        setResultUrl(null)
        setAttachMsg('')
        setError(job.error_message || 'This job failed. Your credit was refunded if charged.')
        return
      }

      if (job.status === 'cancelled') {
        setPhase('idle')
        setResultUrl(null)
        setAttachMsg('This job was stopped. Your credit was refunded.')
        setError('')
        return
      }

      if (['batch_queued', 'batch_processing', 'processing'].includes(job.status)) {
        setPhase('batch')
        setBusy(true)
        setResultUrl(null)
        setAttachMsg('')
        setBatchMessage('Resuming batch job — usually ready within a few minutes.')
        setBatchState(job.batch_state || job.status)
        setProgress(22)
        void pollBatchJob(job.id, job.generation_mode === 'batch')
      }
    },
    [pollBatchJob],
  )

  const clearActivePreviewIfJob = useCallback(
    (id: number) => {
      if (jobId !== id) return
      setJobId(null)
      setResultUrl(null)
      setDownloadName('')
      setAttachMsg('')
      setPhase('idle')
      setBusy(false)
      abortPolling()
    },
    [jobId, abortPolling],
  )

  const handleCancelRecentJob = useCallback(
    async (job: EnhancedRecentJob) => {
      const title =
        job.barcode_stem ||
        job.download_filename?.replace(/\.[^.]+$/, '') ||
        `Job #${job.id}`
      if (
        !window.confirm(
          `Stop "${title}"?\n\nProcessing will be cancelled and your credit will be refunded.`,
        )
      ) {
        return
      }
      setActionJobId(job.id)
      setError('')
      try {
        const data = await cancelEnhancedJob(job.id)
        if (typeof data.credits === 'number') setCredits(data.credits)
        abortPolling()
        if (jobId === job.id) {
          setPhase('idle')
          setBusy(false)
          setResultUrl(null)
          setAttachMsg(data.message || 'Job stopped. Credit refunded.')
        }
        void loadRecentJobs(true)
      } catch (e: unknown) {
        setError(
          (e as { response?: { data?: { error?: string } } })?.response?.data?.error ||
            'Could not stop this job',
        )
      } finally {
        setActionJobId(null)
      }
    },
    [jobId, abortPolling, loadRecentJobs],
  )

  const handleDeleteRecentJob = useCallback(
    async (job: EnhancedRecentJob) => {
      const title =
        job.barcode_stem ||
        job.download_filename?.replace(/\.[^.]+$/, '') ||
        `Job #${job.id}`
      const pending = ['batch_queued', 'batch_processing', 'processing', 'pending'].includes(job.status)
      if (
        !window.confirm(
          pending
            ? `Remove "${title}"?\n\nThis will stop processing, refund your credit, and remove the image from your list and ZIP download.`
            : `Delete "${title}"?\n\nIt will be removed from your list and excluded from Download all (ZIP). Product attachments already saved stay on the product.`,
        )
      ) {
        return
      }
      setActionJobId(job.id)
      setError('')
      try {
        const data = await deleteEnhancedJob(job.id)
        if (typeof data.credits === 'number') setCredits(data.credits)
        clearActivePreviewIfJob(job.id)
        void loadRecentJobs(true)
        setAttachMsg('Removed from your studio jobs.')
      } catch (e: unknown) {
        setError(
          (e as { response?: { data?: { error?: string } } })?.response?.data?.error ||
            'Could not delete this job',
        )
      } finally {
        setActionJobId(null)
      }
    },
    [clearActivePreviewIfJob, loadRecentJobs],
  )

  const runGenerate = async () => {
    if (!sourceFile) {
      setError('Take or choose a product photo first.')
      return
    }
    if (credits < 1) {
      setShowTopup(true)
      setError('No credits remaining. Top up to continue.')
      return
    }
    setBusy(true)
    setError('')
    setAttachMsg('')
    setPhase('preparing')
    setProgress(12)
    const tick = window.setInterval(() => {
      setProgress((p) => (p >= 88 ? p : p + Math.random() * 8))
    }, 900)
    let queuedBatch = false
    try {
      const data = await generateEnhancedPicture({
        image: sourceFile,
        templateKey,
        varietyKey: activeVariety?.variety_key || varietyKey || undefined,
        barcodeStem: normalizeStem(barcodeStem) || undefined,
        photoType,
        aspectRatio,
        canvasText: includeCanvasText ? canvasText.trim() : undefined,
        generationMode: economyBatchMode && geminiBatchAllowed ? 'batch' : 'fast',
        backgroundPreset: generationOptions.backgroundPreset,
        visualization: generationOptions.visualization,
        applyWatermark: generationOptions.applyWatermark,
        applyInfoText: generationOptions.applyInfoText,
      })
      if (typeof data.credits === 'number') setCredits(data.credits)

      if (data.async && data.job?.id) {
        queuedBatch = true
        setJobId(data.job.id)
        const isEconomyBatch =
          data.job.generation_mode === 'batch' || !!data.batch?.name || !!data.batch?.state
        setBatchMessage(
          data.message ||
            (isEconomyBatch
              ? 'Queued in Gemini Batch (~50% cost). Usually ready within a few minutes.'
              : 'Crafting studio quality photo… Usually ready in 30–90 seconds.'),
        )
        setBatchState(data.batch?.state || data.job.batch_state || data.job.status || 'processing')
        setPhase(isEconomyBatch ? 'batch' : 'preparing')
        setProgress(isEconomyBatch ? 22 : 18)
        void loadRecentJobs(true)
        void pollBatchJob(data.job.id, isEconomyBatch)
        return
      }

      setResultUrl(data.result_image_url || data.job?.result_image_url || null)
      setJobId(data.job?.id ?? null)
      setDownloadName(data.download_filename || suggestedFilename || 'studio-shot.webp')
      if (data.attach?.attached) {
        setAttachMsg(`Attached to ${data.attach.sku} (${data.attach.status}).`)
      } else if (normalizeStem(barcodeStem)) {
        setAttachMsg(data.attach?.reason || 'Generated. Tap Attach to product if needed.')
      } else {
        setAttachMsg('Generated. Rename with barcode, then attach or download.')
      }
      setPhase('done')
      setProgress(100)
      void loadRecentJobs(true)
      const h = await fetchBarcodeHints().catch(() => null)
      if (h) setHints(h)
    } catch (e: unknown) {
      setPhase('idle')
      const err = e as {
        response?: { status?: number; data?: { error?: string; credits?: number } }
        message?: string
        code?: string
      }
      const status = err?.response
      const isTimeout =
        err?.code === 'ECONNABORTED' ||
        err?.message === 'Network Error' ||
        /timeout|network error/i.test(err?.message || '')

      if (isTimeout) {
        for (let attempt = 0; attempt < 30; attempt += 1) {
          await new Promise((r) => setTimeout(r, 3000))
          try {
            const list = await fetchEnhancedJobs(8)
            const fresh = list.find(
              (j) =>
                j.status === 'completed' &&
                j.result_image_url &&
                Date.now() - new Date(j.created_at).getTime() < 8 * 60 * 1000,
            )
            if (fresh) {
              setResultUrl(fresh.result_image_url || null)
              setJobId(fresh.id)
              setDownloadName(fresh.download_filename || suggestedFilename || 'studio-shot.webp')
              setPhase('done')
              setProgress(100)
              setError('')
              setAttachMsg(
                'Studio shot finished — the connection timed out while waiting, but your image is ready below.',
              )
              setBusy(false)
              void loadRecentJobs(true)
              return
            }
            const processing = list.find(
              (j) =>
                j.status === 'processing' &&
                Date.now() - new Date(j.created_at).getTime() < 8 * 60 * 1000,
            )
            if (processing?.id) {
              setJobId(processing.id)
              setPhase('preparing')
              setAttachMsg('Still generating in the background…')
              void pollBatchJob(processing.id, false)
              setBusy(false)
              return
            }
          } catch {
            /* retry */
          }
        }
      }

      if (status?.status === 402) {
        setCredits(0)
        setShowTopup(true)
      }
      setError(status?.data?.error || err?.message || 'Generation failed')
    } finally {
      window.clearInterval(tick)
      if (!queuedBatch) setBusy(false)
    }
  }

  const runAttach = async () => {
    if (!jobId) return
    const stem = normalizeStem(barcodeStem)
    if (!stem) {
      setError('Enter the barcode / filename stem (e.g. ganesh-ganesh-sfidol008).')
      return
    }
    setBusy(true)
    setError('')
    try {
      const data = await attachEnhancedPicture({
        jobId,
        barcodeStem: stem,
        photoType,
        mrpRateBehindBox: showMrpField && mrpRateBehindBox.trim() ? mrpRateBehindBox.trim() : undefined,
      })
      setDownloadName(data.download_filename || suggestedFilename)
      setAttachMsg(
        data.attach?.attached
          ? `Attached to ${data.attach.sku}.`
          : data.attach?.reason || 'Could not attach',
      )
      void loadRecentJobs(true)
      const h = await fetchBarcodeHints().catch(() => null)
      if (h) setHints(h)
    } catch (e: unknown) {
      setError(
        (e as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Attach failed',
      )
    } finally {
      setBusy(false)
    }
  }

  const downloadResult = async () => {
    if (!resultUrl) return
    try {
      const res = await fetch(resultUrl)
      const blob = await res.blob()
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = downloadName || suggestedFilename || 'studio-shot.webp'
      a.click()
      URL.revokeObjectURL(a.href)
    } catch {
      window.open(resultUrl, '_blank')
    }
  }

  const downloadZip = () => {
    window.location.href = enhancedPicturesZipUrl()
  }

  const payWithRazorpay = async (plan: EnhancedCreditPlan) => {
    if (!plan.id) return
    setBusy(true)
    setError('')
    try {
      const ok = await loadRazorpay()
      const Razorpay = getRazorpay()
      if (!ok || !Razorpay) {
        setError('Could not load Razorpay checkout')
        return
      }
      const order = await createEnhancedTopupOrder(plan.id)
      await new Promise<void>((resolve, reject) => {
        const rzp = new Razorpay({
          key: order.key_id,
          amount: order.amount,
          currency: order.currency,
          name: 'Enhanced Pictures',
          description: `${order.plan.name} · ${order.plan.credits} credits`,
          order_id: order.razorpay_order_id,
          handler: async (response: {
            razorpay_order_id: string
            razorpay_payment_id: string
            razorpay_signature: string
          }) => {
            try {
              const verified = await verifyEnhancedTopup({
                planId: plan.id!,
                razorpay_order_id: response.razorpay_order_id,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_signature: response.razorpay_signature,
              })
              setCredits(verified.credits)
              setShowTopup(false)
              setAttachMsg(`Added ${verified.added} credits. Balance: ${verified.credits}.`)
              resolve()
            } catch (err) {
              reject(err)
            }
          },
          modal: { ondismiss: () => resolve() },
        })
        rzp.open()
      })
    } catch (e: unknown) {
      setError(
        (e as { response?: { data?: { error?: string } } })?.response?.data?.error ||
          'Payment failed',
      )
    } finally {
      setBusy(false)
    }
  }

  if (!authReady || !tierReady) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center text-[var(--color-jewelry-black,#1a1814)]/60">
        Loading…
      </div>
    )
  }

  if (!auth.isAuthenticated) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <p className="text-[var(--color-jewelry-black,#1a1814)]">Sign in to use Enhanced Pictures.</p>
        <Link href={PROFILE_PATH} className="mt-4 inline-block text-sm font-medium text-[var(--kc-accent,#c41e3a)]">
          Go to profile
        </Link>
      </div>
    )
  }

  if (customerTier !== CUSTOMER_TIER.RESELLER || !subscriptionOn) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <Sparkles className="mx-auto size-12 text-[var(--color-jewelry-black,#1a1814)]/25" />
        <h1 className="mt-4 text-xl font-semibold text-[var(--color-jewelry-black,#1a1814)]">
          Enhanced Pictures not enabled
        </h1>
        <p className="mt-2 text-sm text-[var(--color-jewelry-black,#1a1814)]/65">
          Ask KC admin to turn on Enhanced Picture subscription for your reseller account.
        </p>
        <Link href={PROFILE_PATH} className="mt-6 inline-block text-sm font-medium text-[var(--kc-accent,#c41e3a)]">
          Back to profile
        </Link>
      </div>
    )
  }

  if (bootstrapReady && !enabled) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <Sparkles className="mx-auto size-12 text-[var(--color-jewelry-black,#1a1814)]/25" />
        <h1 className="mt-4 text-xl font-semibold text-[var(--color-jewelry-black,#1a1814)]">
          Enhanced Pictures not enabled
        </h1>
        <p className="mt-2 text-sm text-[var(--color-jewelry-black,#1a1814)]/65">
          Ask KC admin to turn on Enhanced Picture subscription for your reseller account.
        </p>
        <Link href={PROFILE_PATH} className="mt-6 inline-block text-sm font-medium text-[var(--kc-accent,#c41e3a)]">
          Back to profile
        </Link>
      </div>
    )
  }

  const pageShell = (
    <div className="kc-reseller-upload-panel min-h-screen bg-[var(--color-slate-950,#faf8f4)] pb-[var(--kc-mobile-nav-stack,5rem)] md:pb-12">
      <div className="border-b border-[var(--color-slate-700,#e8e4df)] bg-white/95 backdrop-blur-sm">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-4">
          <Link
            href={PROFILE_PATH}
            className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-[var(--color-slate-700,#e8e4df)] text-[var(--color-jewelry-black,#1a1814)] transition hover:bg-[var(--color-slate-900,#f7f4ef)]"
            aria-label="Back to profile"
          >
            <ArrowLeft className="size-5" />
          </Link>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--kc-accent,#c41e3a)]">
              Design studio
            </p>
            <h1 className="truncate text-lg font-semibold text-[var(--color-jewelry-black,#1a1814)]">
              Enhanced pictures
            </h1>
            {activePromptName ? (
              <p className="truncate text-xs text-[var(--color-jewelry-black,#1a1814)]/55">
                Active prompt: {activePromptName}
              </p>
            ) : null}
            {aiModelLabel ? (
              <p className="truncate text-[11px] text-[var(--color-jewelry-black,#1a1814)]/45">
                AI: {aiModelLabel}
              </p>
            ) : null}
          </div>
          <div className="shrink-0 text-right">
            <p className="inline-flex items-center gap-1.5 rounded-full bg-[var(--color-slate-900,#f7f4ef)] px-3 py-1.5 text-xs font-bold text-[var(--color-jewelry-black,#1a1814)]">
              <Coins className="size-3.5 text-[var(--kc-accent,#c41e3a)]" />
              {credits} credit{credits === 1 ? '' : 's'}
            </p>
            {credits < 1 ? (
              <button
                type="button"
                onClick={() => setShowTopup(true)}
                className="mt-1 block w-full text-[11px] font-semibold text-[var(--kc-accent,#c41e3a)]"
              >
                Recharge credits
              </button>
            ) : null}
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-3xl space-y-5 px-4 py-5">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={downloadZip}
            disabled={bootstrapLoading}
            className="inline-flex min-h-[40px] items-center gap-2 rounded-xl border border-[var(--color-slate-700,#e8e4df)] bg-white px-3 text-sm font-semibold text-[var(--color-jewelry-black,#1a1814)] disabled:opacity-60"
          >
            <Archive className="size-4" />
            Download all (ZIP)
          </button>
          <button
            type="button"
            onClick={() => setShowTopup(true)}
            disabled={bootstrapLoading}
            className="inline-flex min-h-[40px] items-center gap-2 rounded-xl border border-[var(--color-slate-700,#e8e4df)] bg-white px-3 text-sm font-semibold text-[var(--color-jewelry-black,#1a1814)] disabled:opacity-60"
          >
            Top up
          </button>
        </div>

        {bootstrapLoading ? (
          <div className="space-y-4" aria-hidden>
            <div className="h-44 animate-pulse rounded-2xl border border-[var(--color-slate-700,#e8e4df)] bg-white" />
            <div className="h-28 animate-pulse rounded-2xl border border-[var(--color-slate-700,#e8e4df)] bg-white" />
            <div className="h-72 animate-pulse rounded-2xl border border-[var(--color-slate-700,#e8e4df)] bg-white" />
            <p className="text-center text-sm text-[var(--color-jewelry-black,#1a1814)]/50">Loading studio…</p>
          </div>
        ) : (
          <>
        <EnhancedRecentJobsPanel
          jobs={recentJobs}
          loading={jobsLoading}
          refreshing={jobsRefreshing}
          activeJobId={jobId}
          actionJobId={actionJobId}
          templateLabels={templateLabels}
          onRefresh={() => void loadRecentJobs(true)}
          onSelect={handleSelectRecentJob}
          onCancel={(job) => void handleCancelRecentJob(job)}
          onDelete={(job) => void handleDeleteRecentJob(job)}
        />

        <section>
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[var(--color-jewelry-black,#1a1814)]/50">
            01 · Template
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            {(templates.length ? templates : [{ key: 'idols', label: 'Idols / Frames', description: '' }]).map(
              (t) => (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => {
                    setTemplateKey(t.key)
                    setVarietyKey(null)
                  }}
                  className={`rounded-2xl border px-4 py-3 text-left transition ${
                    templateKey === t.key
                      ? 'border-[var(--kc-accent,#c41e3a)] bg-[var(--kc-accent,#c41e3a)]/8 shadow-sm'
                      : 'border-[var(--color-slate-700,#e8e4df)] bg-white'
                  }`}
                >
                  <p className="text-sm font-semibold text-[var(--color-jewelry-black,#1a1814)]">
                    {t.label}
                  </p>
                  {t.description ? (
                    <p className="mt-0.5 text-xs text-[var(--color-jewelry-black,#1a1814)]/55">
                      {t.description}
                    </p>
                  ) : null}
                </button>
              ),
            )}
          </div>
          {(activeTemplate?.varieties?.length ?? 0) > 0 ? (
            <div className="mt-3">
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-[var(--color-jewelry-black,#1a1814)]/45">
                Sub-template
              </p>
              <div className="flex flex-wrap gap-2">
                {activeTemplate!.varieties!.map((v) => (
                  <button
                    key={v.variety_key}
                    type="button"
                    onClick={() => setVarietyKey(v.variety_key)}
                    className={`min-h-[40px] rounded-xl px-3 py-2 text-left text-sm font-semibold transition ${
                      (varietyKey || activeVariety?.variety_key) === v.variety_key
                        ? 'bg-[var(--kc-accent,#c41e3a)] text-white'
                        : 'border border-[var(--color-slate-700,#e8e4df)] bg-white text-[var(--color-jewelry-black,#1a1814)]'
                    }`}
                  >
                    {v.variety_label}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </section>

        {activeTemplate?.showcase ? (
          <section>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[var(--color-jewelry-black,#1a1814)]/50">
              Sample cinematic design
            </p>
            <EnhancedTemplateShowcase
              data={activeTemplate.showcase}
              sampleImageUrl={showcaseSampleUrl}
              resultImageUrl={showcaseResultUrl}
              compact
            />
          </section>
        ) : null}

        <CanvasAspectPicker value={aspectRatio} onChange={setAspectRatio} label="02 · Canvas aspect" />

        <section>
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[var(--color-jewelry-black,#1a1814)]/50">
            03 · Style & branding
          </p>
          <EnhancedStudioOptions
            overlaySettings={overlaySettings}
            onOverlayChange={setOverlaySettings}
            generationOptions={generationOptions}
            onGenerationChange={setGenerationOptions}
            previewImageUrl={showcaseResultUrl || sourcePreview}
            previewLines={previewOverlayLines}
            onStatus={setAttachMsg}
          />
        </section>

        <section>
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[var(--color-jewelry-black,#1a1814)]/50">
            04 · Import asset
          </p>
          <div className="rounded-2xl border border-[var(--color-slate-700,#e8e4df)] bg-white p-4">
            <PhotoImportControls
              previewUrl={sourcePreview}
              onPick={onPick}
              emptyLabel="Take or upload office / stock photo"
            />
          </div>
        </section>

        <section className="rounded-2xl border border-[var(--color-slate-700,#e8e4df)] bg-white p-4">
          <label className="flex cursor-pointer items-start gap-3">
            <input
              type="checkbox"
              checked={includeCanvasText}
              onChange={(e) => setIncludeCanvasText(e.target.checked)}
              className="mt-1 size-4 rounded border-[var(--color-slate-700,#e8e4df)]"
            />
            <span>
              <span className="block text-sm font-semibold text-[var(--color-jewelry-black,#1a1814)]">
                Add text bottom of the visual canvas
              </span>
              <span className="mt-0.5 block text-xs text-[var(--color-jewelry-black,#1a1814)]/55">
                Optional — e.g. GANESH-SFIDOL001 under the photo
              </span>
            </span>
          </label>
          {includeCanvasText ? (
            <input
              value={canvasText}
              onChange={(e) => setCanvasText(e.target.value)}
              placeholder="e.g. GANESH-SFIDOL001"
              className="mt-3 w-full rounded-xl border border-[var(--color-slate-700,#e8e4df)] bg-[var(--color-slate-900,#f7f4ef)] px-3 py-3 text-sm text-[var(--color-jewelry-black,#1a1814)] outline-none focus:border-[var(--kc-accent,#c41e3a)]"
            />
          ) : null}
        </section>

        <section>
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[var(--color-jewelry-black,#1a1814)]/50">
            05 · Rename to barcode
          </p>
          <div className="rounded-2xl border border-[var(--color-slate-700,#e8e4df)] bg-white p-4">
            <div className="mb-3 flex gap-2">
              {(['front', 'back'] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setPhotoType(t)}
                  className={`min-h-[40px] flex-1 rounded-xl text-sm font-semibold capitalize ${
                    photoType === t
                      ? 'bg-[var(--kc-accent,#c41e3a)] text-white'
                      : 'bg-[var(--color-slate-900,#f7f4ef)] text-[var(--color-jewelry-black,#1a1814)]'
                  }`}
                >
                  {t} photo
                </button>
              ))}
            </div>
            <label className="block">
              <span className="text-xs font-medium text-[var(--color-jewelry-black,#1a1814)]/60">
                Search product (SKU, barcode, or item code e.g. SFIDOL009-001)
              </span>
              <input
                value={barcodeStem}
                onChange={(e) => setBarcodeStem(e.target.value)}
                placeholder="e.g. SFIDOL009-001 or ganesh-ganesh-sfidol008"
                className="mt-1.5 w-full rounded-xl border border-[var(--color-slate-700,#e8e4df)] bg-[var(--color-slate-900,#f7f4ef)] px-3 py-3 font-mono text-sm text-[var(--color-jewelry-black,#1a1814)] outline-none focus:border-[var(--kc-accent,#c41e3a)]"
              />
            </label>
            {lookupLabel ? (
              <p className="mt-2 text-xs font-medium text-emerald-700">
                Matched: {lookupLabel}
              </p>
            ) : null}
            {showMrpField ? (
              <label className="mt-3 block">
                <span className="text-xs font-medium text-[var(--color-jewelry-black,#1a1814)]/60">
                  MRP rate (behind box) — ₹
                </span>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={mrpRateBehindBox}
                  onChange={(e) => setMrpRateBehindBox(e.target.value)}
                  placeholder="Enter MRP printed on box"
                  className="mt-1.5 w-full rounded-xl border border-[var(--color-slate-700,#e8e4df)] bg-[var(--color-slate-900,#f7f4ef)] px-3 py-3 text-sm text-[var(--color-jewelry-black,#1a1814)] outline-none focus:border-[var(--kc-accent,#c41e3a)]"
                />
                <span className="mt-1 block text-[10px] text-[var(--color-jewelry-black,#1a1814)]/45">
                  Your Excel batch includes this column but values were empty — enter here when attaching the photo.
                </span>
              </label>
            ) : null}
            {suggestedFilename ? (
              <p className="mt-2 text-xs text-[var(--color-jewelry-black,#1a1814)]/55">
                Will save / attach as{' '}
                <code className="rounded bg-[var(--color-slate-900,#f7f4ef)] px-1.5 py-0.5 font-mono text-[11px]">
                  {suggestedFilename}
                </code>
              </p>
            ) : null}
            {hints.length > 0 ? (
              <div className="mt-3 max-h-40 overflow-y-auto rounded-xl border border-[var(--color-slate-700,#e8e4df)]">
                {hints.slice(0, 40).map((h) => (
                  <button
                    key={h.id}
                    type="button"
                    onClick={() => {
                      setBarcodeStem(h.stem || h.product_name || h.item_code || h.web_product_sku || '')
                      setShowMrpField(!!h.show_mrp_field)
                      if (h.mrp_rate_behind_box != null) setMrpRateBehindBox(String(h.mrp_rate_behind_box))
                      if (!includeCanvasText) {
                        /* keep optional */
                      } else if (!canvasText.trim()) {
                        setCanvasText(String(h.barcode || h.web_product_sku || h.product_name || h.stem).toUpperCase())
                      }
                    }}
                    className="flex w-full items-center justify-between gap-2 border-b border-[var(--color-slate-700,#e8e4df)] px-3 py-2 text-left last:border-0 hover:bg-[var(--color-slate-900,#f7f4ef)]"
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-mono text-xs font-semibold text-[var(--color-jewelry-black,#1a1814)]">
                        {h.product_name || h.item_code || h.barcode || h.web_product_sku || h.stem}
                      </span>
                      <span className="block truncate text-[10px] text-[var(--color-jewelry-black,#1a1814)]/45">
                        {photoType === 'back' ? h.back_filename : h.front_filename}
                      </span>
                    </span>
                    {(photoType === 'front' ? h.has_front : h.has_back) ? (
                      <Check className="size-4 shrink-0 text-emerald-600" />
                    ) : (
                      <Package className="size-4 shrink-0 text-[var(--color-jewelry-black,#1a1814)]/25" />
                    )}
                  </button>
                ))}
              </div>
            ) : (
              <p className="mt-3 text-xs text-[var(--color-jewelry-black,#1a1814)]/50">
                Tip: upload your Excel batch in{' '}
                <Link href={RESELLER_PRODUCTS_PATH} className="font-medium text-[var(--kc-accent,#c41e3a)]">
                  Upload products
                </Link>{' '}
                first so barcodes appear here.
              </p>
            )}
          </div>
        </section>

        {phase === 'preparing' || phase === 'batch' ? (
          <div className="rounded-2xl border border-[var(--color-slate-700,#e8e4df)] bg-white px-5 py-8 text-center">
            <Sparkles className="mx-auto size-8 text-[var(--kc-accent,#c41e3a)]" />
            <p className="mt-3 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--kc-accent,#c41e3a)]">
              {phase === 'batch' ? 'Batch queue · 50% savings' : 'Preparing…'}
            </p>
            <p className="mt-1 text-lg font-semibold text-[var(--color-jewelry-black,#1a1814)]">
              {phase === 'batch'
                ? 'Crafting studio quality photo (economy queue)'
                : 'Crafting studio quality photo…'}
            </p>
            {phase === 'batch' ? (
              <p className="mx-auto mt-2 max-w-md text-sm text-[var(--color-jewelry-black,#1a1814)]/60">
                {batchMessage ||
                  'Economy batch mode — usually a few minutes. Use Fast mode next time for ~30–90 second results.'}
              </p>
            ) : (
              <p className="mx-auto mt-2 max-w-md text-sm text-[var(--color-jewelry-black,#1a1814)]/60">
                Fast mode — your studio shot usually appears in 30–90 seconds.
              </p>
            )}
            {batchState ? (
              <p className="mt-2 font-mono text-[11px] text-[var(--color-jewelry-black,#1a1814)]/45">
                Status: {formatBatchStateLabel(batchState) || 'pending'}
              </p>
            ) : null}
            <div className="mx-auto mt-5 h-2 max-w-xs overflow-hidden rounded-full bg-[var(--color-slate-900,#f7f4ef)]">
              <div
                className="h-full rounded-full bg-[var(--kc-accent,#c41e3a)] transition-all duration-500"
                style={{ width: `${Math.min(100, Math.round(progress))}%` }}
              />
            </div>
          </div>
        ) : null}

        {resultUrl && phase !== 'preparing' && phase !== 'batch' ? (
          <section
            id="studio-preview"
            className="rounded-2xl border border-[var(--color-slate-700,#e8e4df)] bg-white p-4"
          >
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[var(--color-jewelry-black,#1a1814)]/50">
              Studio preview
            </p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={resultUrl}
              alt="Studio result"
              className="mx-auto max-h-[420px] w-full rounded-xl object-contain"
            />
            {attachMsg ? (
              <p className="mt-3 rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{attachMsg}</p>
            ) : null}
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void downloadResult()}
                className="inline-flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-xl border border-[var(--color-slate-700,#e8e4df)] px-4 text-sm font-semibold text-[var(--color-jewelry-black,#1a1814)] sm:flex-none"
              >
                <Download className="size-4" />
                Download
              </button>
              <button
                type="button"
                disabled={busy || !jobId}
                onClick={() => void runAttach()}
                className="inline-flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 text-sm font-semibold text-white disabled:opacity-50 sm:flex-none"
              >
                Attach to product
              </button>
            </div>
          </section>
        ) : null}

        {error ? (
          <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
            {error}
          </p>
        ) : null}

        {geminiBatchAllowed ? (
          <div className="rounded-2xl border border-[var(--color-slate-700,#e8e4df)] bg-white px-4 py-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-[var(--color-jewelry-black,#1a1814)]">
                  {economyBatchMode ? 'Economy batch' : 'Fast mode'}
                </p>
                <p className="mt-0.5 text-xs text-[var(--color-jewelry-black,#1a1814)]/55">
                  {economyBatchMode
                    ? 'Slower queue · ~50% lower AI cost · usually a few minutes'
                    : 'Recommended · result in ~30–90 seconds'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => toggleEconomyBatchMode(!economyBatchMode)}
                className={`min-h-[40px] shrink-0 rounded-xl px-4 text-xs font-bold uppercase tracking-wide transition ${
                  economyBatchMode
                    ? 'border border-amber-200 bg-amber-50 text-amber-900'
                    : 'border border-emerald-200 bg-emerald-50 text-emerald-800'
                }`}
              >
                {economyBatchMode ? 'Switch to fast' : 'Use economy batch'}
              </button>
            </div>
          </div>
        ) : null}

        <button
          type="button"
          disabled={busy || !sourceFile || credits < 1 || phase === 'batch'}
          onClick={() => void runGenerate()}
          className="kc-btn-theme flex w-full min-h-[52px] items-center justify-center gap-2 rounded-2xl text-base font-semibold disabled:opacity-50"
        >
          {busy && (phase === 'preparing' || phase === 'batch') ? (
            <Loader2 className="size-5 animate-spin" />
          ) : (
            <Sparkles className="size-5" />
          )}
          Generate studio shot · 1 credit{economyBatchMode && geminiBatchAllowed ? ' · economy' : ' · fast'}
        </button>
        {credits < 1 ? (
          <button
            type="button"
            onClick={() => setShowTopup(true)}
            className="w-full rounded-2xl bg-amber-500 px-4 py-3 text-sm font-bold text-white"
          >
            Recharge credits
          </button>
        ) : null}
          </>
        )}
      </div>

      {showTopup ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center">
          <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-5 shadow-xl">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-[var(--color-jewelry-black,#1a1814)]">
                  Recharge credits
                </h2>
                <p className="text-sm text-[var(--color-jewelry-black,#1a1814)]/55">
                  Balance: {credits} · 1 credit = 1 image
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowTopup(false)}
                className="text-sm font-medium text-[var(--color-jewelry-black,#1a1814)]/60"
              >
                Close
              </button>
            </div>
            <div className="space-y-2">
              {plans.map((p) => (
                <div
                  key={p.id || p.name}
                  className="rounded-xl border border-[var(--color-slate-700,#e8e4df)] px-3 py-3"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <p className="font-semibold text-[var(--color-jewelry-black,#1a1814)]">{p.name}</p>
                      <p className="text-xs text-[var(--color-jewelry-black,#1a1814)]/55">
                        {p.credits} credits · ₹{Number(p.price_inr).toLocaleString('en-IN')}
                      </p>
                    </div>
                    {razorpayEnabled ? (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void payWithRazorpay(p)}
                        className="rounded-lg bg-[var(--kc-accent,#c41e3a)] px-3 py-2 text-xs font-bold text-white disabled:opacity-50"
                      >
                        Pay
                      </button>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
            {(paymentQrUrl || bankDetails) && (
              <div className="mt-4 rounded-xl border border-[var(--color-slate-700,#e8e4df)] bg-[var(--color-slate-900,#f7f4ef)] p-3">
                <p className="text-sm font-semibold text-[var(--color-jewelry-black,#1a1814)]">
                  Pay via UPI / bank
                </p>
                <p className="mt-1 text-xs text-[var(--color-jewelry-black,#1a1814)]/60">
                  After payment, KC admin will add your credits.
                </p>
                {paymentQrUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={paymentQrUrl} alt="Payment QR" className="mx-auto mt-3 max-h-48 rounded-lg" />
                ) : null}
                {bankDetails ? (
                  <pre className="mt-3 whitespace-pre-wrap text-xs text-[var(--color-jewelry-black,#1a1814)]">
                    {bankDetails}
                  </pre>
                ) : null}
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  )

  return pageShell
}

'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  ArrowLeft,
  Check,
  Download,
  ImagePlus,
  Loader2,
  Sparkles,
  Package,
} from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { useCustomerTier } from '@/context/CustomerTierContext'
import { CUSTOMER_TIER } from '@/lib/customer-tier'
import {
  CATALOG_PATH,
  PROFILE_PATH,
  RESELLER_PRODUCTS_PATH,
} from '@/lib/routes'
import {
  attachEnhancedPicture,
  fetchBarcodeHints,
  fetchEnhancedStatus,
  generateEnhancedPicture,
  type EnhancedBarcodeHint,
  type EnhancedPictureTemplate,
} from '@/lib/reseller-enhanced-pictures'

function normalizeStem(raw: string) {
  return String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/_+/g, '-')
}

export default function ResellerEnhancedPicturesPageClient() {
  const auth = useAuth()
  const { customerTier, tierReady } = useCustomerTier()

  const [enabled, setEnabled] = useState(false)
  const [templates, setTemplates] = useState<EnhancedPictureTemplate[]>([])
  const [activePromptName, setActivePromptName] = useState<string | null>(null)
  const [hints, setHints] = useState<EnhancedBarcodeHint[]>([])
  const [statusLoading, setStatusLoading] = useState(true)
  const [templateKey, setTemplateKey] = useState('idols')
  const [photoType, setPhotoType] = useState<'front' | 'back'>('front')
  const [barcodeStem, setBarcodeStem] = useState('')
  const [sourceFile, setSourceFile] = useState<File | null>(null)
  const [sourcePreview, setSourcePreview] = useState<string | null>(null)
  const [resultUrl, setResultUrl] = useState<string | null>(null)
  const [jobId, setJobId] = useState<number | null>(null)
  const [downloadName, setDownloadName] = useState('')
  const [attachMsg, setAttachMsg] = useState('')
  const [busy, setBusy] = useState(false)
  const [phase, setPhase] = useState<'idle' | 'preparing' | 'done'>('idle')
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState('')

  const authReady = auth.hasChecked === true
  const subscriptionOn = Boolean(
    auth.isAuthenticated &&
      customerTier === CUSTOMER_TIER.RESELLER &&
      (auth.user as { reseller_enhanced_pictures_enabled?: boolean })
        ?.reseller_enhanced_pictures_enabled,
  )

  const load = useCallback(async () => {
    if (!auth.isAuthenticated || customerTier !== CUSTOMER_TIER.RESELLER) {
      setStatusLoading(false)
      return
    }
    setStatusLoading(true)
    try {
      const status = await fetchEnhancedStatus()
      setEnabled(status.enabled)
      setTemplates(status.templates || [])
      setActivePromptName(status.active_prompt?.name || null)
      if (status.templates?.[0]?.key) setTemplateKey(status.templates[0].key)
      if (status.enabled) {
        try {
          const h = await fetchBarcodeHints()
          setHints(h)
        } catch {
          setHints([])
        }
      }
    } catch (e: unknown) {
      setError(
        (e as { response?: { data?: { error?: string } } })?.response?.data?.error ||
          'Could not load Enhanced Pictures',
      )
    } finally {
      setStatusLoading(false)
    }
  }, [auth.isAuthenticated, customerTier])

  useEffect(() => {
    if (authReady && tierReady) void load()
  }, [authReady, tierReady, load])

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

  const runGenerate = async () => {
    if (!sourceFile) {
      setError('Take or choose a product photo first.')
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
    try {
      const data = await generateEnhancedPicture({
        image: sourceFile,
        templateKey,
        barcodeStem: normalizeStem(barcodeStem) || undefined,
        photoType,
      })
      setResultUrl(data.result_image_url)
      setJobId(data.job?.id ?? null)
      setDownloadName(data.download_filename || suggestedFilename || 'studio-shot.webp')
      if (data.attach?.attached) {
        setAttachMsg(
          `Attached to ${data.attach.sku} (${data.attach.status}) — appears in Upload products.`,
        )
      } else if (normalizeStem(barcodeStem)) {
        setAttachMsg(
          data.attach?.reason ||
            'Generated. Enter the exact barcode stem and tap Attach to product.',
        )
      } else {
        setAttachMsg('Generated. Rename with the product barcode, then attach or download.')
      }
      setPhase('done')
      setProgress(100)
      const h = await fetchBarcodeHints().catch(() => null)
      if (h) setHints(h)
    } catch (e: unknown) {
      setPhase('idle')
      setError(
        (e as { response?: { data?: { error?: string } }; message?: string })?.response?.data
          ?.error ||
          (e as { message?: string })?.message ||
          'Generation failed',
      )
    } finally {
      window.clearInterval(tick)
      setBusy(false)
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
      })
      setDownloadName(data.download_filename || suggestedFilename)
      setAttachMsg(
        data.attach?.attached
          ? `Attached to ${data.attach.sku} — open Upload products to confirm.`
          : data.attach?.reason || 'Could not attach',
      )
      const h = await fetchBarcodeHints().catch(() => null)
      if (h) setHints(h)
    } catch (e: unknown) {
      setError(
        (e as { response?: { data?: { error?: string } } })?.response?.data?.error ||
          'Attach failed',
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

  if (!authReady || !tierReady || statusLoading) {
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

  if (customerTier !== CUSTOMER_TIER.RESELLER || !subscriptionOn || !enabled) {
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

  return (
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
          <div className="min-w-0">
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
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-3xl space-y-5 px-4 py-5">
        {/* Template */}
        <section>
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[var(--color-jewelry-black,#1a1814)]/45">
            01 · Template
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            {(templates.length ? templates : [{ key: 'idols', label: 'Idols / Frames', description: '' }]).map(
              (t) => (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setTemplateKey(t.key)}
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
        </section>

        {/* Import */}
        <section>
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[var(--color-jewelry-black,#1a1814)]/45">
            02 · Import asset
          </p>
          <label className="flex cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed border-[var(--color-slate-700,#e8e4df)] bg-white px-4 py-8 text-center transition hover:border-[var(--kc-accent,#c41e3a)]/50">
            {sourcePreview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={sourcePreview}
                alt="Source"
                className="mb-3 max-h-56 w-auto rounded-xl object-contain"
              />
            ) : (
              <ImagePlus className="mb-3 size-10 text-[var(--color-jewelry-black,#1a1814)]/25" />
            )}
            <span className="text-sm font-medium text-[var(--color-jewelry-black,#1a1814)]">
              {sourceFile ? 'Change photo' : 'Tap to upload office / stock photo'}
            </span>
            <span className="mt-1 text-xs text-[var(--color-jewelry-black,#1a1814)]/50">
              JPEG, PNG or WEBP · max 12 MB
            </span>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              capture="environment"
              className="sr-only"
              onChange={(e) => onPick(e.target.files?.[0] || null)}
            />
          </label>
        </section>

        {/* Barcode rename */}
        <section>
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[var(--color-jewelry-black,#1a1814)]/45">
            03 · Rename to barcode
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
                Filename stem (matches Excel upload)
              </span>
              <input
                value={barcodeStem}
                onChange={(e) => setBarcodeStem(e.target.value)}
                placeholder="e.g. ganesh-ganesh-sfidol008"
                className="mt-1.5 w-full rounded-xl border border-[var(--color-slate-700,#e8e4df)] bg-[var(--color-slate-900,#f7f4ef)] px-3 py-3 font-mono text-sm text-[var(--color-jewelry-black,#1a1814)] outline-none focus:border-[var(--kc-accent,#c41e3a)]"
              />
            </label>
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
                    onClick={() => setBarcodeStem(h.stem)}
                    className="flex w-full items-center justify-between gap-2 border-b border-[var(--color-slate-700,#e8e4df)] px-3 py-2 text-left last:border-0 hover:bg-[var(--color-slate-900,#f7f4ef)]"
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-mono text-xs font-semibold text-[var(--color-jewelry-black,#1a1814)]">
                        {h.barcode || h.web_product_sku || h.stem}
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
                first so barcodes appear here for one-tap rename.
              </p>
            )}
          </div>
        </section>

        {phase === 'preparing' ? (
          <div className="rounded-2xl border border-[var(--color-slate-700,#e8e4df)] bg-white px-5 py-8 text-center">
            <Sparkles className="mx-auto size-8 text-[var(--kc-accent,#c41e3a)]" />
            <p className="mt-3 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--kc-accent,#c41e3a)]">
              Preparing…
            </p>
            <p className="mt-1 text-lg font-semibold text-[var(--color-jewelry-black,#1a1814)]">
              Crafting studio quality photo
            </p>
            <div className="mx-auto mt-5 h-2 max-w-xs overflow-hidden rounded-full bg-[var(--color-slate-900,#f7f4ef)]">
              <div
                className="h-full rounded-full bg-[var(--kc-accent,#c41e3a)] transition-all duration-500"
                style={{ width: `${Math.min(100, Math.round(progress))}%` }}
              />
            </div>
            <p className="mt-2 text-xs text-[var(--color-jewelry-black,#1a1814)]/50">
              {Math.min(100, Math.round(progress))}% processed
            </p>
          </div>
        ) : null}

        {resultUrl && phase !== 'preparing' ? (
          <section className="rounded-2xl border border-[var(--color-slate-700,#e8e4df)] bg-white p-4">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[var(--color-jewelry-black,#1a1814)]/45">
              Studio preview
            </p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={resultUrl}
              alt="Studio result"
              className="mx-auto max-h-[420px] w-full rounded-xl object-contain"
            />
            {attachMsg ? (
              <p className="mt-3 rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
                {attachMsg}
              </p>
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
              <Link
                href={RESELLER_PRODUCTS_PATH}
                className="inline-flex min-h-[44px] flex-1 items-center justify-center rounded-xl border border-[var(--color-slate-700,#e8e4df)] px-4 text-sm font-medium text-[var(--color-jewelry-black,#1a1814)] sm:flex-none"
              >
                Open uploads
              </Link>
            </div>
          </section>
        ) : null}

        {error ? (
          <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
            {error}
          </p>
        ) : null}

        <button
          type="button"
          disabled={busy || !sourceFile}
          onClick={() => void runGenerate()}
          className="kc-btn-theme flex w-full min-h-[52px] items-center justify-center gap-2 rounded-2xl text-base font-semibold disabled:opacity-50"
        >
          {busy && phase === 'preparing' ? (
            <Loader2 className="size-5 animate-spin" />
          ) : (
            <Sparkles className="size-5" />
          )}
          Generate studio shot
        </button>

        <p className="pb-4 text-center text-xs text-[var(--color-jewelry-black,#1a1814)]/45">
          After attach, the photo lands on the matching Excel draft — no manual re-upload needed.{' '}
          <Link href={CATALOG_PATH} className="underline-offset-2 hover:underline">
            Catalogue
          </Link>
        </p>
      </div>
    </div>
  )
}

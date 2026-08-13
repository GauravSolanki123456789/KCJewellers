'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type ComponentType } from 'react'
import { ImagePlus, Sparkles, Type, Upload, Box, Landmark, Hand, MoveVertical, Minus, CircleDot } from 'lucide-react'
import SaveFeedbackButton from '@/components/ui/SaveFeedbackButton'
import { useSaveFeedback } from '@/hooks/useSaveFeedback'
import {
  mergeStudioPreferences,
  saveEnhancedOverlaySettings,
  saveAdminEnhancedOverlaySettings,
  uploadEnhancedWatermark,
  type EnhancedOverlaySettings,
} from '@/lib/reseller-enhanced-pictures'
import {
  BACKGROUND_PREVIEW,
  VISUALIZATION_PREVIEW,
  BACKGROUND_SWATCH_KEYS,
  VISUALIZATION_KEYS,
  backgroundPreviewStyle,
  studioPreviewLabel,
} from '@/lib/enhanced-studio-previews'

export type StudioGenerationOptions = {
  backgroundPreset: string
  visualization: string
  /** standard = fast preview · 2k = HD studio (default) · 4k = ultra print grade */
  renderQuality: 'standard' | '2k' | '4k'
  applyWatermark: boolean
  applyInfoText: boolean
}

export type RenderQualityKey = StudioGenerationOptions['renderQuality']

export const RENDER_QUALITY_OPTIONS: {
  key: RenderQualityKey
  label: string
  badge?: string
  hint: string
  detail: string
  credits: number
}[] = [
  {
    key: '2k',
    label: 'HD 2K Quality',
    badge: 'Recommended',
    hint: '2048×2048 · studio catalogue',
    detail: 'Sharp cinematic output for catalogues, ads, and WhatsApp.',
    credits: 1,
  },
  {
    key: '4k',
    label: 'Ultra HD 4K',
    badge: 'Print grade',
    hint: '4096×4096 · maximum detail',
    detail: 'Maximum detail for print, posters, and premium listings.',
    credits: 2,
  },
  {
    key: 'standard',
    label: 'Studio Fast',
    hint: '~30s · quick preview',
    detail: 'Lighter processing for rapid previews when you need speed over maximum polish.',
    credits: 1,
  },
]

export function renderQualityCreditCost(quality: string): number {
  return quality === '4k' ? 2 : 1
}

const BACKGROUND_SWATCHES = BACKGROUND_SWATCH_KEYS.map((key) => ({
  key,
  label: BACKGROUND_PREVIEW[key]?.label || key,
  gradient: BACKGROUND_PREVIEW[key]?.gradient || BACKGROUND_PREVIEW.charcoal.gradient,
}))

const VISUALIZATION_ICON: Record<string, ComponentType<{ className?: string }>> = {
  studio: Box,
  prop: Landmark,
  hand_female: Hand,
  hand_male: Hand,
  standing: MoveVertical,
  sleeping: Minus,
  mixed_bangles: CircleDot,
}

const VISUALIZATION_OPTIONS = VISUALIZATION_KEYS.map((key) => ({
  key,
  label: VISUALIZATION_PREVIEW[key]?.label || key,
  hint: VISUALIZATION_PREVIEW[key]?.hint || '',
  Icon: VISUALIZATION_ICON[key] || Sparkles,
}))

const POSITIONS = [
  { key: 'top-left', label: 'Top left' },
  { key: 'top-right', label: 'Top right' },
  { key: 'bottom-left', label: 'Bottom left' },
  { key: 'bottom-right', label: 'Bottom right' },
  { key: 'center', label: 'Center' },
]

const TEXT_COLORS = [
  { key: '#ffffff', label: 'White' },
  { key: '#f5e6c8', label: 'Gold' },
  { key: '#1a1814', label: 'Black' },
  { key: '#c41e3a', label: 'Brand red' },
]

type Props = {
  overlaySettings: EnhancedOverlaySettings
  onOverlayChange: (s: EnhancedOverlaySettings) => void
  generationOptions: StudioGenerationOptions
  onGenerationChange: (o: StudioGenerationOptions) => void
  previewImageUrl?: string | null
  previewLines?: string[]
  onStatus?: (msg: string) => void
  /** When true (default), saves background/visualization/branding toggles to the server automatically. */
  autoPersist?: boolean
  /** Admin Prompt Lab: persist studio prefs for this reseller user id. */
  adminPersistUserId?: number
}

function positionStyle(pos: string): React.CSSProperties {
  const base: React.CSSProperties = { position: 'absolute', maxWidth: '42%' }
  switch (pos) {
    case 'top-right':
      return { ...base, top: '4%', right: '4%', textAlign: 'right' }
    case 'bottom-left':
      return { ...base, bottom: '4%', left: '4%' }
    case 'bottom-right':
      return { ...base, bottom: '4%', right: '4%', textAlign: 'right' }
    case 'center':
      return { ...base, top: '50%', left: '50%', transform: 'translate(-50%, -50%)', textAlign: 'center' }
    default:
      return { ...base, top: '4%', left: '4%' }
  }
}

export default function EnhancedStudioOptions({
  overlaySettings,
  onOverlayChange,
  generationOptions,
  onGenerationChange,
  previewImageUrl,
  previewLines = [],
  onStatus,
  autoPersist = true,
  adminPersistUserId,
}: Props) {
  const [previewBroken, setPreviewBroken] = useState(false)
  const saveFb = useSaveFeedback()

  useEffect(() => {
    setPreviewBroken(false)
  }, [previewImageUrl])
  const [uploading, setUploading] = useState(false)
  const persistTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const persistSettings = useCallback(
    async (nextOverlay: EnhancedOverlaySettings, nextGen: StudioGenerationOptions) => {
      const merged = mergeStudioPreferences(nextOverlay, nextGen)
      if (adminPersistUserId) {
        return saveAdminEnhancedOverlaySettings(adminPersistUserId, merged)
      }
      return saveEnhancedOverlaySettings(merged)
    },
    [adminPersistUserId],
  )

  const schedulePersist = useCallback(
    (nextOverlay: EnhancedOverlaySettings, nextGen: StudioGenerationOptions) => {
      if (!autoPersist) return
      if (persistTimer.current) clearTimeout(persistTimer.current)
      persistTimer.current = setTimeout(() => {
        void persistSettings(nextOverlay, nextGen).catch(() => {
          /* silent — manual Save branding still available */
        })
      }, 700)
    },
    [autoPersist, persistSettings],
  )

  const patchOverlay = useCallback(
    (patch: Partial<EnhancedOverlaySettings>) => {
      const next = { ...overlaySettings, ...patch }
      onOverlayChange(next)
      schedulePersist(next, generationOptions)
    },
    [overlaySettings, onOverlayChange, generationOptions, schedulePersist],
  )

  const patchGeneration = useCallback(
    (next: StudioGenerationOptions) => {
      onGenerationChange(next)
      if (!autoPersist) return
      if (persistTimer.current) clearTimeout(persistTimer.current)
      void persistSettings(overlaySettings, next).catch(() => {
        /* silent — manual Save branding still available */
      })
    },
    [onGenerationChange, overlaySettings, autoPersist, persistSettings],
  )

  const infoLinesText = useMemo(
    () => (overlaySettings.info_text_lines || []).join('\n'),
    [overlaySettings.info_text_lines],
  )

  const saveSettings = () =>
    saveFb.runSave(async () => {
      try {
        const saved = await persistSettings(overlaySettings, generationOptions)
        onOverlayChange(saved)
        onStatus?.('Style & branding settings saved.')
      } catch (e: unknown) {
        onStatus?.(
          (e as { response?: { data?: { error?: string } } })?.response?.data?.error ||
            'Could not save branding settings',
        )
        throw e
      }
    })

  const onWatermarkPick = async (file: File | null) => {
    if (!file) return
    setUploading(true)
    try {
      const { overlay_settings } = await uploadEnhancedWatermark(file)
      onOverlayChange(overlay_settings)
      onStatus?.('Watermark uploaded.')
    } catch (e: unknown) {
      onStatus?.(
        (e as { response?: { data?: { error?: string } } })?.response?.data?.error ||
          'Watermark upload failed',
      )
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-[var(--color-slate-700,#e8e4df)] bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--color-jewelry-black,#1a1814)]/50">
            Render quality
          </p>
          <span className="inline-flex items-center gap-1 rounded-full bg-[var(--color-slate-900,#f7f4ef)] px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-[var(--color-jewelry-black,#1a1814)]/55">
            <Sparkles className="size-3 text-[var(--kc-accent,#c41e3a)]" />
            Gemini AI
          </span>
        </div>
        <div className="mt-3 space-y-2">
          {RENDER_QUALITY_OPTIONS.map((opt) => {
            const selected = generationOptions.renderQuality === opt.key
            return (
              <button
                key={opt.key}
                type="button"
                onClick={() => patchGeneration({ ...generationOptions, renderQuality: opt.key })}
                className={`w-full rounded-2xl border px-3 py-3 text-left transition ${
                  selected
                    ? 'border-[var(--kc-accent,#c41e3a)] bg-[var(--kc-accent,#c41e3a)]/6 ring-2 ring-[var(--kc-accent,#c41e3a)]/20'
                    : 'border-[var(--color-slate-700,#e8e4df)] bg-[var(--color-slate-900,#f7f4ef)]/40'
                }`}
              >
                <div className="flex items-start gap-3">
                  <span
                    className={`mt-1 flex size-4 shrink-0 items-center justify-center rounded-full border-2 ${
                      selected
                        ? 'border-[var(--kc-accent,#c41e3a)] bg-[var(--kc-accent,#c41e3a)]'
                        : 'border-[var(--color-slate-700,#e8e4df)] bg-white'
                    }`}
                  >
                    {selected ? <span className="size-1.5 rounded-full bg-white" /> : null}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-bold text-[var(--color-jewelry-black,#1a1814)]">
                        {opt.label}
                      </span>
                      {opt.badge ? (
                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-900">
                          {opt.badge}
                        </span>
                      ) : null}
                      <span className="ml-auto text-[11px] font-semibold text-[var(--color-jewelry-black,#1a1814)]/55">
                        {opt.credits} credit{opt.credits > 1 ? 's' : ''}
                      </span>
                    </span>
                    <span className="mt-0.5 block text-xs font-semibold text-[var(--kc-accent,#c41e3a)]">
                      {opt.hint}
                    </span>
                    <span className="mt-1 block text-[11px] leading-snug text-[var(--color-jewelry-black,#1a1814)]/55">
                      {opt.detail}
                    </span>
                  </span>
                </div>
              </button>
            )
          })}
        </div>
      </section>

      <section className="rounded-2xl border border-[var(--color-slate-700,#e8e4df)] bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--color-jewelry-black,#1a1814)]/50">
            Style · background colour
          </p>
          <span className="rounded-full bg-[var(--color-slate-900,#f7f4ef)] px-2.5 py-1 text-[10px] font-bold text-[var(--color-jewelry-black,#1a1814)]">
            {studioPreviewLabel(generationOptions.backgroundPreset, generationOptions.visualization)}
          </span>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
          {BACKGROUND_SWATCHES.map((sw) => {
            const selected = generationOptions.backgroundPreset === sw.key
            return (
              <button
                key={sw.key}
                type="button"
                title={sw.label}
                onClick={() => patchGeneration({ ...generationOptions, backgroundPreset: sw.key })}
                className={`overflow-hidden rounded-xl border text-left transition ${
                  selected
                    ? 'border-[var(--kc-accent,#c41e3a)] ring-2 ring-[var(--kc-accent,#c41e3a)]/25'
                    : 'border-[var(--color-slate-700,#e8e4df)]'
                }`}
              >
                <div
                  className="relative flex h-14 w-full items-end justify-center p-1.5 sm:h-16"
                  style={{ background: sw.gradient }}
                >
                  <span
                    className={`rounded-md px-1.5 py-0.5 text-[10px] font-bold ${
                      sw.key === 'white' || sw.key === 'cream'
                        ? 'bg-black/75 text-white'
                        : 'bg-black/55 text-white'
                    }`}
                  >
                    {sw.label}
                  </span>
                </div>
              </button>
            )
          })}
        </div>
      </section>

      <section className="rounded-2xl border border-[var(--color-slate-700,#e8e4df)] bg-white p-4">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--color-jewelry-black,#1a1814)]/50">
          Visualization
        </p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {VISUALIZATION_OPTIONS.map((v) => {
            const selected = generationOptions.visualization === v.key
            return (
              <button
                key={v.key}
                type="button"
                onClick={() => patchGeneration({ ...generationOptions, visualization: v.key })}
                className={`overflow-hidden rounded-xl border text-left transition ${
                  selected
                    ? 'border-[var(--kc-accent,#c41e3a)] bg-[var(--kc-accent,#c41e3a)]/8 ring-2 ring-[var(--kc-accent,#c41e3a)]/20'
                    : 'border-[var(--color-slate-700,#e8e4df)] bg-[var(--color-slate-900,#f7f4ef)]'
                }`}
              >
                <div
                  className="flex h-12 items-center justify-center sm:h-14"
                  style={backgroundPreviewStyle(generationOptions.backgroundPreset)}
                >
                  <v.Icon
                    className={`size-6 ${
                      generationOptions.backgroundPreset === 'white' ||
                      generationOptions.backgroundPreset === 'cream'
                        ? 'text-[var(--color-jewelry-black,#1a1814)]/70'
                        : 'text-white/90'
                    }`}
                    aria-hidden
                  />
                </div>
                <div className="border-t border-[var(--color-slate-700,#e8e4df)]/60 px-3 py-2">
                  <p className="text-sm font-semibold text-[var(--color-jewelry-black,#1a1814)]">
                    {v.label}
                  </p>
                  <p className="text-[11px] text-[var(--color-jewelry-black,#1a1814)]/55">{v.hint}</p>
                </div>
              </button>
            )
          })}
        </div>
      </section>

      <section className="rounded-2xl border border-[var(--color-slate-700,#e8e4df)] bg-white p-4">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--color-jewelry-black,#1a1814)]/50">
            Branding · watermark & text
          </p>
          <SaveFeedbackButton
            type="button"
            saving={saveFb.saving}
            saved={saveFb.saved}
            onClick={() => void saveSettings()}
            className="rounded-lg bg-[var(--kc-accent,#c41e3a)] px-3 py-1.5 text-[11px] font-bold text-white"
          >
            Save branding
          </SaveFeedbackButton>
        </div>

        <label className="mt-3 flex cursor-pointer items-start gap-3">
          <input
            type="checkbox"
            checked={generationOptions.applyWatermark}
            onChange={(e) =>
              patchGeneration({ ...generationOptions, applyWatermark: e.target.checked })
            }
            className="mt-1 size-4"
          />
          <span className="text-sm font-semibold text-[var(--color-jewelry-black,#1a1814)]">
            Apply watermark on generated photo
          </span>
        </label>

        {generationOptions.applyWatermark ? (
          <div className="mt-3 space-y-3 rounded-xl bg-[var(--color-slate-900,#f7f4ef)] p-3">
            <div className="flex flex-wrap items-center gap-2">
              <label className="inline-flex min-h-[40px] cursor-pointer items-center gap-2 rounded-xl border border-[var(--color-slate-700,#e8e4df)] bg-white px-3 text-sm font-semibold text-[var(--color-jewelry-black,#1a1814)]">
                <Upload className="size-4" />
                {uploading ? 'Uploading…' : 'Upload watermark'}
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="sr-only"
                  disabled={uploading}
                  onChange={(e) => void onWatermarkPick(e.target.files?.[0] || null)}
                />
              </label>
              {overlaySettings.watermark_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={overlaySettings.watermark_url}
                  alt="Watermark"
                  className="h-10 max-w-[120px] rounded border border-black/10 bg-white object-contain p-1"
                />
              ) : null}
            </div>
            <label className="block text-xs font-medium text-[var(--color-jewelry-black,#1a1814)]/60">
              Position
              <select
                value={overlaySettings.watermark_position}
                onChange={(e) => patchOverlay({ watermark_position: e.target.value })}
                className="mt-1 w-full rounded-xl border border-[var(--color-slate-700,#e8e4df)] bg-white px-3 py-2 text-sm text-[var(--color-jewelry-black,#1a1814)]"
              >
                {POSITIONS.map((p) => (
                  <option key={p.key} value={p.key}>
                    {p.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        ) : null}

        <label className="mt-4 flex cursor-pointer items-start gap-3">
          <input
            type="checkbox"
            checked={generationOptions.applyInfoText}
            onChange={(e) =>
              patchGeneration({ ...generationOptions, applyInfoText: e.target.checked })
            }
            className="mt-1 size-4"
          />
          <span className="text-sm font-semibold text-[var(--color-jewelry-black,#1a1814)]">
            Apply product info text (SKU, weight, style)
          </span>
        </label>

        {generationOptions.applyInfoText ? (
          <div className="mt-3 space-y-3 rounded-xl bg-[var(--color-slate-900,#f7f4ef)] p-3">
            <label className="block text-xs font-medium text-[var(--color-jewelry-black,#1a1814)]/60">
              Text lines — one per row. Tokens: {'{variety}'} {'{sku}'} {'{weight}'} {'{style_code}'}
              <textarea
                value={infoLinesText}
                onChange={(e) =>
                  patchOverlay({
                    info_text_lines: e.target.value.split(/\r?\n/).map((l) => l.trim()).filter(Boolean),
                  })
                }
                rows={4}
                placeholder={'IDOLS\n{sku}\n{weight}'}
                className="mt-1 w-full rounded-xl border border-[var(--color-slate-700,#e8e4df)] bg-white px-3 py-2 font-mono text-xs text-[var(--color-jewelry-black,#1a1814)]"
              />
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-xs font-medium text-[var(--color-jewelry-black,#1a1814)]/60">
                Position
                <select
                  value={overlaySettings.info_text_position}
                  onChange={(e) => patchOverlay({ info_text_position: e.target.value })}
                  className="mt-1 w-full rounded-xl border border-[var(--color-slate-700,#e8e4df)] bg-white px-3 py-2 text-sm"
                >
                  {POSITIONS.map((p) => (
                    <option key={p.key} value={p.key}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-xs font-medium text-[var(--color-jewelry-black,#1a1814)]/60">
                Text colour
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {TEXT_COLORS.map((c) => (
                    <button
                      key={c.key}
                      type="button"
                      title={c.label}
                      onClick={() => patchOverlay({ info_text_color: c.key })}
                      className={`size-9 rounded-full border-2 ${
                        overlaySettings.info_text_color === c.key
                          ? 'border-[var(--kc-accent,#c41e3a)]'
                          : 'border-transparent'
                      }`}
                      style={{ backgroundColor: c.key }}
                    />
                  ))}
                </div>
              </label>
            </div>
          </div>
        ) : null}
      </section>

      <section className="rounded-2xl border border-[var(--color-slate-700,#e8e4df)] bg-white p-4">
        <p className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--color-jewelry-black,#1a1814)]/50">
          <ImagePlus className="size-3.5" />
          Style preview
          <span className="ml-auto normal-case tracking-normal text-[var(--color-jewelry-black,#1a1814)]/45">
            {studioPreviewLabel(generationOptions.backgroundPreset, generationOptions.visualization)}
          </span>
        </p>
        <div
          className="relative mx-auto aspect-square max-w-sm overflow-hidden rounded-xl"
          style={backgroundPreviewStyle(generationOptions.backgroundPreset)}
        >
          {previewImageUrl && !previewBroken ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={previewImageUrl}
              alt="Preview"
              className="size-full object-contain p-2"
              onError={() => setPreviewBroken(true)}
            />
          ) : previewImageUrl && previewBroken ? (
            <div className="flex size-full flex-col items-center justify-center gap-2 p-4 text-center">
              <p className="text-xs font-semibold text-[var(--color-jewelry-black,#1a1814)]">
                Preview unavailable — generate a fresh studio shot below
              </p>
            </div>
          ) : (
            <div className="flex size-full flex-col items-center justify-center gap-2 p-4 text-center">
              {(() => {
                const VizIcon =
                  VISUALIZATION_ICON[generationOptions.visualization] || Sparkles
                return (
                  <VizIcon
                    className={`size-10 ${
                      generationOptions.backgroundPreset === 'white' ||
                      generationOptions.backgroundPreset === 'cream'
                        ? 'text-[var(--color-jewelry-black,#1a1814)]/55'
                        : 'text-white/85'
                    }`}
                    aria-hidden
                  />
                )
              })()}
              <p
                className={`text-xs font-semibold drop-shadow-md ${
                  generationOptions.backgroundPreset === 'white' ||
                  generationOptions.backgroundPreset === 'cream'
                    ? 'text-[var(--color-jewelry-black,#1a1814)]'
                    : 'text-white'
                }`}
              >
                {VISUALIZATION_PREVIEW[generationOptions.visualization]?.label || 'Studio'}
              </p>
              <p
                className={`text-[10px] drop-shadow ${
                  generationOptions.backgroundPreset === 'white' ||
                  generationOptions.backgroundPreset === 'cream'
                    ? 'text-[var(--color-jewelry-black,#1a1814)]/55'
                    : 'text-white/80'
                }`}
              >
                Upload a photo to preview with your product
              </p>
            </div>
          )}
            {generationOptions.applyInfoText && previewLines.length ? (
              <div
                style={{
                  ...positionStyle(overlaySettings.info_text_position),
                  color: overlaySettings.info_text_color,
                  fontSize: Math.max(11, overlaySettings.info_text_size * 0.38),
                  fontWeight: 800,
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                  textShadow: 'none',
                  whiteSpace: 'pre-line',
                  lineHeight: 1.25,
                }}
              >
                {previewLines.join('\n')}
              </div>
            ) : null}
            {generationOptions.applyWatermark && overlaySettings.watermark_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={overlaySettings.watermark_url}
                alt=""
                className="pointer-events-none absolute opacity-90"
                style={{
                  ...positionStyle(overlaySettings.watermark_position),
                  width: `${Math.round(overlaySettings.watermark_scale * 100)}%`,
                  height: 'auto',
                }}
              />
            ) : null}
          </div>
          <p className="mt-2 flex items-center gap-1 text-[10px] text-[var(--color-jewelry-black,#1a1814)]/45">
            <Type className="size-3" />
            Final burn-in applied after AI generation — preview is approximate.
          </p>
        </section>
    </div>
  )
}

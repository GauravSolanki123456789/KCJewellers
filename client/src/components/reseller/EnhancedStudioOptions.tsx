'use client'

import { useCallback, useMemo, useState } from 'react'
import { ImagePlus, Type, Upload } from 'lucide-react'
import SaveFeedbackButton from '@/components/ui/SaveFeedbackButton'
import { useSaveFeedback } from '@/hooks/useSaveFeedback'
import {
  saveEnhancedOverlaySettings,
  uploadEnhancedWatermark,
  type EnhancedOverlaySettings,
} from '@/lib/reseller-enhanced-pictures'

export type StudioGenerationOptions = {
  backgroundPreset: string
  visualization: string
  applyWatermark: boolean
  applyInfoText: boolean
}

const BACKGROUND_SWATCHES: { key: string; label: string; className: string }[] = [
  { key: 'charcoal', label: 'Charcoal', className: 'bg-gradient-to-br from-zinc-700 to-slate-900' },
  { key: 'black', label: 'Black', className: 'bg-black' },
  { key: 'white', label: 'White', className: 'bg-white ring-1 ring-black/10' },
  { key: 'blue', label: 'Navy', className: 'bg-gradient-to-br from-slate-800 to-blue-950' },
  { key: 'red', label: 'Burgundy', className: 'bg-gradient-to-br from-rose-950 to-red-950' },
  { key: 'emerald', label: 'Emerald', className: 'bg-gradient-to-br from-emerald-950 to-teal-950' },
  { key: 'cream', label: 'Cream', className: 'bg-gradient-to-br from-amber-50 to-stone-200' },
]

const VISUALIZATION_OPTIONS: { key: string; label: string; hint: string }[] = [
  { key: 'studio', label: 'Studio', hint: 'Classic pedestal / tabletop' },
  { key: 'prop', label: 'On prop', hint: 'Luxury display stand' },
  { key: 'hand_female', label: 'Female hand', hint: 'Editorial wear shot' },
  { key: 'hand_male', label: 'Male hand', hint: 'Editorial wear shot' },
  { key: 'standing', label: 'Standing', hint: 'Upright display' },
  { key: 'sleeping', label: 'Flat lay', hint: 'Sleeping / flat position' },
  { key: 'mixed_bangles', label: 'Pair layout', hint: 'One up, one flat' },
]

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
}: Props) {
  const saveFb = useSaveFeedback()
  const [uploading, setUploading] = useState(false)

  const patchOverlay = useCallback(
    (patch: Partial<EnhancedOverlaySettings>) => {
      onOverlayChange({ ...overlaySettings, ...patch })
    },
    [overlaySettings, onOverlayChange],
  )

  const infoLinesText = useMemo(
    () => (overlaySettings.info_text_lines || []).join('\n'),
    [overlaySettings.info_text_lines],
  )

  const saveSettings = () =>
    saveFb.runSave(async () => {
      try {
        const saved = await saveEnhancedOverlaySettings(overlaySettings)
        onOverlayChange(saved)
        onStatus?.('Branding settings saved.')
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
        <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--color-jewelry-black,#1a1814)]/50">
          Style · background colour
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {BACKGROUND_SWATCHES.map((sw) => (
            <button
              key={sw.key}
              type="button"
              title={sw.label}
              onClick={() => onGenerationChange({ ...generationOptions, backgroundPreset: sw.key })}
              className={`flex min-h-[44px] min-w-[72px] flex-col items-center gap-1 rounded-xl border px-2 py-2 text-[10px] font-semibold transition ${
                generationOptions.backgroundPreset === sw.key
                  ? 'border-[var(--kc-accent,#c41e3a)] ring-2 ring-[var(--kc-accent,#c41e3a)]/25'
                  : 'border-[var(--color-slate-700,#e8e4df)]'
              }`}
            >
              <span className={`size-6 rounded-full ${sw.className}`} />
              <span className="text-[var(--color-jewelry-black,#1a1814)]">{sw.label}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-[var(--color-slate-700,#e8e4df)] bg-white p-4">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--color-jewelry-black,#1a1814)]/50">
          Visualization
        </p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {VISUALIZATION_OPTIONS.map((v) => (
            <button
              key={v.key}
              type="button"
              onClick={() => onGenerationChange({ ...generationOptions, visualization: v.key })}
              className={`rounded-xl border px-3 py-2.5 text-left transition ${
                generationOptions.visualization === v.key
                  ? 'border-[var(--kc-accent,#c41e3a)] bg-[var(--kc-accent,#c41e3a)]/8'
                  : 'border-[var(--color-slate-700,#e8e4df)] bg-[var(--color-slate-900,#f7f4ef)]'
              }`}
            >
              <p className="text-sm font-semibold text-[var(--color-jewelry-black,#1a1814)]">{v.label}</p>
              <p className="text-[11px] text-[var(--color-jewelry-black,#1a1814)]/55">{v.hint}</p>
            </button>
          ))}
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
              onGenerationChange({ ...generationOptions, applyWatermark: e.target.checked })
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
              onGenerationChange({ ...generationOptions, applyInfoText: e.target.checked })
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
                placeholder={'EMERALD IDOLS\n{sku}\n{weight}'}
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

      {previewImageUrl ? (
        <section className="rounded-2xl border border-[var(--color-slate-700,#e8e4df)] bg-white p-4">
          <p className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--color-jewelry-black,#1a1814)]/50">
            <ImagePlus className="size-3.5" />
            Live preview (approximate)
          </p>
          <div className="relative mx-auto aspect-square max-w-sm overflow-hidden rounded-xl bg-black/90">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={previewImageUrl} alt="Preview" className="size-full object-contain" />
            {generationOptions.applyInfoText && previewLines.length ? (
              <div
                style={{
                  ...positionStyle(overlaySettings.info_text_position),
                  color: overlaySettings.info_text_color,
                  fontSize: Math.max(10, overlaySettings.info_text_size * 0.35),
                  fontWeight: 700,
                  textShadow: '0 1px 4px rgba(0,0,0,0.75)',
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
      ) : null}
    </div>
  )
}

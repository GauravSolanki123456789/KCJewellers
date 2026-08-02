'use client'

import { useRef } from 'react'
import { Camera, ImagePlus, Upload } from 'lucide-react'

type PhotoImportControlsProps = {
  previewUrl?: string | null
  onPick: (file: File | null) => void
  emptyLabel?: string
  changeLabel?: string
  className?: string
}

export function PhotoImportControls({
  previewUrl,
  onPick,
  emptyLabel = 'Tap to upload a product photo',
  changeLabel = 'Change photo',
  className = '',
}: PhotoImportControlsProps) {
  const galleryRef = useRef<HTMLInputElement>(null)
  const cameraRef = useRef<HTMLInputElement>(null)

  const handleFile = (file: File | null) => {
    if (!file) return
    onPick(file)
  }

  return (
    <div className={className}>
      <div className="mb-3 flex min-h-[180px] items-center justify-center rounded-xl border border-dashed border-[var(--color-slate-700,#e8e4df)] bg-[var(--color-slate-900,#f7f4ef)] p-3">
        {previewUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={previewUrl}
            alt="Selected"
            className="max-h-56 w-full rounded-lg object-contain"
          />
        ) : (
          <div className="flex flex-col items-center gap-2 px-4 text-center">
            <ImagePlus className="size-10 text-[var(--color-jewelry-black,#1a1814)]/25" />
            <p className="text-sm font-medium text-[var(--color-jewelry-black,#1a1814)]/70">
              {emptyLabel}
            </p>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => cameraRef.current?.click()}
          className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-xl bg-[var(--kc-accent,#c41e3a)] px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:opacity-95"
        >
          <Camera className="size-4 shrink-0" />
          Take photo
        </button>
        <button
          type="button"
          onClick={() => galleryRef.current?.click()}
          className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-xl border border-[var(--color-slate-700,#e8e4df)] bg-white px-4 py-2.5 text-sm font-semibold text-[var(--color-jewelry-black,#1a1814)] transition hover:bg-[var(--color-slate-900,#f7f4ef)]"
        >
          <Upload className="size-4 shrink-0" />
          {previewUrl ? changeLabel : 'Choose from gallery'}
        </button>
      </div>

      <p className="mt-2 text-center text-[11px] text-[var(--color-jewelry-black,#1a1814)]/50">
        JPEG, PNG, WEBP or GIF · max 12 MB
      </p>

      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="sr-only"
        onChange={(e) => {
          handleFile(e.target.files?.[0] || null)
          e.target.value = ''
        }}
      />
      <input
        ref={galleryRef}
        type="file"
        accept="image/jpeg,image/jpg,image/png,image/webp,image/gif,image/heic,image/heif,.jpg,.jpeg,.png,.webp,.gif"
        className="sr-only"
        onChange={(e) => {
          handleFile(e.target.files?.[0] || null)
          e.target.value = ''
        }}
      />
    </div>
  )
}

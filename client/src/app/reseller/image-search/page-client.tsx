'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { ArrowLeft, Camera, Loader2, Search } from 'lucide-react'
import { PROFILE_PATH } from '@/lib/routes'
import {
  fetchImageSearchStatus,
  matchProductByImage,
  type ImageSearchMatch,
} from '@/lib/reseller-image-search'
import { normalizeCatalogImageSrc } from '@/lib/normalize-image-url'

export default function ResellerImageSearchPageClient() {
  const [enabled, setEnabled] = useState<boolean | null>(null)
  const [busy, setBusy] = useState(false)
  const [preview, setPreview] = useState<string | null>(null)
  const [matches, setMatches] = useState<ImageSearchMatch[]>([])
  const [analysis, setAnalysis] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void fetchImageSearchStatus().then((s) => setEnabled(s.enabled))
  }, [])

  const onPick = useCallback(async (file: File | null) => {
    if (!file) return
    setError(null)
    setMatches([])
    setAnalysis('')
    setPreview(URL.createObjectURL(file))
    setBusy(true)
    try {
      const res = await matchProductByImage(file)
      setMatches(res.matches)
      setAnalysis(res.analysis)
      if (!res.matches.length) {
        setError('No close catalogue match found. Try a clearer photo or search by code.')
      }
    } catch (e) {
      const err = e as { response?: { data?: { error?: string } }; message?: string }
      setError(err.response?.data?.error || err.message || 'Search failed')
    } finally {
      setBusy(false)
    }
  }, [])

  if (enabled === null) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="size-8 animate-spin text-emerald-700" />
      </div>
    )
  }

  if (!enabled) {
    return (
      <div className="mx-auto max-w-lg px-4 py-10 text-center">
        <p className="text-sm text-[var(--color-jewelry-black,#1a1814)]">
          Find product through image is not enabled for your shop. Ask KC admin to turn it on in Edit
          reseller.
        </p>
        <Link href={PROFILE_PATH} className="mt-4 inline-flex text-sm font-semibold text-emerald-800 underline">
          Back to profile
        </Link>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:py-8">
      <Link
        href={PROFILE_PATH}
        className="mb-4 inline-flex min-h-[44px] items-center gap-2 text-sm font-medium text-[var(--color-jewelry-black,#1a1814)]/70"
      >
        <ArrowLeft className="size-4" />
        Profile
      </Link>

      <h1 className="text-xl font-bold text-[var(--color-jewelry-black,#1a1814)]">
        Find product through image
      </h1>
      <p className="mt-1 text-sm text-[var(--color-jewelry-black,#1a1814)]/60">
        Upload any product photo — we analyse it and show the closest matches from your catalogue.
      </p>

      <label className="mt-6 flex min-h-[120px] cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-[var(--color-slate-700,#e8e4df)] bg-white px-4 py-8 text-center">
        <input
          type="file"
          accept="image/*"
          capture="environment"
          className="sr-only"
          onChange={(e) => void onPick(e.target.files?.[0] ?? null)}
        />
        <Camera className="size-8 text-emerald-700" />
        <span className="mt-2 text-sm font-semibold text-[var(--color-jewelry-black,#1a1814)]">
          Upload or take photo
        </span>
        <span className="mt-1 text-xs text-[var(--color-jewelry-black,#1a1814)]/50">
          JPG, PNG, WEBP — up to 12 MB
        </span>
      </label>

      {busy ? (
        <p className="mt-4 flex items-center gap-2 text-sm text-emerald-800">
          <Loader2 className="size-4 animate-spin" />
          Analysing image…
        </p>
      ) : null}
      {error ? <p className="mt-4 text-sm text-rose-700">{error}</p> : null}

      {preview ? (
        <div className="relative mt-4 aspect-[4/3] overflow-hidden rounded-2xl border border-[var(--color-slate-700,#e8e4df)] bg-[var(--color-slate-900,#faf8f4)]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={preview} alt="Uploaded search" className="size-full object-contain" />
        </div>
      ) : null}

      {analysis ? (
        <p className="mt-4 rounded-xl border border-[var(--color-slate-700,#e8e4df)] bg-white px-3 py-2 text-xs leading-relaxed text-[var(--color-jewelry-black,#1a1814)]/70">
          {analysis.slice(0, 600)}
        </p>
      ) : null}

      {matches.length > 0 ? (
        <ul className="mt-6 space-y-3">
          {matches.map((m) => {
            const img = normalizeCatalogImageSrc(m.image_url)
            const code = m.barcode || m.sku
            return (
              <li
                key={`${m.id}-${code}`}
                className="flex gap-3 rounded-2xl border border-[var(--color-slate-700,#e8e4df)] bg-white p-3"
              >
                <div className="relative size-20 shrink-0 overflow-hidden rounded-xl bg-[var(--color-slate-900,#faf8f4)]">
                  {img ? (
                    <Image src={img} alt={code} fill className="object-cover" sizes="80px" unoptimized />
                  ) : (
                    <div className="flex size-full items-center justify-center text-[10px] text-[var(--color-jewelry-black,#1a1814)]/40">
                      No photo
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-[var(--color-jewelry-black,#1a1814)]">{code}</p>
                  <p className="text-xs text-[var(--color-jewelry-black,#1a1814)]/55">{m.name}</p>
                  <p className="mt-1 text-[11px] text-[var(--color-jewelry-black,#1a1814)]/45">
                    {[m.style_name, m.subcategory_name, m.design_group].filter(Boolean).join(' · ')}
                    {m.net_weight != null ? ` · ${m.net_weight} gm` : ''}
                  </p>
                  <Link
                    href={`/products/${encodeURIComponent(code)}`}
                    className="mt-2 inline-flex min-h-[36px] items-center gap-1 text-xs font-bold text-emerald-800 underline"
                  >
                    <Search className="size-3.5" />
                    Open in catalogue
                  </Link>
                </div>
              </li>
            )
          })}
        </ul>
      ) : null}
    </div>
  )
}

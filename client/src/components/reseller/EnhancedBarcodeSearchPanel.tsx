'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { Check, Package, ScanLine, X } from 'lucide-react'
import type { EnhancedBarcodeHint } from '@/lib/reseller-enhanced-pictures'
import { RESELLER_PRODUCTS_PATH } from '@/lib/routes'
import {
  findBestHintMatch,
  hintDisplayCode,
  normalizeBarcodeStem,
  parseProductCodeFromScan,
  sortBarcodeHints,
} from '@/lib/enhanced-barcode-search'

const READER_ID = 'enhanced-barcode-qr-reader'

type Props = {
  hints: EnhancedBarcodeHint[]
  barcodeStem: string
  onBarcodeStemChange: (value: string) => void
  photoType: 'front' | 'back'
  lookupLabel: string | null
  showMrpField: boolean
  mrpRateBehindBox: string
  onMrpChange: (value: string) => void
  suggestedFilename: string
  onSelectHint: (h: EnhancedBarcodeHint) => void
}

async function safeStopScanner(
  scannerRef: React.MutableRefObject<{ stop: () => Promise<void> } | null>,
  runningRef: React.MutableRefObject<boolean>,
) {
  const scanner = scannerRef.current
  if (!scanner || !runningRef.current) {
    scannerRef.current = null
    runningRef.current = false
    return
  }
  runningRef.current = false
  scannerRef.current = null
  try {
    await scanner.stop()
  } catch {
    /* html5-qrcode throws if already stopped — ignore */
  }
}

export default function EnhancedBarcodeSearchPanel({
  hints,
  barcodeStem,
  onBarcodeStemChange,
  photoType,
  lookupLabel,
  showMrpField,
  mrpRateBehindBox,
  onMrpChange,
  suggestedFilename,
  onSelectHint,
}: Props) {
  const [scanOpen, setScanOpen] = useState(false)
  const [scanError, setScanError] = useState<string | null>(null)
  const scannerRef = useRef<{ stop: () => Promise<void> } | null>(null)
  const scannerRunningRef = useRef(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const sortedHints = useMemo(
    () => sortBarcodeHints(hints, barcodeStem),
    [hints, barcodeStem],
  )

  const displayHints = useMemo(() => {
    const q = barcodeStem.trim()
    if (q.length >= 2) return sortedHints.slice(0, 48)
    return hints.slice(0, 40)
  }, [barcodeStem, sortedHints, hints])

  const topMatch = useMemo(
    () => (barcodeStem.trim().length >= 2 ? findBestHintMatch(hints, barcodeStem) : null),
    [hints, barcodeStem],
  )

  const applyParsedCode = useCallback(
    (parsed: string) => {
      onBarcodeStemChange(parsed)
      const match = findBestHintMatch(hints, parsed)
      if (match) onSelectHint(match)
    },
    [hints, onBarcodeStemChange, onSelectHint],
  )

  const tryApplyScanPayload = useCallback(
    (raw: string): boolean => {
      const parsed = parseProductCodeFromScan(raw)
      if (!parsed) return false
      applyParsedCode(parsed)
      return true
    },
    [applyParsedCode],
  )

  const closeScanner = useCallback(async () => {
    await safeStopScanner(scannerRef, scannerRunningRef)
    setScanOpen(false)
    setScanError(null)
  }, [])

  const applyScannedCode = useCallback(
    async (raw: string) => {
      const parsed = parseProductCodeFromScan(raw)
      if (!parsed) {
        setScanError('Could not read a product code. Hold the QR closer or type the code.')
        return
      }
      await safeStopScanner(scannerRef, scannerRunningRef)
      applyParsedCode(parsed)
      setScanError(null)
      setScanOpen(false)
    },
    [applyParsedCode],
  )

  useEffect(() => {
    if (!scanOpen) return

    let cancelled = false

    void (async () => {
      try {
        const { Html5Qrcode } = await import('html5-qrcode')
        if (cancelled) return

        const scanner = new Html5Qrcode(READER_ID, { verbose: false })
        scannerRef.current = scanner

        const cameras = await Html5Qrcode.getCameras()
        if (cancelled) return
        if (!cameras?.length) {
          setScanError('No camera found. Allow camera access or type the code manually.')
          return
        }

        const backCam =
          cameras.find((c) => /back|rear|environment/i.test(c.label))?.id || cameras[cameras.length - 1].id

        await scanner.start(
          backCam,
          {
            fps: 12,
            // Scan most of the frame — emerald idol QRs on box labels are small.
            qrbox: (viewfinderWidth: number, viewfinderHeight: number) => {
              const edge = Math.min(viewfinderWidth, viewfinderHeight)
              const size = Math.floor(edge * 0.92)
              return { width: size, height: size }
            },
            aspectRatio: 1,
            disableFlip: false,
          },
          (decoded) => {
            void applyScannedCode(decoded)
          },
          () => {
            /* ignore per-frame scan misses */
          },
        )
        if (cancelled) {
          await safeStopScanner(scannerRef, scannerRunningRef)
          return
        }
        scannerRunningRef.current = true
        setScanError(null)
      } catch (e) {
        if (!cancelled) {
          scannerRunningRef.current = false
          scannerRef.current = null
          setScanError(
            e instanceof Error
              ? e.message
              : 'Camera could not start. Check permissions and try again.',
          )
        }
      }
    })()

    return () => {
      cancelled = true
      void safeStopScanner(scannerRef, scannerRunningRef)
    }
  }, [scanOpen, applyScannedCode])

  const handleInputChange = useCallback(
    (value: string) => {
      const trimmed = value.trim()
      if (trimmed.length >= 8) {
        const parsed = parseProductCodeFromScan(trimmed)
        if (parsed && compactPayload(trimmed) !== compactPayload(parsed)) {
          applyParsedCode(parsed)
          return
        }
      }
      onBarcodeStemChange(value)
    },
    [applyParsedCode, onBarcodeStemChange],
  )

  const handlePaste = useCallback(
    (e: React.ClipboardEvent<HTMLInputElement>) => {
      const text = e.clipboardData.getData('text')
      if (tryApplyScanPayload(text)) {
        e.preventDefault()
      }
    },
    [tryApplyScanPayload],
  )

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key !== 'Enter') return
      const raw = (e.currentTarget.value || '').trim()
      if (!raw) return
      if (tryApplyScanPayload(raw)) {
        e.preventDefault()
      }
    },
    [tryApplyScanPayload],
  )

  return (
    <>
      <label className="block">
        <span className="text-xs font-medium text-[var(--color-jewelry-black,#1a1814)]/60">
          Search product (SKU, barcode, or item code e.g. SFIDOL009-001)
        </span>
        <div className="mt-1.5 flex gap-2">
          <input
            ref={inputRef}
            value={barcodeStem}
            onChange={(e) => handleInputChange(e.target.value)}
            onPaste={handlePaste}
            onKeyDown={handleKeyDown}
            placeholder="e.g. SFIDOL028-006 or sfidol028"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            className="min-h-[48px] min-w-0 flex-1 rounded-xl border border-[var(--color-slate-700,#e8e4df)] bg-[var(--color-slate-900,#f7f4ef)] px-3 py-3 font-mono text-sm text-[var(--color-jewelry-black,#1a1814)] outline-none focus:border-[var(--kc-accent,#c41e3a)] focus:ring-2 focus:ring-[var(--kc-accent,#c41e3a)]/15"
          />
          <button
            type="button"
            onClick={() => {
              setScanError(null)
              setScanOpen(true)
            }}
            className="flex min-h-[48px] min-w-[48px] shrink-0 items-center justify-center rounded-xl border border-[var(--color-slate-700,#e8e4df)] bg-[var(--color-slate-900,#f7f4ef)] text-[var(--color-jewelry-black,#1a1814)] transition hover:border-[var(--kc-accent,#c41e3a)] hover:bg-white focus:outline-none focus:ring-2 focus:ring-[var(--kc-accent,#c41e3a)]/20"
            aria-label="Scan QR code on product box"
            title="Scan QR code (Emerald Idols)"
          >
            <ScanLine className="size-5" aria-hidden />
          </button>
        </div>
        <span className="mt-1 block text-[10px] text-[var(--color-jewelry-black,#1a1814)]/45">
          Type to filter — best matches move to the top. USB scanner or camera QR both work.
        </span>
      </label>

      {lookupLabel ? (
        <p className="mt-2 text-xs font-semibold text-emerald-700">Matched: {lookupLabel}</p>
      ) : topMatch && barcodeStem.trim().length >= 2 ? (
        <p className="mt-2 text-xs font-medium text-[var(--color-jewelry-black,#1a1814)]/55">
          Top match:{' '}
          <button
            type="button"
            className="font-mono font-semibold text-[var(--kc-accent,#c41e3a)] underline-offset-2 hover:underline"
            onClick={() => onSelectHint(topMatch)}
          >
            {hintDisplayCode(topMatch)}
          </button>
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
            onChange={(e) => onMrpChange(e.target.value)}
            placeholder="Enter MRP printed on box"
            className="mt-1.5 w-full rounded-xl border border-[var(--color-slate-700,#e8e4df)] bg-[var(--color-slate-900,#f7f4ef)] px-3 py-3 text-sm text-[var(--color-jewelry-black,#1a1814)] outline-none focus:border-[var(--kc-accent,#c41e3a)]"
          />
          <span className="mt-1 block text-[10px] text-[var(--color-jewelry-black,#1a1814)]/45">
            Your Excel batch includes this column but values were empty — enter here when attaching
            the photo.
          </span>
        </label>
      ) : null}

      {suggestedFilename ? (
        <p className="mt-2 text-xs text-[var(--color-jewelry-black,#1a1814)]/55">
          Will save / attach as{' '}
          <code className="rounded bg-[var(--color-slate-900,#f7f4ef)] px-1.5 py-0.5 font-mono text-[11px] text-[var(--color-jewelry-black,#1a1814)]">
            {suggestedFilename}
          </code>
        </p>
      ) : null}

      {hints.length > 0 ? (
        <div className="mt-3 max-h-52 overflow-y-auto rounded-xl border border-[var(--color-slate-700,#e8e4df)] bg-white sm:max-h-56">
          {displayHints.map((h, idx) => {
            const code = hintDisplayCode(h)
            const stemNorm = normalizeBarcodeStem(h.stem || '')
            const selected = normalizeBarcodeStem(barcodeStem) === stemNorm
            const isTop = idx === 0 && barcodeStem.trim().length >= 2
            return (
              <button
                key={h.id}
                type="button"
                onClick={() => onSelectHint(h)}
                className={`flex w-full items-center justify-between gap-2 border-b border-[var(--color-slate-700,#e8e4df)] px-3 py-2.5 text-left last:border-0 transition ${
                  selected
                    ? 'bg-[var(--kc-accent,#c41e3a)]/8'
                    : isTop
                      ? 'bg-emerald-50/80 hover:bg-emerald-50'
                      : 'hover:bg-[var(--color-slate-900,#f7f4ef)]'
                }`}
              >
                <span className="min-w-0">
                  <span className="block truncate font-mono text-xs font-semibold text-[var(--color-jewelry-black,#1a1814)]">
                    {code}
                  </span>
                  <span className="block truncate text-[10px] text-[var(--color-jewelry-black,#1a1814)]/45">
                    {photoType === 'back' ? h.back_filename : h.front_filename}
                  </span>
                </span>
                {(photoType === 'front' ? h.has_front : h.has_back) ? (
                  <Check className="size-4 shrink-0 text-emerald-600" aria-hidden />
                ) : (
                  <Package className="size-4 shrink-0 text-[var(--color-jewelry-black,#1a1814)]/25" aria-hidden />
                )}
              </button>
            )
          })}
          {barcodeStem.trim().length >= 2 && displayHints.length === 0 ? (
            <p className="px-3 py-4 text-center text-xs text-[var(--color-jewelry-black,#1a1814)]/50">
              No products match &ldquo;{barcodeStem.trim()}&rdquo;. Try scanning the box QR or check
              spelling.
            </p>
          ) : null}
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

      {scanOpen ? (
        <div
          className="fixed inset-0 z-[200] flex items-end justify-center bg-black/55 p-0 sm:items-center sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="qr-scan-title"
        >
          <div className="w-full max-w-md rounded-t-2xl border border-[var(--color-slate-700,#e8e4df)] bg-white p-4 shadow-2xl sm:rounded-2xl">
            <div className="mb-3 flex items-center justify-between gap-2">
              <div>
                <p id="qr-scan-title" className="text-sm font-semibold text-[var(--color-jewelry-black,#1a1814)]">
                  Scan product QR
                </p>
                <p className="text-[11px] text-[var(--color-jewelry-black,#1a1814)]/55">
                  Fill the frame with the QR on the emerald idol box label
                </p>
              </div>
              <button
                type="button"
                onClick={() => void closeScanner()}
                className="flex size-10 items-center justify-center rounded-full border border-[var(--color-slate-700,#e8e4df)] text-[var(--color-jewelry-black,#1a1814)]"
                aria-label="Close scanner"
              >
                <X className="size-5" />
              </button>
            </div>
            <div
              id={READER_ID}
              className="min-h-[280px] overflow-hidden rounded-xl bg-[var(--color-jewelry-black,#1a1814)] [&_video]:rounded-xl"
            />
            {scanError ? (
              <p className="mt-3 text-xs font-medium text-red-600">{scanError}</p>
            ) : (
              <p className="mt-3 text-[11px] text-[var(--color-jewelry-black,#1a1814)]/50">
                Hold steady — SFIDOL028-006 fills in automatically when detected.
              </p>
            )}
          </div>
        </div>
      ) : null}
    </>
  )
}

function compactPayload(raw: string): string {
  return String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/[\s_\-./\\]+/g, '')
}

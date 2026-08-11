'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { Check, Loader2, Package, ScanLine, X } from 'lucide-react'
import type { EnhancedBarcodeHint } from '@/lib/reseller-enhanced-pictures'
import { RESELLER_PRODUCTS_PATH } from '@/lib/routes'
import {
  findBestHintMatch,
  hintDisplayCode,
  normalizeBarcodeStem,
  parseProductCodeFromScan,
  sortBarcodeHints,
} from '@/lib/enhanced-barcode-search'
import { startProductQrScanner } from '@/lib/enhanced-qr-scanner'

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
  const [scanStatus, setScanStatus] = useState<string | null>(null)
  const stopScanRef = useRef<(() => Promise<void>) | null>(null)
  const handlingRef = useRef(false)
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
    handlingRef.current = false
    if (stopScanRef.current) {
      await stopScanRef.current().catch(() => {})
      stopScanRef.current = null
    }
    setScanOpen(false)
    setScanError(null)
    setScanStatus(null)
  }, [])

  const handleRawScan = useCallback(
    async (raw: string) => {
      if (handlingRef.current) return
      handlingRef.current = true
      const parsed = parseProductCodeFromScan(raw)
      if (!parsed) {
        setScanError(
          `QR read but no product code found. Raw: ${raw.slice(0, 60)}${raw.length > 60 ? '…' : ''}`,
        )
        setScanStatus(null)
        handlingRef.current = false
        return
      }
      setScanStatus(`Matched ${parsed.toUpperCase()}`)
      setScanError(null)
      try {
        if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(40)
      } catch {
        /* ignore */
      }
      applyParsedCode(parsed)
      await closeScanner()
    },
    [applyParsedCode, closeScanner],
  )

  useEffect(() => {
    if (!scanOpen) return

    let cancelled = false

    void (async () => {
      try {
        await new Promise((r) => setTimeout(r, 150))
        if (cancelled) return

        const stop = await startProductQrScanner(READER_ID, {
          onDecode: (raw) => {
            void handleRawScan(raw)
          },
          onStatus: (s) => {
            if (!cancelled) setScanStatus(s)
          },
          onError: (msg) => {
            if (!cancelled) setScanError(msg)
          },
        })
        if (cancelled) {
          await stop().catch(() => {})
          return
        }
        stopScanRef.current = stop
      } catch (e) {
        if (!cancelled) {
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
      handlingRef.current = false
      void stopScanRef.current?.().catch(() => {})
      stopScanRef.current = null
    }
  }, [scanOpen, handleRawScan])

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
              setScanStatus(null)
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
          Type to filter — best matches move to the top. Tap scan and fill the frame with the box QR.
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
              className="relative min-h-[min(62vh,420px)] overflow-hidden rounded-xl bg-black [&_video]:h-full [&_video]:w-full [&_video]:object-cover"
            />
            {scanStatus ? (
              <p className="mt-3 flex items-center gap-2 text-xs font-medium text-emerald-700">
                {!scanError && !scanStatus.startsWith('Matched') ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : null}
                {scanStatus}
              </p>
            ) : null}
            {scanError ? (
              <p className="mt-2 text-xs font-medium text-red-600">{scanError}</p>
            ) : !scanStatus ? (
              <p className="mt-3 text-[11px] text-[var(--color-jewelry-black,#1a1814)]/50">
                Hold steady — SFIDOL028-006 fills in automatically when detected.
              </p>
            ) : null}
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

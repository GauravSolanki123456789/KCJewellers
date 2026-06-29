'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { X, Link2, FileText, Copy, Check, Share2 } from 'lucide-react'
import { pdf } from '@react-pdf/renderer'
import { useCatalogData } from '@/app/catalog/catalog-data-context'
import { useCatalogBuilder } from '@/context/CatalogBuilderContext'
import { useAuth } from '@/hooks/useAuth'
import { useCustomerTier } from '@/context/CustomerTierContext'
import { useResellerBranding } from '@/context/ResellerBrandingContext'
import {
  CUSTOMER_TIER,
  normalizeCustomerTier,
  buildWholesalePricingInput,
  type WholesaleUserFields,
} from '@/lib/customer-tier'
import { resolveCatalogShareBrand } from '@/lib/catalog-share'
import { createSharedCatalog } from '@/lib/shared-catalog-api'
import type { Item } from '@/lib/pricing'
import {
  type CatalogSlabKind,
  metalsNeedingWholesaleRate,
  parseResellerSlabSettings,
  tierSettingsForSlab,
} from '@/lib/catalog-slab-pricing'
import { CatalogPdfDocument } from '@/lib/catalog-pdf-document'
import { resolveItemsForPdf } from '@/lib/pdf-embed-images'
import { shareCatalogPdfBlob, shouldPresentPdfShareSheet, type PdfShareSheetPayload } from '@/lib/pdf-share'
import PdfShareSheet from '@/components/shared-catalog/PdfShareSheet'
import { buildWhatsAppShareLink } from '@/lib/whatsapp'
import { normalizeKcThemeId } from '@/lib/kc-theme-ids'
import { useCatalogPricingSettings } from '@/context/CatalogPricingSettingsContext'

const EXPIRY_OPTIONS = [
  { label: '1 hour', hours: 1 },
  { label: '2 hours', hours: 2 },
  { label: '12 hours', hours: 12 },
  { label: '24 hours', hours: 24 },
  { label: '2 days', hours: 48 },
] as const

type Props = {
  open: boolean
  onClose: () => void
}

type CatalogCategoryLite = { subcategories: { products: Item[] }[] }

function findProductsByBarcodes(
  categories: CatalogCategoryLite[],
  barcodes: Set<string>,
  order: string[],
): Item[] {
  const map = new Map<string, Item>()
  for (const c of categories) {
    for (const s of c.subcategories) {
      for (const p of s.products) {
        const k = String(p.barcode ?? p.sku ?? p.id ?? '').trim()
        if (k && barcodes.has(k) && !map.has(k)) map.set(k, p)
      }
    }
  }
  const out: Item[] = []
  for (const id of order) {
    const item = map.get(id)
    if (item) out.push(item)
  }
  return out
}

export default function WhatsAppCatalogModal({ open, onClose }: Props) {
  const { categories, rates, isBootstrapping } = useCatalogData()
  const { selectedProductIds, clearSelection } = useCatalogBuilder()
  const auth = useAuth()
  const { customerTier } = useCustomerTier()
  const { active: brandingActive, businessName: brandingBusinessName } = useResellerBranding()
  const { giftingGstEnabled } = useCatalogPricingSettings()
  const [outputFormat, setOutputFormat] = useState<'temporary_web_link' | 'pdf'>('temporary_web_link')
  const [pricingSlab, setPricingSlab] = useState<CatalogSlabKind>('standard')
  const [wholesaleGoldRate, setWholesaleGoldRate] = useState('')
  const [wholesaleSilverRate, setWholesaleSilverRate] = useState('')
  const [markupPercentage, setMarkupPercentage] = useState(0)
  const [discountPercentage, setDiscountPercentage] = useState(0)
  const [expiryHours, setExpiryHours] = useState<number>(24)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [shareUrl, setShareUrl] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [pdfShareOpen, setPdfShareOpen] = useState(false)
  const [pdfSharePayload, setPdfSharePayload] = useState<PdfShareSheetPayload | null>(null)
  const scrollAreaRef = useRef<HTMLDivElement>(null)
  const linkResultRef = useRef<HTMLDivElement>(null)

  const expiresAtIso = useMemo(() => {
    const h = EXPIRY_OPTIONS.find((o) => o.hours === expiryHours)?.hours ?? 24
    return new Date(Date.now() + h * 60 * 60 * 1000).toISOString()
  }, [expiryHours])

  const shareBrandLabel = useMemo(() => {
    const user = auth.user as WholesaleUserFields | undefined
    return resolveCatalogShareBrand({
      brandingActive,
      brandingBusinessName,
      customerTier,
      userBusinessName: user?.business_name,
    })
  }, [auth.user, brandingActive, brandingBusinessName, customerTier])

  const isReseller = normalizeCustomerTier(customerTier) === CUSTOMER_TIER.RESELLER
  const resellerHidePrices =
    isReseller && !!(auth.user as WholesaleUserFields)?.reseller_hide_prices

  const clampedMarkup = useMemo(
    () => Math.max(0, Math.min(1000, Number(markupPercentage) || 0)),
    [markupPercentage],
  )

  const clampedDiscount = useMemo(
    () => Math.max(0, Math.min(100, Number(discountPercentage) || 0)),
    [discountPercentage],
  )

  const slabSettings = useMemo(
    () => parseResellerSlabSettings((auth.user as WholesaleUserFields)?.reseller_slab_settings),
    [auth.user],
  )

  const selectedItems = useMemo(() => {
    if (selectedProductIds.length === 0) return []
    const set = new Set(selectedProductIds)
    return findProductsByBarcodes(categories, set, selectedProductIds)
  }, [categories, selectedProductIds])

  const metalsNeeded = useMemo(
    () => metalsNeedingWholesaleRate(selectedItems),
    [selectedItems],
  )

  const activeSlabTier = useMemo(
    () => tierSettingsForSlab(slabSettings, pricingSlab),
    [slabSettings, pricingSlab],
  )

  const slabPayloadForPricing = useMemo(() => {
    if (pricingSlab === 'standard') return null
    return {
      pricingSlab,
      slabSettingsSnapshot: slabSettings,
      wholesaleGoldRatePerG:
        pricingSlab === 'slab_w' || pricingSlab === 'slab_f'
          ? Number(wholesaleGoldRate) || null
          : null,
      wholesaleSilverRatePerG:
        pricingSlab === 'slab_w' || pricingSlab === 'slab_f'
          ? Number(wholesaleSilverRate) || null
          : null,
    }
  }, [pricingSlab, slabSettings, wholesaleGoldRate, wholesaleSilverRate])

  const resetAndClose = useCallback(() => {
    setError(null)
    setShareUrl(null)
    setCopied(false)
    onClose()
  }, [onClose])

  useEffect(() => {
    if (open) {
      setError(null)
      setShareUrl(null)
      setCopied(false)
    }
  }, [open])

  useEffect(() => {
    if (!shareUrl) return
    const scrollToLink = () => {
      linkResultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
      const area = scrollAreaRef.current
      if (area) {
        area.scrollTo({ top: area.scrollHeight, behavior: 'smooth' })
      }
    }
    requestAnimationFrame(() => {
      requestAnimationFrame(scrollToLink)
    })
  }, [shareUrl])

  const handleSubmit = useCallback(async () => {
    setError(null)
    setShareUrl(null)
    if (selectedProductIds.length === 0) {
      setError('No products selected.')
      return
    }
    setBusy(true)
    try {
      if (
        (pricingSlab === 'slab_w' || pricingSlab === 'slab_f') &&
        metalsNeeded.needsGold &&
        !(Number(wholesaleGoldRate) > 0)
      ) {
        setError('Enter wholesale gold rate (₹/g) for the selected products.')
        setBusy(false)
        return
      }
      if (
        (pricingSlab === 'slab_w' || pricingSlab === 'slab_f') &&
        metalsNeeded.needsSilver &&
        !(Number(wholesaleSilverRate) > 0)
      ) {
        setError('Enter wholesale silver rate (₹/g) for the selected products.')
        setBusy(false)
        return
      }

      if (outputFormat === 'pdf') {
        const set = new Set(selectedProductIds)
        const items = findProductsByBarcodes(categories, set, selectedProductIds)
        if (items.length === 0) {
          setError('Could not resolve selected products. Refresh the catalogue and try again.')
          setBusy(false)
          return
        }
        if (isReseller && !resellerHidePrices && isBootstrapping) {
          setError('Prices are still loading. Wait a moment and try again.')
          setBusy(false)
          return
        }
        const itemsForPdf = await resolveItemsForPdf(items)
        const wholesalePdf =
          isReseller && pricingSlab === 'standard'
            ? buildWholesalePricingInput(auth.user as WholesaleUserFields)
            : null
        const kcThemeId =
          typeof document !== 'undefined'
            ? normalizeKcThemeId(document.documentElement.dataset.kcTheme)
            : undefined
        const blob = await pdf(
          <CatalogPdfDocument
            products={itemsForPdf}
            kcThemeId={kcThemeId}
            hidePrices={resellerHidePrices}
            {...(isReseller && !resellerHidePrices
              ? {
                  brandName: shareBrandLabel,
                  resellerPdfPricing: {
                    rates,
                    markupPercentage: clampedMarkup,
                    discountPercentage: clampedDiscount,
                    wholesale: wholesalePdf,
                    giftingGstEnabled,
                    slabPayload: slabPayloadForPricing,
                  },
                }
              : isReseller
                ? { brandName: shareBrandLabel, itemsLabel: 'Weight catalogue' }
                : {})}
          />,
        ).toBlob()
        const slug =
          shareBrandLabel
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '')
            .slice(0, 48) || 'catalog'
        const filename = `${slug}-${new Date().toISOString().slice(0, 10)}.pdf`
        const pdfText = `${shareBrandLabel} — catalogue PDF`
        const sheetPayload: PdfShareSheetPayload = {
          blob,
          filename,
          title: pdfText,
          text: pdfText,
          fallbackWhatsAppText: `${shareBrandLabel} — catalogue PDF (${filename}).`,
          brandLabel: shareBrandLabel,
        }
        clearSelection()
        if (shouldPresentPdfShareSheet()) {
          setPdfSharePayload(sheetPayload)
          setPdfShareOpen(true)
          onClose()
        } else {
          await shareCatalogPdfBlob(blob, filename)
          resetAndClose()
        }
        return
      }

      const res = await createSharedCatalog({
        selectedProductIds,
        markupPercentage: resellerHidePrices ? 0 : clampedMarkup,
        discountPercentage: resellerHidePrices ? 0 : clampedDiscount,
        format: 'temporary_web_link',
        expiresAt: expiresAtIso,
        pricingSlab,
        wholesaleGoldRatePerG:
          pricingSlab === 'slab_w' || pricingSlab === 'slab_f'
            ? Number(wholesaleGoldRate) || null
            : null,
        wholesaleSilverRatePerG:
          pricingSlab === 'slab_w' || pricingSlab === 'slab_f'
            ? Number(wholesaleSilverRate) || null
            : null,
      })
      if (res.success && res.format === 'temporary_web_link') {
        setShareUrl(res.shareUrl)
      } else {
        setError('Unexpected response from server.')
      }
    } catch (e: unknown) {
      const msg = e && typeof e === 'object' && 'response' in e
        ? (e as { response?: { data?: { error?: string } } }).response?.data?.error
        : null
      setError(msg || (e instanceof Error ? e.message : 'Something went wrong.'))
    } finally {
      setBusy(false)
    }
  }, [
    selectedProductIds,
    outputFormat,
    markupPercentage,
    discountPercentage,
    expiresAtIso,
    categories,
    rates,
    clearSelection,
    resetAndClose,
    shareBrandLabel,
    isReseller,
    clampedMarkup,
    clampedDiscount,
    isBootstrapping,
    auth.user,
    resellerHidePrices,
    pricingSlab,
    wholesaleGoldRate,
    wholesaleSilverRate,
    metalsNeeded,
    slabPayloadForPricing,
    giftingGstEnabled,
  ])

  const copyLink = useCallback(async () => {
    if (!shareUrl) return
    try {
      await navigator.clipboard.writeText(shareUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setError('Could not copy to clipboard.')
    }
  }, [shareUrl])

  const waShareHref = useMemo(() => {
    if (!shareUrl) return null
    const text = `${shareBrandLabel} — curated catalogue for you:\n${shareUrl}`
    return buildWhatsAppShareLink(text)
  }, [shareUrl, shareBrandLabel])

  if (!open) {
    return (
      <>
        <PdfShareSheet
          open={pdfShareOpen}
          onOpenChange={setPdfShareOpen}
          payload={pdfSharePayload}
        />
      </>
    )
  }

  return (
    <>
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center bg-black/70 p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="whatsapp-catalog-modal-title"
    >
      <button
        type="button"
        className="absolute inset-0 cursor-default"
        aria-label="Close dialog backdrop"
        onClick={resetAndClose}
      />
      <div className="relative z-10 kc-catalog-modal flex max-h-[min(92vh,720px)] w-full max-w-md flex-col rounded-t-2xl sm:rounded-2xl">
        <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3 sm:px-5">
          <h2 id="whatsapp-catalog-modal-title" className="text-base font-semibold text-slate-100">
            WhatsApp catalogue
          </h2>
          <button
            type="button"
            onClick={resetAndClose}
            className="rounded-lg p-2 text-slate-500 transition hover:bg-slate-800 hover:text-slate-300"
            aria-label="Close"
          >
            <X className="size-5" />
          </button>
        </div>

        <div
          ref={scrollAreaRef}
          className="flex-1 space-y-5 overflow-y-auto px-4 py-4 sm:px-5"
        >
          <div>
            <p className="kc-catalog-modal-label mb-2">Output format</p>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setOutputFormat('temporary_web_link')}
                className={`flex flex-col items-start gap-1 rounded-xl border px-3 py-2.5 text-left text-sm transition touch-manipulation min-h-[72px] ${
                  outputFormat === 'temporary_web_link'
                    ? 'border-[color-mix(in_oklab,var(--kc-accent,var(--color-emerald-600))_55%,transparent)] bg-[color-mix(in_oklab,var(--kc-accent,var(--color-emerald-600))_12%,transparent)] text-slate-100 [&_svg]:text-[var(--kc-accent,var(--color-emerald-600))]'
                    : 'border-slate-700 bg-slate-900/50 text-slate-400 hover:border-slate-600'
                }`}
              >
                <Link2 className="size-4" />
                <span className="font-medium">Temporary web link</span>
                <span className="text-[11px] text-slate-500">Share a brochure URL</span>
              </button>
              <button
                type="button"
                onClick={() => setOutputFormat('pdf')}
                className={`flex flex-col items-start gap-1 rounded-xl border px-3 py-2.5 text-left text-sm transition touch-manipulation min-h-[72px] ${
                  outputFormat === 'pdf'
                    ? 'border-[color-mix(in_oklab,var(--kc-accent,var(--color-emerald-600))_55%,transparent)] bg-[color-mix(in_oklab,var(--kc-accent,var(--color-emerald-600))_12%,transparent)] text-slate-100 [&_svg]:text-[var(--kc-accent,var(--color-emerald-600))]'
                    : 'border-slate-700 bg-slate-900/50 text-slate-400 hover:border-slate-600'
                }`}
              >
                <FileText className="size-4" />
                <span className="font-medium">PDF document</span>
                <span className="text-[11px] text-slate-500">Download a printable PDF</span>
              </button>
            </div>
            {outputFormat === 'pdf' && (
              <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
                {isReseller && resellerHidePrices ? (
                  <>Weight-only mode — PDF shows barcode, name, and net weight. No prices.</>
                ) : isReseller ? (
                  <>
                    Uses your business name on the PDF. Prices use live rates incl.&nbsp;GST
                    {clampedDiscount > 0
                      ? ` with ${clampedDiscount}% customer discount`
                      : ''}
                    {clampedMarkup > 0 ? ` and ${clampedMarkup}% markup` : ''}.
                  </>
                ) : (
                  <>PDF includes product image, name, barcode, and net weight — prices are not shown.</>
                )}
              </p>
            )}
          </div>

          {resellerHidePrices ? (
            <div className="rounded-xl border border-violet-500/30 bg-violet-950/25 px-3 py-2.5 text-[11px] leading-relaxed text-violet-200/90">
              Weight-only sharing is enabled for your account. Shared links, PDFs, and customer shortlists will show
              weights — not prices.
            </div>
          ) : null}

          {isReseller && !resellerHidePrices && (
            <div>
              <label htmlFor="pricing-slab" className="kc-catalog-modal-label mb-2 block">
                Pricing slab
              </label>
              <select
                id="pricing-slab"
                value={pricingSlab}
                onChange={(e) => setPricingSlab(e.target.value as CatalogSlabKind)}
                className="kc-catalog-modal-select"
              >
                <option value="standard">Standard — live rates + markup / discount</option>
                <option value="slab_r">Slab R — retail MC off + silver −₹/g</option>
                <option value="slab_w">Slab W — wholesale MC off + your metal rate</option>
                <option value="slab_f">Slab F — wholesale + wastage + MC off</option>
              </select>
              {pricingSlab !== 'standard' && (
                <p className="kc-slab-hint mt-2">
                  {pricingSlab === 'slab_r' && (
                    <>
                      <span className="kc-slab-hint-em">MC {Math.round(activeSlabTier.mc_discount_pct ?? 0)}% off</span>
                      {activeSlabTier.silver_rate_offset_per_g
                        ? ` · Silver −₹${activeSlabTier.silver_rate_offset_per_g}/g vs today`
                        : ''}
                      {activeSlabTier.gift_discount_pct
                        ? ` · Gift ${Math.round(activeSlabTier.gift_discount_pct)}% off`
                        : ''}
                      . Customers see strikethrough retail vs slab price.
                    </>
                  )}
                  {pricingSlab === 'slab_w' && (
                    <>
                      <span className="kc-slab-hint-em">MC {Math.round(activeSlabTier.mc_discount_pct ?? 0)}% off</span>
                      {' · '}
                      Uses wholesale ₹/g you enter (not today&apos;s rate).
                      {activeSlabTier.gift_discount_pct
                        ? ` Gift ${Math.round(activeSlabTier.gift_discount_pct)}% off.`
                        : '.'}
                    </>
                  )}
                  {pricingSlab === 'slab_f' && (
                    <>
                      Wastage −{Math.round(activeSlabTier.wastage_discount_pct ?? 0)} pts ·{' '}
                      <span className="kc-slab-hint-em">MC {Math.round(activeSlabTier.mc_discount_pct ?? 0)}% off</span>
                      {' · '}
                      Wholesale ₹/g below.
                      {activeSlabTier.gift_discount_pct
                        ? ` Gift ${Math.round(activeSlabTier.gift_discount_pct)}% off.`
                        : ''}
                    </>
                  )}
                </p>
              )}
              {(pricingSlab === 'slab_w' || pricingSlab === 'slab_f') && (
                <div className="mt-3 space-y-3 rounded-xl border border-slate-800 bg-slate-900/40 p-3">
                  <p className="kc-catalog-modal-label !normal-case !tracking-normal">
                    Wholesale metal rate (₹/g fine)
                  </p>
                  {metalsNeeded.needsGold && (
                    <div>
                      <label htmlFor="wholesale-gold" className="mb-1 block text-[11px] text-slate-500">
                        Gold ₹/g
                      </label>
                      <input
                        id="wholesale-gold"
                        type="number"
                        min={1}
                        step={1}
                        inputMode="decimal"
                        value={wholesaleGoldRate}
                        onChange={(e) => setWholesaleGoldRate(e.target.value)}
                        placeholder="e.g. 13200"
                        className="kc-catalog-modal-input"
                      />
                    </div>
                  )}
                  {metalsNeeded.needsSilver && (
                    <div>
                      <label htmlFor="wholesale-silver" className="mb-1 block text-[11px] text-slate-500">
                        Silver ₹/g (999 fine)
                      </label>
                      <input
                        id="wholesale-silver"
                        type="number"
                        min={1}
                        step={0.5}
                        inputMode="decimal"
                        value={wholesaleSilverRate}
                        onChange={(e) => setWholesaleSilverRate(e.target.value)}
                        placeholder="e.g. 220"
                        className="kc-catalog-modal-input"
                      />
                    </div>
                  )}
                  {!metalsNeeded.needsGold && !metalsNeeded.needsSilver && (
                    <p className="kc-slab-hint">Selected items are gift / fixed-price only.</p>
                  )}
                </div>
              )}
            </div>
          )}

          {(outputFormat === 'temporary_web_link' || isReseller) && !resellerHidePrices && (
            <div className="space-y-5">
              <div>
                <label htmlFor="markup-pct" className="kc-catalog-modal-label mb-1.5 block">
                  Global markup (%)
                </label>
                <input
                  id="markup-pct"
                  type="number"
                  min={0}
                  max={500}
                  step={0.5}
                  inputMode="decimal"
                  value={markupPercentage}
                  onChange={(e) => setMarkupPercentage(Number(e.target.value) || 0)}
                  className="kc-catalog-modal-input"
                />
                <p className="mt-1 text-[11px] text-slate-500">
                  {outputFormat === 'temporary_web_link'
                    ? giftingGstEnabled
                      ? 'Added on top of the live price incl. GST (e.g. 10 = +10%).'
                      : 'Added on top of the catalogue price. Gift items use fixed MRP with no GST added.'
                    : giftingGstEnabled
                      ? 'Added on top of the live price incl. GST on each PDF line.'
                      : 'Added on top of the catalogue price on each PDF line.'}
                </p>
              </div>
              <div>
                <label htmlFor="discount-pct" className="kc-catalog-modal-label mb-1.5 block">
                  Customer discount (%)
                </label>
                <input
                  id="discount-pct"
                  type="number"
                  min={0}
                  max={100}
                  step={0.5}
                  inputMode="decimal"
                  value={discountPercentage}
                  onChange={(e) => setDiscountPercentage(Number(e.target.value) || 0)}
                  className="kc-catalog-modal-input"
                />
                <p className="mt-1 text-[11px] text-slate-500">
                  Applied after markup on the shared link (e.g. 5 = −5% for your customer). Stored as{' '}
                  <code className="text-slate-400">discountPercentage</code>.
                </p>
              </div>
              {outputFormat === 'temporary_web_link' ? (
                <div>
                  <label htmlFor="expiry" className="kc-catalog-modal-label mb-1.5 block">
                    Link expires in
                  </label>
                  <select
                    id="expiry"
                    value={expiryHours}
                    onChange={(e) => setExpiryHours(Number(e.target.value))}
                    className="kc-catalog-modal-select"
                  >
                    {EXPIRY_OPTIONS.map((o) => (
                      <option key={o.hours} value={o.hours}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>
              ) : null}
            </div>
          )}

          {error && (
            <p className="rounded-lg border border-red-500/30 bg-red-950/40 px-3 py-2 text-sm text-red-200">
              {error}
            </p>
          )}

          {shareUrl && (
            <div
              ref={linkResultRef}
              className="space-y-3 rounded-xl border border-emerald-500/30 bg-emerald-950/20 p-3"
            >
              <p className="text-sm font-medium text-slate-100">Your link is ready — share it on WhatsApp or copy it.</p>
              <p className="break-all rounded-lg bg-slate-900/80 px-2 py-1.5 font-mono text-[11px] text-slate-300">
                {shareUrl}
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={copyLink}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-slate-800 px-3 py-2 text-xs font-medium text-slate-200 hover:bg-slate-700"
                >
                  {copied ? <Check className="size-3.5 text-emerald-400" /> : <Copy className="size-3.5" />}
                  {copied ? 'Copied' : 'Copy link'}
                </button>
                {waShareHref && (
                  <a
                    href={waShareHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-lg bg-[#25D366] px-3 py-2 text-xs font-semibold text-white hover:bg-[#20bd5a]"
                  >
                    <Share2 className="size-3.5" />
                    WhatsApp
                  </a>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="border-t border-slate-800 p-4 sm:px-5">
          <button
            type="button"
            disabled={busy}
            onClick={shareUrl ? resetAndClose : handleSubmit}
            className="kc-btn-theme min-h-[48px] w-full py-3 text-sm font-semibold shadow-lg disabled:cursor-not-allowed disabled:opacity-50 sm:min-h-0"
          >
            {busy
              ? 'Working…'
              : shareUrl
                ? 'Done'
                : outputFormat === 'pdf'
                  ? 'Generate PDF & share'
                  : 'Create share link'}
          </button>
        </div>
      </div>
    </div>
    <PdfShareSheet
      open={pdfShareOpen}
      onOpenChange={setPdfShareOpen}
      payload={pdfSharePayload}
    />
    </>
  )
}

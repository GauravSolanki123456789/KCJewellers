/**
 * Build wa.me links for cart checkout — reseller storefront uses partner mobile from branding.
 */

export function normalizeIndianMobileDigits(raw: string | null | undefined): string | null {
  const d = String(raw || "").replace(/\D/g, "");
  if (d.length >= 10) return d.slice(-10);
  if (d.length > 0) return d;
  return null;
}

/** wa.me expects country code + national number (no +). */
export function toWhatsAppWaMeDigits(tenOrMoreDigits: string): string {
  const d = tenOrMoreDigits.replace(/\D/g, "");
  if (d.length === 10) return `91${d}`;
  return d;
}

export function getDefaultStoreWhatsAppDigits(): string | null {
  const raw = process.env.NEXT_PUBLIC_WHATSAPP_BUSINESS_NUMBER?.trim();
  return normalizeIndianMobileDigits(raw || undefined);
}

export type CartLineForWhatsApp = {
  name: string;
  skuOrBarcode: string;
  qty: number;
  lineTotalInr: number;
};

export function buildCartWhatsAppMessage(params: {
  brandLabel: string;
  lines: CartLineForWhatsApp[];
  orderTotalInr: number;
  buyerName?: string;
  buyerMobile?: string;
}): string {
  const { brandLabel, lines, orderTotalInr, buyerName, buyerMobile } = params;
  const header = `Hello ${brandLabel}! I'd like to place an order:\n\n`;
  const buyerBlock =
    buyerName?.trim() && buyerMobile?.trim()
      ? `*Customer:* ${buyerName.trim()}\n*WhatsApp / Mobile:* +91 ${buyerMobile.replace(/\D/g, "").slice(-10)}\n\n`
      : "";
  const body = lines
    .map(
      (l, i) =>
        `${i + 1}. *${l.name}*\n   Ref: ${l.skuOrBarcode}\n   *Qty: ${l.qty} pc${l.qty === 1 ? "" : "s"}*\n   Line total: ₹${Math.round(l.lineTotalInr).toLocaleString("en-IN")} incl. GST\n`,
    )
    .join("\n");
  const footer = `\n—\n*Order total: ₹${Math.round(orderTotalInr).toLocaleString("en-IN")}* incl. GST\n\nPlease confirm availability and next steps. Thank you.`;
  return `${header}${buyerBlock}${body}${footer}`;
}

export function buildWhatsAppOrderUrl(digitsForWaMe: string, message: string): string | null {
  const d = digitsForWaMe.replace(/\D/g, "");
  if (!d) return null;
  return `https://wa.me/${d}?text=${encodeURIComponent(message)}`;
}

export function openWhatsAppOrder(digitsForWaMe: string, message: string): boolean {
  const url = buildWhatsAppOrderUrl(digitsForWaMe, message);
  if (!url) return false;
  window.open(url, "_blank", "noopener,noreferrer");
  return true;
}

export type SharedCatalogPickLineForWhatsApp = {
  name: string
  skuOrBarcode: string
  priceInr: number
  /** List price before link/style discount — shown as "Was ₹X, now ₹Y" when higher than priceInr. */
  compareAtInr?: number | null
  qty?: number
  /** Formatted size e.g. "3x2.5 in" */
  sizeLabel?: string | null
  weightLabel?: string | null
  /** Wastage + component weights for WhatsApp text lines. */
  metalSpecSummary?: string | null
  /** When false, omit "incl. GST" on price lines (e.g. gift items with GST toggle off). */
  showInclGst?: boolean
  /** When set, append "With box · ₹X" after the base price line. */
  withBoxPriceInr?: number | null
  /** Slab savings breakdown — MC / wastage / rate lines. */
  slabDiscountLines?: string[]
  savingsInr?: number | null
}

export function buildSharedCatalogSelectionWhatsAppMessage(params: {
  brandLabel: string
  lines: SharedCatalogPickLineForWhatsApp[]
  catalogueUrl?: string
  /** When true, omit price lines — weight-only reseller brochure. */
  hidePrices?: boolean
}): string {
  const { brandLabel, lines, catalogueUrl, hidePrices } = params
  const totalPcs = lines.reduce((sum, l) => sum + Math.max(1, Number(l.qty) || 1), 0)
  const designCount = lines.length
  const pcsWord = totalPcs === 1 ? "pc" : "pcs"
  const designWord = designCount === 1 ? "line" : "lines"
  const divider = "────────────────"

  let orderTotal = 0
  if (!hidePrices) {
    for (const l of lines) {
      const qty = Math.max(1, Number(l.qty) || 1)
      orderTotal += Math.round(l.priceInr) * qty
    }
  }

  const summaryTitle = hidePrices ? "SHORTLIST" : "ORDER"
  const summaryLines = [
    `*${summaryTitle} — ${totalPcs} ${pcsWord} · ${designCount} ${designWord}*`,
  ]
  if (!hidePrices && orderTotal > 0) {
    summaryLines.push(`*Estimated total: ₹${Math.round(orderTotal).toLocaleString("en-IN")}* incl. GST`)
  }

  const intro = hidePrices
    ? `Hi ${brandLabel},\n\n${summaryLines.join("\n")}\n\nPlease find my shortlisted pieces below (qty & weight for each line):\n`
    : `Hi ${brandLabel},\n\n${summaryLines.join("\n")}\n\nPlease find my order below — *quantities are highlighted* on every line:\n`

  const body = lines
    .map((l, i) => {
      const qty = Math.max(1, Number(l.qty) || 1)
      const qtyLine = `*QTY: ${qty} ${qty === 1 ? "pc" : "pcs"}*`
      const sizeLine = l.sizeLabel?.trim() ? `Size: ${l.sizeLabel.trim()}` : null
      const refLine = `Ref: ${l.skuOrBarcode}`
      const wtLine = l.weightLabel ? `Weight: ${l.weightLabel}` : null
      const specLine = l.metalSpecSummary?.trim() ? l.metalSpecSummary.trim() : null

      if (hidePrices) {
        return [
          divider,
          `*${i + 1}. ${l.name}*`,
          qtyLine,
          sizeLine,
          refLine,
          wtLine,
          specLine,
        ]
          .filter(Boolean)
          .join("\n")
      }

      const unit = Math.round(l.priceInr)
      const lineTotal = unit * qty
      const gstSuffix = l.showInclGst === false ? "" : " incl. GST"
      const compareAt =
        l.compareAtInr != null && l.compareAtInr > unit ? Math.round(l.compareAtInr) : null
      const unitLabel = compareAt
        ? `Unit: Was ₹${compareAt.toLocaleString("en-IN")}, now ₹${unit.toLocaleString("en-IN")}${gstSuffix}`
        : `Unit: ₹${unit.toLocaleString("en-IN")}${gstSuffix}`
      const lineTotalLabel =
        qty > 1
          ? `*Line total: ₹${lineTotal.toLocaleString("en-IN")}* (${qty} × ₹${unit.toLocaleString("en-IN")})`
          : `*Line total: ₹${lineTotal.toLocaleString("en-IN")}*`
      const boxLine =
        l.withBoxPriceInr != null && l.withBoxPriceInr > unit
          ? `With box · ₹${Math.round(l.withBoxPriceInr).toLocaleString("en-IN")}${gstSuffix}`
          : null
      const slabLines =
        l.slabDiscountLines && l.slabDiscountLines.length > 0
          ? l.slabDiscountLines.map((line) => `✓ ${line}`).join("\n")
          : null
      const savingsLine =
        l.savingsInr != null && l.savingsInr > 0
          ? `You save ₹${Math.round(l.savingsInr).toLocaleString("en-IN")} on this piece`
          : null

      return [
        divider,
        `*${i + 1}. ${l.name}*`,
        qtyLine,
        sizeLine,
        refLine,
        unitLabel,
        lineTotalLabel,
        boxLine,
        slabLines,
        savingsLine,
        wtLine,
        specLine,
      ]
        .filter(Boolean)
        .join("\n")
    })
    .join("\n")

  const closing = hidePrices
    ? "\n\nCould you confirm availability and share next steps? Thank you."
    : "\n\nPlease confirm availability and share next steps for this order. Thank you."

  const link = catalogueUrl ? `\n\n${divider}\nCatalogue reference:\n${catalogueUrl}` : ""

  return `${intro}\n${body}${link}${closing}`
}

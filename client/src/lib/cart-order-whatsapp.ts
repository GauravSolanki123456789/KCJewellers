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
}): string {
  const { brandLabel, lines, orderTotalInr } = params;
  const header = `Hello ${brandLabel}! I'd like to place an order:\n\n`;
  const body = lines
    .map(
      (l, i) =>
        `${i + 1}. ${l.name}\n   SKU/Barcode: ${l.skuOrBarcode}\n   Qty: ${l.qty}\n   Line total: ₹${Math.round(l.lineTotalInr).toLocaleString("en-IN")} incl. GST\n`,
    )
    .join("\n");
  const footer = `\n—\nOrder total: ₹${Math.round(orderTotalInr).toLocaleString("en-IN")} incl. GST\n\nPlease confirm availability and next steps. Thank you.`;
  return `${header}${body}${footer}`;
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
  weightLabel?: string | null
  /** When false, omit "incl. GST" on price lines (e.g. gift items with GST toggle off). */
  showInclGst?: boolean
}

export function buildSharedCatalogSelectionWhatsAppMessage(params: {
  brandLabel: string
  lines: SharedCatalogPickLineForWhatsApp[]
  catalogueUrl?: string
  /** When true, omit price lines — weight-only reseller brochure. */
  hidePrices?: boolean
}): string {
  const { brandLabel, lines, catalogueUrl, hidePrices } = params
  const header = hidePrices
    ? `Hi ${brandLabel},\n\nI'd love to know more about these pieces from your catalogue (weights below):\n\n`
    : `Hi ${brandLabel},\n\nI'd love to know more about these pieces from your shared catalogue:\n\n`
  const body = lines
    .map((l, i) => {
      const wt = l.weightLabel
        ? hidePrices
          ? `\n   ${l.weightLabel}`
          : ` · ${l.weightLabel}`
        : ''
      const qty = Math.max(1, Number(l.qty) || 1)
      const qtyLine = qty > 1 ? `\n   Qty: ${qty}` : ''
      if (hidePrices) {
        return `${i + 1}. ${l.name}\n   Ref: ${l.skuOrBarcode}${qtyLine}${wt}\n`
      }
      const unit = Math.round(l.priceInr)
      const lineTotal = unit * qty
      const gstSuffix = l.showInclGst === false ? '' : ' incl. GST'
      const compareAt =
        l.compareAtInr != null && l.compareAtInr > unit ? Math.round(l.compareAtInr) : null
      const unitLabel = compareAt
        ? `Was ₹${compareAt.toLocaleString('en-IN')}, now ₹${unit.toLocaleString('en-IN')}${gstSuffix}`
        : `₹${unit.toLocaleString('en-IN')}${gstSuffix}`
      const priceLine =
        qty > 1
          ? `${unitLabel} · line ₹${lineTotal.toLocaleString('en-IN')}`
          : unitLabel
      return `${i + 1}. ${l.name}\n   Ref: ${l.skuOrBarcode}${qtyLine}\n   ${priceLine}${wt}\n`
    })
    .join('\n')
  const link = catalogueUrl ? `\n—\nFor reference — catalogue link:\n${catalogueUrl}\n` : "";
  const footer = `\nWhenever it's convenient, could you confirm availability and suggest next steps?\n\nThank you.`;
  return `${header}${body}${link}${footer}`;
}

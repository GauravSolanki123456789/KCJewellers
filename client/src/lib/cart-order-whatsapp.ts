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

export function openWhatsAppOrder(digitsForWaMe: string, message: string): boolean {
  const d = digitsForWaMe.replace(/\D/g, "");
  if (!d) return false;
  const url = `https://wa.me/${d}?text=${encodeURIComponent(message)}`;
  window.open(url, "_blank", "noopener,noreferrer");
  return true;
}

export type SharedCatalogPickLineForWhatsApp = {
  name: string;
  skuOrBarcode: string;
  priceInr: number;
  weightLabel?: string | null;
};

export function buildSharedCatalogSelectionWhatsAppMessage(params: {
  brandLabel: string;
  lines: SharedCatalogPickLineForWhatsApp[];
  catalogueUrl?: string;
}): string {
  const { brandLabel, lines, catalogueUrl } = params;
  const header = `Hi ${brandLabel},\n\nI'd love to know more about these pieces from your shared catalogue:\n\n`;
  const body = lines
    .map((l, i) => {
      const wt = l.weightLabel ? ` · ${l.weightLabel}` : "";
      return `${i + 1}. ${l.name}\n   Ref: ${l.skuOrBarcode}\n   ₹${Math.round(l.priceInr).toLocaleString("en-IN")} incl. GST${wt}\n`;
    })
    .join("\n");
  const link = catalogueUrl ? `\n—\nFor reference — catalogue link:\n${catalogueUrl}\n` : "";
  const footer = `\nWhenever it's convenient, could you confirm availability and suggest next steps?\n\nThank you.`;
  return `${header}${body}${link}${footer}`;
}

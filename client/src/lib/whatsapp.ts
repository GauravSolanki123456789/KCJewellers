import { getSiteUrl } from "@/lib/site";
import { buildCatalogSegmentPath } from "@/lib/catalog-paths";

const BRAND = "KC Jewellers";

/** Prefilled text when customers tap “Contact” / the WhatsApp FAB (keep in sync with UX copy). */
export const WHATSAPP_CONTACT_DEFAULT_PROMPT =
  "Hi KC Jewellers! I'd like to know more about your jewellery.";

export type CatalogShareQuery = {
  style?: string;
  sku?: string;
  metal?: string;
};

/** Canonical SEO URL: /catalog/{metal}/{category_slug}/{subcategory_slug} */
export function buildCatalogShareUrl(query: CatalogShareQuery): string {
  const site = getSiteUrl();
  const metal = (query.metal || "gold").toLowerCase().trim();
  const style = (query.style || "").trim();
  const sku = (query.sku || "").trim();
  if (
    style &&
    sku &&
    (metal === "gold" || metal === "silver" || metal === "diamond")
  ) {
    return `${site}${buildCatalogSegmentPath(metal, style, sku)}`;
  }
  const path = "/catalog";
  const params = new URLSearchParams();
  if (query.style) params.set("style", query.style);
  if (query.sku) params.set("sku", query.sku);
  if (query.metal) params.set("metal", query.metal);
  const q = params.toString();
  return q ? `${site}${path}?${q}` : `${site}${path}`;
}

export function buildProductShareUrl(barcodeOrSku: string): string {
  const id = String(barcodeOrSku || "").trim();
  const site = getSiteUrl();
  if (!id) return `${site}/catalog`;
  return `${site}/products/${encodeURIComponent(id)}`;
}

/** Opens WhatsApp with a pre-filled message (share with any contact). */
export function buildWhatsAppShareLink(message: string): string {
  const text = encodeURIComponent(message);
  return `https://wa.me/?text=${text}`;
}

/**
 * Opens a chat with the business number (digits only, country code included, no +).
 * Set NEXT_PUBLIC_WHATSAPP_BUSINESS_NUMBER e.g. 9198XXXXXXXX
 */
export function buildWhatsAppBusinessChatLink(
  prefilledMessage?: string,
  phoneDigits?: string
): string | null {
  const raw =
    phoneDigits?.trim() ||
    process.env.NEXT_PUBLIC_WHATSAPP_BUSINESS_NUMBER?.trim() ||
    "";
  const digits = raw.replace(/\D/g, "");
  if (!digits) return null;
  const base = `https://wa.me/${digits}`;
  if (prefilledMessage && prefilledMessage.trim()) {
    return `${base}?text=${encodeURIComponent(prefilledMessage.trim())}`;
  }
  return base;
}

export function productShareMessage(params: {
  name: string;
  weightGm: number | null;
  barcode: string;
}): string {
  const name = params.name.trim() || "this piece";
  const weightPart =
    params.weightGm != null && !Number.isNaN(params.weightGm)
      ? ` Weight: ${Number(params.weightGm).toFixed(2)} gm.`
      : "";
  const url = buildProductShareUrl(params.barcode);
  return `Check out this stunning ${name} at ${BRAND}!${weightPart} See it here: ${url}`;
}

/** After checkout — contact KC about a specific order (uses profile /orders/[id] link). */
export function orderConfirmationWhatsAppMessage(params: {
  orderId: number;
  /** Approx total for context; omit if unknown */
  totalInr?: number;
  /** Retail Razorpay vs B2B wholesale PO */
  kind: "retail" | "b2b";
}): string {
  const site = getSiteUrl().replace(/\/$/, "");
  const total =
    params.totalInr != null && !Number.isNaN(Number(params.totalInr))
      ? `₹${Math.round(Number(params.totalInr)).toLocaleString("en-IN")}`
      : "";
  const url = `${site}/orders/${params.orderId}`;
  if (params.kind === "b2b") {
    return `Hi KC Jewellers — I placed wholesale purchase order #${params.orderId}${total ? ` (${total})` : ""}. Please confirm receipt or let me know the next step. Order link: ${url}`;
  }
  return `Hi KC Jewellers — I just placed order #${params.orderId} on your website${total ? ` (${total})` : ""}. Please confirm. Thank you! View order: ${url}`;
}

export function catalogShareMessage(params: {
  styleName?: string;
  skuName?: string;
  metalLabel?: string;
  itemCount: number;
  url: string;
}): string {
  const parts: string[] = [];
  if (params.styleName && params.skuName) {
    parts.push(`${params.styleName} › ${params.skuName}`);
  } else if (params.styleName) {
    parts.push(params.styleName);
  } else if (params.skuName) {
    parts.push(params.skuName);
  }
  const collection = parts.length ? parts.join(" ") : "our catalogue";
  const metal = params.metalLabel ? ` (${params.metalLabel})` : "";
  const count = params.itemCount;
  const countPhrase =
    count > 0
      ? `${count} piece${count !== 1 ? "s" : ""}`
      : "curated pieces";
  return `Browse ${collection}${metal} on ${BRAND} — ${countPhrase}. See it here: ${params.url}`;
}

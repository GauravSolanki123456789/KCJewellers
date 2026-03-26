import { getSiteUrl } from "@/lib/site";

const BRAND = "KC Jewellers";

export type CatalogShareQuery = {
  style?: string;
  sku?: string;
  metal?: string;
};

export function buildCatalogShareUrl(query: CatalogShareQuery): string {
  const site = getSiteUrl();
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

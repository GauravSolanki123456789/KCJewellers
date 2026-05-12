import { absoluteImageUrl } from "@/lib/site";

/**
 * Canonical resolver for product photos. The API / DB fields include `image_url` and
 * optional `secondary_image_url` (see `web_products`, cart `Item`, catalog rows).
 * to `NEXT_PUBLIC_API_URL` so Next/Image `remotePatterns` match legacy hosts.
 */
export function normalizeCatalogImageSrc(
  raw: string | null | undefined,
): string {
  if (raw == null || typeof raw !== "string") return "";
  const t = raw.trim();
  if (!t) return "";

  const api = process.env.NEXT_PUBLIC_API_URL?.trim().replace(/\/$/, "");
  if (!api) return t;

  const lower = t.toLowerCase();
  /** Match `/uploads/...`, `uploads/...`, or `\uploads\...` after normalizing. */
  const slashUploadsIdx = lower.indexOf("/uploads/");
  const bareUploadsIdx = lower.indexOf("uploads/");
  const uploadsIdx =
    slashUploadsIdx >= 0 ? slashUploadsIdx : bareUploadsIdx;
  if (uploadsIdx >= 0) {
    const pathAndQuery = t
      .slice(uploadsIdx)
      .replace(/\\/g, "/")
      .replace(/^uploads/i, "/uploads");
    return `${api}${pathAndQuery.startsWith("/") ? pathAndQuery : `/${pathAndQuery}`}`;
  }

  if (/^https?:\/\//i.test(t)) return t;
  /** Basename-only secondary filename from ERP/DB (`{barcode}_secondary.webp`, no folder). */
  if (
    !/[\\/]/.test(t) &&
    /_secondary\.(webp|jpe?g|png)$/i.test(t)
  ) {
    return `${api}/uploads/web_products/${t}`;
  }
  return `${api}${t.startsWith("/") ? "" : "/"}${t}`;
}

/** Server metadata / JSON-LD: prefer normalized host, then legacy absolute rules. */
export function resolveCatalogImageUrlForMeta(
  raw: string | null | undefined,
): string | undefined {
  const n = normalizeCatalogImageSrc(raw);
  if (n) return n;
  return absoluteImageUrl(raw);
}

/** Reseller `users.logo_url` — same `/uploads/` rules as catalogue photos; WhatsApp/OG need absolute https. */
export function normalizeResellerLogoUrl(
  raw: string | null | undefined,
): string | null {
  const n = normalizeCatalogImageSrc(raw);
  return n.length > 0 ? n : null;
}

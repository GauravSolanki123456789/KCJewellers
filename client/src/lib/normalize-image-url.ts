import { absoluteImageUrl } from "@/lib/site";

/**
 * Canonical resolver for product photos. The API / DB field is always `image_url`
 * (see `web_products`, cart `Item`, catalog rows). Rewrites any `…/uploads/…` URL
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
  const uploadsIdx = lower.indexOf("/uploads/");
  if (uploadsIdx >= 0) {
    const pathAndQuery = t.slice(uploadsIdx);
    return `${api}${pathAndQuery}`;
  }

  if (/^https?:\/\//i.test(t)) return t;
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

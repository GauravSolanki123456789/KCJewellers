/**
 * Force catalogue product image URLs onto NEXT_PUBLIC_API_URL so Next/Image
 * remotePatterns match even when the DB still has a legacy API hostname.
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

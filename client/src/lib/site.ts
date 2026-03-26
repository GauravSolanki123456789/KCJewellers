/**
 * Canonical public site URL — matches NEXT_PUBLIC_SITE_URL used in production
 * (see client/.env.production and admin orders getBaseUrl pattern).
 */
export const DEFAULT_SITE_URL = "https://kcjewellers.co.in";

export function getSiteUrl(): string {
  const raw = process.env.NEXT_PUBLIC_SITE_URL?.trim() || DEFAULT_SITE_URL;
  return raw.replace(/\/$/, "");
}

/** API origin for server-side fetches (metadata, OG). Same host as client NEXT_PUBLIC_API_URL. */
export function getApiUrlForServer(): string {
  const raw =
    process.env.NEXT_PUBLIC_API_URL?.trim() ||
    process.env.API_URL?.trim() ||
    "http://localhost:4000";
  return raw.replace(/\/$/, "");
}

/** Turn a stored image path into an absolute URL for Open Graph / Twitter cards. */
export function absoluteImageUrl(
  imageUrl: string | null | undefined,
  apiBase?: string
): string | undefined {
  if (!imageUrl || typeof imageUrl !== "string") return undefined;
  const trimmed = imageUrl.trim();
  if (!trimmed) return undefined;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  const base = (apiBase || getApiUrlForServer()).replace(/\/$/, "");
  const path = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  return `${base}${path}`;
}

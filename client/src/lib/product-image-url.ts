/**
 * Absolute URL for product images — matches how the API stores paths (often `/uploads/...`).
 * Use with next/image so the optimizer can fetch the correct origin.
 */
export function productImageAbsoluteUrl(
  imageUrl: string | null | undefined
): string | null {
  if (!imageUrl || typeof imageUrl !== "string") return null;
  const trimmed = imageUrl.trim();
  if (!trimmed) return null;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  const base = (process.env.NEXT_PUBLIC_API_URL || "")
    .trim()
    .replace(/\/$/, "");
  if (!base) return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  const path = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  return `${base}${path}`;
}

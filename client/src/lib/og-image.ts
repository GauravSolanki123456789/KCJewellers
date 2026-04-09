/**
 * Open Graph / WhatsApp link preview image.
 *
 * Source asset: `client/public/og/kc-jewellers.png` (designer export).
 * Crawler-friendly build: `client/public/og/kc-jewellers.jpg` (run
 * `node scripts/optimize-og-image.mjs` after changing the PNG).
 *
 * Use a **clean URL** (no query string): some crawlers mishandle `?v=` on
 * og:image. Prefer renaming the file to bust cache when you replace the art.
 *
 * Served URL: `/og/kc-jewellers.jpg`
 */
export function getOgImagePath(): string {
  return "/og/kc-jewellers.jpg";
}

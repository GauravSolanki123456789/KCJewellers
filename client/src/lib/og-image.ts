/**
 * Open Graph / WhatsApp link preview image.
 *
 * File on disk (from repo root): `client/public/og/kc-jewellers.png`
 * Served URL: `/og/kc-jewellers.png`
 *
 * We keep the asset under `public/` and set it explicitly in `metadata` so we
 * don’t rely only on Next’s `app/opengraph-image` convention (which can stack
 * with `metadata.openGraph.images` and confuse crawlers).
 *
 * Bump `OG_IMAGE_VERSION` whenever you replace the PNG so WhatsApp / Facebook
 * treat it as a new URL and refresh their cache (they cache og:image aggressively).
 */
export const OG_IMAGE_VERSION = "3";

export function getOgImagePath(): string {
  return `/og/kc-jewellers.png?v=${OG_IMAGE_VERSION}`;
}

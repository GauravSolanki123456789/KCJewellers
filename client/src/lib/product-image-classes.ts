import type { ImageSurfaceTone } from "./detect-image-surface";

/**
 * Catalogue / PDP image framing for known ERP batches.
 *
 * Why some Pitara (tops/pendant) shots look “sideways” or off-centre:
 * - The JPEGs are often flat-lay or angled in-camera; `object-contain` shows the full
 *   bitmap, so uneven padding and tilt read as inconsistent vs studio-centred SKUs.
 * - Next/Image + Sharp already apply EXIF orientation; if it still looks tilted, the
 *   pixels are usually saved that way (fix at source / re-export), not a CSS bug.
 *
 * Here we only nudge `object-position` for specific subcategory slugs so other lines
 * keep the default centred framing.
 *
 * Solid white/black JPEG frames (detected client-side) use `object-cover` so the photo
 * fills the card and avoids a “floating rectangle” / letterboxed look.
 */
const SUBCATEGORY_OBJECT_POSITION_TUNING = new Set([
  "pitara-tops",
  "pitara-pendant",
]);

function useTunedFraming(subcategorySlug?: string | null): boolean {
  const s = (subcategorySlug || "").toLowerCase().trim();
  return SUBCATEGORY_OBJECT_POSITION_TUNING.has(s);
}

/** Product grid cards — pairs with `group-hover:scale-105` on the same node. */
export function catalogProductImageClass(subcategorySlug?: string | null): string {
  if (useTunedFraming(subcategorySlug)) {
    /* Slightly above centre: common for flat-lay pairs so the grid feels more upright. */
    return "object-contain object-[center_38%]";
  }
  return "object-contain object-center";
}

/** PDP main image + thumbs — full product must stay visible; same position bias only. */
export function detailProductImageClass(subcategorySlug?: string | null): string {
  if (useTunedFraming(subcategorySlug)) {
    return "object-contain object-[center_38%]";
  }
  return "object-contain object-center";
}

/**
 * Unified `object-fit` / `object-position` for any product image (catalog, PDP, cart).
 * When corners look like flat white or black studio frames, use cover + centre so the
 * image fills the slot and blends with the card instead of sitting as a small box.
 */
export function productImageObjectClass(
  surfaceTone: ImageSurfaceTone | null,
  subcategorySlug: string | null | undefined,
  variant: "catalog" | "detail",
): string {
  if (surfaceTone === "light" || surfaceTone === "dark") {
    return "object-cover object-center";
  }
  return variant === "catalog"
    ? catalogProductImageClass(subcategorySlug)
    : detailProductImageClass(subcategorySlug);
}

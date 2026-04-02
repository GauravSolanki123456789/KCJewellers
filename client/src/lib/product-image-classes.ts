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

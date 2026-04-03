/**
 * Catalogue / PDP image framing for known ERP batches.
 *
 * **Catalog grid:** `object-cover` so thumbnails fill the card (no empty letterboxing).
 * **PDP:** `object-contain` so the full piece is visible for purchase decisions.
 * Wells use `bg-[#0B1120]` on parents (`product-image-theme`).
 */
const SUBCATEGORY_OBJECT_POSITION_TUNING = new Set([
  "pitara-tops",
  "pitara-pendant",
]);

function useTunedFraming(subcategorySlug?: string | null): boolean {
  const s = (subcategorySlug || "").toLowerCase().trim();
  return SUBCATEGORY_OBJECT_POSITION_TUNING.has(s);
}

type FramingOpts = {
  /** Pure white/black frame — cover + centre; bottom strip may be clipped via viewport wrapper. */
  flatTone?: boolean;
};

export function catalogProductImageClass(
  subcategorySlug?: string | null,
  opts?: FramingOpts,
): string {
  if (opts?.flatTone) return "object-cover object-center";
  if (useTunedFraming(subcategorySlug)) {
    return "object-cover object-[center_38%]";
  }
  return "object-cover object-center";
}

export function detailProductImageClass(
  subcategorySlug?: string | null,
  opts?: FramingOpts,
): string {
  if (opts?.flatTone) return "object-contain object-center";
  if (useTunedFraming(subcategorySlug)) {
    return "object-contain object-[center_38%]";
  }
  return "object-contain object-center";
}

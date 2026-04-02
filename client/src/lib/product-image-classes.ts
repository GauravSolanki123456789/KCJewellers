/**
 * Catalogue / PDP image framing for known ERP batches.
 *
 * Uses `object-contain` so the full piece stays visible (no perceived cropping).
 * Padding uses the same deep-navy well (`bg-[#0B1120]`) on the parent so edges blend with the UI.
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
  /** Pure white/black frame — same contain + centre; bottom strip may be clipped via viewport wrapper. */
  flatTone?: boolean;
};

export function catalogProductImageClass(
  subcategorySlug?: string | null,
  opts?: FramingOpts,
): string {
  if (opts?.flatTone) return "object-contain object-center";
  if (useTunedFraming(subcategorySlug)) {
    return "object-contain object-[center_38%]";
  }
  return "object-contain object-center";
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

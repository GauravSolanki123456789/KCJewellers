/**
 * Catalogue / PDP image framing for known ERP batches.
 *
 * Flat white/black shots use `flatTone` so we keep object-center (full bitmap, no focal nudge).
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
  /** Pure white/black frame: always centred; avoids conflicting slug nudges. */
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

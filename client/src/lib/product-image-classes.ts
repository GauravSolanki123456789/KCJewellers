/**
 * Catalogue / PDP image framing for known ERP batches.
 *
 * **PITARA tops & rings:** Show the uploaded file **as-is** (`object-contain`, centred)
 * in grid + PDP — no crop, so jewellery matches your studio shots (including label strip).
 *
 * **Other catalog rows:** `object-cover` fills the card; optional focal nudges below.
 * Wells use `bg-[#0B1120]` on parents (`product-image-theme`) so letterboxing blends in.
 */
const CATALOG_CONTAIN_AS_SHOT = new Set(["pitara-tops", "pitara-ring"]);

/** `object-cover` + slight focal nudge — not used for tops/rings. */
const CATALOG_OBJECT_POSITION: Record<string, string> = {
  "pitara-pendant": "object-[center_50%_42%]",
};

const PDP_OBJECT_POSITION: Record<string, string> = {
  "pitara-pendant": "object-[center_50%_42%]",
};

type FramingOpts = {
  /** Pure white/black frame — PDP only. */
  flatTone?: boolean;
};

export function catalogProductImageClass(subcategorySlug?: string | null): string {
  const s = (subcategorySlug || "").toLowerCase().trim();
  if (CATALOG_CONTAIN_AS_SHOT.has(s)) {
    return "object-contain object-center";
  }
  const pos = CATALOG_OBJECT_POSITION[s];
  if (pos) return `object-cover ${pos}`;
  return "object-cover object-center";
}

export function detailProductImageClass(
  subcategorySlug?: string | null,
  opts?: FramingOpts,
): string {
  if (opts?.flatTone) return "object-contain object-center";
  const s = (subcategorySlug || "").toLowerCase().trim();
  if (CATALOG_CONTAIN_AS_SHOT.has(s)) {
    return "object-contain object-center";
  }
  const pos = PDP_OBJECT_POSITION[s];
  if (pos) return `object-contain ${pos}`;
  return "object-contain object-center";
}

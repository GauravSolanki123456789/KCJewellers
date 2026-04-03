/**
 * Catalogue / PDP image framing for known ERP batches.
 *
 * **Catalog grid:** `object-cover` + full-bleed viewport (see `flat-product-image`).
 * **PDP:** `object-contain` so the full piece is visible for purchase decisions.
 * Wells use `bg-[#0B1120]` on parents (`product-image-theme`).
 *
 * Subcategory `object-position` nudges focal point for batches where the subject
 * sits slightly off-centre in the source file (reduces uneven crops vs plain `center`).
 */
const CATALOG_OBJECT_POSITION: Record<string, string> = {
  "pitara-tops": "object-[center_50%_42%]",
  "pitara-pendant": "object-[center_50%_42%]",
  "pitara-ring": "object-[center_50%_43%]",
};

/** Same focal nudges as the grid, with `contain` for the PDP hero. */
const PDP_OBJECT_POSITION: Record<string, string> = {
  "pitara-tops": "object-[center_50%_42%]",
  "pitara-pendant": "object-[center_50%_42%]",
  "pitara-ring": "object-[center_50%_43%]",
};

type FramingOpts = {
  /** Pure white/black frame — PDP only. */
  flatTone?: boolean;
};

export function catalogProductImageClass(subcategorySlug?: string | null): string {
  const s = (subcategorySlug || "").toLowerCase().trim();
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
  const pos = PDP_OBJECT_POSITION[s];
  if (pos) return `object-contain ${pos}`;
  return "object-contain object-center";
}

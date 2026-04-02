/**
 * Single surface for all product photo wells (catalog, PDP, cart, checkout).
 * With `object-contain`, padding matches the card — no mismatched grey bars.
 */
export const PRODUCT_IMAGE_SURFACE_HEX = "#0B1120" as const;

export const productImageSurfaceClass = "bg-[#0B1120]";

/** Hero / card wells — subtle edge definition without affecting photo pixels */
export const productImageWellClass =
  `${productImageSurfaceClass} ring-1 ring-inset ring-white/[0.06]`;

/**
 * Single surface for all product photo wells (catalog, PDP, cart, checkout).
 * Light background so `object-contain` letterboxing reads as clean studio padding
 * instead of heavy black bars beside portrait shots.
 */
export const PRODUCT_IMAGE_SURFACE_HEX = "#ffffff" as const;

export const productImageSurfaceClass = "bg-white";

/** Hero / card wells — subtle edge definition without affecting photo pixels */
export const productImageWellClass =
  `${productImageSurfaceClass} ring-1 ring-inset ring-slate-200/95`;

/** Skeleton / loading overlay inside wells (replaces dark navy pulse). */
export const productImageLoadingShimmerClass =
  "bg-gradient-to-br from-slate-100 via-white to-slate-100";

/** Empty / missing image fill (no oversized initial letter). */
export const productImageEmptyWellClass = "bg-slate-100";

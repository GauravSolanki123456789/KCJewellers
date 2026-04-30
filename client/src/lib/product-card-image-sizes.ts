/**
 * `sizes` hints for `next/image` on product cards. When these match the CSS grid,
 * the optimizer requests roughly the right pixel width (same visual quality, less data).
 */

/** Main catalogue grid: `grid-cols-2 md:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4` */
export const CATALOG_GRID_IMAGE_SIZES =
  "(max-width: 767px) 50vw, (max-width: 1279px) 33vw, 25vw";

/** Search results: `grid-cols-2 md:grid-cols-3 lg:grid-cols-4` */
export const SEARCH_GRID_IMAGE_SIZES =
  "(max-width: 767px) 50vw, (max-width: 1023px) 33vw, 25vw";

/** `grid-cols-2 sm:grid-cols-3` (category page, legacy product grid) */
export const TWO_THREE_GRID_IMAGE_SIZES =
  "(max-width: 639px) 50vw, 33vw";

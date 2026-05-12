import type { ImageSurfaceTone } from "./detect-image-surface";
import { productImageSurfaceClass } from "./product-image-theme";

/** True for pure white / black ERP frames (used on PDP for framing hints only). */
export function isFlatProductImageTone(
  tone: ImageSurfaceTone | null | undefined,
): boolean {
  return tone === "light" || tone === "dark";
}

/**
 * Full-bleed viewport for Next/Image `fill`. We no longer reserve a bottom strip:
 * that strip showed as empty navy in the grid. Watermarks are handled by `object-cover`
 * cropping instead.
 */
export function productImageViewportWrapperClass(): string {
  /** Explicit light surface behind `object-contain` letterboxing. */
  return `absolute inset-0 overflow-hidden ${productImageSurfaceClass}`;
}

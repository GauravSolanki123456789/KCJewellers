import type { ImageSurfaceTone } from "./detect-image-surface";

/** True for pure white / black ERP frames (blend + optional watermark strip clip). */
export function isFlatProductImageTone(
  tone: ImageSurfaceTone | null | undefined,
): boolean {
  return tone === "light" || tone === "dark";
}

/**
 * Wrapper for the Next/Image fill layer: clips the bottom strip where ERP watermarks
 * (e.g. PITARA RING + barcode) usually sit on pure white/black frames.
 * Use with `object-contain` + centred positioning so the full piece stays visible; only the label band is hidden.
 */
export function productImageViewportWrapperClass(isFlat: boolean): string {
  return isFlat
    ? "absolute inset-x-0 top-0 bottom-[11%] sm:bottom-[10%] overflow-hidden"
    : "absolute inset-0 overflow-hidden";
}

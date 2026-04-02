import type { ImageSurfaceTone } from "./detect-image-surface";

/**
 * Blend product photos with the card surface so flat white/black JPEG frames
 * sit less harshly on the dark UI. Only applied when tone is light/dark.
 */
export function blendClassForSurface(tone: ImageSurfaceTone | null): string {
  if (tone === "light") return "mix-blend-multiply";
  if (tone === "dark") return "mix-blend-screen";
  return "";
}

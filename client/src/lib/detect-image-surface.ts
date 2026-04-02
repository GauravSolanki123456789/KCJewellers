/**
 * Classify flat product-photo backgrounds (white / black / neither) by sampling
 * corner pixels after decode, so we can apply multiply/screen without per-SKU DB.
 */

export type ImageSurfaceTone = "light" | "dark" | "neutral";

const LIGHT_THRESHOLD = 185; // near-white frame (0–255 luminance)
const DARK_THRESHOLD = 52; // near-black frame

function luminance(r: number, g: number, b: number): number {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

/**
 * Samples downscaled corners of a decoded image. Returns neutral on
 * canvas/security errors (tainted canvas).
 */
export function detectImageSurfaceTone(img: HTMLImageElement): ImageSurfaceTone {
  const w = img.naturalWidth;
  const h = img.naturalHeight;
  if (!w || !h) return "neutral";

  const maxSide = 160;
  const scale = Math.min(1, maxSide / Math.max(w, h));
  const cw = Math.max(1, Math.floor(w * scale));
  const ch = Math.max(1, Math.floor(h * scale));

  const canvas = document.createElement("canvas");
  canvas.width = cw;
  canvas.height = ch;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return "neutral";

  try {
    ctx.drawImage(img, 0, 0, w, h, 0, 0, cw, ch);
  } catch {
    return "neutral";
  }

  const cornerSize = Math.max(8, Math.floor(Math.min(cw, ch) * 0.14));
  const xs = [0, cw - cornerSize];
  const ys = [0, ch - cornerSize];

  let sum = 0;
  let n = 0;

  try {
    for (const x of xs) {
      for (const y of ys) {
        const data = ctx.getImageData(x, y, cornerSize, cornerSize).data;
        for (let i = 0; i < data.length; i += 4) {
          sum += luminance(data[i], data[i + 1], data[i + 2]);
          n++;
        }
      }
    }
  } catch {
    return "neutral";
  }

  if (n === 0) return "neutral";
  const avg = sum / n;

  if (avg >= LIGHT_THRESHOLD) return "light";
  if (avg <= DARK_THRESHOLD) return "dark";
  return "neutral";
}

/** Skip analysis on tiny thumbs where sampling is unreliable. */
export function shouldAnalyzeImageSurface(img: HTMLImageElement): boolean {
  return img.naturalWidth >= 64 && img.naturalHeight >= 64;
}

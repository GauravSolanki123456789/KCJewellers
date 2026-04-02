/**
 * Classify flat product-photo backgrounds (white / black / neither) and, for light/dark
 * frames, estimate a focal point so `object-position` can centre the jewellery instead
 * of leaving it stuck in a corner of the bitmap.
 */

export type ImageSurfaceTone = "light" | "dark" | "neutral";

export type ProductImageAnalysis = {
  tone: ImageSurfaceTone;
  /** Normalized focal point for object-position when tone is light/dark (centre of foreground bbox). */
  focalPercent: { x: number; y: number } | null;
};

const LIGHT_THRESHOLD = 185;
const DARK_THRESHOLD = 52;
const MAX_ANALYSIS_SIDE = 200;

function luminance(r: number, g: number, b: number): number {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

function isForegroundForTone(
  r: number,
  g: number,
  b: number,
  tone: "light" | "dark",
): boolean {
  const L = luminance(r, g, b);
  if (tone === "light") {
    return L < 238;
  }
  return L > 42;
}

function cornerAverageLuminance(
  ctx: CanvasRenderingContext2D,
  cw: number,
  ch: number,
): number | null {
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
    return null;
  }
  if (n === 0) return null;
  return sum / n;
}

function computeFocalFromForeground(
  data: Uint8ClampedArray,
  cw: number,
  ch: number,
  tone: "light" | "dark",
): { x: number; y: number } | null {
  const stride = 2;
  let minX = cw;
  let maxX = 0;
  let minY = ch;
  let maxY = 0;
  let count = 0;

  for (let y = 0; y < ch; y += stride) {
    const row = y * cw * 4;
    for (let x = 0; x < cw; x += stride) {
      const i = row + x * 4;
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      if (isForegroundForTone(r, g, b, tone)) {
        count++;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  const area = cw * ch;
  if (count < 80 || (maxX - minX) * (maxY - minY) < area * 0.002) {
    return null;
  }

  const cx = ((minX + maxX) / 2 / cw) * 100;
  const cy = ((minY + maxY) / 2 / ch) * 100;
  const clamp = (v: number) => Math.min(88, Math.max(12, v));
  return { x: clamp(cx), y: clamp(cy) };
}

/**
 * One canvas pass: corner tone + optional foreground bbox centre for flat light/dark shots.
 */
export function analyzeProductImage(img: HTMLImageElement): ProductImageAnalysis {
  const w = img.naturalWidth;
  const h = img.naturalHeight;
  if (!w || !h) return { tone: "neutral", focalPercent: null };

  const scale = Math.min(1, MAX_ANALYSIS_SIDE / Math.max(w, h));
  const cw = Math.max(1, Math.floor(w * scale));
  const ch = Math.max(1, Math.floor(h * scale));

  const canvas = document.createElement("canvas");
  canvas.width = cw;
  canvas.height = ch;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return { tone: "neutral", focalPercent: null };

  try {
    ctx.drawImage(img, 0, 0, w, h, 0, 0, cw, ch);
  } catch {
    return { tone: "neutral", focalPercent: null };
  }

  const cornerAvg = cornerAverageLuminance(ctx, cw, ch);
  if (cornerAvg == null) return { tone: "neutral", focalPercent: null };

  let tone: ImageSurfaceTone = "neutral";
  if (cornerAvg >= LIGHT_THRESHOLD) tone = "light";
  else if (cornerAvg <= DARK_THRESHOLD) tone = "dark";
  else return { tone: "neutral", focalPercent: null };

  let focalPercent: { x: number; y: number } | null = null;
  try {
    const full = ctx.getImageData(0, 0, cw, ch);
    focalPercent = computeFocalFromForeground(full.data, cw, ch, tone);
  } catch {
    focalPercent = null;
  }

  return { tone, focalPercent };
}

/** @deprecated use analyzeProductImage */
export function detectImageSurfaceTone(img: HTMLImageElement): ImageSurfaceTone {
  return analyzeProductImage(img).tone;
}

/** Skip analysis on tiny thumbs where sampling is unreliable. */
export function shouldAnalyzeImageSurface(img: HTMLImageElement): boolean {
  return img.naturalWidth >= 64 && img.naturalHeight >= 64;
}

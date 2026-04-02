/**
 * Classify flat product-photo backgrounds (white / black / neither) by sampling
 * corner pixels after decode — used for mix-blend and optional bottom clip (watermark strip).
 */

export type ImageSurfaceTone = "light" | "dark" | "neutral";

export type ProductImageAnalysis = {
  tone: ImageSurfaceTone;
};

const LIGHT_THRESHOLD = 185;
const DARK_THRESHOLD = 52;
const MAX_ANALYSIS_SIDE = 160;

function luminance(r: number, g: number, b: number): number {
  return 0.299 * r + 0.587 * g + 0.114 * b;
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

/** Corner-only tone: full bitmap stays centred with object-contain (no focal shifting). */
export function analyzeProductImage(img: HTMLImageElement): ProductImageAnalysis {
  const w = img.naturalWidth;
  const h = img.naturalHeight;
  if (!w || !h) return { tone: "neutral" };

  const scale = Math.min(1, MAX_ANALYSIS_SIDE / Math.max(w, h));
  const cw = Math.max(1, Math.floor(w * scale));
  const ch = Math.max(1, Math.floor(h * scale));

  const canvas = document.createElement("canvas");
  canvas.width = cw;
  canvas.height = ch;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return { tone: "neutral" };

  try {
    ctx.drawImage(img, 0, 0, w, h, 0, 0, cw, ch);
  } catch {
    return { tone: "neutral" };
  }

  const cornerAvg = cornerAverageLuminance(ctx, cw, ch);
  if (cornerAvg == null) return { tone: "neutral" };

  if (cornerAvg >= LIGHT_THRESHOLD) return { tone: "light" };
  if (cornerAvg <= DARK_THRESHOLD) return { tone: "dark" };
  return { tone: "neutral" };
}

/** @deprecated use analyzeProductImage */
export function detectImageSurfaceTone(img: HTMLImageElement): ImageSurfaceTone {
  return analyzeProductImage(img).tone;
}

export function shouldAnalyzeImageSurface(img: HTMLImageElement): boolean {
  return img.naturalWidth >= 64 && img.naturalHeight >= 64;
}

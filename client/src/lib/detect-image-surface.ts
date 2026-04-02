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

/** Middle of frame — catches dark product photos that still have bright corners (mis-blend → blackout). */
function centerAverageLuminance(
  ctx: CanvasRenderingContext2D,
  cw: number,
  ch: number,
): number | null {
  const mw = Math.max(8, Math.floor(cw * 0.42));
  const mh = Math.max(8, Math.floor(ch * 0.42));
  const x = Math.floor((cw - mw) / 2);
  const y = Math.floor((ch - mh) / 2);
  try {
    const data = ctx.getImageData(x, y, mw, mh).data;
    let sum = 0;
    let n = 0;
    for (let i = 0; i < data.length; i += 4) {
      sum += luminance(data[i], data[i + 1], data[i + 2]);
      n++;
    }
    return n ? sum / n : null;
  } catch {
    return null;
  }
}

/**
 * Corner tone + centre check: avoid multiply on overall-dark photos (blackout) and screen on bright scenes.
 */
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

  const centerAvg = centerAverageLuminance(ctx, cw, ch);

  if (cornerAvg >= LIGHT_THRESHOLD) {
    if (centerAvg != null && centerAvg < 92) {
      return { tone: "neutral" };
    }
    return { tone: "light" };
  }
  if (cornerAvg <= DARK_THRESHOLD) {
    if (centerAvg != null && centerAvg > 168) {
      return { tone: "neutral" };
    }
    return { tone: "dark" };
  }
  return { tone: "neutral" };
}

/** @deprecated use analyzeProductImage */
export function detectImageSurfaceTone(img: HTMLImageElement): ImageSurfaceTone {
  return analyzeProductImage(img).tone;
}

export function shouldAnalyzeImageSurface(img: HTMLImageElement): boolean {
  return img.naturalWidth >= 64 && img.naturalHeight >= 64;
}

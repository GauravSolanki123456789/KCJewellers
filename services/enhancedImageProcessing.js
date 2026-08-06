/**
 * Input normalization + output finishing for Enhanced Pictures (Aurra-grade catalogue).
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

let sharpModule = null;

function getSharp() {
    if (sharpModule !== null) return sharpModule;
    try {
        sharpModule = require('sharp');
    } catch {
        sharpModule = false;
    }
    return sharpModule || null;
}

function writeTempBuffer(buffer, ext = '.png') {
    const dir = path.join(os.tmpdir(), 'kc-enhanced-pipeline');
    fs.mkdirSync(dir, { recursive: true });
    const full = path.join(
        dir,
        `img-${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`,
    );
    fs.writeFileSync(full, buffer);
    return full;
}

/**
 * Upscale/normalize source photos before Gemini — phone shots benefit from higher-res input.
 */
async function preprocessSourceForGemini(sourceImagePath) {
    const sharp = getSharp();
    if (!sharp || !sourceImagePath || !fs.existsSync(sourceImagePath)) {
        return { path: sourceImagePath, preprocessed: false };
    }
    try {
        const meta = await sharp(sourceImagePath).metadata();
        const w = meta.width || 0;
        const h = meta.height || 0;
        const longEdge = Math.max(w, h);
        let pipeline = sharp(sourceImagePath).rotate();

        // Upscale small phone photos so Gemini sees fine engravings / glass detail.
        if (longEdge > 0 && longEdge < 1400) {
            const target = 1536;
            pipeline =
                w >= h
                    ? pipeline.resize({ width: target, withoutEnlargement: false })
                    : pipeline.resize({ height: target, withoutEnlargement: false });
        }

        const buf = await pipeline
            .normalize()
            .jpeg({ quality: 96, mozjpeg: true, chromaSubsampling: '4:4:4' })
            .toBuffer();

        const outPath = writeTempBuffer(buf, '.jpg');
        return { path: outPath, preprocessed: true };
    } catch (e) {
        console.warn('enhanced preprocess skipped:', e.message);
        return { path: sourceImagePath, preprocessed: false };
    }
}

/**
 * Smooth noisy AI backdrop while keeping the centered product sharp.
 */
async function smoothBackdropKeepProductSharp(sharp, buffer, w, h) {
    const cx = Math.round(w * 0.5);
    const cy = Math.round(h * 0.44);
    const rx = Math.round(Math.min(w, h) * 0.36);
    const ry = Math.round(Math.min(w, h) * 0.4);
    const maskSvg = `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <radialGradient id="m" cx="50%" cy="44%" r="50%">
      <stop offset="0%" stop-color="white"/>
      <stop offset="62%" stop-color="white" stop-opacity="0.92"/>
      <stop offset="100%" stop-color="black"/>
    </radialGradient>
  </defs>
  <ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="url(#m)"/>
</svg>`;
    const smoothBg = await sharp(buffer).blur(2.6).toBuffer();
    const maskGrey = await sharp(Buffer.from(maskSvg)).resize(w, h).greyscale().toBuffer();
    const productLayer = await sharp(buffer).joinChannel(maskGrey).png().toBuffer();
    return sharp(smoothBg).composite([{ input: productLayer, blend: 'over' }]).toBuffer();
}

/**
 * Catalogue finish pass — Aurra-style: smooth backdrop, suppress floor hotspot, crisp metal.
 */
async function postprocessStudioOutput(buffer, mimeType = 'image/png') {
    const sharp = getSharp();
    if (!sharp || !buffer?.length) {
        return { buffer, mimeType };
    }
    try {
        let working = sharp(buffer).rotate();
        const meta = await working.metadata();
        let w = meta.width || 0;
        let h = meta.height || 0;
        const longEdge = Math.max(w, h);

        if (longEdge > 0 && longEdge < 1800) {
            working = working.resize({
                width: w >= h ? 2048 : undefined,
                height: h > w ? 2048 : undefined,
                withoutEnlargement: false,
                kernel: sharp.kernel.lanczos3,
            });
            const resized = await working.metadata();
            w = resized.width || w;
            h = resized.height || h;
        }

        let baseBuf = await working.toBuffer();
        baseBuf = await smoothBackdropKeepProductSharp(sharp, baseBuf, w, h);

        const hotspotSvg = `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <radialGradient id="h" cx="50%" cy="76%" r="42%">
      <stop offset="0%" stop-color="#000" stop-opacity="0.38"/>
      <stop offset="50%" stop-color="#000" stop-opacity="0.14"/>
      <stop offset="100%" stop-color="#000" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="100%" height="100%" fill="url(#h)"/>
</svg>`;

        const vignetteSvg = `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <radialGradient id="v" cx="50%" cy="40%" r="78%">
      <stop offset="58%" stop-color="#000" stop-opacity="0"/>
      <stop offset="100%" stop-color="#141a24" stop-opacity="0.22"/>
    </radialGradient>
  </defs>
  <rect width="100%" height="100%" fill="url(#v)"/>
</svg>`;

        const out = await sharp(baseBuf)
            .sharpen({ sigma: 0.55, m1: 0.45, m2: 0.28 })
            .modulate({ saturation: 1.03, brightness: 1.008 })
            .recomb([
                [0.985, 0, 0.015],
                [0, 0.99, 0.01],
                [0, 0.012, 1.025],
            ])
            .composite([
                { input: Buffer.from(hotspotSvg), blend: 'multiply' },
                { input: Buffer.from(vignetteSvg), blend: 'multiply' },
            ])
            .png({ compressionLevel: 6, quality: 100, effort: 7 })
            .toBuffer();

        return { buffer: out, mimeType: 'image/png' };
    } catch (e) {
        console.warn('enhanced postprocess skipped:', e.message);
        return { buffer, mimeType };
    }
}

function studioShadowAndSurfaceBlock() {
    return `

[SHADOW & SURFACE — AURRA STUDIO CLEAN]
• Soft contact shadow ONLY — a tight, natural shadow directly under the product base on the stone surface.
• NO long cast shadows on the backdrop wall behind the product.
• NO box/base silhouette or duplicate shadow projected onto the charcoal background.
• NO harsh circular spotlight pool, hot spot, or bright ring on the tabletop.
• Backdrop stays clean: smooth smoky blue-charcoal gradient with soft vignette — no film grain, no speckled noise, no product shadow shapes on the wall.
• Gentle localized reflection under the product only; backdrop must remain uncluttered and premium.`;
}

function aurraCinematicPromptBlock() {
    return `

[AURRA CINEMATIC STUDIO — REFERENCE QUALITY]
Match premium jewellery catalogue output (Aurra Studio grade):
• 100% identity preservation — same idol/jewellery geometry, engravings, stones, dome, base.
• Exact color fidelity — preserve gold/silver tones, halo colors, gemstone hues from the source; do NOT recolor or saturate.
• Soft diffused multi-light studio — large softbox key from front-left, gentle fill, subtle rim; NOT a single harsh overhead spotlight.
• High-fidelity micro-textures on metal — crisp engraved detail and natural silver/gold speculars; NOT melted CGI, NOT plastic wax look.
• Smoky blue-charcoal cinematic backdrop — smooth atmospheric gradient, soft edge vignette; replace cluttered shop backgrounds entirely; NO film grain or mottled noise on walls.
• Glass dome: soft curved natural highlights following dome curvature; physically plausible refraction; NO white rectangular glare bars or fake stripe reflections.
• Product must feel naturally integrated in the studio — not pasted onto the background.
• 4K hyper-realistic commercial product render — editorial luxury, museum display feel.
• Centered composition, elegant negative space, square catalogue crop.${studioShadowAndSurfaceBlock()}`;
}

function spatialLockPromptBlock() {
    return `

[PIPELINE — SPATIAL LOCK]
The attached photo is the EXACT product. Do NOT redraw, warp, melt, recolor, or alter silhouette, proportions, engravings, halo color, gemstones, glass dome, or wood base.
Generate ONLY the studio environment, lighting, and reflections AROUND the locked product.
If shot through glass: keep the real dome shape and natural refraction — never replace with fake white reflection bars or duplicated ghost images.
Relight the scene; do NOT copy messy shop shadows, wall shadows, or spotlight rings from the source photo onto the new backdrop.${studioShadowAndSurfaceBlock()}`;
}

/** Always appended to negative prompts for catalogue shadow cleanup. */
const SYSTEM_STUDIO_NEGATIVE_LINES = [
    'No cast shadow on backdrop wall',
    'No box shadow on background',
    'No duplicate product silhouette on backdrop',
    'No harsh spotlight circle on tabletop',
    'No long projected shadow behind product',
    'No hot spot or bright ring on surface',
    'No muddy shadow spill on backdrop',
    'No shop background or warehouse clutter',
    'No film grain or noise in background',
    'No mottled or speckled backdrop texture',
    'No white rectangular glare bar on glass dome',
    'No fake barcode stripe reflections on glass',
    'No ghost or duplicated idol reflection on backdrop',
    'No harsh single overhead spotlight',
    'No bright circular light pool on tabletop',
    'No melted or softened CGI metal texture',
    'No plastic or wax-like surface on silver',
    'No oversaturated recoloring of halo or stones',
    'No flat lighting without specular detail',
    'No visible studio equipment or clutter in frame',
];

function mergeSystemNegativePrompt(userNegative) {
    const lines = String(userNegative || '')
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean);
    const seen = new Set(lines.map((l) => l.toLowerCase()));
    for (const line of SYSTEM_STUDIO_NEGATIVE_LINES) {
        const key = line.toLowerCase();
        if (!seen.has(key)) {
            lines.push(line);
            seen.add(key);
        }
    }
    return lines.join('\n');
}

module.exports = {
    getSharp,
    preprocessSourceForGemini,
    postprocessStudioOutput,
    aurraCinematicPromptBlock,
    spatialLockPromptBlock,
    studioShadowAndSurfaceBlock,
    mergeSystemNegativePrompt,
    SYSTEM_STUDIO_NEGATIVE_LINES,
    writeTempBuffer,
};

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
            .sharpen({ sigma: 0.6, m1: 0.4, m2: 0.25 })
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
 * Catalogue finish pass — crisp metal, soft vignette, clean backdrop shadows.
 */
async function postprocessStudioOutput(buffer, mimeType = 'image/png') {
    const sharp = getSharp();
    if (!sharp || !buffer?.length) {
        return { buffer, mimeType };
    }
    try {
        let pipeline = sharp(buffer);
        const meta = await pipeline.metadata();
        const w = meta.width || 0;
        const h = meta.height || 0;
        const longEdge = Math.max(w, h);

        if (longEdge > 0 && longEdge < 1800) {
            pipeline = pipeline.resize({
                width: w >= h ? 2048 : undefined,
                height: h > w ? 2048 : undefined,
                withoutEnlargement: false,
                kernel: sharp.kernel.lanczos3,
            });
        }

        const outW = w >= h && longEdge < 1800 ? 2048 : w;
        const outH = h > w && longEdge < 1800 ? 2048 : h;
        const vignetteW = outW || w;
        const vignetteH = outH || h;

        const vignetteSvg = `<svg width="${vignetteW}" height="${vignetteH}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <radialGradient id="v" cx="50%" cy="42%" r="72%">
      <stop offset="55%" stop-color="#000" stop-opacity="0"/>
      <stop offset="100%" stop-color="#000" stop-opacity="0.28"/>
    </radialGradient>
  </defs>
  <rect width="100%" height="100%" fill="url(#v)"/>
</svg>`;

        const out = await pipeline
            .sharpen({ sigma: 0.85, m1: 0.5, m2: 0.32 })
            .modulate({ saturation: 1.04, brightness: 1.012 })
            .composite([{ input: Buffer.from(vignetteSvg), blend: 'multiply' }])
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
• Backdrop stays clean: smooth charcoal-to-midnight gradient with soft vignette — no product shadow shapes on the wall.
• Gentle localized reflection under the product only; backdrop must remain uncluttered and premium.`;
}

function aurraCinematicPromptBlock() {
    return `

[AURRA CINEMATIC STUDIO — REFERENCE QUALITY]
Match premium jewellery catalogue output (Aurra Studio grade):
• 100% identity preservation — same idol/jewellery geometry, engravings, stones, dome, base.
• Exact color fidelity — preserve gold/silver tones, halo colors, gemstone hues from the source; do NOT recolor or saturate.
• Professional studio lighting — soft key from front-left, gentle rim from right, controlled top fill; readable shadow detail, no crushed blacks.
• High-fidelity micro-textures on metal — crisp specular highlights, not flat CGI plastic.
• Cinematic charcoal/midnight velvet backdrop with soft vignette — replace cluttered shop/warehouse backgrounds entirely.
• AI ray-traced style reflections on glass/metal — subtle, physically plausible; NO white barcode stripes or fake glare bars on glass.
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

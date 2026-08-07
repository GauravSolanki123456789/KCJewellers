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
async function applyIdolHeroFraming(sharp, buffer, w, h) {
    try {
        const trimmed = await sharp(buffer).trim({ threshold: 14 }).toBuffer({ resolveWithObject: true });
        const tw = trimmed.info.width || w;
        const th = trimmed.info.height || h;
        if (tw < 32 || th < 32) return buffer;

        const targetFill = 0.8;
        const long = Math.max(tw, th);
        const canvas = Math.round(long / targetFill);
        const padX = Math.max(0, Math.round((canvas - tw) / 2));
        const padY = Math.max(0, Math.round((canvas - th) / 2));

        let framed = await sharp(trimmed.data)
            .extend({
                top: padY,
                bottom: padY,
                left: padX,
                right: padX,
                background: { r: 20, g: 26, b: 36, alpha: 1 },
            })
            .resize(2048, 2048, { fit: 'cover', position: 'centre', kernel: sharp.kernel.lanczos3 })
            .toBuffer();

        const fw = 2048;
        const fh = 2048;
        const glassMask = `<svg width="${fw}" height="${fh}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <radialGradient id="g" cx="50%" cy="48%" r="46%">
      <stop offset="0%" stop-color="#fff" stop-opacity="0"/>
      <stop offset="72%" stop-color="#fff" stop-opacity="0"/>
      <stop offset="100%" stop-color="#fff" stop-opacity="0.18"/>
    </radialGradient>
  </defs>
  <rect width="100%" height="100%" fill="url(#g)"/>
</svg>`;
        framed = await sharp(framed)
            .composite([{ input: Buffer.from(glassMask), blend: 'soft-light' }])
            .toBuffer();
        return framed;
    } catch (e) {
        console.warn('idol hero framing skipped:', e.message);
        return buffer;
    }
}

async function postprocessStudioOutput(buffer, mimeType = 'image/png', options = {}) {
    const sharp = getSharp();
    if (!sharp || !buffer?.length) {
        return { buffer, mimeType };
    }
    const profile = options.profile || 'generic';
    const fastMode = options.fastMode !== false;
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
        if (profile !== 'kada' && !fastMode) {
            baseBuf = await smoothBackdropKeepProductSharp(sharp, baseBuf, w, h);
        } else if (profile === 'idol') {
            baseBuf = await smoothBackdropKeepProductSharp(sharp, baseBuf, w, h);
            baseBuf = await applyIdolHeroFraming(sharp, baseBuf, w, h);
            const heroMeta = await sharp(baseBuf).metadata();
            w = heroMeta.width || w;
            h = heroMeta.height || h;
        }

        const composites = [];
        if (profile !== 'kada') {
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
            composites.push({ input: Buffer.from(hotspotSvg), blend: 'multiply' });
        }

        const vignetteSvg = `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <radialGradient id="v" cx="50%" cy="40%" r="78%">
      <stop offset="58%" stop-color="#000" stop-opacity="0"/>
      <stop offset="100%" stop-color="#141a24" stop-opacity="${profile === 'kada' ? '0.18' : '0.22'}"/>
    </radialGradient>
  </defs>
  <rect width="100%" height="100%" fill="url(#v)"/>
</svg>`;
        composites.push({ input: Buffer.from(vignetteSvg), blend: 'multiply' });

        let pipeline = sharp(baseBuf).sharpen({
            sigma: fastMode ? 0.45 : 0.55,
            m1: 0.45,
            m2: 0.28,
        });

        if (profile === 'kada') {
            pipeline = pipeline.modulate({ saturation: 1.02, brightness: 1.01 });
        } else {
            pipeline = pipeline
                .modulate({ saturation: 1.03, brightness: 1.008 })
                .recomb([
                    [0.985, 0, 0.015],
                    [0, 0.99, 0.01],
                    [0, 0.012, 1.025],
                ]);
        }

        const out = await pipeline.composite(composites).png({ compressionLevel: 6, quality: 100, effort: 7 }).toBuffer();

        return { buffer: out, mimeType: 'image/png' };
    } catch (e) {
        console.warn('enhanced postprocess skipped:', e.message);
        return { buffer, mimeType };
    }
}

function detectEnhancementProfile({ templateKey, varietyKey, promptText } = {}) {
    const tk = String(templateKey || '').toLowerCase();
    const vk = String(varietyKey || '').toLowerCase();
    const pt = String(promptText || '').toLowerCase();
    if (
        vk.includes('kada') ||
        tk.includes('kada') ||
        tk.includes('bangle') ||
        pt.includes('uploaded kada') ||
        (pt.includes('kada') && pt.includes('macro close-up inset'))
    ) {
        return 'kada';
    }
    if (
        tk.includes('idol') ||
        vk.includes('idol') ||
        vk.includes('emerald') ||
        vk.includes('frame') ||
        pt.includes('uploaded idol') ||
        pt.includes('glass cloche') ||
        pt.includes('glass dome')
    ) {
        return 'idol';
    }
    return 'generic';
}

function isComprehensiveUserPrompt(promptText) {
    const t = String(promptText || '').toLowerCase();
    return (
        t.length > 650 ||
        /strict (reference|product) lock|strict product preservation|absolute color lock/.test(t)
    );
}

function profileStudioQualityBlock(profile) {
    if (profile === 'kada') {
        return `

[PIPELINE — KADA LUXURY ADVERT]
Matte black natural slate pedestal, soft diffused invisible studio lighting, balanced HDR metallic reflections.
Do NOT draw or generate a macro inset circle — leave bottom-right corner clear; a real inset from the source photo is composited automatically in post.
No watermark, no logo, no generated text. Preserve exact jewellery geometry and colors from source.`;
    }
    if (profile === 'idol') {
        return `

[PIPELINE — IDOL CATALOGUE STUDIO]
Smoky blue-charcoal cinematic backdrop (smooth gradient, zero grain), soft diffused multi-light relighting.
Hero framing: product including glass dome fills 82–88% of frame height — large, close, readable without zooming.
Natural curved glass highlights only — NO vertical white glare bars, NO pink/magenta reflection stripes on dome exterior, NO shadow of dome cast on backdrop.
Museum display feel — idol appears close to camera.${studioShadowAndSurfaceBlock()}`;
    }
    return aurraCinematicPromptBlock();
}

/**
 * Real macro inset from the SOURCE photo — exact feature preservation (Aurra-style kada ads).
 */
async function composeFeatureMacroInset(outputBuffer, sourceImagePath, profile = 'generic') {
    const sharp = getSharp();
    if (!sharp || profile !== 'kada' || !sourceImagePath || !fs.existsSync(sourceImagePath)) {
        return outputBuffer;
    }
    try {
        const outMeta = await sharp(outputBuffer).metadata();
        const w = outMeta.width || 1024;
        const h = outMeta.height || 1024;
        const insetDiam = Math.round(Math.min(w, h) * 0.21);
        const borderPad = 4;
        const frameSize = insetDiam + borderPad * 2;

        const srcMeta = await sharp(sourceImagePath).metadata();
        const sw = srcMeta.width || 0;
        const sh = srcMeta.height || 0;
        if (!sw || !sh) return outputBuffer;

        const cropW = Math.round(sw * 0.42);
        const cropH = Math.round(sh * 0.42);
        const left = Math.max(0, Math.round((sw - cropW) / 2));
        const top = Math.max(0, Math.round((sh - cropH) / 2));

        const feature = await sharp(sourceImagePath)
            .extract({ left, top, width: Math.min(cropW, sw - left), height: Math.min(cropH, sh - top) })
            .resize(insetDiam, insetDiam, { fit: 'cover', position: 'centre' })
            .sharpen({ sigma: 0.75, m1: 0.5, m2: 0.3 })
            .toBuffer();

        const maskSvg = `<svg width="${insetDiam}" height="${insetDiam}" xmlns="http://www.w3.org/2000/svg">
  <circle cx="${insetDiam / 2}" cy="${insetDiam / 2}" r="${insetDiam / 2 - 1}" fill="white"/>
</svg>`;
        const circular = await sharp(feature)
            .composite([{ input: Buffer.from(maskSvg), blend: 'dest-in' }])
            .png()
            .toBuffer();

        const frameSvg = `<svg width="${frameSize}" height="${frameSize}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <filter id="s" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="2" stdDeviation="3" flood-color="#000" flood-opacity="0.45"/>
    </filter>
  </defs>
  <circle cx="${frameSize / 2}" cy="${frameSize / 2}" r="${insetDiam / 2 + borderPad - 1}" fill="none" stroke="white" stroke-width="2" filter="url(#s)"/>
</svg>`;
        const frameBg = await sharp({
            create: {
                width: frameSize,
                height: frameSize,
                channels: 4,
                background: { r: 0, g: 0, b: 0, alpha: 0 },
            },
        })
            .composite([
                { input: Buffer.from(frameSvg), top: 0, left: 0 },
                { input: circular, top: borderPad, left: borderPad },
            ])
            .png()
            .toBuffer();

        const margin = Math.round(Math.min(w, h) * 0.035);
        const posLeft = w - frameSize - margin;
        const posTop = h - frameSize - margin;

        return sharp(outputBuffer)
            .composite([{ input: frameBg, top: posTop, left: posLeft }])
            .png()
            .toBuffer();
    } catch (e) {
        console.warn('macro inset skipped:', e.message);
        return outputBuffer;
    }
}

function shouldUseRembgForProfile(profile) {
    if (process.env.ENHANCED_SKIP_REMBG === '1') return false;
    if (profile === 'kada') return process.env.ENHANCED_REMBG_KADA === '1';
    return true;
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
• Hero catalogue framing — product fills 72–82% of frame height (idols) or 75–85% width (kadas); clearly readable without zooming; not tiny with excessive empty space.
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
    'No pink or magenta vertical reflection stripe on glass dome',
    'No fake barcode stripe reflections on glass',
    'No ghost or duplicated idol reflection on backdrop',
    'No shadow silhouette of glass dome on background wall',
    'No tiny distant product with excessive empty headroom',
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
    detectEnhancementProfile,
    isComprehensiveUserPrompt,
    profileStudioQualityBlock,
    composeFeatureMacroInset,
    shouldUseRembgForProfile,
};

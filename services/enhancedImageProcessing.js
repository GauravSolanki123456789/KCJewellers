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
 * Catalogue finish pass — crisp metal, clean shadows, no mushy AI softness.
 */
async function postprocessStudioOutput(buffer, mimeType = 'image/png') {
    const sharp = getSharp();
    if (!sharp || !buffer?.length) {
        return { buffer, mimeType };
    }
    try {
        let pipeline = sharp(buffer);
        const meta = await pipeline.metadata();
        const longEdge = Math.max(meta.width || 0, meta.height || 0);

        if (longEdge > 0 && longEdge < 1800) {
            pipeline = pipeline.resize({
                width: meta.width >= (meta.height || 0) ? 2048 : undefined,
                height: (meta.height || 0) > (meta.width || 0) ? 2048 : undefined,
                withoutEnlargement: false,
                kernel: sharp.kernel.lanczos3,
            });
        }

        const out = await pipeline
            .sharpen({ sigma: 0.9, m1: 0.55, m2: 0.35 })
            .modulate({ saturation: 1.03, brightness: 1.015 })
            .png({ compressionLevel: 6, quality: 100, effort: 7 })
            .toBuffer();

        return { buffer: out, mimeType: 'image/png' };
    } catch (e) {
        console.warn('enhanced postprocess skipped:', e.message);
        return { buffer, mimeType };
    }
}

function aurraCinematicPromptBlock() {
    return `

[AURRA CINEMATIC STUDIO — REFERENCE QUALITY]
Match premium jewellery catalogue output (Aurra Studio grade):
• 100% identity preservation — same idol/jewellery geometry, engravings, stones, dome, base.
• Exact color fidelity — preserve gold/silver tones, halo colors, gemstone hues from the source; do NOT recolor or saturate.
• Professional studio lighting — soft key + gentle rim + controlled top spotlight; readable shadow detail, no crushed blacks.
• High-fidelity micro-textures on metal — crisp specular highlights, not flat CGI plastic.
• Cinematic charcoal/midnight backdrop with soft vignette — replace cluttered shop/warehouse backgrounds entirely.
• AI ray-traced style reflections on glass/metal — subtle, physically plausible; NO white barcode stripes or fake glare bars on glass.
• 4K hyper-realistic commercial product render — editorial luxury, museum display feel.
• Centered composition, elegant negative space, square catalogue crop.`;
}

function spatialLockPromptBlock() {
    return `

[PIPELINE — SPATIAL LOCK]
The attached photo is the EXACT product. Do NOT redraw, warp, melt, recolor, or alter silhouette, proportions, engravings, halo color, gemstones, glass dome, or wood base.
Generate ONLY the studio environment, lighting, and reflections AROUND the locked product.
If shot through glass: keep the real dome shape and natural refraction — never replace with fake white reflection bars or duplicated ghost images.`;
}

module.exports = {
    getSharp,
    preprocessSourceForGemini,
    postprocessStudioOutput,
    aurraCinematicPromptBlock,
    spatialLockPromptBlock,
    writeTempBuffer,
};

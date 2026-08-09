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
async function preprocessSourceForGemini(sourceImagePath, options = {}) {
    const sharp = getSharp();
    if (!sharp || !sourceImagePath || !fs.existsSync(sourceImagePath)) {
        return { path: sourceImagePath, preprocessed: false };
    }
    try {
        const rq = String(options.renderQuality || '2k').toLowerCase();
        let target = 1536;
        if (rq === '4k') target = 2560;
        else if (rq === '2k') target = 2048;
        else if (options.preferHighRes) target = 2048;

        const meta = await sharp(sourceImagePath).metadata();
        const w = meta.width || 0;
        const h = meta.height || 0;
        const longEdge = Math.max(w, h);
        let pipeline = sharp(sourceImagePath).rotate();

        // Upscale phone photos so Gemini sees fine engravings, glass dome detail, and gemstone color.
        if (longEdge > 0 && longEdge < target) {
            pipeline =
                w >= h
                    ? pipeline.resize({ width: target, withoutEnlargement: false, kernel: sharp.kernel.lanczos3 })
                    : pipeline.resize({ height: target, withoutEnlargement: false, kernel: sharp.kernel.lanczos3 });
        }

        const buf = await pipeline
            .normalize()
            .sharpen({ sigma: rq === '4k' ? 0.35 : 0.28, m1: 0.4, m2: 0.22 })
            .jpeg({ quality: rq === '4k' ? 98 : 96, mozjpeg: true, chromaSubsampling: '4:4:4' })
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

function isWhiteCatalogMode(options = {}) {
    const bg = String(options.backgroundPreset || '').toLowerCase();
    if (bg === 'white') return true;
    const tk = String(options.templateKey || '').toLowerCase();
    if (/\bwhite\b/.test(tk) || tk.includes('white-layout') || tk.includes('white_layout')) {
        return true;
    }
    const pt = String(options.promptText || '').toLowerCase();
    if (
        /pure.{0,24}white|sterile white|white void|white catalogue|#ffffff|infinity-cove|high-key white|e-commerce.{0,20}white|warm white.{0,40}background/.test(
            pt,
        )
    ) {
        return true;
    }
    return false;
}

function metalColorPreservationBlock() {
    return `

[METAL & COLOR — CONDITIONAL (CRITICAL)]
Inspect the uploaded source photo before generating:
• If the source is plain silver/pewter/antique silver with NO gold → do NOT add gold plating, gold crowns, or gold ornaments.
• If the source has NO red, blue, or purple enamel/paint/garments → do NOT add tilak, colored dhotis, saris, or enamel accents.
• Preserve exact metal tone, oxidation, and paint from source — polish and sharpen only, never recolor or "upgrade" to gold/enamel.
• If gold or color IS present in source → preserve those exact hues and placement.`;
}

function sanitizePromptForWhiteCatalog(promptText) {
    let t = String(promptText || '');
    const replacements = [
        [
            /Center the enhanced idol on a luxurious, highly polished, rich wood display base[^\n.]*/gi,
            'Preserve whatever base is in the uploaded source — wood only if already present; do NOT add a wooden display base if the source has none',
        ],
        [
            /No props \(other than the required wood base\)/gi,
            'No props unless already part of the uploaded product',
        ],
        [
            /All ornamentation, clothing, and crowns are gold-plated[^\n.]*/gi,
            'Preserve ornamentation metal colors exactly as in the uploaded source — do NOT add gold plating if the source is plain silver',
        ],
        [
            /Enamel colors \(like the reds and blues[^\n.]*/gi,
            'Preserve paint/enamel colors exactly as in source only — do NOT add red, blue, or purple if not in the uploaded photo',
        ],
        [/Deep ruby reds\.[^\n]*/gi, ''],
        [/Royal muted purples\.[^\n]*/gi, ''],
        [/Rich champagne gold\.[^\n]*/gi, 'Preserve exact metal colors from source.'],
        [/Warm white\.[^\n]*ivory[^\n]*/gi, 'Pure white (#FFFFFF) background only'],
        [/Very subtle studio vignette/gi, 'No vignette on white background'],
        [/True-to-Life Wood Grain Preservation/gi, 'Wood grain only when wood base exists in source'],
    ];
    for (const [re, rep] of replacements) {
        t = t.replace(re, rep);
    }
    return t.trim();
}

function filterWorkflowHighlightsForWhiteIdol(highlights) {
    return (Array.isArray(highlights) ? highlights : [])
        .map((h) => {
            const l = String(h).trim();
            const lower = l.toLowerCase();
            if (!l) return null;
            if (lower.includes('wood grain') && !lower.includes('when') && !lower.includes('only')) {
                return 'Wood grain preservation only when present in source photo';
            }
            if (lower.includes('gold color') || lower.includes('silver & gold color')) {
                return 'Accurate metal colors from source — no added gold or enamel';
            }
            if (lower.includes('cinematic background')) {
                return 'Pure white studio background';
            }
            return l;
        })
        .filter(Boolean)
        .filter((h, i, arr) => arr.indexOf(h) === i);
}

function idolWhiteSupremacyOverrideBlock() {
    return `

[FINAL OVERRIDE — HIGHEST PRIORITY (SUPERSEDES ALL CONFLICTING TEXT ABOVE)]
The uploaded source photo is ABSOLUTE GROUND TRUTH for base type, metal color, and paint/enamel.
• Plain silver source with no wood base → output plain silver on pure #FFFFFF white with NO wooden pedestal.
• Wood base in source → preserve that exact wood base (shape, tiers, grain).
• Do NOT add gold plating, red/blue/purple enamel, colored garments, or tilak unless visible in the source.
• Do NOT add drum, flute, arch, or extra ornaments not in source.
• Background MUST be pure seamless #FFFFFF white — no cream, ivory, grey gradient, or vignette.
• Only improve lighting, sharpness, and background cleanup — never redesign the product.`;
}

function studioPolishPromptBlock(profile, backgroundPreset, options = {}) {
    if (profile === 'kada') {
        return `[PASS 2 — JEWELLERY IDENTITY POLISH (CRITICAL)]
Image 1 = draft studio render. Image 2 = original product photo (ABSOLUTE ground truth).
The jewellery in Image 2 is the exact product — preserve chain link structure, individual charms, enamel flower colors, stone placement, clasp type, and metal tone.
If Image 2 shows a FLEXIBLE CHAIN BRACELET with visible links and spaced charms, the output MUST NOT become a solid rigid bangle or merged band — restore every link and charm from Image 2.
If Image 2 shows a solid kada/bangle, preserve exact band width, engravings, and profile.
Fix: wrong product topology, melted metal, missing/extra charms, wrong gold/silver tone, blur, plastic CGI look, invented props.
Polish ONLY: backdrop velvet/studio surface, lighting, contact shadow, micro-sharpness. Do NOT redesign the jewellery.`;
    }
    const isWhite = isWhiteCatalogMode({
        backgroundPreset,
        templateKey: options.templateKey,
        promptText: options.promptText,
    });
    if (isWhite) {
        return `[PASS 2 — WHITE CATALOGUE POLISH]
Image 1 = draft studio render. Image 2 = original product photo (ABSOLUTE ground truth).
Final product must match Image 2 exactly — same pose, accessories, colors, proportions, and base type. Polish only backdrop, lighting, glass clarity, and sharpness.
Enhance: metal micro-texture, wood grain only if present in Image 2, glass clarity, pure white backdrop, even lighting.
Fix: grey backdrop cast, glass glare bars, blur, plastic CGI look, floating edges.
Do NOT add drum, flute, arch, ornaments, or wooden pedestal not in Image 2. Do NOT recolor, redesign, or convert base material.`;
    }
    return `[PASS 2 — STUDIO POLISH]
Image 1 = draft studio render. Image 2 = original product photo (ABSOLUTE ground truth).
Final product must match Image 2 exactly — same pose, accessories, colors, and proportions. Polish only backdrop, lighting, glass clarity, and sharpness.
Enhance: metallic micro-texture, glass dome clarity, backdrop smoothness, cinematic depth.
Fix: harsh overhead spotlight cone, glass glare bars, ghost reflections, muddy shadows, blur, plastic CGI look.
Do NOT add drum, flute, arch, or ornaments not in Image 2. Do NOT recolor or redesign.`;
}

async function assessOutputResolution(buffer, targetLong = 2048) {
    const sharp = getSharp();
    if (!sharp || !buffer?.length) return { ok: true, longEdge: 0, targetLong };
    try {
        const meta = await sharp(buffer).metadata();
        const longEdge = Math.max(meta.width || 0, meta.height || 0);
        const minOk = Math.round(targetLong * 0.72);
        return { ok: longEdge >= minOk, longEdge, targetLong, minOk };
    } catch {
        return { ok: true, longEdge: 0, targetLong };
    }
}

async function geminiNativeUpscale(sharp, buffer, targetLong) {
    if (!sharp || !buffer?.length || targetLong <= 0) return buffer;
    try {
        const meta = await sharp(buffer).metadata();
        const w = meta.width || 0;
        const h = meta.height || 0;
        const longEdge = Math.max(w, h);
        if (longEdge >= targetLong) return buffer;
        return sharp(buffer)
            .resize({
                width: w >= h ? targetLong : undefined,
                height: h > w ? targetLong : undefined,
                withoutEnlargement: false,
                kernel: sharp.kernel.lanczos3,
            })
            .sharpen({ sigma: 0.42, m1: 0.45, m2: 0.25 })
            .png()
            .toBuffer();
    } catch {
        return buffer;
    }
}

/**
 * Hero framing on pure white — e-commerce catalogue (matches sample references).
 */
async function applyIdolWhiteHeroFraming(sharp, buffer, w, h, fastMode = true, outputSize) {
    const canvasSize = outputSize || (fastMode ? 1600 : 2048);
    try {
        const trimmed = await sharp(buffer).trim({ threshold: 12 }).toBuffer({ resolveWithObject: true });
        const tw = trimmed.info.width || w;
        const th = trimmed.info.height || h;
        if (tw < 32 || th < 32) return buffer;

        const targetFill = 0.91;
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
                background: { r: 255, g: 255, b: 255, alpha: 1 },
            })
            .resize(canvasSize, canvasSize, { fit: 'cover', position: 'centre', kernel: sharp.kernel.lanczos3 })
            .toBuffer();

        const fw = canvasSize;
        const fh = canvasSize;
        const shadowSvg = `<svg width="${fw}" height="${fh}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <radialGradient id="s" cx="50%" cy="86%" rx="26%" ry="5%">
      <stop offset="0%" stop-color="#000" stop-opacity="0.2"/>
      <stop offset="55%" stop-color="#000" stop-opacity="0.08"/>
      <stop offset="100%" stop-color="#000" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="100%" height="100%" fill="url(#s)"/>
</svg>`;
        framed = await sharp(framed)
            .composite([{ input: Buffer.from(shadowSvg), blend: 'multiply' }])
            .toBuffer();

        const whitenSvg = `<svg width="${fw}" height="${fh}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <radialGradient id="w" cx="50%" cy="42%" r="72%">
      <stop offset="0%" stop-color="#fff" stop-opacity="0"/>
      <stop offset="68%" stop-color="#fff" stop-opacity="0"/>
      <stop offset="100%" stop-color="#fff" stop-opacity="0.55"/>
    </radialGradient>
  </defs>
  <rect width="100%" height="100%" fill="url(#w)"/>
</svg>`;
        framed = await sharp(framed)
            .composite([{ input: Buffer.from(whitenSvg), blend: 'lighten' }])
            .toBuffer();
        return framed;
    } catch (e) {
        console.warn('idol white hero framing skipped:', e.message);
        return buffer;
    }
}

function resolveOutputLongEdge(options = {}) {
    const rq = String(options.renderQuality || '2k').toLowerCase();
    const whiteCatalog = isWhiteCatalogMode(options);
    const fastMode = options.fastMode !== false;
    if (rq === '4k') return 4096;
    if (rq === '2k') return 2048;
    if (whiteCatalog && fastMode) return 1600;
    return 2048;
}

/**
 * Dark cinematic hero framing — charcoal pad + subtle glass anti-glare.
 */
async function applyIdolHeroFraming(sharp, buffer, w, h, targetSize = 2048) {
    try {
        const trimmed = await sharp(buffer).trim({ threshold: 14 }).toBuffer({ resolveWithObject: true });
        const tw = trimmed.info.width || w;
        const th = trimmed.info.height || h;
        if (tw < 32 || th < 32) return buffer;

        const targetFill = targetSize >= 4096 ? 0.86 : targetSize >= 2048 ? 0.84 : 0.8;
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
            .resize(targetSize, targetSize, { fit: 'cover', position: 'centre', kernel: sharp.kernel.lanczos3 })
            .toBuffer();

        const fw = targetSize;
        const fh = targetSize;
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
    const whiteCatalog = isWhiteCatalogMode(options);
    const targetLong = resolveOutputLongEdge(options);
    const qualityTier = String(options.renderQuality || '2k').toLowerCase();
    try {
        let working = sharp(buffer).rotate();
        const meta = await working.metadata();
        let w = meta.width || 0;
        let h = meta.height || 0;
        const longEdge = Math.max(w, h);
        const upscaleThreshold = Math.round(targetLong * 0.88);

        if (longEdge > 0 && longEdge < upscaleThreshold) {
            working = working.resize({
                width: w >= h ? targetLong : undefined,
                height: h > w ? targetLong : undefined,
                withoutEnlargement: false,
                kernel: sharp.kernel.lanczos3,
            });
            const resized = await working.metadata();
            w = resized.width || w;
            h = resized.height || h;
        }

        let baseBuf = await working.toBuffer();
        if (profile === 'idol' && whiteCatalog) {
            baseBuf = await applyIdolWhiteHeroFraming(sharp, baseBuf, w, h, fastMode, targetLong);
            const heroMeta = await sharp(baseBuf).metadata();
            w = heroMeta.width || w;
            h = heroMeta.height || h;
        } else if (profile === 'idol') {
            if (!fastMode || qualityTier !== 'standard') {
                baseBuf = await smoothBackdropKeepProductSharp(sharp, baseBuf, w, h);
            }
            baseBuf = await applyIdolHeroFraming(sharp, baseBuf, w, h, targetLong);
            const heroMeta = await sharp(baseBuf).metadata();
            w = heroMeta.width || w;
            h = heroMeta.height || h;
        } else if (profile !== 'kada' && !fastMode) {
            baseBuf = await smoothBackdropKeepProductSharp(sharp, baseBuf, w, h);
        }

        if (longEdge > 0 && longEdge < targetLong && profile !== 'idol') {
            baseBuf = await sharp(baseBuf)
                .resize(targetLong, targetLong, { fit: 'inside', kernel: sharp.kernel.lanczos3 })
                .toBuffer();
            const upMeta = await sharp(baseBuf).metadata();
            w = upMeta.width || w;
            h = upMeta.height || h;
        }

        const composites = [];
        if (!whiteCatalog && profile !== 'kada' && profile !== 'idol') {
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

        if (!whiteCatalog) {
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
        }

        let pipeline = sharp(baseBuf).sharpen({
            sigma: qualityTier === '4k' ? 0.62 : whiteCatalog ? (fastMode ? 0.5 : 0.58) : fastMode ? 0.45 : 0.55,
            m1: qualityTier === '4k' ? 0.52 : 0.45,
            m2: qualityTier === '4k' ? 0.32 : 0.28,
        });

        if (profile === 'kada') {
            pipeline = pipeline.modulate({ saturation: 1.02, brightness: 1.01 });
        } else if (whiteCatalog) {
            pipeline = pipeline.modulate({ saturation: 1.04, brightness: 1.015 });
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
        vk.includes('bracelet') ||
        vk.includes('bangle') ||
        vk.includes('ladies') ||
        tk.includes('kada') ||
        tk.includes('bangle') ||
        tk.includes('bracelet') ||
        pt.includes('uploaded kada') ||
        pt.includes('uploaded jewellery') ||
        pt.includes('standing upright') ||
        (pt.includes('kada') && pt.includes('macro close-up inset')) ||
        (pt.includes('bracelet') && pt.includes('100% identity'))
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

function whiteCatalogShadowBlock() {
    return `

[SHADOW & SURFACE — WHITE CATALOGUE]
• Pure seamless white (#FFFFFF) infinity-cove background — NO grey gradient wall, NO cream cast, NO dark vignette.
• Bright even diffused studio lighting — soft key + fill like premium Amazon/Flipkart jewellery listings.
• ONLY a very soft subtle contact shadow directly under the product base on the white floor.
• NO cast shadow on the white backdrop wall, NO dark shadow blob, NO harsh spotlight ring.
• Preserve crisp silver/gold micro-texture, natural wood grain on bases when present in source, and clean glass refraction when dome is present.
• Remove ALL shop clutter, plastic bags, hands, price tags, messy tables from the scene.`;
}

function woodBaseConditionalBlock() {
    return `

[BASE / PEDESTAL — CONDITIONAL (CRITICAL)]
Inspect the uploaded source photo carefully before generating:
• If the source HAS a wooden base/pedestal/plinth under the idol → preserve it exactly (same shape, size, tier count, wood grain, finish). Polish only — do NOT remove, replace, or convert to a different material.
• If the source has NO wooden base (idol sits directly on white/table surface, only metal feet, or no visible pedestal) → do NOT add any wooden pedestal, wooden plinth, wooden platform, or wooden "display base". Never invent wood at the bottom.
• If the source has a black, metal, acrylic, or stone display base (not wood) → keep that exact base type — do NOT convert it to wood.
• Never add a new base type that was not visible in the source photo.`;
}

function idolWhiteCatalogPromptBlock() {
    return `

[PIPELINE — IDOL WHITE CATALOGUE (E-COMMERCE REFERENCE)]
Pure seamless white background (#FFFFFF) — identical to premium jewellery product photography references.
Product (idol + whatever base is in the source — wood, black, metal, or none — with OR without glass dome) centered, fills 78–88% of frame height.
Bright even diffused studio lighting — no harsh shadows on white backdrop.
ONLY soft subtle grey contact shadow directly under the base when a base exists — never a dark blob on the white floor.
Crisp silver/gold micro-texture, natural metallic speculars, engraved detail sharp and readable.
Glass dome when present: clean natural refraction — NO pink/magenta stripes, NO white glare bars, NO ghost reflections.${woodBaseConditionalBlock()}${metalColorPreservationBlock()}${whiteCatalogShadowBlock()}`;
}

function idolPremiumStudioBlock() {
    return `

[PIPELINE — IDOL PREMIUM STUDIO]
Match premium jewellery catalogue idol photography — one-shot museum-grade output from any phone photo.
Backdrop: soft champagne/silver-grey draped fabric OR smooth smoky blue-charcoal gradient — elegant depth, zero grain, zero muddy flat grey.
Glass cloche/dome when present: crystal-clear with soft curved natural highlights; idol inside sharp and identical to source — same pose, same accessories; NO vertical white glare bars, NO pink/magenta stripes, NO ghost duplicate on backdrop.
Lighting: soft diffused multi-source studio (large softbox key + fill + subtle rim) — NOT a harsh overhead spotlight cone, NOT bright circular floor hotspot.
Surface: dark polished stone or matte black pedestal; soft contact shadow under base only — no cast shadow on backdrop wall.
Hero framing: product including glass dome fills 82–88% of frame height — large close catalogue hero.${studioShadowAndSurfaceBlock()}`;
}

function profileStudioQualityBlock(profile, backgroundPreset, options = {}) {
    const isWhite = isWhiteCatalogMode({
        backgroundPreset,
        templateKey: options.templateKey,
        promptText: options.promptText,
    });
    if (profile === 'kada') {
        return `

[PIPELINE — KADA LUXURY ADVERT]
Matte black natural slate pedestal, soft diffused invisible studio lighting, balanced HDR metallic reflections.
Do NOT draw or generate a macro inset circle — leave bottom-right corner clear; a real inset from the source photo is composited automatically in post.
No watermark, no logo, no generated text. Preserve exact jewellery geometry and colors from source.`;
    }
    if (profile === 'idol' && isWhite) {
        return idolWhiteCatalogPromptBlock();
    }
    if (profile === 'idol') {
        return idolPremiumStudioBlock();
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
    return true;
}

function jewelryStructuralIdentityBlock() {
    return `

[JEWELLERY STRUCTURAL IDENTITY — CRITICAL (READ BEFORE GENERATING)]
Classify the uploaded product precisely:
• FLEXIBLE CHAIN / LINK BRACELET: visible individual chain links, lobster clasp, charms spaced along the chain — preserve EVERY link, charm, flower, and stone. Do NOT convert to a solid rigid bangle, cuff, or merged band. Do NOT simplify into a vertical pillar or stacked disc shape.
• SOLID BANGLE / KADA: continuous rigid band — preserve exact width, curvature, engravings, and emblem.
• RING / NECKLACE / EARRINGS: preserve exact design topology and component count.

If standing/upright pose is requested on a flat chain bracelet: rearrange the SAME chain into an upright circle or oval balanced on edge — identical links, charms, colors, and clasp — NOT a different rigid bangle silhouette.
Change ONLY pose, background, lighting, and environment — never product design.`;
}

const JEWELRY_NEGATIVE_LINES = [
    'No converting chain bracelet to solid bangle',
    'No converting flexible links to rigid band',
    'No vertical pillar or stacked disc shape',
    'No missing or extra flower charms',
    'No changed enamel flower colors',
    'No melted or merged chain links',
    'No simplified jewellery geometry',
    'No invented clasp or heart charm if not in source',
    'No jewellery holder or stand unless requested',
    'No floating disconnected charms',
];

function backgroundColorsForPreset(preset) {
    const key = String(preset || 'charcoal').toLowerCase();
    const map = {
        white: { top: '#ffffff', mid: '#fafafa', bottom: '#f0f0f0', surface: '#ffffff', accent: '#e8e8e8' },
        black: { top: '#222222', mid: '#111111', bottom: '#000000', surface: '#0a0a0a', accent: '#1a1a1a' },
        blue: { top: '#0f1a2e', mid: '#1a2844', bottom: '#0a1220', surface: '#152238', accent: '#1e3050' },
        charcoal: { top: '#2a3140', mid: '#1a2030', bottom: '#121820', surface: '#252b38', accent: '#303848' },
        red: { top: '#4a1020', mid: '#5c1428', bottom: '#2a0810', surface: '#401018', accent: '#581828' },
        emerald: { top: '#0f2818', mid: '#183828', bottom: '#081810', surface: '#123020', accent: '#1a4030' },
        cream: { top: '#f5efe6', mid: '#ebe3d6', bottom: '#ddd4c4', surface: '#f0e8dc', accent: '#e5dcc8' },
    };
    return map[key] || map.charcoal;
}

function isSamePoseVisualization(visualization) {
    const v = String(visualization || 'studio').toLowerCase();
    return v === 'studio' || v === 'sleeping';
}

function requiresGenerativeVisualization(visualization) {
    return !isSamePoseVisualization(visualization);
}

async function createLuxuryStudioBackground(width, height, backgroundPreset = 'charcoal') {
    const sharp = getSharp();
    if (!sharp) return null;
    const w = Math.max(512, Math.round(width));
    const h = Math.max(512, Math.round(height));
    const c = backgroundColorsForPreset(backgroundPreset);
    const isWhite = String(backgroundPreset).toLowerCase() === 'white';
    const svg = `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="${c.top}"/>
      <stop offset="55%" stop-color="${c.mid}"/>
      <stop offset="100%" stop-color="${c.bottom}"/>
    </linearGradient>
    <radialGradient id="spot" cx="50%" cy="72%" r="55%">
      <stop offset="0%" stop-color="${c.surface}" stop-opacity="0.95"/>
      <stop offset="100%" stop-color="${c.accent}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="vig" cx="50%" cy="38%" r="82%">
      <stop offset="55%" stop-color="#000" stop-opacity="0"/>
      <stop offset="100%" stop-color="#000" stop-opacity="${isWhite ? '0.04' : '0.22'}"/>
    </radialGradient>
  </defs>
  <rect width="100%" height="100%" fill="url(#bg)"/>
  <rect width="100%" height="100%" fill="url(#spot)"/>
  <rect width="100%" height="100%" fill="url(#vig)"/>
</svg>`;
    try {
        let bg = await sharp(Buffer.from(svg)).resize(w, h).png().toBuffer();
        if (!isWhite) {
            const grain = await sharp({
                create: { width: w, height: h, channels: 3, background: { r: 128, g: 128, b: 128 } },
            })
                .png()
                .toBuffer();
            bg = await sharp(bg)
                .composite([{ input: grain, blend: 'overlay', opacity: 0.035 }])
                .png()
                .toBuffer();
        }
        return bg;
    } catch (e) {
        console.warn('studio background generation skipped:', e.message);
        return null;
    }
}

async function compositeProductCutoutOntoStudio(cutoutBuffer, options = {}) {
    const sharp = getSharp();
    if (!sharp || !cutoutBuffer?.length) return null;
    const targetLong = resolveOutputLongEdge(options);
    const size = targetLong;
    const bg = await createLuxuryStudioBackground(size, size, options.backgroundPreset || 'charcoal');
    if (!bg) return null;
    try {
        const trimmed = await sharp(cutoutBuffer).trim({ threshold: 12 }).toBuffer({ resolveWithObject: true });
        const tw = trimmed.info.width || 0;
        const th = trimmed.info.height || 0;
        if (tw < 24 || th < 24) return null;

        const targetFill = options.profile === 'kada' ? 0.84 : 0.78;
        const maxDim = Math.round(size * targetFill);
        const scale = maxDim / Math.max(tw, th);
        const nw = Math.round(tw * scale);
        const nh = Math.round(th * scale);
        const product = await sharp(trimmed.data)
            .resize(nw, nh, { kernel: sharp.kernel.lanczos3 })
            .png()
            .toBuffer();

        const left = Math.round((size - nw) / 2);
        const top = Math.round((size - nh) / 2 + size * 0.03);
        const shadowW = Math.round(nw * 0.72);
        const shadowH = Math.round(nh * 0.1);
        const shadowSvg = `<svg width="${shadowW}" height="${shadowH}" xmlns="http://www.w3.org/2000/svg">
  <ellipse cx="${shadowW / 2}" cy="${shadowH / 2}" rx="${shadowW / 2}" ry="${shadowH / 2}" fill="#000" fill-opacity="0.38"/>
</svg>`;
        const shadowBuf = await sharp(Buffer.from(shadowSvg)).blur(2.5).png().toBuffer();
        const shadowLeft = left + Math.round((nw - shadowW) / 2);
        const shadowTop = top + nh - Math.round(shadowH * 0.35);

        const result = await sharp(bg)
            .composite([
                { input: shadowBuf, left: shadowLeft, top: shadowTop, blend: 'multiply' },
                { input: product, left, top, blend: 'over' },
            ])
            .png()
            .toBuffer();
        return { buffer: result, mimeType: 'image/png' };
    } catch (e) {
        console.warn('cutout composite skipped:', e.message);
        return null;
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
• Hero catalogue framing — product fills 72–82% of frame height (idols) or 75–85% width (kadas); clearly readable without zooming; not tiny with excessive empty space.
• 4K hyper-realistic commercial product render — editorial luxury, museum display feel.
• Centered composition, elegant negative space, square catalogue crop.${studioShadowAndSurfaceBlock()}`;
}

function spatialLockPromptBlock(options = {}) {
    if (isWhiteCatalogMode(options)) {
        return `

[PIPELINE — SPATIAL LOCK (WHITE CATALOGUE)]
The attached photo is the EXACT product. Do NOT redraw, warp, melt, recolor, or alter silhouette, proportions, engravings, halo color, gemstones, glass dome, or display base.
Generate ONLY a pure white seamless studio environment and professional relighting AROUND the locked product.
Replace any shop/warehouse/table clutter with clean #FFFFFF infinity-cove background.
If shot through glass: keep the real dome shape and natural refraction — never fake white glare bars or duplicated ghost images.
Do NOT copy messy shop shadows onto the white backdrop — use only a soft contact shadow under the base when a base exists in source.${woodBaseConditionalBlock()}${metalColorPreservationBlock()}${whiteCatalogShadowBlock()}`;
    }
    return `

[PIPELINE — SPATIAL LOCK]
The attached photo is the EXACT product. Do NOT redraw, warp, melt, recolor, or alter silhouette, proportions, engravings, halo color, gemstones, glass dome, or wood base.
Generate ONLY the studio environment, lighting, and reflections AROUND the locked product.
If shot through glass: keep the real dome shape and natural refraction — never replace with fake white reflection bars or duplicated ghost images.
Relight the scene; do NOT copy messy shop shadows, wall shadows, or spotlight rings from the source photo onto the new backdrop.${studioShadowAndSurfaceBlock()}`;
}

const WHITE_CATALOG_NEGATIVE_LINES = [
    'No grey or cream background',
    'No dark charcoal or navy backdrop',
    'No dark vignette or edge darkening',
    'No smoky gradient wall on white template',
    'No dark shadow blob on white floor',
    'No yellow or green color cast on white background',
    'No visible table edge or horizon line',
    'No plastic bag or packaging in frame',
    'No price tag or sticker visible',
    'No added wooden pedestal if not in source',
    'No invented wooden plinth or platform',
    'No converting black or metal base to wood',
    'No added gold plating if source is plain silver',
    'No added red blue or purple enamel if not in source',
    'No added colored garments or tilak if not in source',
];

/** Always appended to negative prompts for catalogue shadow cleanup. */
const SYSTEM_STUDIO_NEGATIVE_LINES = [
    'No added drum or mridangam if not in source',
    'No added flute or accessories not in source',
    'No pose change from source photo',
    'No added golden arch or halo if not in source',
    'No garment or dhoti color change',
    'No harsh overhead spotlight cone',
    'No bright circular floor spotlight pool',
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

function mergeSystemNegativePrompt(userNegative, options = {}) {
    const lines = String(userNegative || '')
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean);
    const seen = new Set(lines.map((l) => l.toLowerCase()));
    const extra = isWhiteCatalogMode(options) ? WHITE_CATALOG_NEGATIVE_LINES : [];
    const profile = options.profile || 'generic';
    const jewelryExtra = profile === 'kada' ? JEWELRY_NEGATIVE_LINES : [];
    for (const line of [...SYSTEM_STUDIO_NEGATIVE_LINES, ...extra, ...jewelryExtra]) {
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
    whiteCatalogShadowBlock,
    woodBaseConditionalBlock,
    idolWhiteCatalogPromptBlock,
    idolPremiumStudioBlock,
    mergeSystemNegativePrompt,
    SYSTEM_STUDIO_NEGATIVE_LINES,
    WHITE_CATALOG_NEGATIVE_LINES,
    writeTempBuffer,
    detectEnhancementProfile,
    isComprehensiveUserPrompt,
    profileStudioQualityBlock,
    composeFeatureMacroInset,
    shouldUseRembgForProfile,
    isWhiteCatalogMode,
    metalColorPreservationBlock,
    sanitizePromptForWhiteCatalog,
    filterWorkflowHighlightsForWhiteIdol,
    idolWhiteSupremacyOverrideBlock,
    studioPolishPromptBlock,
    assessOutputResolution,
    geminiNativeUpscale,
    resolveOutputLongEdge,
    jewelryStructuralIdentityBlock,
    JEWELRY_NEGATIVE_LINES,
    createLuxuryStudioBackground,
    compositeProductCutoutOntoStudio,
    isSamePoseVisualization,
    requiresGenerativeVisualization,
    backgroundColorsForPreset,
};

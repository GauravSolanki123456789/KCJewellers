/**
 * Post-process watermark + informational text overlays for Enhanced Pictures.
 */

const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { getSharp, isWhiteCatalogMode } = require('./enhancedImageProcessing');

const OVERLAY_POSITIONS = new Set([
    'top-left',
    'top-right',
    'bottom-left',
    'bottom-right',
    'center',
]);

function defaultOverlaySettings() {
    return {
        watermark_enabled: false,
        watermark_url: null,
        watermark_position: 'bottom-right',
        watermark_opacity: 0.88,
        watermark_scale: 0.16,
        info_text_enabled: false,
        info_text_lines: ['{variety}', '{sku}', '{weight}'],
        info_text_position: 'bottom-right',
        info_text_color: '#1a1814',
        info_text_size: 32,
        studio_prefs: {
            backgroundPreset: 'charcoal',
            visualization: 'studio',
            renderQuality: '2k',
            apply_watermark: false,
            apply_info_text: false,
        },
    };
}

function normalizeStudioPrefs(raw, base) {
    const sp = raw && typeof raw.studio_prefs === 'object' ? raw.studio_prefs : {};
    const b = base.studio_prefs || {};
    const rq = String(sp.renderQuality || sp.render_quality || b.renderQuality || '2k').toLowerCase();
    return {
        backgroundPreset: String(sp.backgroundPreset || sp.background_preset || b.backgroundPreset || 'charcoal')
            .trim()
            .toLowerCase(),
        visualization: String(sp.visualization || b.visualization || 'studio').trim().toLowerCase(),
        renderQuality: rq === '4k' ? '4k' : rq === 'standard' ? 'standard' : '2k',
        apply_watermark: sp.apply_watermark != null ? !!sp.apply_watermark : !!b.apply_watermark,
        apply_info_text: sp.apply_info_text != null ? !!sp.apply_info_text : !!b.apply_info_text,
    };
}

function normalizeOverlaySettings(raw) {
    const base = defaultOverlaySettings();
    if (!raw || typeof raw !== 'object') return base;
    const pos = String(raw.watermark_position || base.watermark_position).toLowerCase();
    const textPos = String(raw.info_text_position || base.info_text_position).toLowerCase();
    return {
        watermark_enabled: !!raw.watermark_enabled,
        watermark_url: raw.watermark_url ? String(raw.watermark_url).trim().slice(0, 500) : null,
        watermark_position: OVERLAY_POSITIONS.has(pos) ? pos : base.watermark_position,
        watermark_opacity: Math.min(1, Math.max(0.2, Number(raw.watermark_opacity) || base.watermark_opacity)),
        watermark_scale: Math.min(0.4, Math.max(0.06, Number(raw.watermark_scale) || base.watermark_scale)),
        info_text_enabled: !!raw.info_text_enabled,
        info_text_lines: Array.isArray(raw.info_text_lines)
            ? raw.info_text_lines.map((l) => String(l).trim()).filter(Boolean).slice(0, 8)
            : base.info_text_lines,
        info_text_position: OVERLAY_POSITIONS.has(textPos) ? textPos : base.info_text_position,
        info_text_color: /^#[0-9a-fA-F]{3,8}$/.test(String(raw.info_text_color || ''))
            ? String(raw.info_text_color)
            : base.info_text_color,
        info_text_size: Math.min(56, Math.max(16, parseInt(String(raw.info_text_size || base.info_text_size), 10) || base.info_text_size)),
        studio_prefs: normalizeStudioPrefs(raw, base),
    };
}

function escapeXml(s) {
    return String(s || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function formatWeight(productMeta) {
    if (!productMeta) return '';
    const wd = productMeta.weight_display || productMeta.weightDisplay;
    if (wd) return String(wd).trim();
    const net = productMeta.net_weight ?? productMeta.netWeight;
    const gross = productMeta.gross_weight ?? productMeta.grossWeight;
    const n = net != null ? Number(net) : NaN;
    const g = gross != null ? Number(gross) : NaN;
    if (Number.isFinite(n) && n > 0) return `${n.toFixed(2)} G`;
    if (Number.isFinite(g) && g > 0) return `${g.toFixed(2)} G`;
    return '';
}

function isLightColor(hex) {
    const h = String(hex || '#ffffff').replace('#', '');
    if (h.length < 3) return true;
    const full =
        h.length === 3
            ? h
                  .split('')
                  .map((c) => c + c)
                  .join('')
            : h.slice(0, 6);
    const r = parseInt(full.slice(0, 2), 16);
    const g = parseInt(full.slice(2, 4), 16);
    const b = parseInt(full.slice(4, 6), 16);
    if (!Number.isFinite(r) || !Number.isFinite(g) || !Number.isFinite(b)) return true;
    return (r * 299 + g * 587 + b * 114) / 1000 > 160;
}

function resolveOverlayTextLines(settings, meta = {}) {
    const lines = settings.info_text_lines?.length ? settings.info_text_lines : ['{variety}', '{sku}', '{weight}'];
    const tokens = {
        '{variety}': String(meta.variety_label || meta.variety || '').trim(),
        '{template}': String(meta.template_label || meta.template || '').trim(),
        '{sku}': String(meta.sku || meta.barcode_stem || meta.item_code || '').trim(),
        '{style_code}': String(meta.style_code || meta.item_code || meta.design_group || '').trim(),
        '{weight}': formatWeight(meta.product),
        '{product_name}': String(meta.product_name || '').trim(),
        '{barcode}': String(meta.barcode || meta.barcode_stem || '').trim(),
    };
    return lines
        .map((line) => {
            let out = String(line);
            for (const [key, val] of Object.entries(tokens)) {
                out = out.split(key).join(val);
            }
            return out.trim().toUpperCase();
        })
        .filter(Boolean);
}

function positionCoords(position, w, h, boxW, boxH, margin) {
    const m = margin;
    switch (position) {
        case 'top-right':
            return { left: w - boxW - m, top: m };
        case 'bottom-left':
            return { left: m, top: h - boxH - m };
        case 'bottom-right':
            return { left: w - boxW - m, top: h - boxH - m };
        case 'center':
            return { left: Math.round((w - boxW) / 2), top: Math.round((h - boxH) / 2) };
        case 'top-left':
        default:
            return { left: m, top: m };
    }
}

function buildInfoTextSvg(lines, w, h, position, color, fontSize) {
    const scale = 2;
    const sw = w * scale;
    const sh = h * scale;
    const fs = Math.round(fontSize * scale);
    const lineHeight = Math.round(fs * 1.22);
    const pad = 20 * scale;
    const maxChars = Math.max(...lines.map((l) => l.length), 1);
    const boxW = Math.min(sw - pad * 2, Math.max(120 * scale, maxChars * fs * 0.56));
    const boxH = lines.length * lineHeight + pad;
    const { left, top } = positionCoords(position, sw, sh, boxW, boxH, pad);
    const anchor =
        position === 'top-right' || position === 'bottom-right'
            ? 'end'
            : position === 'center'
              ? 'middle'
              : 'start';
    const textX =
        position === 'top-right' || position === 'bottom-right'
            ? left + boxW - 8 * scale
            : position === 'center'
              ? left + boxW / 2
              : left + 8 * scale;
    const textY = top + fs + 4 * scale;
    const light = isLightColor(color);
    const defs = light
        ? `<filter id="tshadow" x="-30%" y="-30%" width="160%" height="160%">
    <feDropShadow dx="0" dy="${scale}" stdDeviation="${scale * 1.5}" flood-color="#000" flood-opacity="0.65"/>
  </filter>`
        : '';
    const filterAttr = light ? ' filter="url(#tshadow)"' : '';
    const strokeAttr = light
        ? ''
        : ` stroke="#ffffff" stroke-width="${Math.max(2, scale * 1.2)}" paint-order="stroke fill"`;
    const tspans = lines
        .map(
            (line, i) =>
                `<tspan x="${textX}" dy="${i === 0 ? 0 : lineHeight}">${escapeXml(line)}</tspan>`,
        )
        .join('');
    return Buffer.from(
        `<svg width="${sw}" height="${sh}" xmlns="http://www.w3.org/2000/svg">
  <defs>${defs}</defs>
  <text x="${textX}" y="${textY}" fill="${escapeXml(color)}" font-family="Arial, Helvetica, sans-serif" font-size="${fs}" font-weight="800" letter-spacing="0.04em" text-anchor="${anchor}"${filterAttr}${strokeAttr}>${tspans}</text>
</svg>`,
    );
}

async function loadWatermarkBuffer(watermarkUrl, enhancedDir, getPublicApiBaseUrl) {
    const url = String(watermarkUrl || '').trim();
    if (!url) return null;
    try {
        if (url.startsWith('http://') || url.startsWith('https://')) {
            const res = await axios.get(url, { responseType: 'arraybuffer', timeout: 30000 });
            return Buffer.from(res.data);
        }
        const base = String(getPublicApiBaseUrl?.() || '').replace(/\/$/, '');
        const rel = url.replace(/^\/+/, '');
        const localPath = rel.includes('uploads/')
            ? path.join(process.cwd(), rel.replace(/^uploads\//, 'uploads/'))
            : path.join(enhancedDir || path.join(process.cwd(), 'uploads/web_products/enhanced'), path.basename(url));
        if (fs.existsSync(localPath)) return fs.readFileSync(localPath);
        if (base) {
            const res = await axios.get(`${base}/${rel}`, { responseType: 'arraybuffer', timeout: 30000 });
            return Buffer.from(res.data);
        }
    } catch (e) {
        console.warn('watermark load failed:', e.message);
    }
    return null;
}

/**
 * Apply watermark and/or info text onto a generated image buffer.
 */
async function applyImageOverlays(buffer, mimeType, settingsRaw, meta = {}, deps = {}) {
    const sharp = getSharp();
    if (!sharp || !buffer?.length) return { buffer, mimeType };

    const settings = normalizeOverlaySettings(settingsRaw);
    const applyWatermark =
        (meta.apply_watermark != null ? !!meta.apply_watermark : settings.watermark_enabled) &&
        settings.watermark_url;
    const applyText =
        (meta.apply_info_text != null ? !!meta.apply_info_text : settings.info_text_enabled);

    if (!applyWatermark && !applyText) return { buffer, mimeType };

    try {
        const metaImg = await sharp(buffer).metadata();
        const w = metaImg.width || 1024;
        const h = metaImg.height || 1024;
        const composites = [];

        if (applyText) {
            const lines = resolveOverlayTextLines(settings, meta);
            if (lines.length) {
                const svg = buildInfoTextSvg(
                    lines,
                    w,
                    h,
                    settings.info_text_position,
                    settings.info_text_color,
                    settings.info_text_size,
                );
                const textLayer = await sharp(svg)
                    .resize(w, h, { kernel: sharp.kernel.lanczos3 })
                    .png()
                    .toBuffer();
                composites.push({ input: textLayer, blend: 'over' });
            }
        }

        if (applyWatermark) {
            const wmBuf = await loadWatermarkBuffer(
                settings.watermark_url,
                deps.enhancedDir,
                deps.getPublicApiBaseUrl,
            );
            if (wmBuf?.length) {
                const targetW = Math.round(w * settings.watermark_scale);
                const wmMeta = await sharp(wmBuf).metadata();
                const aspect = (wmMeta.width || 1) / (wmMeta.height || 1);
                const targetH = Math.round(targetW / aspect);
                const wmResized = await sharp(wmBuf)
                    .resize(targetW, targetH, { fit: 'inside' })
                    .ensureAlpha()
                    .modulate({ brightness: 1 })
                    .toBuffer();
                const margin = Math.round(Math.min(w, h) * 0.035);
                const { left, top } = positionCoords(
                    settings.watermark_position,
                    w,
                    h,
                    targetW,
                    targetH,
                    margin,
                );
                composites.push({
                    input: wmResized,
                    top,
                    left,
                    blend: 'over',
                    opacity: settings.watermark_opacity,
                });
            }
        }

        if (!composites.length) return { buffer, mimeType };

        const out = await sharp(buffer).composite(composites).png({ compressionLevel: 6, quality: 100 }).toBuffer();
        return { buffer: out, mimeType: 'image/png' };
    } catch (e) {
        console.warn('overlay apply skipped:', e.message);
        return { buffer, mimeType };
    }
}

const BACKGROUND_PRESETS = {
    charcoal: 'Deep charcoal to midnight blue smoky cinematic studio backdrop with soft vignette',
    black: 'Pure matte black luxury studio background with subtle gradient',
    white: 'Pure seamless white infinity-cove studio background (#FFFFFF) — premium e-commerce catalogue identical to Amazon/Flipkart jewellery product shots',
    red: 'Deep rich burgundy-red luxury studio backdrop',
    blue: 'Deep navy blue luxury studio backdrop',
    emerald: 'Dark emerald green luxury studio backdrop',
    cream: 'Warm ivory cream luxury studio backdrop',
};

const VISUALIZATION_PRESETS = {
    studio:
        'Classic luxury studio pedestal/tabletop presentation. Product centered on an elegant matte stone, velvet, or suede surface matching the selected background colour. Eye-level catalogue framing with soft contact shadow.',
    prop: 'Place the product on an elegant minimal luxury display prop or pedestal appropriate for jewellery catalogue photography. Premium showroom look.',
    hand_female:
        'Show the jewellery naturally worn on an elegant female hand — manicured, soft skin tone, cropped at wrist. Premium editorial catalogue look. Product identity unchanged.',
    hand_male:
        'Show the jewellery naturally worn on a male hand — cropped at wrist. Premium editorial catalogue look. Product identity unchanged.',
    standing:
        'STANDING UPRIGHT DISPLAY: For bangles/bracelets — place the jewellery standing vertically on its edge (portrait orientation), balanced naturally on the studio surface with a subtle contact shadow. Rotate so the decorative centerpiece faces the camera with a slight 10–15° angle for depth. For rings — upright on band edge when possible. For idols — upright on existing base. Change ONLY pose/arrangement — preserve 100% design, metal colour, stones, and proportions from the uploaded photo.',
    sleeping:
        'FLAT LAY / SLEEPING POSE: Product lying flat in classic catalogue flat-lay arrangement on the studio surface. Full design visible. Preserve 100% identity — only change to horizontal resting pose.',
    mixed_bangles:
        'For paired bangles/kadas: one piece standing upright inside the circle of the other lying flat — classic dual-angle catalogue arrangement. Preserve exact design on both pieces.',
};

function visualizationOverrideBlock(visualization, profile = 'generic') {
    const vizKey = String(visualization || 'studio').toLowerCase();
    const vizText = VISUALIZATION_PRESETS[vizKey];
    if (!vizText || vizKey === 'studio') {
        return `

[USER VISUALIZATION — STUDIO (HIGHEST PRIORITY)]
Present the product in a classic luxury studio pedestal/tabletop arrangement matching the selected background colour.
Centered hero framing, soft contact shadow, premium commercial catalogue quality.`;
    }
    const poseNote =
        vizKey === 'standing'
            ? '\nIf the source photo shows the product flat, change ONLY the pose to standing upright while keeping every design detail identical to the source.'
            : vizKey === 'sleeping'
              ? '\nIf the source photo shows the product standing, change ONLY the pose to flat lay while keeping every design detail identical to the source.'
              : '';
    const profileNote =
        profile === 'kada' || profile === 'generic'
            ? '\nJewellery identity lock: same gold tone, stone placement, engravings, and proportions as the uploaded reference.'
            : '';
    return `

[USER VISUALIZATION — ${vizKey.toUpperCase()} (HIGHEST PRIORITY — OVERRIDE CONFLICTING POSE/BACKGROUND TEXT ABOVE)]
${vizText}${poseNote}${profileNote}
Ignore any conflicting pose or background instructions elsewhere in this prompt — this visualization selection wins.`;
}

function backgroundPresetOverrideBlock(backgroundPreset, profile = 'generic') {
    const bgKey = String(backgroundPreset || 'charcoal').toLowerCase();
    const bgText = BACKGROUND_PRESETS[bgKey] || BACKGROUND_PRESETS.charcoal;
    if (bgKey === 'white') {
        return `

[USER BACKGROUND — WHITE (HIGHEST PRIORITY — OVERRIDE CONFLICTING BACKGROUND TEXT ABOVE)]
Pure seamless white (#FFFFFF) infinity-cove background only. Ignore any dark, blue, charcoal, or velvet background instructions above.
Bright even diffused studio lighting. Soft contact shadow under product when a base exists.`;
    }
    if (bgKey === 'blue') {
        return `

[USER BACKGROUND — NAVY BLUE (HIGHEST PRIORITY — OVERRIDE CONFLICTING BACKGROUND TEXT ABOVE)]
Luxurious deep navy-blue velvet/suede studio backdrop with elegant soft folds and smooth gradients, fading to darker blue-black at top.
Premium showroom atmosphere. NO flowers, NO props, NO text. Match Aurra Studio luxury blue campaign quality.`;
    }
    if (bgKey === 'black') {
        return `

[USER BACKGROUND — BLACK (HIGHEST PRIORITY — OVERRIDE CONFLICTING BACKGROUND TEXT ABOVE)]
Pure matte black luxury studio background with subtle gradient. Ignore any white or coloured backdrop instructions above.`;
    }
    return `

[USER BACKGROUND — ${bgKey.toUpperCase()} (HIGHEST PRIORITY — OVERRIDE CONFLICTING BACKGROUND TEXT ABOVE)]
${bgText}
Ignore any conflicting background colour instructions elsewhere in this prompt — this background selection wins.${profile === 'idol' && bgKey !== 'white' ? ' Relight only — preserve product identity exactly.' : ''}`;
}

function studioOptionsSupremacyBlock(generationOptions = {}, profile = 'generic') {
    const bg = generationOptions.backgroundPreset || 'charcoal';
    const viz = generationOptions.visualization || 'studio';
    return `${backgroundPresetOverrideBlock(bg, profile)}${visualizationOverrideBlock(viz, profile)}`;
}

function generationOptionsPromptBlock({ backgroundPreset, visualization, profile } = {}) {
    const parts = [];
    const bgKey = String(backgroundPreset || 'charcoal').toLowerCase();
    const bgText = BACKGROUND_PRESETS[bgKey] || BACKGROUND_PRESETS.charcoal;
    if (bgKey === 'white') {
        parts.push(
            `\n\n[BACKGROUND — WHITE CATALOGUE (CRITICAL)]
Pure seamless white background (#FFFFFF) — clean infinity-cove e-commerce look matching premium jewellery catalogue references.
Bright, even, diffused studio lighting. NO grey backdrop, NO cream gradient wall, NO dark vignette.
ONLY a very soft subtle contact shadow directly under the product base on the white floor when a base exists in source — never a dark shadow blob, never cast shadow on the white backdrop.
Do NOT add a wooden pedestal if the uploaded source has none — preserve base type exactly (wood, black, metal, or direct floor contact).
Product centered with generous white margin — catalogue-ready for website listing.`,
        );
    } else {
        parts.push(`\n\n[BACKGROUND — ${bgKey.toUpperCase()}]\n${bgText}.`);
    }
    const vizKey = String(visualization || 'studio').toLowerCase();
    const vizText = VISUALIZATION_PRESETS[vizKey];
    if (vizText && vizKey !== 'studio') {
        parts.push(`\n\n[VISUALIZATION — ${vizKey.toUpperCase()}]\n${vizText}`);
    }
    return parts.join('');
}

function compositionPromptBlock(profile, options = {}) {
    if (profile === 'kada') {
        return `

[COMPOSITION — HERO FRAMING]
Product fills approximately 75–85% of frame width, centered on pedestal. Close hero shot — engravings and emblem details must be clearly readable WITHOUT the customer zooming in. Not tiny in frame, not extreme macro crop.`;
    }
    if (profile === 'idol') {
        const isWhite = isWhiteCatalogMode({
            backgroundPreset: options?.backgroundPreset,
            templateKey: options?.templateKey,
        });
        if (isWhite) {
            return `

[COMPOSITION — WHITE CATALOGUE HERO]
Product (idol + whatever base is in source, with or without glass dome) fills 78–88% of frame HEIGHT — large close hero shot like premium e-commerce references.
Centered on pure white. Detail clearly readable without zooming. NOT tiny with excessive empty space. NOT extreme macro crop.
Modest even margins on all sides for website grid display. Do NOT invent a wooden base if source has none.`;
        }
        return `

[COMPOSITION — HERO FRAMING]
Product including glass dome and base fills approximately 72–82% of frame HEIGHT — Aurra Studio catalogue scale. Close hero shot: idol detail clearly visible WITHOUT zooming. NOT a tiny distant product with excessive empty space above/below. NOT extreme macro that crops the dome. Balanced premium framing with modest top margin for optional text overlay.`;
    }
    return `

[COMPOSITION]
Product fills 70–80% of the frame — clear hero shot readable without zoom.`;
}

function defaultBackgroundForTemplate(templateKey, templateLabel) {
    const combined = `${templateKey || ''} ${templateLabel || ''}`.toLowerCase();
    if (/\bwhite\b/.test(combined) || combined.includes('white-layout')) return 'white';
    if (/\bblue\b/.test(combined) || /\bnavy\b/.test(combined)) return 'blue';
    if (/\bblack\b/.test(combined)) return 'black';
    if (/\bemerald\b/.test(combined)) return 'emerald';
    if (/\bcream\b/.test(combined) || /\bivory\b/.test(combined)) return 'cream';
    if (/\bred\b/.test(combined) || /\bburgundy\b/.test(combined)) return 'red';
    return 'charcoal';
}

module.exports = {
    defaultOverlaySettings,
    normalizeOverlaySettings,
    resolveOverlayTextLines,
    applyImageOverlays,
    BACKGROUND_PRESETS,
    VISUALIZATION_PRESETS,
    generationOptionsPromptBlock,
    compositionPromptBlock,
    backgroundPresetOverrideBlock,
    visualizationOverrideBlock,
    studioOptionsSupremacyBlock,
    defaultBackgroundForTemplate,
};

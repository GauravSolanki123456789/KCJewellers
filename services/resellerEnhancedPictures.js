/**
 * Enhanced Picture Subscription — AI product photography studio for resellers.
 * Admin configures/tests prompts per reseller; staff generate idol (etc.) shots and
 * auto-attach by barcode stem to Excel draft product submissions.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const axios = require('axios');
const multer = require('multer');
const archiver = require('archiver');
const {
    ensureCreditsSchema,
    getCreditBalance,
    ensureDefaultPlans,
    listPlans,
    setCreditBalance,
    addCredits,
    consumeOneCredit,
    DEFAULT_PLANS,
} = require('./resellerEnhancedPictureCredits');
const { runFourStepStudioPipeline } = require('./enhancedStudioPipeline');
const { aurraCinematicPromptBlock, postprocessStudioOutput } = require('./enhancedImageProcessing');

const TEMPLATE_IDOLS = 'idols';
const CANVAS_ASPECTS = ['1:1', '3:4', '4:5', '9:16', '16:9'];
const AI_PROVIDERS = new Set(['gemini', 'replicate']);
const DEFAULT_GEMINI_MODEL = 'gemini-2.5-flash-image';
const DEFAULT_REPLICATE_MODEL = 'black-forest-labs/flux-kontext-pro';
const GEMINI_MODEL_PRESETS = [
    'gemini-2.5-flash-image',
    'gemini-2.5-flash-image-preview',
    'gemini-3.1-flash-lite-image',
];
const REPLICATE_MODEL_PRESETS = [
    'black-forest-labs/flux-kontext-pro',
    'google/nano-banana',
    'black-forest-labs/flux-1.1-pro',
];

function normalizeAspectRatio(raw) {
    const a = String(raw || '1:1').trim();
    return CANVAS_ASPECTS.includes(a) ? a : '1:1';
}

const DEFAULT_IDOLS_PROMPT = `Create an ultra-premium luxury product photoshoot using ONLY the uploaded idol, frame, or jewellery piece.

STRICT PRODUCT PRESERVATION (HIGHEST PRIORITY):
Use the uploaded product exactly as photographed — phone photo, shop background, glass cloche, low light, or any angle.
Do NOT redesign, recreate, stylize, simplify, smooth away detail, recolor, or modify any part.

Preserve 100%:
• Exact shape, size, proportions, and silhouette
• All carvings, engravings, relief work, and surface ornament
• Exact metal finish — silver tone, gold accents, oxidized/antique texture
• Exact gemstone and halo/backdrop colors from the source (do NOT shift orange to red, blue to cyan, etc.)
• Glass cloche/dome shape and base if present — realistic refraction only
• Wood or display base exactly as in source

SCENE (replace cluttered backgrounds completely):
Premium dark navy-black stone tabletop with subtle natural texture.
Deep charcoal to midnight blue cinematic studio backdrop with soft vignette.
Minimal luxury environment — no shop shelves, boxes, scissors, or warehouse clutter.

LIGHTING (Aurra Studio grade):
Professional catalogue lighting — soft key from front-left, gentle rim from right, controlled top spotlight.
Natural metallic specular highlights with micro-texture visible — NOT flat CGI plastic.
Deep but readable shadows — no crushed blacks, no heavy noise/grain in background.

CAMERA:
Front 3/4 angle (~30°) when possible while keeping product identity; eye-level; 85mm product lens look.
Centered composition with elegant negative space for catalogue use.

QUALITY:
4K hyper-realistic commercial product render.
High-fidelity textures, ray-traced style reflections on glass and metal.
Zero blur, zero AI mushiness, zero compression artifacts.

TEXT AREA:
Leave clean negative space top-left and right. No text, logo, watermark, or branding.`;

const DEFAULT_IDOLS_NEGATIVE = `No redesign
No AI-generated carvings
No altered proportions
No missing engravings
No extra ornaments
No added gemstones
No color changes or recoloring
No shifted halo or stone colors
No blur
No low resolution
No background noise or grain
No oversharpening halos
No unrealistic reflections
No white glare bars on glass
No double-image ghosting through glass
No melted or warped glass dome
No flat CGI plastic metal
No watermark
No logo
No text
No hands
No human model
No flowers
No shop shelves or warehouse background
No unnecessary props`;

const TEMPLATES = [
    {
        key: TEMPLATE_IDOLS,
        label: 'Idols / Frames',
        description: 'Museum-style silver & gold idol and frame catalogue shots.',
    },
];

const DEFAULT_WORKFLOW_HIGHLIGHTS = [
    '100% Identity Preservation',
    'Professional Studio Lighting',
    'High-Fidelity Textures',
    'Cinematic Backgrounds',
    'AI Ray-Traced Reflections',
];

function defaultTemplateShowcase(templateKey) {
    const key = String(templateKey || TEMPLATE_IDOLS).trim().toLowerCase();
    if (key === TEMPLATE_IDOLS) {
        return {
            template_key: TEMPLATE_IDOLS,
            workflow_highlights: [...DEFAULT_WORKFLOW_HIGHLIGHTS],
            system_resolutions: '2K, 4K High Definition',
            system_ratios: '1:1',
            sample_label: 'Sample cinematic design',
            output_label: 'Professional output',
            output_subtitle: '4K hyper-realistic studio rendering',
            footer_note: 'Preserves source details perfectly',
        };
    }
    return {
        template_key: key,
        workflow_highlights: [],
        system_resolutions: '2K, 4K High Definition',
        system_ratios: '1:1',
        sample_label: 'Reference sample',
        output_label: 'Studio result',
        output_subtitle: '',
        footer_note: '',
    };
}

function normalizePromptNewlines(text) {
    return String(text ?? '')
        .replace(/\r\n/g, '\n')
        .replace(/\r/g, '\n');
}

const PROMPT_SECTION_MARKERS = [
    'STRICT PRODUCT PRESERVATION:',
    'Preserve 100%:',
    'SCENE:',
    'QUALITY:',
    'BACKGROUND DETAILS:',
    'TEXT AREA:',
    'NEGATIVE PROMPT:',
    'Camera:',
    'Lighting should resemble luxury premium brand photography:',
];

function repairPromptFormatting(text) {
    let s = normalizePromptNewlines(text).trim();
    if (!s) return '';
    const newlineCount = (s.match(/\n/g) || []).length;
    if (newlineCount >= 8) return s;
    for (const marker of PROMPT_SECTION_MARKERS) {
        const escaped = marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        s = s.replace(new RegExp(`(?<!\\n)${escaped}`, 'g'), `\n\n${marker}`);
    }
    s = s.replace(/([a-z])([A-Z])/g, '$1\n$2');
    s = s.replace(/:([A-Z])/g, ':\n$1');
    s = s.replace(/•\s*/g, '\n• ');
    s = s.replace(/(?<!\\n)(No [a-z])/gi, '\n$1');
    s = s.replace(/\n{3,}/g, '\n\n').trim();
    return s;
}

function stripSampleImgMarkers(text) {
    return String(text || '')
        .replace(/\[SampleImg:\s*data:image[^\]]*\]/gi, '')
        .replace(/\[SampleImg:[^\]]*\]/gi, '')
        .trim();
}

function splitMasterAndNegative(promptText, negativePrompt) {
    let master = repairPromptFormatting(stripSampleImgMarkers(promptText));
    let neg = repairPromptFormatting(stripSampleImgMarkers(negativePrompt));
    const re = /\n\nNEGATIVE PROMPT:\s*\n/i;
    const match = master.match(re);
    if (match && match.index != null) {
        const idx = match.index;
        const embedded = master.slice(idx + match[0].length).trim();
        master = master.slice(0, idx).trim();
        if (embedded && (!neg || neg.length < 10)) neg = embedded;
    }
    return { promptText: master, negativePrompt: neg };
}

function normalizePromptFields(promptText, negativePrompt) {
    return splitMasterAndNegative(
        repairPromptFormatting(promptText),
        repairPromptFormatting(negativePrompt),
    );
}

function slugifyTemplateKey(label) {
    const base = String(label || 'template')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '')
        .slice(0, 48);
    return base || 'template';
}

function parseWorkflowHighlights(raw) {
    if (Array.isArray(raw)) {
        return raw.map((x) => String(x).trim()).filter(Boolean).slice(0, 20);
    }
    if (typeof raw === 'string' && raw.trim()) {
        try {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) {
                return parsed.map((x) => String(x).trim()).filter(Boolean).slice(0, 20);
            }
        } catch {
            let text = raw.trim();
            if (!text.includes('\n')) {
                text = text
                    .replace(/(\d+%)/g, '$1\n')
                    .replace(/([a-z])([A-Z])/g, '$1\n$2')
                    .replace(/(Preservation)(Professional)/gi, '$1\n$2')
                    .replace(/(Lighting)(High)/gi, '$1\n$2')
                    .replace(/(Textures)(Cinematic)/gi, '$1\n$2')
                    .replace(/(Backgrounds)(AI)/gi, '$1\n$2');
            }
            return text
                .split(/\r?\n/)
                .map((x) => x.replace(/^[-•*]\s*/, '').trim())
                .filter(Boolean)
                .slice(0, 20);
        }
    }
    return [];
}

function normalizeTemplateShowcaseRow(row, templateKey) {
    const defaults = defaultTemplateShowcase(templateKey);
    if (!row) return defaults;
    const highlights = parseWorkflowHighlights(row.workflow_highlights);
    return {
        template_key: templateKey,
        workflow_highlights: highlights.length ? highlights : defaults.workflow_highlights,
        system_resolutions:
            String(row.system_resolutions || '').trim() || defaults.system_resolutions,
        system_ratios: String(row.system_ratios || '').trim() || defaults.system_ratios,
        sample_label: String(row.sample_label || '').trim() || defaults.sample_label,
        output_label: String(row.output_label || '').trim() || defaults.output_label,
        output_subtitle: String(row.output_subtitle || '').trim() || defaults.output_subtitle,
        footer_note: String(row.footer_note || '').trim() || defaults.footer_note,
        sample_source_image_url: String(row.sample_source_image_url || '').trim() || null,
        sample_result_image_url: String(row.sample_result_image_url || '').trim() || null,
    };
}

function slugifyVarietyKey(label) {
    return String(label || 'variety')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 64) || 'variety';
}

function formatVarietyRow(row) {
    if (!row) return row;
    return {
        id: row.id,
        template_key: row.template_key,
        variety_key: row.variety_key,
        variety_label: row.variety_label,
        variety_description: row.variety_description || '',
        sample_source_image_url: row.sample_source_image_url || null,
        sample_result_image_url: row.sample_result_image_url || null,
        is_enabled: row.is_enabled !== false,
        sort_order: row.sort_order ?? 0,
    };
}

async function loadVarietiesForTemplate(query, resellerUserId, templateKey) {
    const rows = await query(
        `SELECT * FROM reseller_enhanced_picture_varieties
         WHERE reseller_user_id = $1 AND template_key = $2
         ORDER BY sort_order ASC, variety_label ASC, id ASC`,
        [resellerUserId, templateKey],
    );
    return rows.map(formatVarietyRow);
}

async function loadAllVarietiesForReseller(query, resellerUserId) {
    const rows = await query(
        `SELECT * FROM reseller_enhanced_picture_varieties
         WHERE reseller_user_id = $1
         ORDER BY template_key ASC, sort_order ASC, variety_label ASC, id ASC`,
        [resellerUserId],
    );
    const byTemplate = new Map();
    for (const row of rows) {
        const key = String(row.template_key || '').trim().toLowerCase();
        if (!byTemplate.has(key)) byTemplate.set(key, []);
        byTemplate.get(key).push(formatVarietyRow(row));
    }
    return byTemplate;
}

async function loadTemplateShowcase(query, resellerUserId, templateKey) {
    const key = String(templateKey || TEMPLATE_IDOLS).trim().toLowerCase().slice(0, 64);
    const rows = await query(
        `SELECT * FROM reseller_enhanced_picture_template_settings
         WHERE reseller_user_id = $1 AND template_key = $2 LIMIT 1`,
        [resellerUserId, key],
    );
    return normalizeTemplateShowcaseRow(rows[0], key);
}

async function ensureDefaultTemplateShowcase(query, resellerUserId, templateKey = TEMPLATE_IDOLS) {
    const key = String(templateKey || TEMPLATE_IDOLS).trim().toLowerCase().slice(0, 64);
    const existing = await query(
        `SELECT id FROM reseller_enhanced_picture_template_settings
         WHERE reseller_user_id = $1 AND template_key = $2 LIMIT 1`,
        [resellerUserId, key],
    );
    if (existing.length) return loadTemplateShowcase(query, resellerUserId, key);
    const d = defaultTemplateShowcase(key);
    const builtin = TEMPLATES.find((t) => t.key === key);
    await query(
        `INSERT INTO reseller_enhanced_picture_template_settings
            (reseller_user_id, template_key, template_label, template_description,
             workflow_highlights, system_resolutions, system_ratios,
             sample_label, output_label, output_subtitle, footer_note)
         VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8, $9, $10, $11)`,
        [
            resellerUserId,
            key,
            builtin?.label || null,
            builtin?.description || null,
            JSON.stringify(d.workflow_highlights),
            d.system_resolutions,
            d.system_ratios,
            d.sample_label,
            d.output_label,
            d.output_subtitle,
            d.footer_note,
        ],
    );
    return d;
}

function formatPromptRow(row) {
    if (!row) return row;
    const normalized = normalizePromptFields(row.prompt_text, row.negative_prompt || '');
    return {
        ...row,
        prompt_text: normalized.promptText,
        negative_prompt: normalized.negativePrompt || null,
    };
}

async function createBlankTemplate(query, resellerUserId, body, adminId) {
    const label = String(body?.label || 'New template').trim().slice(0, 120) || 'New template';
    const description = String(body?.description || '').trim().slice(0, 500) || null;
    let key = String(body?.template_key || slugifyTemplateKey(label))
        .trim()
        .toLowerCase()
        .slice(0, 64);
    if (!key) key = `template_${Date.now().toString(36).slice(-6)}`;
    const taken = await query(
        `SELECT template_key FROM reseller_enhanced_picture_template_settings
         WHERE reseller_user_id = $1 AND template_key = $2 LIMIT 1`,
        [resellerUserId, key],
    );
    if (taken.length) {
        key = `${key.slice(0, 52)}_${Date.now().toString(36).slice(-6)}`.slice(0, 64);
    }
    const d = defaultTemplateShowcase(key);
    await query(
        `INSERT INTO reseller_enhanced_picture_template_settings
            (reseller_user_id, template_key, template_label, template_description,
             workflow_highlights, system_resolutions, system_ratios,
             sample_label, output_label, output_subtitle, footer_note)
         VALUES ($1, $2, $3, $4, '[]'::jsonb, '', '', '', '', '', '')`,
        [resellerUserId, key, label, description],
    );
    const promptIns = await query(
        `INSERT INTO reseller_enhanced_picture_prompts
            (reseller_user_id, template_key, name, prompt_text, negative_prompt, is_active, is_test, created_by_admin_id)
         VALUES ($1, $2, $3, '', '', false, false, $4)
         RETURNING *`,
        [resellerUserId, key, `${label} — prompt`, adminId || null],
    );
    return {
        key,
        label,
        description: description || '',
        showcase: normalizeTemplateShowcaseRow(
            {
                template_key: key,
                workflow_highlights: [],
                system_resolutions: '',
                system_ratios: '',
                sample_label: '',
                output_label: '',
                output_subtitle: '',
                footer_note: '',
            },
            key,
        ),
        prompt: formatPromptRow(promptIns[0]),
    };
}

async function buildTemplatesForReseller(query, resellerUserId) {
    await ensureDefaultTemplateShowcase(query, resellerUserId, TEMPLATE_IDOLS);
    const [rows, varietiesByTemplate] = await Promise.all([
        query(
        `SELECT template_key, template_label, template_description, workflow_highlights,
                system_resolutions, system_ratios, sample_label, output_label, output_subtitle,
                footer_note, sample_source_image_url, sample_result_image_url,
                COALESCE(is_enabled, true) AS is_enabled
             FROM reseller_enhanced_picture_template_settings
             WHERE reseller_user_id = $1
             ORDER BY template_key ASC`,
            [resellerUserId],
        ),
        loadAllVarietiesForReseller(query, resellerUserId),
    ]);
    const byKey = new Map();
    for (const t of TEMPLATES) {
        byKey.set(t.key, {
            key: t.key,
            label: t.label,
            description: t.description,
            is_enabled: true,
            varieties: [],
            subtemplates: [],
        });
    }
    for (const row of rows) {
        const key = String(row.template_key || '').trim().toLowerCase();
        if (!key) continue;
        const builtin = byKey.get(key);
        const varieties = varietiesByTemplate.get(key) || [];
        byKey.set(key, {
            key,
            label: String(row.template_label || '').trim() || builtin?.label || key,
            description: String(row.template_description || '').trim() || builtin?.description || '',
            is_enabled: row.is_enabled !== false,
            showcase: normalizeTemplateShowcaseRow(row, key),
            varieties,
            subtemplates: varieties,
        });
    }
    if (!byKey.has(TEMPLATE_IDOLS)) {
        const showcase = await ensureDefaultTemplateShowcase(query, resellerUserId, TEMPLATE_IDOLS);
        const varieties = varietiesByTemplate.get(TEMPLATE_IDOLS) || [];
        byKey.set(TEMPLATE_IDOLS, {
            key: TEMPLATE_IDOLS,
            label: 'Idols / Frames',
            description: 'Museum-style silver & gold idol and frame catalogue shots.',
            is_enabled: true,
            showcase,
            varieties,
            subtemplates: varieties,
        });
    }
    return [...byKey.values()];
}

function getGeminiApiKey() {
    return String(process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY || '').trim();
}

function getGeminiImageModel() {
    return String(process.env.GEMINI_IMAGE_MODEL || DEFAULT_GEMINI_MODEL).trim();
}

function getReplicateApiToken() {
    return String(process.env.REPLICATE_API_TOKEN || '').trim();
}

function getReplicateDefaultModel() {
    return String(process.env.REPLICATE_DEFAULT_MODEL || DEFAULT_REPLICATE_MODEL).trim();
}

function normalizeAiProvider(raw) {
    const p = String(raw || 'gemini').trim().toLowerCase();
    return AI_PROVIDERS.has(p) ? p : 'gemini';
}

function maskSecret(val) {
    if (!val) return null;
    const s = String(val).trim();
    if (!s) return null;
    if (s.length <= 8) return '••••••••';
    return `••••${s.slice(-4)}`;
}

function parseAiSettingsRow(row) {
    const batchDefault =
        process.env.GEMINI_BATCH_DEFAULT === '1' || process.env.GEMINI_BATCH_DEFAULT === 'true';
    if (!row) {
        return {
            provider: 'gemini',
            gemini_model: getGeminiImageModel(),
            replicate_model: getReplicateDefaultModel(),
            gemini_batch_enabled: batchDefault,
            studio_pipeline_enabled: true,
            gemini_api_key_configured: !!getGeminiApiKey(),
            replicate_api_token_configured: !!getReplicateApiToken(),
            gemini_api_key_masked: getGeminiApiKey() ? maskSecret(getGeminiApiKey()) : null,
            replicate_api_token_masked: getReplicateApiToken() ? maskSecret(getReplicateApiToken()) : null,
            gemini_model_presets: GEMINI_MODEL_PRESETS,
            replicate_model_presets: REPLICATE_MODEL_PRESETS,
            server_gemini_configured: !!getGeminiApiKey(),
            server_replicate_configured: !!getReplicateApiToken(),
        };
    }
    const provider = normalizeAiProvider(row.reseller_enhanced_ai_provider);
    const geminiKey = String(row.reseller_enhanced_gemini_api_key || '').trim();
    const replicateToken = String(row.reseller_enhanced_replicate_api_token || '').trim();
    const batchEnabled =
        row.reseller_enhanced_gemini_batch_enabled != null
            ? !!row.reseller_enhanced_gemini_batch_enabled
            : batchDefault;
    const pipelineEnabled =
        row.reseller_enhanced_studio_pipeline_enabled != null
            ? !!row.reseller_enhanced_studio_pipeline_enabled
            : true;
    return {
        provider,
        gemini_model: String(row.reseller_enhanced_gemini_model || '').trim() || getGeminiImageModel(),
        replicate_model: String(row.reseller_enhanced_replicate_model || '').trim() || getReplicateDefaultModel(),
        gemini_batch_enabled: batchEnabled,
        studio_pipeline_enabled: pipelineEnabled,
        gemini_api_key_configured: !!geminiKey || !!getGeminiApiKey(),
        replicate_api_token_configured: !!replicateToken || !!getReplicateApiToken(),
        gemini_api_key_masked: geminiKey
            ? maskSecret(geminiKey)
            : getGeminiApiKey()
              ? maskSecret(getGeminiApiKey())
              : null,
        replicate_api_token_masked: replicateToken
            ? maskSecret(replicateToken)
            : getReplicateApiToken()
              ? maskSecret(getReplicateApiToken())
              : null,
        gemini_model_presets: GEMINI_MODEL_PRESETS,
        replicate_model_presets: REPLICATE_MODEL_PRESETS,
        server_gemini_configured: !!getGeminiApiKey(),
        server_replicate_configured: !!getReplicateApiToken(),
    };
}

async function loadResellerAiSettings(query, userId) {
    const rows = await query(
        `SELECT reseller_enhanced_ai_provider,
                reseller_enhanced_gemini_api_key,
                reseller_enhanced_gemini_model,
                reseller_enhanced_replicate_api_token,
                reseller_enhanced_replicate_model,
                COALESCE(reseller_enhanced_gemini_batch_enabled, false) AS reseller_enhanced_gemini_batch_enabled,
                COALESCE(reseller_enhanced_studio_pipeline_enabled, true) AS reseller_enhanced_studio_pipeline_enabled
         FROM users WHERE id = $1`,
        [userId],
    );
    return parseAiSettingsRow(rows[0]);
}

async function loadResellerAiConfigRaw(query, userId) {
    const rows = await query(
        `SELECT reseller_enhanced_ai_provider,
                reseller_enhanced_gemini_api_key,
                reseller_enhanced_gemini_model,
                reseller_enhanced_replicate_api_token,
                reseller_enhanced_replicate_model,
                COALESCE(reseller_enhanced_gemini_batch_enabled, false) AS reseller_enhanced_gemini_batch_enabled,
                COALESCE(reseller_enhanced_studio_pipeline_enabled, true) AS reseller_enhanced_studio_pipeline_enabled
         FROM users WHERE id = $1`,
        [userId],
    );
    return rows[0] || null;
}

async function resolveAiConfigForUser(query, userId, overrides = {}) {
    const row = await loadResellerAiConfigRaw(query, userId);
    return resolveAiConfig(row, overrides);
}

function parseAiOverridesFromBody(body) {
    if (!body || typeof body !== 'object') return {};
    const overrides = {};
    if (body.ai_provider != null) overrides.provider = body.ai_provider;
    if (body.gemini_api_key != null && String(body.gemini_api_key).trim()) {
        overrides.gemini_api_key = String(body.gemini_api_key).trim();
    }
    if (body.gemini_model != null && String(body.gemini_model).trim()) {
        overrides.gemini_model = String(body.gemini_model).trim();
    }
    if (body.replicate_api_token != null && String(body.replicate_api_token).trim()) {
        overrides.replicate_api_token = String(body.replicate_api_token).trim();
    }
    if (body.replicate_model != null && String(body.replicate_model).trim()) {
        overrides.replicate_model = String(body.replicate_model).trim();
    }
    return overrides;
}

function resolveAiConfig(savedSettings, overrides = {}) {
    const provider = normalizeAiProvider(
        overrides.provider ?? savedSettings?.reseller_enhanced_ai_provider,
    );
    const geminiModel =
        String(overrides.gemini_model || savedSettings?.reseller_enhanced_gemini_model || '').trim() ||
        getGeminiImageModel();
    const replicateModel =
        String(
            overrides.replicate_model || savedSettings?.reseller_enhanced_replicate_model || '',
        ).trim() || getReplicateDefaultModel();
    const geminiKey =
        String(overrides.gemini_api_key || '').trim() ||
        String(savedSettings?.reseller_enhanced_gemini_api_key || '').trim() ||
        getGeminiApiKey();
    const replicateToken =
        String(overrides.replicate_api_token || '').trim() ||
        String(savedSettings?.reseller_enhanced_replicate_api_token || '').trim() ||
        getReplicateApiToken();
    return {
        provider,
        gemini_model: geminiModel,
        replicate_model: replicateModel,
        gemini_api_key: geminiKey,
        replicate_api_token: replicateToken,
        gemini_batch_enabled:
            savedSettings?.reseller_enhanced_gemini_batch_enabled != null
                ? !!savedSettings.reseller_enhanced_gemini_batch_enabled
                : process.env.GEMINI_BATCH_DEFAULT === '1' ||
                  process.env.GEMINI_BATCH_DEFAULT === 'true',
        studio_pipeline_enabled:
            savedSettings?.reseller_enhanced_studio_pipeline_enabled != null
                ? !!savedSettings.reseller_enhanced_studio_pipeline_enabled
                : true,
    };
}

function geminiImageModelCandidates() {
    const primary = getGeminiImageModel();
    const qualityFirst = [
        'gemini-2.5-flash-image',
        'gemini-2.5-flash-image-preview',
        'gemini-3.1-flash-lite-image',
    ];
    return [...new Set([primary, ...qualityFirst].filter(Boolean))];
}

function normalizeStem(raw) {
    return String(raw || '')
        .trim()
        .toLowerCase()
        .replace(/\s+/g, '-')
        .replace(/_+/g, '-');
}

function stemKeys(stem) {
    const s = normalizeStem(stem);
    if (!s) return [];
    const compact = s.replace(/-/g, '');
    return compact && compact !== s ? [s, compact] : [s];
}

let enhancedPicturesSchemaPromise = null;

async function ensureEnhancedPicturesSchema(pool) {
    if (enhancedPicturesSchemaPromise) return enhancedPicturesSchemaPromise;
    enhancedPicturesSchemaPromise = (async () => {
        await pool.query(`
        ALTER TABLE users
            ADD COLUMN IF NOT EXISTS reseller_enhanced_pictures_enabled BOOLEAN NOT NULL DEFAULT false
    `);
    await pool.query(`
        ALTER TABLE users
            ADD COLUMN IF NOT EXISTS reseller_enhanced_ai_provider VARCHAR(32) NOT NULL DEFAULT 'gemini'
    `);
    await pool.query(`
        ALTER TABLE users ADD COLUMN IF NOT EXISTS reseller_enhanced_gemini_api_key TEXT
    `);
    await pool.query(`
        ALTER TABLE users ADD COLUMN IF NOT EXISTS reseller_enhanced_gemini_model VARCHAR(128)
    `);
    await pool.query(`
        ALTER TABLE users ADD COLUMN IF NOT EXISTS reseller_enhanced_replicate_api_token TEXT
    `);
    await pool.query(`
        ALTER TABLE users ADD COLUMN IF NOT EXISTS reseller_enhanced_replicate_model VARCHAR(255)
    `);
    await pool.query(`
        CREATE TABLE IF NOT EXISTS reseller_enhanced_picture_prompts (
            id SERIAL PRIMARY KEY,
            reseller_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            template_key VARCHAR(64) NOT NULL DEFAULT 'idols',
            name VARCHAR(200) NOT NULL,
            prompt_text TEXT NOT NULL,
            negative_prompt TEXT,
            is_active BOOLEAN NOT NULL DEFAULT false,
            is_test BOOLEAN NOT NULL DEFAULT true,
            test_source_image_url TEXT,
            test_result_image_url TEXT,
            created_by_admin_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
    `);
    await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_reseller_enhanced_prompts_user_template
            ON reseller_enhanced_picture_prompts (reseller_user_id, template_key)
    `);
    await pool.query(`
        CREATE TABLE IF NOT EXISTS reseller_enhanced_picture_jobs (
            id SERIAL PRIMARY KEY,
            reseller_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            template_key VARCHAR(64) NOT NULL DEFAULT 'idols',
            prompt_id INTEGER REFERENCES reseller_enhanced_picture_prompts(id) ON DELETE SET NULL,
            source_image_url TEXT,
            result_image_url TEXT,
            barcode_stem VARCHAR(255),
            photo_type VARCHAR(20) NOT NULL DEFAULT 'front',
            attached_submission_id INTEGER,
            attached_sku VARCHAR(255),
            status VARCHAR(32) NOT NULL DEFAULT 'pending',
            error_message TEXT,
            created_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
    `);
    await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_reseller_enhanced_jobs_user
            ON reseller_enhanced_picture_jobs (reseller_user_id, created_at DESC)
    `);
    await pool.query(`
        ALTER TABLE reseller_enhanced_picture_jobs ADD COLUMN IF NOT EXISTS ai_provider VARCHAR(32)
    `);
    await pool.query(`
        ALTER TABLE reseller_enhanced_picture_jobs ADD COLUMN IF NOT EXISTS ai_model VARCHAR(255)
    `);
    await pool.query(`
        ALTER TABLE users ADD COLUMN IF NOT EXISTS reseller_enhanced_gemini_batch_enabled BOOLEAN NOT NULL DEFAULT false
    `);
    await pool.query(`
        ALTER TABLE reseller_enhanced_picture_jobs ADD COLUMN IF NOT EXISTS generation_mode VARCHAR(16) NOT NULL DEFAULT 'sync'
    `);
    await pool.query(`
        ALTER TABLE reseller_enhanced_picture_jobs ADD COLUMN IF NOT EXISTS gemini_batch_name TEXT
    `);
    await pool.query(`
        ALTER TABLE reseller_enhanced_picture_jobs ADD COLUMN IF NOT EXISTS batch_state VARCHAR(64)
    `);
    await pool.query(`
        ALTER TABLE reseller_enhanced_picture_jobs ADD COLUMN IF NOT EXISTS batch_submitted_at TIMESTAMP
    `);
    await pool.query(`
        ALTER TABLE reseller_enhanced_picture_jobs ADD COLUMN IF NOT EXISTS batch_completed_at TIMESTAMP
    `);
    await pool.query(`
        ALTER TABLE reseller_enhanced_picture_jobs ADD COLUMN IF NOT EXISTS credit_charged BOOLEAN NOT NULL DEFAULT false
    `);
    await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_enhanced_jobs_batch_pending
            ON reseller_enhanced_picture_jobs (status, batch_submitted_at)
            WHERE gemini_batch_name IS NOT NULL AND status IN ('batch_queued', 'batch_processing')
    `);
    await pool.query(`
        ALTER TABLE reseller_enhanced_picture_jobs ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP
    `);
    await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_enhanced_jobs_user_active
            ON reseller_enhanced_picture_jobs (reseller_user_id, created_at DESC)
            WHERE deleted_at IS NULL
    `);
    await pool.query(`
        CREATE TABLE IF NOT EXISTS reseller_enhanced_picture_template_settings (
            id SERIAL PRIMARY KEY,
            reseller_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            template_key VARCHAR(64) NOT NULL,
            workflow_highlights JSONB NOT NULL DEFAULT '[]'::jsonb,
            system_resolutions TEXT,
            system_ratios TEXT,
            sample_label TEXT,
            output_label TEXT,
            output_subtitle TEXT,
            footer_note TEXT,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            UNIQUE (reseller_user_id, template_key)
        )
    `);
    await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_enhanced_template_settings_user
            ON reseller_enhanced_picture_template_settings (reseller_user_id, template_key)
    `);
    await pool.query(`
        ALTER TABLE reseller_enhanced_picture_template_settings
            ADD COLUMN IF NOT EXISTS template_label VARCHAR(120)
    `);
    await pool.query(`
        ALTER TABLE reseller_enhanced_picture_template_settings
            ADD COLUMN IF NOT EXISTS template_description TEXT
    `);
    await pool.query(`
        ALTER TABLE reseller_enhanced_picture_template_settings
            ADD COLUMN IF NOT EXISTS sample_source_image_url TEXT
    `);
    await pool.query(`
        ALTER TABLE reseller_enhanced_picture_template_settings
            ADD COLUMN IF NOT EXISTS sample_result_image_url TEXT
    `);
    await pool.query(`
        ALTER TABLE reseller_enhanced_picture_template_settings
            ADD COLUMN IF NOT EXISTS is_enabled BOOLEAN NOT NULL DEFAULT true
    `);
    await pool.query(`
        ALTER TABLE users
            ADD COLUMN IF NOT EXISTS reseller_enhanced_studio_pipeline_enabled BOOLEAN NOT NULL DEFAULT true
    `);
    await pool.query(`
        ALTER TABLE reseller_enhanced_picture_prompts
            ADD COLUMN IF NOT EXISTS variety_key VARCHAR(64)
    `);
    await pool.query(`
        CREATE TABLE IF NOT EXISTS reseller_enhanced_picture_varieties (
            id SERIAL PRIMARY KEY,
            reseller_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            template_key VARCHAR(64) NOT NULL,
            variety_key VARCHAR(64) NOT NULL,
            variety_label VARCHAR(120) NOT NULL,
            variety_description TEXT,
            sample_source_image_url TEXT,
            sample_result_image_url TEXT,
            is_enabled BOOLEAN NOT NULL DEFAULT true,
            sort_order INTEGER NOT NULL DEFAULT 0,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            UNIQUE (reseller_user_id, template_key, variety_key)
        )
    `);
    await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_enhanced_varieties_user_template
            ON reseller_enhanced_picture_varieties (reseller_user_id, template_key, sort_order)
    `);
    await ensureCreditsSchema(pool);
    })().catch((err) => {
        enhancedPicturesSchemaPromise = null;
        throw err;
    });
    return enhancedPicturesSchemaPromise;
}

function createEnhancedUploadMulter(uploadsDir) {
    fs.mkdirSync(uploadsDir, { recursive: true });
    return multer({
        storage: multer.diskStorage({
            destination: (req, file, cb) => cb(null, uploadsDir),
            filename: (req, file, cb) => {
                const ext = path.extname(String(file.originalname || '')).toLowerCase() || '.jpg';
                const safeExt = ['.jpg', '.jpeg', '.png', '.webp', '.gif'].includes(ext) ? ext : '.jpg';
                cb(null, `enhanced-src-${Date.now()}-${Math.random().toString(36).slice(2, 8)}${safeExt}`);
            },
        }),
        limits: { fileSize: 12 * 1024 * 1024 },
        fileFilter: (req, file, cb) => {
            const mime = String(file.mimetype || '').toLowerCase();
            const ext = path.extname(String(file.originalname || '')).toLowerCase();
            const okMime =
                mime.startsWith('image/') ||
                mime === 'application/octet-stream' ||
                mime === 'binary/octet-stream';
            const okExt = ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.heic', '.heif'].includes(ext);
            cb(okMime || okExt ? null : new Error('Only JPEG, PNG, WEBP, or GIF images are allowed'), okMime || okExt);
        },
    }).single('image');
}

function mimeFromExt(ext) {
    const e = String(ext || '').toLowerCase();
    if (e === '.png') return 'image/png';
    if (e === '.webp') return 'image/webp';
    if (e === '.gif') return 'image/gif';
    return 'image/jpeg';
}

function buildFullPrompt(promptText, negativePrompt, { aspectRatio, canvasText, workflowHighlights } = {}) {
    const normalized = normalizePromptFields(promptText, negativePrompt);
    let main = normalized.promptText;
    let neg = normalized.negativePrompt;
    const aspect = normalizeAspectRatio(aspectRatio);
    const text = String(canvasText || '').trim().slice(0, 120);
    const highlights = Array.isArray(workflowHighlights)
        ? workflowHighlights.map((x) => String(x).trim()).filter(Boolean)
        : [];
    if (highlights.length) {
        main += `\n\nWORKFLOW PRIORITIES (follow strictly):\n${highlights.map((h) => `• ${h}`).join('\n')}`;
    }
    main += `\n\nCANVAS ASPECT RATIO:\nCompose and export the final image at ${aspect} aspect ratio. Fill the frame elegantly; do not letterbox with empty bars unless needed for composition.`;
    main += `\n\nOUTPUT QUALITY (CRITICAL — AURRA STUDIO GRADE):\n4K hyper-realistic luxury jewellery catalogue. Crisp micro-textures on metal, ray-traced style reflections on glass and silver/gold, deep cinematic contrast, zero blur, zero compression artifacts, no AI smoothing or plastic look. Replace any shop/warehouse background with a cinematic charcoal studio backdrop. Preserve exact product colors from the source photo — especially halo, stone, and metal tones.`;
    main += aurraCinematicPromptBlock();
    if (text) {
        main += `\n\nBOTTOM CANVAS TEXT (REQUIRED):\nAt the bottom of the visual canvas, render this exact text centered on a clean dark band or elegant margin:\n"${text}"\nUse clear white or soft-gold sans-serif lettering, readable catalogue style. Do not add any other text, logo, watermark, or labels.`;
        neg = neg
            .split(/\r?\n/)
            .filter((line) => !/^no\s+text$/i.test(String(line).trim()))
            .join('\n');
    }
    if (!neg) return main;
    return `${main}\n\nNEGATIVE PROMPT:\n${neg}`;
}

const GEMINI_BATCH_TERMINAL_STATES = new Set([
    'JOB_STATE_SUCCEEDED',
    'JOB_STATE_FAILED',
    'JOB_STATE_CANCELLED',
    'JOB_STATE_EXPIRED',
]);

function buildGeminiUserParts({
    promptText,
    negativePrompt,
    sourceImagePath,
    aspectRatio,
    canvasText,
    workflowHighlights,
}) {
    const aspect = normalizeAspectRatio(aspectRatio);
    const fullPrompt = buildFullPrompt(promptText, negativePrompt, {
        aspectRatio: aspect,
        canvasText,
        workflowHighlights,
    });
    const parts = [{ text: fullPrompt }];
    if (sourceImagePath && fs.existsSync(sourceImagePath)) {
        parts[0].text +=
            '\n\nSOURCE PRODUCT (CRITICAL — COLOR & IDENTITY LOCK):\nThe attached photo is the exact product. Preserve 100% identity — same shape, proportions, engravings, stone settings, metal finish, halo color, gemstone colors, glass dome, and wood base. Only improve lighting, background, and catalogue presentation. Do NOT redesign, recolor, saturate differently, or alter the product. Match metal and halo colors exactly as in the source image.';
        const buf = fs.readFileSync(sourceImagePath);
        parts.push({
            inline_data: {
                mime_type: mimeFromExt(path.extname(sourceImagePath)),
                data: buf.toString('base64'),
            },
        });
    }
    return { parts, aspect };
}

function parseGeminiBatchJobState(data) {
    if (!data || typeof data !== 'object') return null;
    return (
        data.state ||
        data.metadata?.state ||
        (data.done === true ? 'JOB_STATE_SUCCEEDED' : null) ||
        null
    );
}

function extractImageFromGeminiResponse(response) {
    const candidates = response?.candidates || [];
    for (const c of candidates) {
        for (const p of c?.content?.parts || []) {
            const inline = p.inlineData || p.inline_data;
            if (inline?.data) {
                return {
                    buffer: Buffer.from(inline.data, 'base64'),
                    mimeType: inline.mimeType || inline.mime_type || 'image/png',
                };
            }
        }
    }
    return null;
}

async function submitGeminiBatchJob({
    model,
    apiKey,
    parts,
    aspectRatio,
    displayName,
    metadataKey,
}) {
    if (!apiKey) {
        const err = new Error('Gemini API key is not configured.');
        err.status = 503;
        throw err;
    }
    const aspect = normalizeAspectRatio(aspectRatio);
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:batchGenerateContent`;
    const body = {
        batch: {
            display_name: String(displayName || 'kc-enhanced-batch').slice(0, 120),
            input_config: {
                requests: {
                    requests: [
                        {
                            request: {
                                contents: [{ role: 'user', parts }],
                                generationConfig: {
                                    responseModalities: ['IMAGE'],
                                    imageConfig: { aspectRatio: aspect, imageSize: '4K' },
                                },
                            },
                            metadata: { key: String(metadataKey || 'job-1').slice(0, 64) },
                        },
                    ],
                },
            },
        },
    };
    const res = await axios.post(url, body, {
        headers: { 'x-goog-api-key': apiKey, 'Content-Type': 'application/json' },
        timeout: 120000,
        validateStatus: () => true,
    });
    if (res.status >= 400) {
        const msg =
            res.data?.error?.message || res.data?.message || `Gemini Batch API error (${res.status})`;
        const err = new Error(msg);
        err.status = res.status === 429 ? 429 : 502;
        throw err;
    }
    const batchName = res.data?.name || res.data?.batch?.name;
    if (!batchName) {
        const err = new Error('Gemini Batch API did not return a batch job name.');
        err.status = 502;
        throw err;
    }
    return {
        batchName,
        batchState: parseGeminiBatchJobState(res.data) || 'JOB_STATE_PENDING',
        model,
    };
}

async function fetchGeminiBatchJob(batchName, apiKey) {
    const url = `https://generativelanguage.googleapis.com/v1beta/${encodeURIComponent(batchName)}`;
    const res = await axios.get(url, {
        headers: { 'x-goog-api-key': apiKey, 'Content-Type': 'application/json' },
        timeout: 60000,
        validateStatus: () => true,
    });
    if (res.status >= 400) {
        const msg =
            res.data?.error?.message || res.data?.message || `Gemini batch status error (${res.status})`;
        const err = new Error(msg);
        err.status = res.status === 429 ? 429 : 502;
        throw err;
    }
    return res.data;
}

function extractImageFromGeminiBatchStatus(batchStatus) {
    const inlineResponses =
        batchStatus?.dest?.inlinedResponses ||
        batchStatus?.dest?.inlined_responses ||
        batchStatus?.response?.inlinedResponses ||
        batchStatus?.response?.inlined_responses ||
        [];
    for (const inline of inlineResponses) {
        const response = inline?.response || inline;
        const img = extractImageFromGeminiResponse(response);
        if (img) return img;
        if (inline?.error) {
            const err = new Error(
                typeof inline.error === 'string'
                    ? inline.error
                    : inline.error?.message || JSON.stringify(inline.error),
            );
            err.status = 502;
            throw err;
        }
    }
    return null;
}

async function refundJobCreditIfNeeded(query, pool, job, note) {
    if (!job?.credit_charged || !job?.reseller_user_id) return;
    await addCredits(query, pool, {
        userId: job.reseller_user_id,
        amount: 1,
        note: note || `Refund: batch job #${job.id} failed`,
        reason: 'batch_refund',
    });
    await query(
        `UPDATE reseller_enhanced_picture_jobs SET credit_charged = false WHERE id = $1`,
        [job.id],
    );
}

function enhancedJobResultDiskPath(enhancedDir, resultImageUrl) {
    if (!resultImageUrl) return null;
    const fileName = path.basename(String(resultImageUrl).split('?')[0]);
    if (!fileName) return null;
    return path.join(enhancedDir, fileName);
}

function removeEnhancedJobResultFile(enhancedDir, resultImageUrl) {
    try {
        const diskPath = enhancedJobResultDiskPath(enhancedDir, resultImageUrl);
        if (diskPath && fs.existsSync(diskPath)) fs.unlinkSync(diskPath);
    } catch (e) {
        console.warn('enhanced job file delete:', e.message);
    }
}

const ENHANCED_JOB_ACTIVE_STATUSES = new Set([
    'pending',
    'processing',
    'batch_queued',
    'batch_processing',
]);

async function cancelEnhancedPictureJob(query, pool, job, { note } = {}) {
    if (!ENHANCED_JOB_ACTIVE_STATUSES.has(job.status)) {
        const err = new Error('This job is not running anymore.');
        err.status = 400;
        throw err;
    }
    const updated = await query(
        `UPDATE reseller_enhanced_picture_jobs
         SET status = 'cancelled',
             batch_state = COALESCE(batch_state, 'JOB_STATE_CANCELLED'),
             batch_completed_at = CURRENT_TIMESTAMP,
             error_message = $1
         WHERE id = $2 AND reseller_user_id = $3
           AND deleted_at IS NULL
           AND status IN ('pending', 'processing', 'batch_queued', 'batch_processing')
         RETURNING *`,
        [note || 'Cancelled by user', job.id, job.reseller_user_id],
    );
    if (!updated.length) {
        const err = new Error('Could not cancel this job.');
        err.status = 409;
        throw err;
    }
    await refundJobCreditIfNeeded(
        query,
        pool,
        job,
        `Refund: job #${job.id} cancelled`,
    );
    return updated[0];
}

async function deleteEnhancedPictureJob(query, pool, job, enhancedDir) {
    if (job.deleted_at) {
        const err = new Error('Job already removed.');
        err.status = 410;
        throw err;
    }
    let current = job;
    if (ENHANCED_JOB_ACTIVE_STATUSES.has(job.status)) {
        current = await cancelEnhancedPictureJob(query, pool, job, {
            note: 'Cancelled before delete',
        });
    }
    removeEnhancedJobResultFile(enhancedDir, current.result_image_url);
    const updated = await query(
        `UPDATE reseller_enhanced_picture_jobs
         SET deleted_at = CURRENT_TIMESTAMP
         WHERE id = $1 AND reseller_user_id = $2 AND deleted_at IS NULL
         RETURNING id`,
        [job.id, job.reseller_user_id],
    );
    if (!updated.length) {
        const err = new Error('Could not remove this job.');
        err.status = 409;
        throw err;
    }
    return { id: job.id, removed: true };
}

async function finalizeEnhancedPictureJob({
    query,
    pool,
    job,
    generated,
    aiConfig,
    enhancedDir,
    getPublicApiBaseUrl,
    uploadsWebProductsDir,
    barcodeStem,
    photoType,
    downloadFilename,
}) {
    const outName = saveGeneratedBuffer(
        enhancedDir,
        generated.buffer,
        generated.mimeType,
        `enhanced-out-${job.reseller_user_id}`,
    );
    const resultUrl = `${getPublicApiBaseUrl()}/uploads/web_products/enhanced/${outName}`;
    const resultPath = path.join(enhancedDir, outName);
    const finalDownload =
        (downloadFilename || `studio-${job.id}`) + extFromMime(generated.mimeType);

    let attach = null;
    const stem = barcodeStem || job.barcode_stem;
    if (stem) {
        attach = await attachGeneratedToProduct({
            query,
            getPublicApiBaseUrl,
            uploadsWebProductsDir,
            resellerUserId: job.reseller_user_id,
            stem,
            photoType: photoType || job.photo_type || 'front',
            resultFilePath: resultPath,
            resultMime: generated.mimeType,
        });
    }

    const updated = await query(
        `UPDATE reseller_enhanced_picture_jobs
         SET result_image_url = $1, status = 'completed',
             attached_submission_id = $2, attached_sku = $3,
             barcode_stem = COALESCE($4, barcode_stem),
             download_filename = $5,
             ai_provider = $6,
             ai_model = $7,
             batch_completed_at = CURRENT_TIMESTAMP,
             error_message = NULL
         WHERE id = $8 AND deleted_at IS NULL AND status NOT IN ('cancelled')
         RETURNING *`,
        [
            resultUrl,
            attach?.submissionId || null,
            attach?.sku || null,
            stem || null,
            finalDownload,
            generated.provider || aiConfig?.provider || 'gemini',
            generated.model || aiConfig?.gemini_model || null,
            job.id,
        ],
    );
    return { job: updated[0], resultUrl, finalDownload, attach };
}

/** Background fast-mode generation — avoids proxy timeouts on long AI calls. */
async function processEnhancedSyncJob(jobId, params, deps) {
    const { query, pool, enhancedDir, getPublicApiBaseUrl, uploadsWebProductsDir } = deps;
    const {
        sourceImagePath,
        aspectRatio,
        canvasText,
        barcodeStem,
        photoType,
        downloadFilename,
        resellerUserId,
        promptText,
        negativePrompt,
        workflowHighlights,
    } = params;

    try {
        const active = await query(
            `SELECT * FROM reseller_enhanced_picture_jobs
             WHERE id = $1 AND deleted_at IS NULL AND status = 'processing'`,
            [jobId],
        );
        if (!active.length) return;
        const job = active[0];

        const aiConfig = await resolveAiConfigForUser(query, resellerUserId);
        const generated = await generateStudioImage({
            promptText,
            negativePrompt,
            sourceImagePath,
            aspectRatio,
            canvasText,
            aiConfig,
            workflowHighlights,
        });

        const stillActive = await query(
            `SELECT id FROM reseller_enhanced_picture_jobs
             WHERE id = $1 AND deleted_at IS NULL AND status = 'processing'`,
            [jobId],
        );
        if (!stillActive.length) return;

        await consumeOneCredit(query, pool, resellerUserId);
        await finalizeEnhancedPictureJob({
            query,
            pool,
            job: { ...job, reseller_user_id: resellerUserId },
            generated,
            aiConfig,
            enhancedDir,
            getPublicApiBaseUrl,
            uploadsWebProductsDir,
            barcodeStem,
            photoType,
            downloadFilename,
        });
        await query(
            `UPDATE reseller_enhanced_picture_jobs
             SET generation_mode = 'sync', credit_charged = true
             WHERE id = $1`,
            [jobId],
        );
    } catch (genErr) {
        console.error(`enhanced sync job #${jobId}:`, genErr);
        await query(
            `UPDATE reseller_enhanced_picture_jobs
             SET status = 'failed', error_message = $1, batch_completed_at = CURRENT_TIMESTAMP
             WHERE id = $2 AND status = 'processing' AND deleted_at IS NULL`,
            [String(genErr.message || 'Generation failed').slice(0, 1000), jobId],
        );
    }
}

async function processEnhancedBatchJobRow(job, deps) {
    const { query, pool, enhancedDir, getPublicApiBaseUrl, uploadsWebProductsDir } = deps;
    if (!job?.gemini_batch_name || !job?.id) return;
    const freshRows = await query(
        `SELECT * FROM reseller_enhanced_picture_jobs WHERE id = $1`,
        [job.id],
    );
    if (!freshRows.length) return;
    job = freshRows[0];
    if (job.deleted_at || job.status === 'cancelled') return;
    if (!['batch_queued', 'batch_processing'].includes(job.status)) return;
    const aiConfig = await resolveAiConfigForUser(query, job.reseller_user_id);
    const apiKey = aiConfig.gemini_api_key || getGeminiApiKey();
    if (!apiKey) return;

    let batchStatus;
    try {
        batchStatus = await fetchGeminiBatchJob(job.gemini_batch_name, apiKey);
    } catch (e) {
        console.warn(`enhanced batch poll #${job.id}:`, e.message);
        return;
    }

    const state = parseGeminiBatchJobState(batchStatus) || job.batch_state || 'JOB_STATE_PENDING';
    if (!GEMINI_BATCH_TERMINAL_STATES.has(state)) {
        await query(
            `UPDATE reseller_enhanced_picture_jobs
             SET status = 'batch_processing', batch_state = $1
             WHERE id = $2 AND status IN ('batch_queued', 'batch_processing')
               AND deleted_at IS NULL`,
            [state, job.id],
        );
        return;
    }

    if (state !== 'JOB_STATE_SUCCEEDED') {
        const errMsg =
            batchStatus?.error?.message ||
            batchStatus?.error ||
            `Batch ended with ${state}`;
        await query(
            `UPDATE reseller_enhanced_picture_jobs
             SET status = 'failed', batch_state = $1, batch_completed_at = CURRENT_TIMESTAMP,
                 error_message = $2
             WHERE id = $3 AND deleted_at IS NULL AND status NOT IN ('cancelled')`,
            [state, String(errMsg).slice(0, 1000), job.id],
        );
        await refundJobCreditIfNeeded(query, pool, job);
        return;
    }

    try {
        const img = extractImageFromGeminiBatchStatus(batchStatus);
        if (!img) {
            throw new Error('Batch succeeded but returned no image.');
        }
        const stillActive = await query(
            `SELECT id FROM reseller_enhanced_picture_jobs
             WHERE id = $1 AND deleted_at IS NULL AND status IN ('batch_queued', 'batch_processing')`,
            [job.id],
        );
        if (!stillActive.length) return;
        await finalizeEnhancedPictureJob({
            query,
            pool,
            job,
            generated: {
                ...img,
                provider: 'gemini',
                model: job.ai_model || aiConfig.gemini_model,
            },
            aiConfig,
            enhancedDir,
            getPublicApiBaseUrl,
            uploadsWebProductsDir,
            barcodeStem: job.barcode_stem,
            photoType: job.photo_type,
            downloadFilename: job.download_filename,
        });
        await query(
            `UPDATE reseller_enhanced_picture_jobs SET batch_state = $1 WHERE id = $2`,
            ['JOB_STATE_SUCCEEDED', job.id],
        );
    } catch (e) {
        console.error(`enhanced batch finalize #${job.id}:`, e);
        await query(
            `UPDATE reseller_enhanced_picture_jobs
             SET status = 'failed', batch_state = 'JOB_STATE_FAILED',
                 batch_completed_at = CURRENT_TIMESTAMP, error_message = $1
             WHERE id = $2`,
            [String(e.message || 'Batch finalize failed').slice(0, 1000), job.id],
        );
        await refundJobCreditIfNeeded(query, pool, job);
    }
}

let batchPollerStarted = false;

function startEnhancedBatchPoller(deps) {
    if (batchPollerStarted) return;
    batchPollerStarted = true;
    const intervalMs = Math.max(8000, parseInt(process.env.GEMINI_BATCH_POLL_MS || '10000', 10));
    setInterval(async () => {
        try {
            const { query, pool } = deps;
            const rows = await query(
                `SELECT * FROM reseller_enhanced_picture_jobs
                 WHERE status IN ('batch_queued', 'batch_processing')
                   AND gemini_batch_name IS NOT NULL
                   AND deleted_at IS NULL
                 ORDER BY batch_submitted_at ASC NULLS LAST, id ASC
                 LIMIT 20`,
            );
            for (const job of rows) {
                await processEnhancedBatchJobRow(job, deps);
            }
        } catch (e) {
            console.warn('enhanced batch poller:', e.message);
        }
    }, intervalMs);
    console.log(`✅ Enhanced picture Gemini batch poller every ${intervalMs / 1000}s`);
}

/**
 * Call Gemini image generation with an optional reference image.
 * Returns { buffer, mimeType, provider, model }.
 */
async function generateWithGemini({
    promptText,
    negativePrompt,
    sourceImagePath,
    aspectRatio,
    canvasText,
    aiConfig,
    workflowHighlights,
}) {
    const apiKey = aiConfig?.gemini_api_key || getGeminiApiKey();
    if (!apiKey) {
        const err = new Error(
            'Gemini API key is not configured. Add GEMINI_API_KEY to server .env or paste a key in Prompt Lab → AI model settings.',
        );
        err.status = 503;
        throw err;
    }
    const aspect = normalizeAspectRatio(aspectRatio);
    const { parts } = buildGeminiUserParts({
        promptText,
        negativePrompt,
        sourceImagePath,
        aspectRatio: aspect,
        canvasText,
        workflowHighlights,
    });

    const primaryModel = aiConfig?.gemini_model || getGeminiImageModel();
    const models = [...new Set([primaryModel, ...geminiImageModelCandidates()].filter(Boolean))];
    const imageSizes = ['4K', '2K'];
    let lastError = null;
    let usedModel = primaryModel;
    for (const model of models) {
        usedModel = model;
        for (const imageSize of imageSizes) {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
        try {
            const res = await axios.post(
                url,
                {
                    contents: [{ role: 'user', parts }],
                    generationConfig: {
                        responseModalities: ['IMAGE'],
                        imageConfig: { aspectRatio: aspect, imageSize },
                    },
                },
                { timeout: 180000, validateStatus: () => true },
            );
            if (res.status >= 400) {
                const msg =
                    res.data?.error?.message ||
                    res.data?.message ||
                    `Gemini API error (${res.status})`;
                const err = new Error(msg);
                err.status = res.status === 429 ? 429 : 502;
                lastError = err;
                if (/not found|not supported|invalid.*imageSize|imageSize/i.test(msg)) {
                    if (imageSize === '4K') continue;
                    continue;
                }
                if (/not found|not supported/i.test(msg)) break;
                throw err;
            }
            const data = res.data;
            const candidates = data?.candidates || [];
            for (const c of candidates) {
                const outParts = c?.content?.parts || [];
                for (const p of outParts) {
                    const inline = p.inlineData || p.inline_data;
                    if (inline?.data) {
                        let buffer = Buffer.from(inline.data, 'base64');
                        let mimeType = inline.mimeType || inline.mime_type || 'image/png';
                        const finished = await postprocessStudioOutput(buffer, mimeType);
                        buffer = finished.buffer;
                        mimeType = finished.mimeType;
                        return {
                            buffer,
                            mimeType,
                            provider: 'gemini',
                            model: usedModel,
                            imageSize,
                        };
                    }
                }
            }
            const textBits = [];
            for (const c of candidates) {
                for (const p of c?.content?.parts || []) {
                    if (p.text) textBits.push(p.text);
                }
            }
            lastError = new Error(
                textBits.length
                    ? `Model returned no image. ${textBits.join(' ').slice(0, 400)}`
                    : 'Model returned no image. Try another photo or adjust the prompt.',
            );
            lastError.status = 502;
        } catch (e) {
            if (e.status && !/not found|not supported|imageSize/i.test(String(e.message || ''))) throw e;
            lastError = e;
        }
        }
    }
    if (lastError) throw lastError;
    const err = new Error('Gemini image generation failed. Check API key and model access.');
    err.status = 502;
    throw err;
}

function replicateAspectRatio(aspectRatio) {
    const aspect = normalizeAspectRatio(aspectRatio);
    const supported = new Set(['1:1', '16:9', '9:16', '4:3', '3:4', '4:5', '5:4', '2:3', '3:2']);
    return supported.has(aspect) ? aspect : '1:1';
}

function buildReplicateInput(model, { fullPrompt, sourceImagePath, aspectRatio }) {
    const aspect = replicateAspectRatio(aspectRatio);
    const input = { prompt: fullPrompt };
    if (sourceImagePath && fs.existsSync(sourceImagePath)) {
        const buf = fs.readFileSync(sourceImagePath);
        const mime = mimeFromExt(path.extname(sourceImagePath));
        const dataUri = `data:${mime};base64,${buf.toString('base64')}`;
        const slug = String(model || '').toLowerCase();
        if (slug.includes('flux-kontext') || slug.includes('nano-banana')) {
            input.input_image = dataUri;
            input.aspect_ratio = aspect;
        } else if (slug.includes('flux')) {
            input.image = dataUri;
            input.aspect_ratio = aspect;
        } else {
            input.image = dataUri;
            input.aspect_ratio = aspect;
        }
    }
    return input;
}

async function pollReplicatePrediction(token, predictionId, maxWaitMs = 180000) {
    const started = Date.now();
    while (Date.now() - started < maxWaitMs) {
        const res = await axios.get(`https://api.replicate.com/v1/predictions/${predictionId}`, {
            headers: { Authorization: `Bearer ${token}` },
            timeout: 30000,
            validateStatus: () => true,
        });
        if (res.status >= 400) {
            const msg = res.data?.detail || res.data?.error || `Replicate poll error (${res.status})`;
            const err = new Error(typeof msg === 'string' ? msg : JSON.stringify(msg).slice(0, 400));
            err.status = 502;
            throw err;
        }
        const p = res.data;
        if (p.status === 'succeeded') return p;
        if (p.status === 'failed' || p.status === 'canceled') {
            const err = new Error(String(p.error || 'Replicate prediction failed'));
            err.status = 502;
            throw err;
        }
        await new Promise((r) => setTimeout(r, 2000));
    }
    const err = new Error('Replicate timed out waiting for image generation.');
    err.status = 504;
    throw err;
}

async function generateWithReplicate({
    promptText,
    negativePrompt,
    sourceImagePath,
    aspectRatio,
    canvasText,
    aiConfig,
    workflowHighlights,
}) {
    const token = aiConfig?.replicate_api_token || getReplicateApiToken();
    if (!token) {
        const err = new Error(
            'Replicate API token is not configured. Paste your token in Prompt Lab → AI model settings (from replicate.com/account/api-tokens).',
        );
        err.status = 503;
        throw err;
    }
    const model = String(aiConfig?.replicate_model || getReplicateDefaultModel()).trim();
    if (!model.includes('/')) {
        const err = new Error('Replicate model must be owner/name (e.g. black-forest-labs/flux-kontext-pro).');
        err.status = 400;
        throw err;
    }
    const fullPrompt = buildFullPrompt(promptText, negativePrompt, {
        aspectRatio,
        canvasText,
        workflowHighlights,
    });
    const input = buildReplicateInput(model, { fullPrompt, sourceImagePath, aspectRatio });
    const [owner, name] = model.split('/');
    const createRes = await axios.post(
        `https://api.replicate.com/v1/models/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/predictions`,
        { input },
        {
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
            timeout: 60000,
            validateStatus: () => true,
        },
    );
    if (createRes.status >= 400) {
        const detail = createRes.data?.detail || createRes.data?.error || createRes.data;
        const msg =
            typeof detail === 'string'
                ? detail
                : Array.isArray(detail)
                  ? detail.map((d) => d.msg || d.message || JSON.stringify(d)).join('; ')
                  : JSON.stringify(detail).slice(0, 500);
        const err = new Error(`Replicate error: ${msg}`);
        err.status = createRes.status === 401 ? 401 : 502;
        throw err;
    }
    const prediction = createRes.data;
    const finished =
        prediction.status === 'succeeded'
            ? prediction
            : await pollReplicatePrediction(token, prediction.id);
    const output = finished.output;
    const outputUrl = Array.isArray(output) ? output[0] : output;
    if (!outputUrl || typeof outputUrl !== 'string') {
        const err = new Error('Replicate returned no image URL.');
        err.status = 502;
        throw err;
    }
    const imgRes = await axios.get(outputUrl, {
        responseType: 'arraybuffer',
        timeout: 120000,
        validateStatus: () => true,
    });
    if (imgRes.status >= 400) {
        const err = new Error(`Failed to download Replicate output (${imgRes.status}).`);
        err.status = 502;
        throw err;
    }
    const contentType = String(imgRes.headers['content-type'] || 'image/png').split(';')[0];
    return {
        buffer: Buffer.from(imgRes.data),
        mimeType: contentType || 'image/png',
        provider: 'replicate',
        model,
    };
}

async function generateStudioImageCore({
    promptText,
    negativePrompt,
    sourceImagePath,
    aspectRatio,
    canvasText,
    aiConfig,
    workflowHighlights,
}) {
    const provider = normalizeAiProvider(aiConfig?.provider);
    if (provider === 'replicate') {
        return generateWithReplicate({
            promptText,
            negativePrompt,
            sourceImagePath,
            aspectRatio,
            canvasText,
            aiConfig,
            workflowHighlights,
        });
    }
    return generateWithGemini({
        promptText,
        negativePrompt,
        sourceImagePath,
        aspectRatio,
        canvasText,
        aiConfig,
        workflowHighlights,
    });
}

async function generateStudioImage({
    promptText,
    negativePrompt,
    sourceImagePath,
    aspectRatio,
    canvasText,
    aiConfig,
    workflowHighlights,
    usePipeline,
}) {
    const pipelineOn =
        usePipeline !== false && aiConfig?.studio_pipeline_enabled !== false;
    return runFourStepStudioPipeline({
        promptText,
        negativePrompt,
        sourceImagePath,
        aspectRatio,
        canvasText,
        aiConfig,
        workflowHighlights,
        generateStudioImage: generateStudioImageCore,
        pipelineEnabled: pipelineOn,
    });
}

function extFromMime(mime) {
    const m = String(mime || '').toLowerCase();
    if (m.includes('jpeg') || m.includes('jpg')) return '.jpg';
    if (m.includes('webp')) return '.webp';
    if (m.includes('gif')) return '.gif';
    return '.png';
}

function saveGeneratedBuffer(uploadsDir, buffer, mimeType, prefix) {
    fs.mkdirSync(uploadsDir, { recursive: true });
    const ext = extFromMime(mimeType);
    const name = `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`;
    const full = path.join(uploadsDir, name);
    fs.writeFileSync(full, buffer);
    return name;
}

async function loadResellerFlags(query, userId) {
    const rows = await query(
        `SELECT id, customer_tier,
                COALESCE(reseller_enhanced_pictures_enabled, false) AS enhanced_pictures,
                COALESCE(reseller_product_uploads_enabled, false) AS product_uploads,
                COALESCE(reseller_product_edits_enabled, false) AS product_edits,
                business_name, email
         FROM users WHERE id = $1`,
        [userId],
    );
    return rows[0] || null;
}

async function assertResellerEnhancedAccess(query, userId) {
    const u = await loadResellerFlags(query, userId);
    if (!u || String(u.customer_tier || '').toUpperCase() !== 'RESELLER') {
        const err = new Error('Enhanced Pictures is available for RESELLER accounts only');
        err.status = 403;
        throw err;
    }
    if (!u.enhanced_pictures) {
        const err = new Error(
            'Enhanced Picture subscription is not enabled for this account. Ask KC admin to turn it on.',
        );
        err.status = 403;
        throw err;
    }
    return u;
}

function mapBarcodeHintRows(rows) {
    return rows.map((r) => {
        const payload =
            r.payload_json && typeof r.payload_json === 'object' ? r.payload_json : {};
        const itemCode = payload.itemCode || payload.item_code || payload.ItemCode || r.design_group;
        const stem = normalizeStem(r.web_product_sku || r.barcode || '');
        return {
            id: r.id,
            barcode: r.barcode,
            web_product_sku: r.web_product_sku,
            product_name: r.product_name || null,
            item_code: itemCode || null,
            stem,
            front_filename: stem ? `${stem}.webp` : null,
            back_filename: stem ? `${stem}_secondary.webp` : null,
            has_front: !!(r.image_url && String(r.image_url).trim()),
            has_back: !!(r.secondary_image_url && String(r.secondary_image_url).trim()),
            submission_status: r.submission_status,
            batch_id: r.batch_id,
            mrp_rate_behind_box: r.mrp_rate_behind_box ?? null,
            show_mrp_field:
                payload.excel_has_mrp_behind_box_column === true ||
                payload.excelHasMrpBehindBoxColumn === true,
        };
    });
}

async function reconcileStaleEnhancedJobs(query, pool, userId) {
    const stale = await query(
        `SELECT * FROM reseller_enhanced_picture_jobs
         WHERE reseller_user_id = $1 AND deleted_at IS NULL
           AND status IN ('processing', 'pending')
           AND created_at < NOW() - INTERVAL '20 minutes'
           AND COALESCE(generation_mode, 'sync') NOT IN ('batch')`,
        [userId],
    );
    for (const job of stale) {
        await query(
            `UPDATE reseller_enhanced_picture_jobs
             SET status = 'failed', error_message = $1, batch_completed_at = CURRENT_TIMESTAMP
             WHERE id = $2 AND status IN ('processing', 'pending')`,
            ['Generation timed out — please try again.', job.id],
        );
        await refundJobCreditIfNeeded(query, pool, job, `Refund: job #${job.id} timed out`);
    }
}

async function loadResellerEnhancedBootstrap(query, pool, userId, { jobLimit = 15, includeHints = true } = {}) {
    await Promise.all([
        ensureDefaultIdolsPrompt(query, userId, null),
        ensureDefaultPlans(query, userId),
        reconcileStaleEnhancedJobs(query, pool, userId),
    ]);
    const safeJobLimit = Number.isFinite(jobLimit) ? Math.min(Math.max(jobLimit, 1), 30) : 15;
    const [
        activePromptRows,
        creditInfo,
        plans,
        templatesRaw,
        aiSettings,
        jobs,
        hintRows,
    ] = await Promise.all([
        query(
            `SELECT id, template_key, name, is_active
             FROM reseller_enhanced_picture_prompts
             WHERE reseller_user_id = $1 AND is_active = true`,
            [userId],
        ),
        getCreditBalance(query, userId),
        listPlans(query, userId, { activeOnly: true }),
        buildTemplatesForReseller(query, userId),
        loadResellerAiSettings(query, userId),
        query(
            `SELECT id, template_key, status, barcode_stem, photo_type, generation_mode,
                    batch_state, result_image_url, source_image_url, download_filename,
                    error_message, attached_sku, attached_submission_id,
                    created_at, batch_submitted_at, batch_completed_at
             FROM reseller_enhanced_picture_jobs
             WHERE reseller_user_id = $1 AND deleted_at IS NULL
             ORDER BY created_at DESC
             LIMIT $2`,
            [userId, safeJobLimit],
        ),
        includeHints
            ? query(
                  `SELECT id, barcode, web_product_sku, product_name, design_group, payload_json,
                          image_url, secondary_image_url, submission_status, batch_id, mrp_rate_behind_box
                   FROM reseller_product_submissions
                   WHERE submitted_by_user_id = $1
                     AND submission_status IN ('draft', 'pending')
                   ORDER BY updated_at DESC NULLS LAST, created_at DESC
                   LIMIT 200`,
                  [userId],
              )
            : Promise.resolve([]),
    ]);
    const templatesWithShowcase = templatesRaw
        .filter((t) => t.is_enabled !== false)
        .map((t) => ({
            ...t,
            varieties: (t.varieties || []).filter((v) => v.is_enabled),
            subtemplates: (t.varieties || []).filter((v) => v.is_enabled),
        }));
    return {
        enabled: true,
        templates: templatesWithShowcase,
        aspects: CANVAS_ASPECTS,
        active_prompt: activePromptRows[0] || null,
        credits: creditInfo?.credits ?? 0,
        razorpay_enabled: !!creditInfo?.razorpay_enabled,
        payment_qr_url: creditInfo?.payment_qr_url || null,
        bank_details: creditInfo?.bank_details || null,
        plans,
        ai_settings: aiSettings
            ? {
                  provider: aiSettings.provider,
                  gemini_model: aiSettings.gemini_model,
                  replicate_model: aiSettings.replicate_model,
                  gemini_batch_enabled: aiSettings.gemini_batch_enabled,
                  studio_pipeline_enabled: aiSettings.studio_pipeline_enabled,
              }
            : null,
        jobs,
        hints: mapBarcodeHintRows(hintRows),
    };
}

async function ensureDefaultIdolsPrompt(query, resellerUserId, adminId) {
    const existing = await query(
        `SELECT id FROM reseller_enhanced_picture_prompts
         WHERE reseller_user_id = $1 AND template_key = $2 LIMIT 1`,
        [resellerUserId, TEMPLATE_IDOLS],
    );
    if (existing.length) return existing[0];
    const inserted = await query(
        `INSERT INTO reseller_enhanced_picture_prompts
            (reseller_user_id, template_key, name, prompt_text, negative_prompt, is_active, is_test, created_by_admin_id)
         VALUES ($1, $2, $3, $4, $5, true, false, $6)
         RETURNING *`,
        [
            resellerUserId,
            TEMPLATE_IDOLS,
            'Idols — default studio prompt',
            DEFAULT_IDOLS_PROMPT,
            DEFAULT_IDOLS_NEGATIVE,
            adminId || null,
        ],
    );
    return inserted[0];
}

async function findSubmissionByStem(query, resellerUserId, stem) {
    const keys = stemKeys(stem);
    if (!keys.length) return null;
    const rows = await query(
        `SELECT id, barcode, web_product_sku, product_name, design_group, payload_json,
                image_url, secondary_image_url, submission_status, batch_id,
                mrp_rate_behind_box
         FROM reseller_product_submissions
         WHERE submitted_by_user_id = $1
           AND submission_status IN ('draft', 'pending', 'approved')
         ORDER BY
           CASE submission_status WHEN 'draft' THEN 0 WHEN 'pending' THEN 1 ELSE 2 END,
           updated_at DESC NULLS LAST,
           created_at DESC
         LIMIT 500`,
        [resellerUserId],
    );
    for (const row of rows) {
        const payload =
            row.payload_json && typeof row.payload_json === 'object' ? row.payload_json : {};
        const itemCode = payload.itemCode || payload.item_code || payload.ItemCode || row.design_group;
        const candidates = [
            row.web_product_sku,
            row.barcode,
            row.product_name,
            itemCode,
        ]
            .map((x) => normalizeStem(x))
            .filter(Boolean);
        for (const c of candidates) {
            const cKeys = stemKeys(c);
            if (keys.some((k) => cKeys.includes(k))) {
                return {
                    ...row,
                    excel_has_mrp_behind_box_column:
                        payload.excel_has_mrp_behind_box_column === true ||
                        payload.excelHasMrpBehindBoxColumn === true,
                };
            }
        }
        const searchUpper = String(stem || '')
            .trim()
            .toUpperCase();
        if (searchUpper) {
            const nameMatch = String(row.product_name || '')
                .trim()
                .toUpperCase();
            const codeMatch = String(itemCode || '')
                .trim()
                .toUpperCase();
            if (nameMatch === searchUpper || codeMatch === searchUpper) {
                return {
                    ...row,
                    excel_has_mrp_behind_box_column:
                        payload.excel_has_mrp_behind_box_column === true ||
                        payload.excelHasMrpBehindBoxColumn === true,
                };
            }
        }
    }
    return null;
}

async function resolveActivePrompt(query, resellerUserId, templateKey, varietyKey) {
    const vKey = varietyKey ? String(varietyKey).trim().toLowerCase().slice(0, 64) : null;
    if (vKey) {
        const varietyPrompt = await query(
            `SELECT * FROM reseller_enhanced_picture_prompts
             WHERE reseller_user_id = $1 AND template_key = $2 AND variety_key = $3 AND is_active = true
             LIMIT 1`,
            [resellerUserId, templateKey, vKey],
        );
        if (varietyPrompt.length) return varietyPrompt[0];
    }
    const templatePrompt = await query(
        `SELECT * FROM reseller_enhanced_picture_prompts
         WHERE reseller_user_id = $1 AND template_key = $2 AND is_active = true
           AND (variety_key IS NULL OR variety_key = '')
         LIMIT 1`,
        [resellerUserId, templateKey],
    );
    if (templatePrompt.length) return templatePrompt[0];
    const fallback = await query(
        `SELECT * FROM reseller_enhanced_picture_prompts
         WHERE reseller_user_id = $1 AND template_key = $2 AND is_active = true
         LIMIT 1`,
        [resellerUserId, templateKey],
    );
    return fallback[0] || null;
}

async function attachGeneratedToProduct({
    query,
    getPublicApiBaseUrl,
    uploadsWebProductsDir,
    resellerUserId,
    stem,
    photoType,
    resultFilePath,
    resultMime,
    mrpRateBehindBox,
}) {
    const entry = await findSubmissionByStem(query, resellerUserId, stem);
    if (!entry) {
        return { attached: false, reason: 'No matching draft/pending product for this barcode' };
    }
    const prodSku = normalizeStem(entry.web_product_sku || entry.barcode || stem);
    if (!prodSku) {
        return { attached: false, reason: 'Product has no SKU/barcode stem' };
    }
    const ext = extFromMime(resultMime);
    let target;
    let urlField;
    if (photoType === 'back') {
        target = `${prodSku}_secondary${ext}`;
        urlField = 'secondary_image_url';
    } else if (photoType === 'box') {
        target = `${prodSku}_box${ext}`;
        urlField = 'box_image_url';
    } else {
        target = `${prodSku}${ext}`;
        urlField = 'image_url';
    }
    const destPath = path.join(uploadsWebProductsDir, target);
    if (fs.existsSync(destPath)) {
        try {
            fs.unlinkSync(destPath);
        } catch (_) {
            /* ignore */
        }
    }
    fs.copyFileSync(resultFilePath, destPath);
    const url = `${getPublicApiBaseUrl()}/uploads/web_products/${target}`;

    let mrpVal = null;
    if (mrpRateBehindBox != null && String(mrpRateBehindBox).trim() !== '') {
        const n = Number(mrpRateBehindBox);
        if (Number.isFinite(n) && n > 0) mrpVal = n;
    }

    const payload =
        entry.payload_json && typeof entry.payload_json === 'object' ? { ...entry.payload_json } : {};
    if (mrpVal != null) {
        payload.mrpRateBehindBox = mrpVal;
        payload.mrp_rate_behind_box = mrpVal;
    }

    if (mrpVal != null) {
        await query(
            `UPDATE reseller_product_submissions
             SET ${urlField} = $1, mrp_rate_behind_box = $2, payload_json = $3::jsonb,
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = $4`,
            [url, mrpVal, JSON.stringify(payload), entry.id],
        );
        if (entry.submission_status === 'approved' && entry.web_product_sku) {
            await query(
                `UPDATE web_products SET mrp_rate_behind_box = $1 WHERE sku = $2`,
                [mrpVal, entry.web_product_sku],
            );
        }
    } else {
        await query(
            `UPDATE reseller_product_submissions
             SET ${urlField} = $1, updated_at = CURRENT_TIMESTAMP
             WHERE id = $2`,
            [url, entry.id],
        );
    }
    return {
        attached: true,
        submissionId: entry.id,
        sku: prodSku,
        url,
        photoType,
        status: entry.submission_status,
        mrp_rate_behind_box: mrpVal,
        product_name: entry.product_name || null,
    };
}

function registerResellerEnhancedPictureRoutes(app, deps) {
    const {
        query,
        pool,
        checkAuth,
        isAdminStrict,
        requireJson,
        getPublicApiBaseUrl,
        uploadsWebProductsDir,
    } = deps;

    const enhancedDir = path.join(uploadsWebProductsDir, 'enhanced');
    fs.mkdirSync(enhancedDir, { recursive: true });
    const upload = createEnhancedUploadMulter(enhancedDir);

    const runUpload = (req, res) =>
        new Promise((resolve, reject) => {
            upload(req, res, (err) => (err ? reject(err) : resolve()));
        });

    // ---- Admin: templates + prompts for a reseller ----
    app.get('/api/admin/enhanced-pictures/templates', isAdminStrict, (req, res) => {
        res.json({ templates: TEMPLATES, default_idols_prompt: DEFAULT_IDOLS_PROMPT });
    });

    app.get(
        '/api/admin/users/:userId/enhanced-picture-prompts',
        isAdminStrict,
        async (req, res) => {
            try {
                await ensureEnhancedPicturesSchema(pool);
                const userId = parseInt(String(req.params.userId), 10);
                if (!userId) return res.status(400).json({ error: 'userId required' });
                const u = await loadResellerFlags(query, userId);
                if (!u) return res.status(404).json({ error: 'User not found' });
                await ensureDefaultIdolsPrompt(query, userId, req.user?.id);
                await ensureDefaultPlans(query, userId);
                const templatesWithShowcase = await buildTemplatesForReseller(query, userId);
                const prompts = await query(
                    `SELECT * FROM reseller_enhanced_picture_prompts
                     WHERE reseller_user_id = $1
                     ORDER BY is_active DESC, updated_at DESC, id DESC`,
                    [userId],
                );
                const creditInfo = await getCreditBalance(query, userId);
                const plans = await listPlans(query, userId);
                const aiSettings = await loadResellerAiSettings(query, userId);
                res.json({
                    user: {
                        id: u.id,
                        email: u.email,
                        business_name: u.business_name,
                        reseller_enhanced_pictures_enabled: !!u.enhanced_pictures,
                        credits: creditInfo?.credits ?? 0,
                        razorpay_enabled: !!creditInfo?.razorpay_enabled,
                        payment_qr_url: creditInfo?.payment_qr_url || null,
                        bank_details: creditInfo?.bank_details || null,
                    },
                    ai_settings: aiSettings,
                    templates: templatesWithShowcase,
                    aspects: CANVAS_ASPECTS,
                    prompts: prompts.map(formatPromptRow),
                    plans,
                    default_plans: DEFAULT_PLANS,
                });
            } catch (e) {
                console.error('admin list enhanced prompts:', e);
                res.status(e.status || 500).json({ error: e.message });
            }
        },
    );

    app.post(
        '/api/admin/users/:userId/enhanced-picture-templates',
        isAdminStrict,
        requireJson,
        async (req, res) => {
            try {
                await ensureEnhancedPicturesSchema(pool);
                const userId = parseInt(String(req.params.userId), 10);
                if (!userId) return res.status(400).json({ error: 'userId required' });
                const created = await createBlankTemplate(query, userId, req.body, req.user?.id);
                res.json({ success: true, template: created });
            } catch (e) {
                console.error('admin create enhanced template:', e);
                res.status(e.status || 500).json({ error: e.message });
            }
        },
    );

    app.delete(
        '/api/admin/users/:userId/enhanced-picture-templates/:templateKey',
        isAdminStrict,
        async (req, res) => {
            try {
                await ensureEnhancedPicturesSchema(pool);
                const userId = parseInt(String(req.params.userId), 10);
                const templateKey = String(req.params.templateKey || '')
                    .trim()
                    .toLowerCase()
                    .slice(0, 64);
                if (!userId || !templateKey) {
                    return res.status(400).json({ error: 'userId and templateKey required' });
                }
                if (templateKey === TEMPLATE_IDOLS) {
                    return res.status(400).json({
                        error: 'Cannot delete the default Idols / Frames template. Disable it for the reseller instead.',
                    });
                }
                await query(
                    `DELETE FROM reseller_enhanced_picture_prompts
                     WHERE reseller_user_id = $1 AND template_key = $2`,
                    [userId, templateKey],
                );
                await query(
                    `DELETE FROM reseller_enhanced_picture_varieties
                     WHERE reseller_user_id = $1 AND template_key = $2`,
                    [userId, templateKey],
                );
                await query(
                    `DELETE FROM reseller_enhanced_picture_template_settings
                     WHERE reseller_user_id = $1 AND template_key = $2`,
                    [userId, templateKey],
                );
                res.json({ success: true, deleted: templateKey });
            } catch (e) {
                console.error('admin delete enhanced template:', e);
                res.status(e.status || 500).json({ error: e.message });
            }
        },
    );

    /** Unified Prompt Lab save: showcase + prompt + optional activate + template access. */
    app.post(
        '/api/admin/users/:userId/enhanced-picture-lab/save',
        isAdminStrict,
        requireJson,
        async (req, res) => {
            try {
                await ensureEnhancedPicturesSchema(pool);
                const userId = parseInt(String(req.params.userId), 10);
                if (!userId) return res.status(400).json({ error: 'userId required' });
                const templateKey = String(req.body.template_key || TEMPLATE_IDOLS)
                    .trim()
                    .toLowerCase()
                    .slice(0, 64) || TEMPLATE_IDOLS;
                const varietyKey = String(req.body.variety_key || '')
                    .trim()
                    .toLowerCase()
                    .slice(0, 64) || null;
                const promptId = req.body.prompt_id
                    ? parseInt(String(req.body.prompt_id), 10)
                    : null;
                const activate = req.body.activate !== false;
                const templateEnabled =
                    req.body.template_enabled !== undefined ? !!req.body.template_enabled : true;

                await ensureDefaultTemplateShowcase(query, userId, templateKey);
                const highlights = parseWorkflowHighlights(req.body.workflow_highlights || []);
                await query(
                    `UPDATE reseller_enhanced_picture_template_settings SET
                        workflow_highlights = $1::jsonb,
                        system_resolutions = COALESCE(NULLIF($2, ''), system_resolutions),
                        system_ratios = COALESCE(NULLIF($3, ''), system_ratios),
                        sample_label = COALESCE(NULLIF($4, ''), sample_label),
                        output_label = COALESCE(NULLIF($5, ''), output_label),
                        output_subtitle = COALESCE(NULLIF($6, ''), output_subtitle),
                        footer_note = COALESCE(NULLIF($7, ''), footer_note),
                        is_enabled = $8,
                        updated_at = CURRENT_TIMESTAMP
                     WHERE reseller_user_id = $9 AND template_key = $10`,
                    [
                        JSON.stringify(highlights),
                        String(req.body.system_resolutions || '').trim().slice(0, 200),
                        String(req.body.system_ratios || '').trim().slice(0, 120),
                        String(req.body.sample_label || '').trim().slice(0, 120),
                        String(req.body.output_label || '').trim().slice(0, 120),
                        String(req.body.output_subtitle || '').trim().slice(0, 200),
                        String(req.body.footer_note || '').trim().slice(0, 200),
                        templateEnabled,
                        userId,
                        templateKey,
                    ],
                );

                const normalized = normalizePromptFields(
                    req.body.prompt_text || '',
                    req.body.negative_prompt != null ? req.body.negative_prompt : '',
                );
                if (!normalized.promptText) {
                    return res.status(400).json({ error: 'Master prompt is required' });
                }
                const promptName =
                    String(req.body.name || 'Studio prompt').trim().slice(0, 200) || 'Studio prompt';

                let promptRow = null;
                if (promptId) {
                    const existing = await query(
                        `SELECT * FROM reseller_enhanced_picture_prompts
                         WHERE id = $1 AND reseller_user_id = $2`,
                        [promptId, userId],
                    );
                    if (!existing.length) return res.status(404).json({ error: 'Prompt not found' });
                    const updated = await query(
                        `UPDATE reseller_enhanced_picture_prompts
                         SET name = $1, prompt_text = $2, negative_prompt = $3,
                             template_key = $4, variety_key = $5, updated_at = CURRENT_TIMESTAMP
                         WHERE id = $6
                         RETURNING *`,
                        [
                            promptName,
                            normalized.promptText,
                            normalized.negativePrompt || null,
                            templateKey,
                            varietyKey,
                            promptId,
                        ],
                    );
                    promptRow = updated[0];
                } else {
                    const inserted = await query(
                        `INSERT INTO reseller_enhanced_picture_prompts
                            (reseller_user_id, template_key, variety_key, name, prompt_text, negative_prompt,
                             is_active, is_test, created_by_admin_id)
                         VALUES ($1, $2, $3, $4, $5, $6, false, false, $7)
                         RETURNING *`,
                        [
                            userId,
                            templateKey,
                            varietyKey,
                            promptName,
                            normalized.promptText,
                            normalized.negativePrompt || null,
                            req.user?.id || null,
                        ],
                    );
                    promptRow = inserted[0];
                }

                if (activate && promptRow) {
                    await query(
                        `UPDATE reseller_enhanced_picture_prompts
                         SET is_active = false, updated_at = CURRENT_TIMESTAMP
                         WHERE reseller_user_id = $1 AND template_key = $2
                           AND COALESCE(variety_key, '') = COALESCE($3, '')
                           AND id <> $4`,
                        [userId, templateKey, varietyKey, promptRow.id],
                    );
                    const act = await query(
                        `UPDATE reseller_enhanced_picture_prompts
                         SET is_active = true, is_test = false, updated_at = CURRENT_TIMESTAMP
                         WHERE id = $1
                         RETURNING *`,
                        [promptRow.id],
                    );
                    promptRow = act[0];
                }

                if (varietyKey && promptName) {
                    await query(
                        `UPDATE reseller_enhanced_picture_varieties
                         SET variety_label = $1, updated_at = CURRENT_TIMESTAMP
                         WHERE reseller_user_id = $2 AND template_key = $3 AND variety_key = $4`,
                        [promptName, userId, templateKey, varietyKey],
                    );
                }

                res.json({
                    success: true,
                    prompt: formatPromptRow(promptRow),
                    template_key: templateKey,
                    variety_key: varietyKey,
                    template_enabled: templateEnabled,
                });
            } catch (e) {
                console.error('admin enhanced lab save:', e);
                res.status(e.status || 500).json({ error: e.message });
            }
        },
    );

    app.post(
        '/api/admin/users/:userId/enhanced-picture-prompts',
        isAdminStrict,
        requireJson,
        async (req, res) => {
            try {
                await ensureEnhancedPicturesSchema(pool);
                const userId = parseInt(String(req.params.userId), 10);
                if (!userId) return res.status(400).json({ error: 'userId required' });
                const templateKey = String(req.body.template_key || TEMPLATE_IDOLS)
                    .trim()
                    .toLowerCase()
                    .slice(0, 64);
                const name = String(req.body.name || 'Test prompt').trim().slice(0, 200) || 'Test prompt';
                const normalized = normalizePromptFields(
                    req.body.prompt_text || '',
                    req.body.negative_prompt != null ? req.body.negative_prompt : DEFAULT_IDOLS_NEGATIVE,
                );
                if (!normalized.promptText) {
                    return res.status(400).json({ error: 'prompt_text required' });
                }
                const rows = await query(
                    `INSERT INTO reseller_enhanced_picture_prompts
                        (reseller_user_id, template_key, name, prompt_text, negative_prompt, is_active, is_test, created_by_admin_id)
                     VALUES ($1, $2, $3, $4, $5, false, true, $6)
                     RETURNING *`,
                    [
                        userId,
                        templateKey || TEMPLATE_IDOLS,
                        name,
                        normalized.promptText,
                        normalized.negativePrompt || null,
                        req.user?.id || null,
                    ],
                );
                res.json({ prompt: formatPromptRow(rows[0]) });
            } catch (e) {
                console.error('admin create enhanced prompt:', e);
                res.status(e.status || 500).json({ error: e.message });
            }
        },
    );

    app.patch(
        '/api/admin/enhanced-picture-prompts/:id',
        isAdminStrict,
        requireJson,
        async (req, res) => {
            try {
                await ensureEnhancedPicturesSchema(pool);
                const id = parseInt(String(req.params.id), 10);
                if (!id) return res.status(400).json({ error: 'id required' });
                const existing = await query(
                    `SELECT * FROM reseller_enhanced_picture_prompts WHERE id = $1`,
                    [id],
                );
                if (!existing.length) return res.status(404).json({ error: 'Prompt not found' });
                const cur = existing[0];
                const name =
                    req.body.name !== undefined
                        ? String(req.body.name || '').trim().slice(0, 200) || cur.name
                        : cur.name;
                const promptTextRaw =
                    req.body.prompt_text !== undefined
                        ? String(req.body.prompt_text || '')
                        : cur.prompt_text;
                const negativePromptRaw =
                    req.body.negative_prompt !== undefined
                        ? String(req.body.negative_prompt || '')
                        : cur.negative_prompt || '';
                const normalized = normalizePromptFields(promptTextRaw, negativePromptRaw);
                if (!normalized.promptText) {
                    return res.status(400).json({ error: 'prompt_text required' });
                }
                const rows = await query(
                    `UPDATE reseller_enhanced_picture_prompts
                     SET name = $1, prompt_text = $2, negative_prompt = $3, updated_at = CURRENT_TIMESTAMP
                     WHERE id = $4
                     RETURNING *`,
                    [name, normalized.promptText, normalized.negativePrompt || null, id],
                );
                res.json({ prompt: formatPromptRow(rows[0]) });
            } catch (e) {
                console.error('admin patch enhanced prompt:', e);
                res.status(e.status || 500).json({ error: e.message });
            }
        },
    );

    app.post(
        '/api/admin/enhanced-picture-prompts/:id/activate',
        isAdminStrict,
        async (req, res) => {
            try {
                await ensureEnhancedPicturesSchema(pool);
                const id = parseInt(String(req.params.id), 10);
                if (!id) return res.status(400).json({ error: 'id required' });
                const existing = await query(
                    `SELECT * FROM reseller_enhanced_picture_prompts WHERE id = $1`,
                    [id],
                );
                if (!existing.length) return res.status(404).json({ error: 'Prompt not found' });
                const cur = existing[0];
                await query(
                    `UPDATE reseller_enhanced_picture_prompts
                     SET is_active = false, updated_at = CURRENT_TIMESTAMP
                     WHERE reseller_user_id = $1 AND template_key = $2
                       AND COALESCE(variety_key, '') = COALESCE($3, '')
                       AND id <> $4`,
                    [cur.reseller_user_id, cur.template_key, cur.variety_key || null, id],
                );
                const rows = await query(
                    `UPDATE reseller_enhanced_picture_prompts
                     SET is_active = true, is_test = false, updated_at = CURRENT_TIMESTAMP
                     WHERE id = $1
                     RETURNING *`,
                    [id],
                );
                res.json({ prompt: rows[0] });
            } catch (e) {
                console.error('admin activate enhanced prompt:', e);
                res.status(e.status || 500).json({ error: e.message });
            }
        },
    );

    app.delete('/api/admin/enhanced-picture-prompts/:id', isAdminStrict, async (req, res) => {
        try {
            await ensureEnhancedPicturesSchema(pool);
            const id = parseInt(String(req.params.id), 10);
            if (!id) return res.status(400).json({ error: 'id required' });
            const existing = await query(
                `SELECT * FROM reseller_enhanced_picture_prompts WHERE id = $1`,
                [id],
            );
            if (!existing.length) return res.status(404).json({ error: 'Prompt not found' });
            if (existing[0].is_active) {
                return res.status(400).json({
                    error: 'Cannot delete the active prompt. Activate another prompt first.',
                });
            }
            await query(`DELETE FROM reseller_enhanced_picture_prompts WHERE id = $1`, [id]);
            res.json({ success: true });
        } catch (e) {
            console.error('admin delete enhanced prompt:', e);
            res.status(e.status || 500).json({ error: e.message });
        }
    });

    app.patch(
        '/api/admin/users/:userId/enhanced-picture-ai-settings',
        isAdminStrict,
        requireJson,
        async (req, res) => {
            try {
                await ensureEnhancedPicturesSchema(pool);
                const userId = parseInt(String(req.params.userId), 10);
                if (!userId) return res.status(400).json({ error: 'userId required' });
                const existing = await loadResellerAiConfigRaw(query, userId);
                if (!existing) return res.status(404).json({ error: 'User not found' });

                const provider =
                    req.body.provider !== undefined
                        ? normalizeAiProvider(req.body.provider)
                        : normalizeAiProvider(existing.reseller_enhanced_ai_provider);
                const geminiModel =
                    req.body.gemini_model !== undefined
                        ? String(req.body.gemini_model || '').trim().slice(0, 128) || null
                        : existing.reseller_enhanced_gemini_model;
                const replicateModel =
                    req.body.replicate_model !== undefined
                        ? String(req.body.replicate_model || '').trim().slice(0, 255) || null
                        : existing.reseller_enhanced_replicate_model;
                let geminiKey = existing.reseller_enhanced_gemini_api_key;
                let replicateToken = existing.reseller_enhanced_replicate_api_token;
                if (req.body.clear_gemini_api_key) geminiKey = null;
                if (req.body.clear_replicate_api_token) replicateToken = null;
                if (req.body.gemini_api_key != null && String(req.body.gemini_api_key).trim()) {
                    geminiKey = String(req.body.gemini_api_key).trim();
                }
                if (req.body.replicate_api_token != null && String(req.body.replicate_api_token).trim()) {
                    replicateToken = String(req.body.replicate_api_token).trim();
                }
                const geminiBatchEnabled =
                    req.body.gemini_batch_enabled !== undefined
                        ? !!req.body.gemini_batch_enabled
                        : existing.reseller_enhanced_gemini_batch_enabled != null
                          ? !!existing.reseller_enhanced_gemini_batch_enabled
                          : false;
                const studioPipelineEnabled =
                    req.body.studio_pipeline_enabled !== undefined
                        ? !!req.body.studio_pipeline_enabled
                        : existing.reseller_enhanced_studio_pipeline_enabled != null
                          ? !!existing.reseller_enhanced_studio_pipeline_enabled
                          : true;

                await query(
                    `UPDATE users SET
                        reseller_enhanced_ai_provider = $1,
                        reseller_enhanced_gemini_model = $2,
                        reseller_enhanced_replicate_model = $3,
                        reseller_enhanced_gemini_api_key = $4,
                        reseller_enhanced_replicate_api_token = $5,
                        reseller_enhanced_gemini_batch_enabled = $6,
                        reseller_enhanced_studio_pipeline_enabled = $7
                     WHERE id = $8`,
                    [
                        provider,
                        geminiModel,
                        replicateModel,
                        geminiKey,
                        replicateToken,
                        geminiBatchEnabled,
                        studioPipelineEnabled,
                        userId,
                    ],
                );
                const aiSettings = await loadResellerAiSettings(query, userId);
                res.json({ success: true, ai_settings: aiSettings });
            } catch (e) {
                console.error('admin patch enhanced ai settings:', e);
                res.status(e.status || 500).json({ error: e.message });
            }
        },
    );

    app.patch(
        '/api/admin/users/:userId/enhanced-picture-template-settings',
        isAdminStrict,
        requireJson,
        async (req, res) => {
            try {
                await ensureEnhancedPicturesSchema(pool);
                const userId = parseInt(String(req.params.userId), 10);
                if (!userId) return res.status(400).json({ error: 'userId required' });
                const templateKey = String(req.body.template_key || TEMPLATE_IDOLS)
                    .trim()
                    .toLowerCase()
                    .slice(0, 64);

                await ensureDefaultTemplateShowcase(query, userId, templateKey);
                const existing = await query(
                    `SELECT * FROM reseller_enhanced_picture_template_settings
                     WHERE reseller_user_id = $1 AND template_key = $2`,
                    [userId, templateKey],
                );
                const cur = normalizeTemplateShowcaseRow(existing[0], templateKey);
                const highlights =
                    req.body.workflow_highlights !== undefined
                        ? parseWorkflowHighlights(req.body.workflow_highlights)
                        : cur.workflow_highlights;
                const systemResolutions =
                    req.body.system_resolutions !== undefined
                        ? String(req.body.system_resolutions || '').trim().slice(0, 200)
                        : cur.system_resolutions;
                const systemRatios =
                    req.body.system_ratios !== undefined
                        ? String(req.body.system_ratios || '').trim().slice(0, 120)
                        : cur.system_ratios;
                const sampleLabel =
                    req.body.sample_label !== undefined
                        ? String(req.body.sample_label || '').trim().slice(0, 120)
                        : cur.sample_label;
                const outputLabel =
                    req.body.output_label !== undefined
                        ? String(req.body.output_label || '').trim().slice(0, 120)
                        : cur.output_label;
                const outputSubtitle =
                    req.body.output_subtitle !== undefined
                        ? String(req.body.output_subtitle || '').trim().slice(0, 200)
                        : cur.output_subtitle;
                const footerNote =
                    req.body.footer_note !== undefined
                        ? String(req.body.footer_note || '').trim().slice(0, 200)
                        : cur.footer_note;
                const sampleSourceUrl =
                    req.body.sample_source_image_url !== undefined
                        ? String(req.body.sample_source_image_url || '').trim().slice(0, 500) || null
                        : existing[0]?.sample_source_image_url || null;
                const sampleResultUrl =
                    req.body.sample_result_image_url !== undefined
                        ? String(req.body.sample_result_image_url || '').trim().slice(0, 500) || null
                        : existing[0]?.sample_result_image_url || null;
                const isEnabled =
                    req.body.is_enabled !== undefined
                        ? !!req.body.is_enabled
                        : existing[0]?.is_enabled !== false;

                const rows = await query(
                    `UPDATE reseller_enhanced_picture_template_settings SET
                        workflow_highlights = $1::jsonb,
                        system_resolutions = $2,
                        system_ratios = $3,
                        sample_label = $4,
                        output_label = $5,
                        output_subtitle = $6,
                        footer_note = $7,
                        sample_source_image_url = $8,
                        sample_result_image_url = $9,
                        is_enabled = $10,
                        updated_at = CURRENT_TIMESTAMP
                     WHERE reseller_user_id = $11 AND template_key = $12
                     RETURNING *`,
                    [
                        JSON.stringify(highlights),
                        systemResolutions,
                        systemRatios,
                        sampleLabel,
                        outputLabel,
                        outputSubtitle,
                        footerNote,
                        sampleSourceUrl,
                        sampleResultUrl,
                        isEnabled,
                        userId,
                        templateKey,
                    ],
                );
                res.json({
                    success: true,
                    showcase: normalizeTemplateShowcaseRow(rows[0], templateKey),
                });
            } catch (e) {
                console.error('admin patch template showcase:', e);
                res.status(e.status || 500).json({ error: e.message });
            }
        },
    );

    /** Admin test-generate with uploaded sample image + prompt text (or saved prompt id). */
    app.post(
        '/api/admin/users/:userId/enhanced-pictures/test-generate',
        isAdminStrict,
        async (req, res) => {
            try {
                await ensureEnhancedPicturesSchema(pool);
                await runUpload(req, res);
                const userId = parseInt(String(req.params.userId), 10);
                if (!userId) return res.status(400).json({ error: 'userId required' });
                if (!req.file) return res.status(400).json({ error: 'image file required' });

                let promptId = req.body.prompt_id ? parseInt(String(req.body.prompt_id), 10) : null;
                let promptText = String(req.body.prompt_text || '').trim();
                let negativePrompt = String(req.body.negative_prompt || '').trim();
                let name = String(req.body.name || 'Test run').trim().slice(0, 200) || 'Test run';
                const templateKey = String(req.body.template_key || TEMPLATE_IDOLS)
                    .trim()
                    .toLowerCase()
                    .slice(0, 64) || TEMPLATE_IDOLS;
                const varietyKey = String(req.body.variety_key || '')
                    .trim()
                    .toLowerCase()
                    .slice(0, 64) || null;
                const aspectRatio = normalizeAspectRatio(req.body.aspect_ratio);
                const canvasText = String(req.body.canvas_text || '').trim().slice(0, 120);
                const saveAsNew = String(req.body.save_as_new || '') === '1' || req.body.save_as_new === true;

                if (promptId) {
                    const rows = await query(
                        `SELECT * FROM reseller_enhanced_picture_prompts WHERE id = $1 AND reseller_user_id = $2`,
                        [promptId, userId],
                    );
                    if (!rows.length) return res.status(404).json({ error: 'Prompt not found' });
                    if (!promptText) promptText = rows[0].prompt_text;
                    if (!negativePrompt) negativePrompt = rows[0].negative_prompt || '';
                    name = rows[0].name;
                }
                if (!promptText) {
                    promptText = DEFAULT_IDOLS_PROMPT;
                    if (!negativePrompt) negativePrompt = DEFAULT_IDOLS_NEGATIVE;
                }
                const normalized = normalizePromptFields(promptText, negativePrompt);
                promptText = normalized.promptText;
                negativePrompt = normalized.negativePrompt;
                if (!promptText) {
                    return res.status(400).json({ error: 'Master prompt is required before generating.' });
                }

                const sourceUrl = `${getPublicApiBaseUrl()}/uploads/web_products/enhanced/${req.file.filename}`;
                const showcase = await loadTemplateShowcase(query, userId, templateKey);
                const aiConfig = await resolveAiConfigForUser(
                    query,
                    userId,
                    parseAiOverridesFromBody(req.body),
                );
                const generated = await generateStudioImage({
                    promptText,
                    negativePrompt,
                    sourceImagePath: req.file.path,
                    aspectRatio,
                    canvasText,
                    aiConfig,
                    workflowHighlights: showcase.workflow_highlights,
                });
                const outName = saveGeneratedBuffer(
                    enhancedDir,
                    generated.buffer,
                    generated.mimeType,
                    `enhanced-test-${userId}`,
                );
                const resultUrl = `${getPublicApiBaseUrl()}/uploads/web_products/enhanced/${outName}`;

                let promptRow = null;
                if (saveAsNew || !promptId) {
                    const inserted = await query(
                        `INSERT INTO reseller_enhanced_picture_prompts
                            (reseller_user_id, template_key, variety_key, name, prompt_text, negative_prompt, is_active, is_test,
                             test_source_image_url, test_result_image_url, created_by_admin_id)
                         VALUES ($1, $2, $3, $4, $5, $6, false, true, $7, $8, $9)
                         RETURNING *`,
                        [
                            userId,
                            templateKey,
                            varietyKey,
                            name,
                            promptText,
                            negativePrompt || null,
                            sourceUrl,
                            resultUrl,
                            req.user?.id || null,
                        ],
                    );
                    promptRow = formatPromptRow(inserted[0]);
                } else {
                    const updated = await query(
                        `UPDATE reseller_enhanced_picture_prompts
                         SET prompt_text = $1, negative_prompt = $2,
                             test_source_image_url = $3, test_result_image_url = $4,
                             variety_key = COALESCE($5, variety_key),
                             updated_at = CURRENT_TIMESTAMP
                         WHERE id = $6
                         RETURNING *`,
                        [promptText, negativePrompt || null, sourceUrl, resultUrl, varietyKey, promptId],
                    );
                    promptRow = formatPromptRow(updated[0]);
                }

                await query(
                    `UPDATE reseller_enhanced_picture_template_settings
                     SET sample_source_image_url = $1, sample_result_image_url = $2, updated_at = CURRENT_TIMESTAMP
                     WHERE reseller_user_id = $3 AND template_key = $4`,
                    [sourceUrl, resultUrl, userId, templateKey],
                );
                if (varietyKey) {
                    await query(
                        `UPDATE reseller_enhanced_picture_varieties
                         SET sample_source_image_url = $1, sample_result_image_url = $2, updated_at = CURRENT_TIMESTAMP
                         WHERE reseller_user_id = $3 AND template_key = $4 AND variety_key = $5`,
                        [sourceUrl, resultUrl, userId, templateKey, varietyKey],
                    );
                }

                res.json({
                    success: true,
                    source_image_url: sourceUrl,
                    result_image_url: resultUrl,
                    aspect_ratio: aspectRatio,
                    canvas_text: canvasText || null,
                    ai_provider: generated.provider || aiConfig.provider,
                    ai_model: generated.model || null,
                    prompt: formatPromptRow(promptRow),
                });
            } catch (e) {
                console.error('admin enhanced test-generate:', e);
                res.status(e.status || 500).json({ error: e.message });
            }
        },
    );

    // ---- Admin: credits + payment settings + plans ----
    app.patch(
        '/api/admin/users/:userId/enhanced-picture-credits',
        isAdminStrict,
        requireJson,
        async (req, res) => {
            try {
                await ensureEnhancedPicturesSchema(pool);
                const userId = parseInt(String(req.params.userId), 10);
                if (!userId) return res.status(400).json({ error: 'userId required' });
                let credits;
                if (req.body.credits !== undefined && req.body.credits !== null && req.body.add == null) {
                    credits = await setCreditBalance(query, pool, {
                        userId,
                        balance: req.body.credits,
                        adminId: req.user?.id,
                        note: req.body.note,
                        reason: 'admin_set',
                    });
                } else {
                    credits = await addCredits(query, pool, {
                        userId,
                        amount: req.body.add != null ? req.body.add : req.body.credits,
                        adminId: req.user?.id,
                        note: req.body.note,
                        reason: 'admin_add',
                    });
                }
                res.json({ success: true, credits });
            } catch (e) {
                res.status(e.status || 500).json({ error: e.message });
            }
        },
    );

    app.put(
        '/api/admin/users/:userId/enhanced-picture-payment',
        isAdminStrict,
        (req, res, next) => {
            const ct = String(req.headers['content-type'] || '');
            if (ct.includes('multipart/form-data')) {
                return upload(req, res, (err) => (err ? next(err) : next()));
            }
            return next();
        },
        async (req, res) => {
            try {
                await ensureEnhancedPicturesSchema(pool);
                const userId = parseInt(String(req.params.userId), 10);
                if (!userId) return res.status(400).json({ error: 'userId required' });
                const body = req.body || {};
                const razorpayEnabled =
                    body.razorpay_enabled === true ||
                    body.razorpay_enabled === '1' ||
                    body.razorpay_enabled === 'true';
                const bankDetails =
                    body.bank_details !== undefined
                        ? String(body.bank_details || '').trim().slice(0, 4000) || null
                        : undefined;
                let qrUrl;
                if (req.file) {
                    qrUrl = `${getPublicApiBaseUrl()}/uploads/web_products/enhanced/${req.file.filename}`;
                } else if (body.clear_qr === '1' || body.clear_qr === true) {
                    qrUrl = null;
                }
                const sets = [
                    'reseller_enhanced_razorpay_enabled = $1',
                    'updated_at = CURRENT_TIMESTAMP',
                ];
                const params = [!!razorpayEnabled];
                let i = 2;
                if (bankDetails !== undefined) {
                    sets.push(`reseller_enhanced_bank_details = $${i++}`);
                    params.push(bankDetails);
                }
                if (qrUrl !== undefined) {
                    sets.push(`reseller_enhanced_payment_qr_url = $${i++}`);
                    params.push(qrUrl);
                }
                params.push(userId);
                await query(`UPDATE users SET ${sets.join(', ')} WHERE id = $${i}`, params);
                const info = await getCreditBalance(query, userId);
                res.json({ success: true, payment: info });
            } catch (e) {
                console.error('admin enhanced payment settings:', e);
                res.status(e.status || 500).json({ error: e.message });
            }
        },
    );

    app.put(
        '/api/admin/users/:userId/enhanced-picture-plans',
        isAdminStrict,
        requireJson,
        async (req, res) => {
            try {
                await ensureEnhancedPicturesSchema(pool);
                const userId = parseInt(String(req.params.userId), 10);
                if (!userId) return res.status(400).json({ error: 'userId required' });
                const plans = Array.isArray(req.body.plans) ? req.body.plans : [];
                if (!plans.length) return res.status(400).json({ error: 'plans array required' });
                await query(`DELETE FROM reseller_enhanced_credit_plans WHERE reseller_user_id = $1`, [
                    userId,
                ]);
                const saved = [];
                let order = 0;
                for (const p of plans) {
                    const name = String(p.name || '').trim().slice(0, 120);
                    const credits = Math.max(1, Math.floor(Number(p.credits) || 0));
                    const price = Math.max(0, Number(p.price_inr) || 0);
                    if (!name || !credits) continue;
                    order += 1;
                    const rows = await query(
                        `INSERT INTO reseller_enhanced_credit_plans
                            (reseller_user_id, name, credits, price_inr, sort_order, is_active)
                         VALUES ($1, $2, $3, $4, $5, $6)
                         RETURNING *`,
                        [
                            userId,
                            name,
                            credits,
                            price,
                            p.sort_order != null ? Number(p.sort_order) : order,
                            p.is_active === false ? false : true,
                        ],
                    );
                    saved.push(rows[0]);
                }
                if (!saved.length) {
                    await ensureDefaultPlans(query, userId);
                    const fallback = await listPlans(query, userId);
                    return res.json({ plans: fallback });
                }
                res.json({ plans: saved });
            } catch (e) {
                res.status(e.status || 500).json({ error: e.message });
            }
        },
    );

    // ---- Admin: template varieties (product types under a layout) ----
    app.post(
        '/api/admin/users/:userId/enhanced-picture-varieties',
        isAdminStrict,
        requireJson,
        async (req, res) => {
            try {
                await ensureEnhancedPicturesSchema(pool);
                const userId = parseInt(String(req.params.userId), 10);
                if (!userId) return res.status(400).json({ error: 'userId required' });
                const templateKey = String(req.body.template_key || TEMPLATE_IDOLS)
                    .trim()
                    .toLowerCase()
                    .slice(0, 64);
                const label =
                    String(req.body.variety_label || req.body.label || 'New variety')
                        .trim()
                        .slice(0, 120) || 'New variety';
                let key = String(req.body.variety_key || slugifyVarietyKey(label))
                    .trim()
                    .toLowerCase()
                    .slice(0, 64);
                if (!key) key = `variety_${Date.now().toString(36).slice(-6)}`;
                const taken = await query(
                    `SELECT id FROM reseller_enhanced_picture_varieties
                     WHERE reseller_user_id = $1 AND template_key = $2 AND variety_key = $3 LIMIT 1`,
                    [userId, templateKey, key],
                );
                if (taken.length) {
                    key = `${key.slice(0, 52)}_${Date.now().toString(36).slice(-6)}`.slice(0, 64);
                }
                const description = String(req.body.variety_description || '').trim().slice(0, 500) || null;
                const rows = await query(
                    `INSERT INTO reseller_enhanced_picture_varieties
                        (reseller_user_id, template_key, variety_key, variety_label, variety_description, is_enabled, sort_order)
                     VALUES ($1, $2, $3, $4, $5, true, COALESCE($6, 0))
                     RETURNING *`,
                    [
                        userId,
                        templateKey,
                        key,
                        label,
                        description,
                        req.body.sort_order != null ? parseInt(String(req.body.sort_order), 10) : 0,
                    ],
                );
                res.json({ success: true, variety: formatVarietyRow(rows[0]) });
            } catch (e) {
                console.error('admin create enhanced variety:', e);
                res.status(e.status || 500).json({ error: e.message });
            }
        },
    );

    app.patch(
        '/api/admin/enhanced-picture-varieties/:id',
        isAdminStrict,
        requireJson,
        async (req, res) => {
            try {
                await ensureEnhancedPicturesSchema(pool);
                const id = parseInt(String(req.params.id), 10);
                if (!id) return res.status(400).json({ error: 'id required' });
                const existing = await query(
                    `SELECT * FROM reseller_enhanced_picture_varieties WHERE id = $1`,
                    [id],
                );
                if (!existing.length) return res.status(404).json({ error: 'Variety not found' });
                const cur = existing[0];
                const label =
                    req.body.variety_label !== undefined
                        ? String(req.body.variety_label || '').trim().slice(0, 120) || cur.variety_label
                        : cur.variety_label;
                const description =
                    req.body.variety_description !== undefined
                        ? String(req.body.variety_description || '').trim().slice(0, 500) || null
                        : cur.variety_description;
                const isEnabled =
                    req.body.is_enabled !== undefined ? !!req.body.is_enabled : cur.is_enabled;
                const sampleSource =
                    req.body.sample_source_image_url !== undefined
                        ? String(req.body.sample_source_image_url || '').trim().slice(0, 500) || null
                        : cur.sample_source_image_url;
                const sampleResult =
                    req.body.sample_result_image_url !== undefined
                        ? String(req.body.sample_result_image_url || '').trim().slice(0, 500) || null
                        : cur.sample_result_image_url;
                const sortOrder =
                    req.body.sort_order !== undefined
                        ? parseInt(String(req.body.sort_order), 10) || 0
                        : cur.sort_order;
                const rows = await query(
                    `UPDATE reseller_enhanced_picture_varieties SET
                        variety_label = $1, variety_description = $2, is_enabled = $3,
                        sample_source_image_url = $4, sample_result_image_url = $5,
                        sort_order = $6, updated_at = CURRENT_TIMESTAMP
                     WHERE id = $7 RETURNING *`,
                    [label, description, isEnabled, sampleSource, sampleResult, sortOrder, id],
                );
                res.json({ success: true, variety: formatVarietyRow(rows[0]) });
            } catch (e) {
                console.error('admin patch enhanced variety:', e);
                res.status(e.status || 500).json({ error: e.message });
            }
        },
    );

    app.delete('/api/admin/enhanced-picture-varieties/:id', isAdminStrict, async (req, res) => {
        try {
            await ensureEnhancedPicturesSchema(pool);
            const id = parseInt(String(req.params.id), 10);
            if (!id) return res.status(400).json({ error: 'id required' });
            await query(`DELETE FROM reseller_enhanced_picture_varieties WHERE id = $1`, [id]);
            res.json({ success: true });
        } catch (e) {
            console.error('admin delete enhanced variety:', e);
            res.status(e.status || 500).json({ error: e.message });
        }
    });

    // ---- Reseller APIs ----
    app.get('/api/reseller/enhanced-pictures/bootstrap', checkAuth, async (req, res) => {
        try {
            await ensureEnhancedPicturesSchema(pool);
            const u = await loadResellerFlags(query, req.user.id);
            if (!u || String(u.customer_tier || '').toUpperCase() !== 'RESELLER') {
                return res.json({
                    enabled: false,
                    templates: [],
                    aspects: CANVAS_ASPECTS,
                    jobs: [],
                    hints: [],
                });
            }
            if (!u.enhanced_pictures) {
                return res.json({
                    enabled: false,
                    templates: [],
                    aspects: CANVAS_ASPECTS,
                    jobs: [],
                    hints: [],
                });
            }
            const jobLimitRaw = parseInt(String(req.query.job_limit || '15'), 10);
            const payload = await loadResellerEnhancedBootstrap(query, pool, req.user.id, {
                jobLimit: jobLimitRaw,
                includeHints: req.query.hints !== '0',
            });
            res.json(payload);
        } catch (e) {
            console.error('reseller enhanced bootstrap:', e);
            res.status(500).json({ error: e.message });
        }
    });

    app.get('/api/reseller/enhanced-pictures/status', checkAuth, async (req, res) => {
        try {
            await ensureEnhancedPicturesSchema(pool);
            const u = await loadResellerFlags(query, req.user.id);
            if (!u || String(u.customer_tier || '').toUpperCase() !== 'RESELLER') {
                return res.json({ enabled: false, templates: [], aspects: CANVAS_ASPECTS });
            }
            let activePrompt = null;
            let creditInfo = null;
            let plans = [];
            if (u.enhanced_pictures) {
                await ensureDefaultIdolsPrompt(query, req.user.id, null);
                await ensureDefaultPlans(query, req.user.id);
                const rows = await query(
                    `SELECT id, template_key, name, is_active
                     FROM reseller_enhanced_picture_prompts
                     WHERE reseller_user_id = $1 AND is_active = true`,
                    [req.user.id],
                );
                activePrompt = rows[0] || null;
                creditInfo = await getCreditBalance(query, req.user.id);
                plans = await listPlans(query, req.user.id, { activeOnly: true });
            }
            const templatesWithShowcase = u.enhanced_pictures
                ? (await buildTemplatesForReseller(query, req.user.id))
                      .filter((t) => t.is_enabled !== false)
                      .map((t) => ({
                          ...t,
                          varieties: (t.varieties || []).filter((v) => v.is_enabled),
                          subtemplates: (t.varieties || []).filter((v) => v.is_enabled),
                      }))
                : [];
            const aiSettings = u.enhanced_pictures
                ? await loadResellerAiSettings(query, req.user.id)
                : null;
            res.json({
                enabled: !!u.enhanced_pictures,
                templates: templatesWithShowcase,
                aspects: CANVAS_ASPECTS,
                active_prompt: activePrompt,
                credits: creditInfo?.credits ?? 0,
                razorpay_enabled: !!creditInfo?.razorpay_enabled,
                payment_qr_url: creditInfo?.payment_qr_url || null,
                bank_details: creditInfo?.bank_details || null,
                plans,
                ai_settings: aiSettings
                    ? {
                          provider: aiSettings.provider,
                          gemini_model: aiSettings.gemini_model,
                          replicate_model: aiSettings.replicate_model,
                          gemini_batch_enabled: aiSettings.gemini_batch_enabled,
                          studio_pipeline_enabled: aiSettings.studio_pipeline_enabled,
                      }
                    : null,
            });
        } catch (e) {
            console.error('reseller enhanced status:', e);
            res.status(500).json({ error: e.message });
        }
    });

    app.get('/api/reseller/enhanced-pictures/barcode-hints', checkAuth, async (req, res) => {
        try {
            await assertResellerEnhancedAccess(query, req.user.id);
            const rows = await query(
                `SELECT id, barcode, web_product_sku, product_name, design_group, payload_json,
                        image_url, secondary_image_url, submission_status, batch_id, mrp_rate_behind_box
                 FROM reseller_product_submissions
                 WHERE submitted_by_user_id = $1
                   AND submission_status IN ('draft', 'pending')
                 ORDER BY updated_at DESC NULLS LAST, created_at DESC
                 LIMIT 200`,
                [req.user.id],
            );
            const hints = mapBarcodeHintRows(rows);
            res.json({ hints });
        } catch (e) {
            res.status(e.status || 500).json({ error: e.message });
        }
    });

    app.get('/api/reseller/enhanced-pictures/product-lookup', checkAuth, async (req, res) => {
        try {
            await assertResellerEnhancedAccess(query, req.user.id);
            const stem = String(req.query.stem || req.query.q || '').trim();
            if (!stem) return res.status(400).json({ error: 'stem query required' });
            const match = await findSubmissionByStem(query, req.user.id, stem);
            if (!match) {
                return res.json({ found: false, product: null });
            }
            const payload =
                match.payload_json && typeof match.payload_json === 'object' ? match.payload_json : {};
            const itemCode = payload.itemCode || payload.item_code || payload.ItemCode || match.design_group;
            res.json({
                found: true,
                product: {
                    id: match.id,
                    barcode: match.barcode,
                    web_product_sku: match.web_product_sku,
                    product_name: match.product_name,
                    item_code: itemCode || null,
                    stem: normalizeStem(match.web_product_sku || match.barcode || stem),
                    mrp_rate_behind_box: match.mrp_rate_behind_box ?? null,
                    show_mrp_field:
                        match.excel_has_mrp_behind_box_column === true ||
                        payload.excel_has_mrp_behind_box_column === true ||
                        payload.excelHasMrpBehindBoxColumn === true,
                    has_front: !!(match.image_url && String(match.image_url).trim()),
                    has_back: !!(match.secondary_image_url && String(match.secondary_image_url).trim()),
                    submission_status: match.submission_status,
                },
            });
        } catch (e) {
            res.status(e.status || 500).json({ error: e.message });
        }
    });

    app.get('/api/reseller/enhanced-pictures/jobs', checkAuth, async (req, res) => {
        try {
            await ensureEnhancedPicturesSchema(pool);
            await assertResellerEnhancedAccess(query, req.user.id);
            const limitRaw = parseInt(String(req.query.limit || '30'), 10);
            const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 50) : 30;
            const jobs = await query(
                `SELECT id, template_key, status, barcode_stem, photo_type, generation_mode,
                        batch_state, result_image_url, source_image_url, download_filename,
                        error_message, attached_sku, attached_submission_id,
                        created_at, batch_submitted_at, batch_completed_at
                 FROM reseller_enhanced_picture_jobs
                 WHERE reseller_user_id = $1 AND deleted_at IS NULL
                 ORDER BY created_at DESC
                 LIMIT $2`,
                [req.user.id, limit],
            );
            res.json({ jobs });
        } catch (e) {
            res.status(e.status || 500).json({ error: e.message });
        }
    });

    app.get('/api/reseller/enhanced-pictures/jobs/:id', checkAuth, async (req, res) => {
        try {
            await assertResellerEnhancedAccess(query, req.user.id);
            const jobId = parseInt(String(req.params.id), 10);
            if (!jobId) return res.status(400).json({ error: 'job id required' });
            let rows = await query(
                `SELECT * FROM reseller_enhanced_picture_jobs WHERE id = $1 AND reseller_user_id = $2`,
                [jobId, req.user.id],
            );
            if (!rows.length) return res.status(404).json({ error: 'Job not found' });
            const job = rows[0];
            if (job.deleted_at) return res.status(404).json({ error: 'Job not found' });
            if (
                (job.status === 'batch_queued' || job.status === 'batch_processing') &&
                job.gemini_batch_name
            ) {
                await processEnhancedBatchJobRow(job, {
                    query,
                    pool,
                    enhancedDir,
                    getPublicApiBaseUrl,
                    uploadsWebProductsDir,
                });
                rows = await query(
                    `SELECT id, status, result_image_url, source_image_url, barcode_stem, photo_type,
                            download_filename, error_message, generation_mode, gemini_batch_name,
                            batch_state, batch_submitted_at, batch_completed_at, created_at
                     FROM reseller_enhanced_picture_jobs WHERE id = $1`,
                    [jobId],
                );
            } else {
                rows = [
                    {
                        id: job.id,
                        status: job.status,
                        result_image_url: job.result_image_url,
                        source_image_url: job.source_image_url,
                        barcode_stem: job.barcode_stem,
                        photo_type: job.photo_type,
                        download_filename: job.download_filename,
                        error_message: job.error_message,
                        generation_mode: job.generation_mode,
                        gemini_batch_name: job.gemini_batch_name,
                        batch_state: job.batch_state,
                        batch_submitted_at: job.batch_submitted_at,
                        batch_completed_at: job.batch_completed_at,
                        created_at: job.created_at,
                    },
                ];
            }
            res.json({ job: rows[0] });
        } catch (e) {
            res.status(e.status || 500).json({ error: e.message });
        }
    });

    app.post('/api/reseller/enhanced-pictures/jobs/:id/cancel', checkAuth, async (req, res) => {
        try {
            await ensureEnhancedPicturesSchema(pool);
            await assertResellerEnhancedAccess(query, req.user.id);
            const jobId = parseInt(String(req.params.id), 10);
            if (!jobId) return res.status(400).json({ error: 'job id required' });
            const rows = await query(
                `SELECT * FROM reseller_enhanced_picture_jobs
                 WHERE id = $1 AND reseller_user_id = $2 AND deleted_at IS NULL`,
                [jobId, req.user.id],
            );
            if (!rows.length) return res.status(404).json({ error: 'Job not found' });
            const cancelled = await cancelEnhancedPictureJob(query, pool, rows[0]);
            const creditsRow = await getCreditBalance(query, req.user.id);
            res.json({
                success: true,
                job: cancelled,
                credits: creditsRow?.credits ?? null,
                message: 'Job stopped. Your credit was refunded.',
            });
        } catch (e) {
            res.status(e.status || 500).json({ error: e.message });
        }
    });

    app.delete('/api/reseller/enhanced-pictures/jobs/:id', checkAuth, async (req, res) => {
        try {
            await ensureEnhancedPicturesSchema(pool);
            await assertResellerEnhancedAccess(query, req.user.id);
            const jobId = parseInt(String(req.params.id), 10);
            if (!jobId) return res.status(400).json({ error: 'job id required' });
            const rows = await query(
                `SELECT * FROM reseller_enhanced_picture_jobs
                 WHERE id = $1 AND reseller_user_id = $2 AND deleted_at IS NULL`,
                [jobId, req.user.id],
            );
            if (!rows.length) return res.status(404).json({ error: 'Job not found' });
            await deleteEnhancedPictureJob(query, pool, rows[0], enhancedDir);
            const creditsRow = await getCreditBalance(query, req.user.id);
            res.json({
                success: true,
                removed: true,
                credits: creditsRow?.credits ?? null,
            });
        } catch (e) {
            res.status(e.status || 500).json({ error: e.message });
        }
    });

    app.post('/api/reseller/enhanced-pictures/generate', checkAuth, async (req, res) => {
        try {
            await ensureEnhancedPicturesSchema(pool);
            await assertResellerEnhancedAccess(query, req.user.id);
            const creditCheck = await getCreditBalance(query, req.user.id);
            if (!creditCheck || creditCheck.credits < 1) {
                return res.status(402).json({
                    error: 'No credits remaining. Top up credits to continue generating studio photos.',
                    credits: 0,
                });
            }
            await runUpload(req, res);
            if (!req.file) return res.status(400).json({ error: 'image file required' });

            const templateKey = String(req.body.template_key || TEMPLATE_IDOLS)
                .trim()
                .toLowerCase()
                .slice(0, 64) || TEMPLATE_IDOLS;
            const photoType = String(req.body.photo_type || 'front').trim().toLowerCase() === 'back'
                ? 'back'
                : 'front';
            let barcodeStem = normalizeStem(req.body.barcode_stem || req.body.barcode || '');
            const aspectRatio = normalizeAspectRatio(req.body.aspect_ratio);
            const canvasText = String(req.body.canvas_text || '').trim().slice(0, 120);
            const varietyKey = String(req.body.variety_key || '')
                .trim()
                .toLowerCase()
                .slice(0, 64) || null;
            const prompt = await resolveActivePrompt(query, req.user.id, templateKey, varietyKey);
            if (!prompt) {
                return res.status(400).json({
                    error: 'No active prompt for this template. Ask KC admin to activate one.',
                });
            }
            const sourceUrl = `${getPublicApiBaseUrl()}/uploads/web_products/enhanced/${req.file.filename}`;
            const downloadFilename = barcodeStem
                ? photoType === 'back'
                    ? `${barcodeStem}_secondary`
                    : barcodeStem
                : null;

            const jobIns = await query(
                `INSERT INTO reseller_enhanced_picture_jobs
                    (reseller_user_id, template_key, prompt_id, source_image_url, barcode_stem, photo_type,
                     status, created_by_user_id, aspect_ratio, canvas_text, download_filename)
                 VALUES ($1, $2, $3, $4, $5, $6, 'processing', $7, $8, $9, $10)
                 RETURNING *`,
                [
                    req.user.id,
                    templateKey,
                    prompt.id,
                    sourceUrl,
                    barcodeStem || null,
                    photoType,
                    req.user.id,
                    aspectRatio,
                    canvasText || null,
                    downloadFilename,
                ],
            );
            const job = jobIns[0];

            try {
                const aiConfig = await resolveAiConfigForUser(query, req.user.id);
                const showcase = await loadTemplateShowcase(query, req.user.id, templateKey);
                const normalized = normalizePromptFields(
                    prompt.prompt_text,
                    prompt.negative_prompt || '',
                );
                const generationMode = String(req.body.generation_mode || 'fast')
                    .trim()
                    .toLowerCase();
                const useGeminiBatch =
                    normalizeAiProvider(aiConfig.provider) === 'gemini' &&
                    aiConfig.gemini_batch_enabled === true &&
                    generationMode === 'batch';

                if (useGeminiBatch) {
                    const creditsLeft = await consumeOneCredit(query, pool, req.user.id);
                    const { parts, aspect } = buildGeminiUserParts({
                        promptText: normalized.promptText,
                        negativePrompt: normalized.negativePrompt,
                        sourceImagePath: req.file.path,
                        aspectRatio,
                        canvasText,
                        workflowHighlights: showcase.workflow_highlights,
                    });
                    const model = aiConfig.gemini_model || getGeminiImageModel();
                    try {
                        const batch = await submitGeminiBatchJob({
                            model,
                            apiKey: aiConfig.gemini_api_key,
                            parts,
                            aspectRatio: aspect,
                            displayName: `kc-enhanced-${job.id}`,
                            metadataKey: `job-${job.id}`,
                        });
                        const updated = await query(
                            `UPDATE reseller_enhanced_picture_jobs
                             SET status = 'batch_processing', generation_mode = 'batch',
                                 gemini_batch_name = $1, batch_state = $2,
                                 batch_submitted_at = CURRENT_TIMESTAMP,
                                 credit_charged = true,
                                 ai_provider = 'gemini', ai_model = $3
                             WHERE id = $4
                             RETURNING *`,
                            [batch.batchName, batch.batchState, model, job.id],
                        );
                        return res.status(202).json({
                            success: true,
                            async: true,
                            job: updated[0],
                            batch: {
                                name: batch.batchName,
                                state: batch.batchState,
                            },
                            credits: creditsLeft,
                            message:
                                'Queued in economy batch (~50% cost). Usually ready within a few minutes — switch to Fast mode for quicker results.',
                        });
                    } catch (batchErr) {
                        await addCredits(query, pool, {
                            userId: req.user.id,
                            amount: 1,
                            note: `Refund: batch submit failed for job #${job.id}`,
                            reason: 'batch_refund',
                        });
                        console.warn(
                            `enhanced batch submit #${job.id} failed, falling back to fast async:`,
                            batchErr.message,
                        );
                    }
                }

                const syncParams = {
                    sourceImagePath: req.file.path,
                    aspectRatio,
                    canvasText,
                    barcodeStem,
                    photoType,
                    downloadFilename,
                    resellerUserId: req.user.id,
                    promptText: normalized.promptText,
                    negativePrompt: normalized.negativePrompt,
                    workflowHighlights: showcase.workflow_highlights,
                };
                const syncDeps = {
                    query,
                    pool,
                    enhancedDir,
                    getPublicApiBaseUrl,
                    uploadsWebProductsDir,
                };

                res.status(202).json({
                    success: true,
                    async: true,
                    job: {
                        id: job.id,
                        status: 'processing',
                        template_key: templateKey,
                        source_image_url: sourceUrl,
                        aspect_ratio: aspectRatio,
                        generation_mode: 'sync',
                    },
                    credits: creditCheck.credits,
                    message:
                        'Crafting studio quality photo… Usually ready in 30–90 seconds. You can keep using the page.',
                });

                setImmediate(() => {
                    processEnhancedSyncJob(job.id, syncParams, syncDeps).catch((e) => {
                        console.error(`enhanced sync background #${job.id}:`, e);
                    });
                });
                return;
            } catch (genErr) {
                await query(
                    `UPDATE reseller_enhanced_picture_jobs
                     SET status = 'failed', error_message = $1
                     WHERE id = $2`,
                    [String(genErr.message || 'Generation failed').slice(0, 1000), job.id],
                );
                throw genErr;
            }
        } catch (e) {
            console.error('reseller enhanced generate:', e);
            res.status(e.status || 500).json({ error: e.message, credits: e.status === 402 ? 0 : undefined });
        }
    });

    /** Attach / re-attach a completed job (or raw result file) to a barcode after rename. */
    app.post(
        '/api/reseller/enhanced-pictures/attach',
        checkAuth,
        requireJson,
        async (req, res) => {
            try {
                await ensureEnhancedPicturesSchema(pool);
                await assertResellerEnhancedAccess(query, req.user.id);
                const jobId = req.body.job_id ? parseInt(String(req.body.job_id), 10) : null;
                const barcodeStem = normalizeStem(req.body.barcode_stem || req.body.barcode || '');
                const photoType =
                    String(req.body.photo_type || 'front').trim().toLowerCase() === 'back'
                        ? 'back'
                        : 'front';
                const mrpRateBehindBox = req.body.mrp_rate_behind_box;
                if (!barcodeStem) return res.status(400).json({ error: 'barcode_stem required' });
                if (!jobId) return res.status(400).json({ error: 'job_id required' });

                const jobs = await query(
                    `SELECT * FROM reseller_enhanced_picture_jobs
                     WHERE id = $1 AND reseller_user_id = $2`,
                    [jobId, req.user.id],
                );
                if (!jobs.length) return res.status(404).json({ error: 'Job not found' });
                const job = jobs[0];
                if (job.deleted_at) return res.status(404).json({ error: 'Job not found' });
                if (!job.result_image_url) {
                    return res.status(400).json({ error: 'Job has no generated image yet' });
                }
                const fileName = path.basename(String(job.result_image_url).split('?')[0]);
                const resultPath = path.join(enhancedDir, fileName);
                if (!fs.existsSync(resultPath)) {
                    return res.status(404).json({ error: 'Generated image file missing on server' });
                }
                const attach = await attachGeneratedToProduct({
                    query,
                    getPublicApiBaseUrl,
                    uploadsWebProductsDir,
                    resellerUserId: req.user.id,
                    stem: barcodeStem,
                    photoType,
                    resultFilePath: resultPath,
                    resultMime: mimeFromExt(path.extname(fileName)),
                    mrpRateBehindBox,
                });
                await query(
                    `UPDATE reseller_enhanced_picture_jobs
                     SET barcode_stem = $1, photo_type = $2,
                         attached_submission_id = $3, attached_sku = $4
                     WHERE id = $5`,
                    [
                        barcodeStem,
                        photoType,
                        attach.submissionId || null,
                        attach.sku || null,
                        jobId,
                    ],
                );
                if (!attach.attached) {
                    return res.status(404).json({
                        error: attach.reason || 'No matching product',
                        attach,
                    });
                }
                res.json({
                    success: true,
                    attach,
                    download_filename:
                        photoType === 'back'
                            ? `${attach.sku}_secondary${path.extname(fileName) || '.webp'}`
                            : `${attach.sku}${path.extname(fileName) || '.webp'}`,
                });
            } catch (e) {
                console.error('reseller enhanced attach:', e);
                res.status(e.status || 500).json({ error: e.message });
            }
        },
    );

    /** Download all completed generations as a ZIP, foldered by template (e.g. idols/). */
    app.get('/api/reseller/enhanced-pictures/download-zip', checkAuth, async (req, res) => {
        try {
            await ensureEnhancedPicturesSchema(pool);
            await assertResellerEnhancedAccess(query, req.user.id);
            const jobs = await query(
                `SELECT id, template_key, result_image_url, download_filename, barcode_stem, photo_type, created_at
                 FROM reseller_enhanced_picture_jobs
                 WHERE reseller_user_id = $1 AND status = 'completed'
                   AND result_image_url IS NOT NULL
                   AND deleted_at IS NULL
                 ORDER BY template_key ASC, created_at ASC`,
                [req.user.id],
            );
            if (!jobs.length) {
                return res.status(404).json({ error: 'No generated images to download yet' });
            }
            res.setHeader('Content-Type', 'application/zip');
            res.setHeader(
                'Content-Disposition',
                `attachment; filename="enhanced-pictures-${req.user.id}.zip"`,
            );
            const archive = archiver('zip', { zlib: { level: 6 } });
            archive.on('error', (err) => {
                console.error('enhanced zip:', err);
                try {
                    res.status(500).end();
                } catch (_) {
                    /* ignore */
                }
            });
            archive.pipe(res);
            const usedNames = new Set();
            for (const job of jobs) {
                const fileName = path.basename(String(job.result_image_url || '').split('?')[0]);
                const diskPath = path.join(enhancedDir, fileName);
                if (!fs.existsSync(diskPath)) continue;
                const folder = String(job.template_key || 'idols')
                    .replace(/[^a-z0-9_-]+/gi, '-')
                    .toLowerCase() || 'idols';
                const ext = path.extname(fileName) || '.png';
                let base =
                    String(job.download_filename || '').trim() ||
                    (job.barcode_stem
                        ? job.photo_type === 'back'
                            ? `${normalizeStem(job.barcode_stem)}_secondary${ext}`
                            : `${normalizeStem(job.barcode_stem)}${ext}`
                        : `image-${job.id}${ext}`);
                if (!path.extname(base)) base += ext;
                let entry = `${folder}/${base}`;
                let n = 1;
                while (usedNames.has(entry.toLowerCase())) {
                    const stem = base.replace(new RegExp(`${ext.replace('.', '\\.')}$`, 'i'), '');
                    entry = `${folder}/${stem}-${n}${ext}`;
                    n += 1;
                }
                usedNames.add(entry.toLowerCase());
                archive.file(diskPath, { name: entry });
            }
            await archive.finalize();
        } catch (e) {
            console.error('reseller enhanced zip:', e);
            if (!res.headersSent) res.status(e.status || 500).json({ error: e.message });
        }
    });

    /** Razorpay top-up for a credit plan (only when admin enabled Razorpay for this reseller). */
    app.post(
        '/api/reseller/enhanced-pictures/topup/create-order',
        checkAuth,
        requireJson,
        async (req, res) => {
            try {
                await ensureEnhancedPicturesSchema(pool);
                await assertResellerEnhancedAccess(query, req.user.id);
                const info = await getCreditBalance(query, req.user.id);
                if (!info?.razorpay_enabled) {
                    return res.status(403).json({
                        error: 'Razorpay top-up is not enabled for your account. Use UPI/QR or bank transfer.',
                    });
                }
                const planId = parseInt(String(req.body.plan_id), 10);
                if (!planId) return res.status(400).json({ error: 'plan_id required' });
                const plans = await query(
                    `SELECT * FROM reseller_enhanced_credit_plans
                     WHERE id = $1 AND reseller_user_id = $2 AND is_active = true`,
                    [planId, req.user.id],
                );
                if (!plans.length) return res.status(404).json({ error: 'Plan not found' });
                const plan = plans[0];
                const keyId = process.env.RAZORPAY_KEY_ID;
                const keySecret = process.env.RAZORPAY_KEY_SECRET;
                if (!keyId || !keySecret) {
                    return res.status(503).json({ error: 'Razorpay is not configured on the server' });
                }
                const amountPaise = Math.round(Number(plan.price_inr) * 100);
                if (amountPaise < 100) {
                    return res.status(400).json({ error: 'Plan price too low for Razorpay' });
                }
                const auth = Buffer.from(`${keyId}:${keySecret}`).toString('base64');
                const resp = await axios.post(
                    'https://api.razorpay.com/v1/orders',
                    {
                        amount: amountPaise,
                        currency: 'INR',
                        receipt: `enh-cr-${req.user.id}-${plan.id}-${Date.now()}`.slice(0, 40),
                        notes: {
                            type: 'enhanced_picture_credits',
                            reseller_user_id: String(req.user.id),
                            plan_id: String(plan.id),
                            credits: String(plan.credits),
                        },
                    },
                    {
                        headers: {
                            Authorization: `Basic ${auth}`,
                            'Content-Type': 'application/json',
                        },
                        validateStatus: () => true,
                    },
                );
                if (resp.status >= 400) {
                    return res.status(502).json({
                        error: resp.data?.error?.description || 'Failed to create Razorpay order',
                    });
                }
                res.json({
                    razorpay_order_id: resp.data.id,
                    amount: amountPaise,
                    currency: 'INR',
                    key_id: keyId,
                    plan: {
                        id: plan.id,
                        name: plan.name,
                        credits: plan.credits,
                        price_inr: Number(plan.price_inr),
                    },
                });
            } catch (e) {
                console.error('enhanced topup create:', e);
                res.status(e.status || 500).json({ error: e.message });
            }
        },
    );

    app.post(
        '/api/reseller/enhanced-pictures/topup/verify',
        checkAuth,
        requireJson,
        async (req, res) => {
            try {
                await ensureEnhancedPicturesSchema(pool);
                await assertResellerEnhancedAccess(query, req.user.id);
                const info = await getCreditBalance(query, req.user.id);
                if (!info?.razorpay_enabled) {
                    return res.status(403).json({ error: 'Razorpay top-up is not enabled' });
                }
                const {
                    razorpay_order_id,
                    razorpay_payment_id,
                    razorpay_signature,
                    plan_id,
                } = req.body || {};
                if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature || !plan_id) {
                    return res.status(400).json({
                        error: 'razorpay_order_id, razorpay_payment_id, razorpay_signature, plan_id required',
                    });
                }
                const keySecret = process.env.RAZORPAY_KEY_SECRET;
                if (!keySecret) return res.status(503).json({ error: 'Razorpay not configured' });
                const expected = crypto
                    .createHmac('sha256', keySecret)
                    .update(`${razorpay_order_id}|${razorpay_payment_id}`)
                    .digest('hex');
                if (expected !== razorpay_signature) {
                    return res.status(400).json({ error: 'Invalid payment signature' });
                }
                const plans = await query(
                    `SELECT * FROM reseller_enhanced_credit_plans
                     WHERE id = $1 AND reseller_user_id = $2 AND is_active = true`,
                    [parseInt(String(plan_id), 10), req.user.id],
                );
                if (!plans.length) return res.status(404).json({ error: 'Plan not found' });
                const plan = plans[0];
                const credits = await addCredits(query, pool, {
                    userId: req.user.id,
                    amount: plan.credits,
                    note: `Razorpay ${razorpay_payment_id} · ${plan.name}`,
                    reason: 'razorpay_topup',
                });
                res.json({
                    success: true,
                    credits,
                    added: plan.credits,
                    plan: { id: plan.id, name: plan.name },
                });
            } catch (e) {
                console.error('enhanced topup verify:', e);
                res.status(e.status || 500).json({ error: e.message });
            }
        },
    );

    startEnhancedBatchPoller({
        query,
        pool,
        enhancedDir,
        getPublicApiBaseUrl,
        uploadsWebProductsDir,
    });
}

module.exports = {
    registerResellerEnhancedPictureRoutes,
    ensureEnhancedPicturesSchema,
    startEnhancedBatchPoller,
    DEFAULT_IDOLS_PROMPT,
    DEFAULT_IDOLS_NEGATIVE,
    TEMPLATES,
    TEMPLATE_IDOLS,
    CANVAS_ASPECTS,
};

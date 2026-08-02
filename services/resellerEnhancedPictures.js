/**
 * Enhanced Picture Subscription — AI product photography studio for resellers.
 * Admin configures/tests prompts per reseller; staff generate idol (etc.) shots and
 * auto-attach by barcode stem to Excel draft product submissions.
 */

const fs = require('fs');
const path = require('path');
const axios = require('axios');
const multer = require('multer');

const TEMPLATE_IDOLS = 'idols';

const DEFAULT_IDOLS_PROMPT = `Create an ultra-premium luxury product photoshoot using ONLY the uploaded idol or frame.

STRICT PRODUCT PRESERVATION:
Use the uploaded product exactly as it is.
Do NOT redesign, recreate, stylize, simplify, or modify any part.

Preserve 100%:
• Shape
• Size
• Carvings
• Engravings
• Relief work
• Metal finish
• Silver/Gold tone
• Oxidized texture
• Antique finish
• Gemstones
• Borders
• Frame proportions
• Surface details
• Every tiny ornament
• Every engraving
Everything must remain identical to the uploaded product.

SCENE:

Place the product on a premium dark navy-black stone tabletop with subtle natural texture.

Background should be a deep charcoal to midnight blue luxury studio backdrop with soft vignette and slight texture, creating a high-end catalog atmosphere.

Lighting should resemble luxury premium brand photography:
Soft rim light from right
Gentle top light
Natural metallic reflections
Deep cinematic shadows
Museum-quality lighting
Balanced contrast

Camera:
Front 3/4 angle (approximately 30°)
Eye-level perspective
85mm product photography lens
Entire product perfectly visible
Centered composition
Plenty of elegant negative space around the product

QUALITY:

Ultra photorealistic
Luxury catalogue photography
Commercial product advertisement
HDR
8K resolution
Extreme micro details
Macro sharpness
Perfect focus
Natural reflections
Realistic metal texture
True silver/gold colors
Premium editorial finish

BACKGROUND DETAILS:

Minimal luxury environment
Dark textured backdrop
Soft spotlight behind the product
No distractions
No decorative props unless naturally blurred
Premium museum display feel

TEXT AREA:

Leave clean negative space at the top-left for headline.
Leave space on the right side for product specifications.
Do NOT generate any text, logo, watermark, labels, or branding.`;

const DEFAULT_IDOLS_NEGATIVE = `No redesign
No AI-generated carvings
No altered proportions
No missing engravings
No extra ornaments
No added gemstones
No color changes
No blur
No low resolution
No noise
No oversharpening
No unrealistic reflections
No watermark
No logo
No text
No hands
No human model
No flowers
No unnecessary props`;

const TEMPLATES = [
    {
        key: TEMPLATE_IDOLS,
        label: 'Idols / Frames',
        description: 'Museum-style silver & gold idol and frame catalogue shots.',
    },
];

function getGeminiApiKey() {
    return String(process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY || '').trim();
}

function getGeminiImageModel() {
    return String(process.env.GEMINI_IMAGE_MODEL || 'gemini-2.5-flash-image').trim();
}

function geminiImageModelCandidates() {
    const primary = getGeminiImageModel();
    const fallbacks = ['gemini-2.5-flash-image', 'gemini-2.5-flash-image-preview'];
    return [...new Set([primary, ...fallbacks].filter(Boolean))];
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

async function ensureEnhancedPicturesSchema(pool) {
    await pool.query(`
        ALTER TABLE users
            ADD COLUMN IF NOT EXISTS reseller_enhanced_pictures_enabled BOOLEAN NOT NULL DEFAULT false
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

function buildFullPrompt(promptText, negativePrompt) {
    const main = String(promptText || '').trim();
    const neg = String(negativePrompt || '').trim();
    if (!neg) return main;
    return `${main}\n\nNEGATIVE PROMPT:\n${neg}`;
}

/**
 * Call Gemini image generation with an optional reference image.
 * Returns { buffer, mimeType }.
 */
async function generateStudioImage({ promptText, negativePrompt, sourceImagePath }) {
    const apiKey = getGeminiApiKey();
    if (!apiKey) {
        const err = new Error(
            'GEMINI_API_KEY is not configured on the server. Add it to .env to enable Enhanced Pictures.',
        );
        err.status = 503;
        throw err;
    }
    const fullPrompt = buildFullPrompt(promptText, negativePrompt);
    const parts = [{ text: fullPrompt }];
    if (sourceImagePath && fs.existsSync(sourceImagePath)) {
        const buf = fs.readFileSync(sourceImagePath);
        parts.push({
            inline_data: {
                mime_type: mimeFromExt(path.extname(sourceImagePath)),
                data: buf.toString('base64'),
            },
        });
    }

    const models = geminiImageModelCandidates();
    let lastError = null;
    for (const model of models) {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
        try {
            const res = await axios.post(
                url,
                {
                    contents: [{ role: 'user', parts }],
                    generationConfig: {
                        responseModalities: ['IMAGE'],
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
                if (/not found|not supported/i.test(msg)) continue;
                throw err;
            }
            const data = res.data;
            const candidates = data?.candidates || [];
            for (const c of candidates) {
                const outParts = c?.content?.parts || [];
                for (const p of outParts) {
                    const inline = p.inlineData || p.inline_data;
                    if (inline?.data) {
                        return {
                            buffer: Buffer.from(inline.data, 'base64'),
                            mimeType: inline.mimeType || inline.mime_type || 'image/png',
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
            if (e.status && !/not found|not supported/i.test(String(e.message || ''))) throw e;
            lastError = e;
        }
    }
    if (lastError) throw lastError;
    const err = new Error('Gemini image generation failed. Check GEMINI_API_KEY and model access.');
    err.status = 502;
    throw err;
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
        `SELECT id, barcode, web_product_sku, image_url, secondary_image_url, submission_status, batch_id
         FROM reseller_product_submissions
         WHERE submitted_by_user_id = $1
           AND submission_status IN ('draft', 'pending')
         ORDER BY
           CASE submission_status WHEN 'draft' THEN 0 ELSE 1 END,
           updated_at DESC NULLS LAST,
           created_at DESC
         LIMIT 500`,
        [resellerUserId],
    );
    for (const row of rows) {
        const candidates = [row.web_product_sku, row.barcode]
            .map((x) => normalizeStem(x))
            .filter(Boolean);
        for (const c of candidates) {
            const cKeys = stemKeys(c);
            if (keys.some((k) => cKeys.includes(k))) {
                return row;
            }
        }
    }
    return null;
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
    await query(
        `UPDATE reseller_product_submissions
         SET ${urlField} = $1, updated_at = CURRENT_TIMESTAMP
         WHERE id = $2`,
        [url, entry.id],
    );
    return {
        attached: true,
        submissionId: entry.id,
        sku: prodSku,
        url,
        photoType,
        status: entry.submission_status,
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
                const prompts = await query(
                    `SELECT * FROM reseller_enhanced_picture_prompts
                     WHERE reseller_user_id = $1
                     ORDER BY is_active DESC, updated_at DESC, id DESC`,
                    [userId],
                );
                res.json({
                    user: {
                        id: u.id,
                        email: u.email,
                        business_name: u.business_name,
                        reseller_enhanced_pictures_enabled: !!u.enhanced_pictures,
                    },
                    templates: TEMPLATES,
                    prompts,
                });
            } catch (e) {
                console.error('admin list enhanced prompts:', e);
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
                const promptText = String(req.body.prompt_text || '').trim();
                if (!promptText) return res.status(400).json({ error: 'prompt_text required' });
                const negativePrompt =
                    req.body.negative_prompt != null
                        ? String(req.body.negative_prompt).trim()
                        : DEFAULT_IDOLS_NEGATIVE;
                const rows = await query(
                    `INSERT INTO reseller_enhanced_picture_prompts
                        (reseller_user_id, template_key, name, prompt_text, negative_prompt, is_active, is_test, created_by_admin_id)
                     VALUES ($1, $2, $3, $4, $5, false, true, $6)
                     RETURNING *`,
                    [userId, templateKey || TEMPLATE_IDOLS, name, promptText, negativePrompt || null, req.user?.id || null],
                );
                res.json({ prompt: rows[0] });
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
                const promptText =
                    req.body.prompt_text !== undefined
                        ? String(req.body.prompt_text || '').trim()
                        : cur.prompt_text;
                if (!promptText) return res.status(400).json({ error: 'prompt_text required' });
                const negativePrompt =
                    req.body.negative_prompt !== undefined
                        ? String(req.body.negative_prompt || '').trim() || null
                        : cur.negative_prompt;
                const rows = await query(
                    `UPDATE reseller_enhanced_picture_prompts
                     SET name = $1, prompt_text = $2, negative_prompt = $3, updated_at = CURRENT_TIMESTAMP
                     WHERE id = $4
                     RETURNING *`,
                    [name, promptText, negativePrompt, id],
                );
                res.json({ prompt: rows[0] });
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
                     WHERE reseller_user_id = $1 AND template_key = $2 AND id <> $3`,
                    [cur.reseller_user_id, cur.template_key, id],
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

                const sourceUrl = `${getPublicApiBaseUrl()}/uploads/web_products/enhanced/${req.file.filename}`;
                const generated = await generateStudioImage({
                    promptText,
                    negativePrompt,
                    sourceImagePath: req.file.path,
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
                            (reseller_user_id, template_key, name, prompt_text, negative_prompt, is_active, is_test,
                             test_source_image_url, test_result_image_url, created_by_admin_id)
                         VALUES ($1, $2, $3, $4, $5, false, true, $6, $7, $8)
                         RETURNING *`,
                        [
                            userId,
                            templateKey,
                            name,
                            promptText,
                            negativePrompt || null,
                            sourceUrl,
                            resultUrl,
                            req.user?.id || null,
                        ],
                    );
                    promptRow = inserted[0];
                } else {
                    const updated = await query(
                        `UPDATE reseller_enhanced_picture_prompts
                         SET prompt_text = $1, negative_prompt = $2,
                             test_source_image_url = $3, test_result_image_url = $4,
                             updated_at = CURRENT_TIMESTAMP
                         WHERE id = $5
                         RETURNING *`,
                        [promptText, negativePrompt || null, sourceUrl, resultUrl, promptId],
                    );
                    promptRow = updated[0];
                }

                res.json({
                    success: true,
                    source_image_url: sourceUrl,
                    result_image_url: resultUrl,
                    prompt: promptRow,
                });
            } catch (e) {
                console.error('admin enhanced test-generate:', e);
                res.status(e.status || 500).json({ error: e.message });
            }
        },
    );

    // ---- Reseller APIs ----
    app.get('/api/reseller/enhanced-pictures/status', checkAuth, async (req, res) => {
        try {
            await ensureEnhancedPicturesSchema(pool);
            const u = await loadResellerFlags(query, req.user.id);
            if (!u || String(u.customer_tier || '').toUpperCase() !== 'RESELLER') {
                return res.json({ enabled: false, templates: [] });
            }
            let activePrompt = null;
            if (u.enhanced_pictures) {
                await ensureDefaultIdolsPrompt(query, req.user.id, null);
                const rows = await query(
                    `SELECT id, template_key, name, is_active
                     FROM reseller_enhanced_picture_prompts
                     WHERE reseller_user_id = $1 AND is_active = true`,
                    [req.user.id],
                );
                activePrompt = rows[0] || null;
            }
            res.json({
                enabled: !!u.enhanced_pictures,
                templates: u.enhanced_pictures ? TEMPLATES : [],
                active_prompt: activePrompt,
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
                `SELECT id, barcode, web_product_sku, image_url, secondary_image_url, submission_status, batch_id
                 FROM reseller_product_submissions
                 WHERE submitted_by_user_id = $1
                   AND submission_status IN ('draft', 'pending')
                 ORDER BY updated_at DESC NULLS LAST, created_at DESC
                 LIMIT 200`,
                [req.user.id],
            );
            const hints = rows.map((r) => {
                const stem = normalizeStem(r.web_product_sku || r.barcode || '');
                return {
                    id: r.id,
                    barcode: r.barcode,
                    web_product_sku: r.web_product_sku,
                    stem,
                    front_filename: stem ? `${stem}.webp` : null,
                    back_filename: stem ? `${stem}_secondary.webp` : null,
                    has_front: !!(r.image_url && String(r.image_url).trim()),
                    has_back: !!(r.secondary_image_url && String(r.secondary_image_url).trim()),
                    submission_status: r.submission_status,
                    batch_id: r.batch_id,
                };
            });
            res.json({ hints });
        } catch (e) {
            res.status(e.status || 500).json({ error: e.message });
        }
    });

    app.post('/api/reseller/enhanced-pictures/generate', checkAuth, async (req, res) => {
        try {
            await ensureEnhancedPicturesSchema(pool);
            await assertResellerEnhancedAccess(query, req.user.id);
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
            // Allow renaming after generate; barcode optional at generate time
            const promptRows = await query(
                `SELECT * FROM reseller_enhanced_picture_prompts
                 WHERE reseller_user_id = $1 AND template_key = $2 AND is_active = true
                 LIMIT 1`,
                [req.user.id, templateKey],
            );
            if (!promptRows.length) {
                return res.status(400).json({
                    error: 'No active prompt for this template. Ask KC admin to activate one.',
                });
            }
            const prompt = promptRows[0];
            const sourceUrl = `${getPublicApiBaseUrl()}/uploads/web_products/enhanced/${req.file.filename}`;

            const jobIns = await query(
                `INSERT INTO reseller_enhanced_picture_jobs
                    (reseller_user_id, template_key, prompt_id, source_image_url, barcode_stem, photo_type, status, created_by_user_id)
                 VALUES ($1, $2, $3, $4, $5, $6, 'processing', $7)
                 RETURNING *`,
                [
                    req.user.id,
                    templateKey,
                    prompt.id,
                    sourceUrl,
                    barcodeStem || null,
                    photoType,
                    req.user.id,
                ],
            );
            const job = jobIns[0];

            try {
                const generated = await generateStudioImage({
                    promptText: prompt.prompt_text,
                    negativePrompt: prompt.negative_prompt,
                    sourceImagePath: req.file.path,
                });
                const outName = saveGeneratedBuffer(
                    enhancedDir,
                    generated.buffer,
                    generated.mimeType,
                    `enhanced-out-${req.user.id}`,
                );
                const resultUrl = `${getPublicApiBaseUrl()}/uploads/web_products/enhanced/${outName}`;
                const resultPath = path.join(enhancedDir, outName);

                let attach = null;
                if (barcodeStem) {
                    attach = await attachGeneratedToProduct({
                        query,
                        getPublicApiBaseUrl,
                        uploadsWebProductsDir,
                        resellerUserId: req.user.id,
                        stem: barcodeStem,
                        photoType,
                        resultFilePath: resultPath,
                        resultMime: generated.mimeType,
                    });
                }

                const updated = await query(
                    `UPDATE reseller_enhanced_picture_jobs
                     SET result_image_url = $1, status = 'completed',
                         attached_submission_id = $2, attached_sku = $3,
                         barcode_stem = COALESCE($4, barcode_stem),
                         error_message = NULL
                     WHERE id = $5
                     RETURNING *`,
                    [
                        resultUrl,
                        attach?.submissionId || null,
                        attach?.sku || null,
                        barcodeStem || null,
                        job.id,
                    ],
                );

                res.json({
                    success: true,
                    job: updated[0],
                    result_image_url: resultUrl,
                    download_filename: barcodeStem
                        ? photoType === 'back'
                            ? `${barcodeStem}_secondary${extFromMime(generated.mimeType)}`
                            : `${barcodeStem}${extFromMime(generated.mimeType)}`
                        : outName,
                    attach,
                });
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
            res.status(e.status || 500).json({ error: e.message });
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
                if (!barcodeStem) return res.status(400).json({ error: 'barcode_stem required' });
                if (!jobId) return res.status(400).json({ error: 'job_id required' });

                const jobs = await query(
                    `SELECT * FROM reseller_enhanced_picture_jobs
                     WHERE id = $1 AND reseller_user_id = $2`,
                    [jobId, req.user.id],
                );
                if (!jobs.length) return res.status(404).json({ error: 'Job not found' });
                const job = jobs[0];
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
}

module.exports = {
    registerResellerEnhancedPictureRoutes,
    ensureEnhancedPicturesSchema,
    DEFAULT_IDOLS_PROMPT,
    DEFAULT_IDOLS_NEGATIVE,
    TEMPLATES,
    TEMPLATE_IDOLS,
};

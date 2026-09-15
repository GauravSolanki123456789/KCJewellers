/**
 * Find catalogue products by uploaded photo (Gemini vision + catalogue text match).
 */

const axios = require('axios');
const multer = require('multer');
const fs = require('fs');
const path = require('path');

function normalizeStem(raw) {
    return String(raw || '')
        .trim()
        .toLowerCase()
        .replace(/\s+/g, '-')
        .replace(/_+/g, '-');
}

function extractCodesFromText(text) {
    const out = new Set();
    const s = String(text || '');
    for (const m of s.matchAll(/sfidol[\w-]+/gi)) {
        out.add(normalizeStem(m[0]));
    }
    return [...out];
}

async function assertImageSearchAccess(query, userId) {
    const uid = parseInt(String(userId), 10);
    if (!Number.isFinite(uid) || uid <= 0) {
        throw Object.assign(new Error('Unauthorized'), { status: 401 });
    }
    const rows = await query(
        `SELECT id, COALESCE(reseller_image_search_enabled, false) AS enabled
         FROM users WHERE id = $1 LIMIT 1`,
        [uid],
    );
    if (!rows[0]) throw Object.assign(new Error('User not found'), { status: 404 });
    if (!rows[0].enabled) {
        throw Object.assign(new Error('Find product through image is not enabled for your shop'), {
            status: 403,
        });
    }
    return rows[0];
}

async function loadResellerCatalogForImageSearch(query, userId, limit = 400) {
    return query(
        `SELECT wp.id, wp.sku, wp.barcode, wp.name, wp.design_group, wp.size,
                wp.net_weight::float AS net_weight, wp.image_url,
                ws.name AS subcategory_name, wc.name AS style_name,
                COALESCE(wp.make_to_order_only, false) AS make_to_order_only
         FROM web_products wp
         LEFT JOIN web_subcategories ws ON ws.id = wp.subcategory_id
         LEFT JOIN web_categories wc ON wc.id = ws.category_id
         WHERE wp.submitted_by_user_id = $1
           AND (wp.is_active IS NULL OR wp.is_active = true)
         ORDER BY wp.updated_at DESC NULLS LAST, wp.id DESC
         LIMIT $2`,
        [userId, limit],
    );
}

async function analyzeImageWithGemini(imagePath, apiKey) {
    if (!apiKey || !imagePath || !fs.existsSync(imagePath)) return null;
    const buf = fs.readFileSync(imagePath);
    const ext = path.extname(imagePath).toLowerCase();
    const mime =
        ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg';
    const model = String(process.env.ENHANCED_VLM_MODEL || 'gemini-2.5-flash').trim();
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
    const catalogHint = `You are helping a jewellery wholesaler find a matching SKU in their catalogue from a customer photo.

Describe the product briefly, then list likely product codes if visible on tags/packaging.
If you see patterns like SFIDOL973-I1 or SFIDOL969-002, include them exactly.
End with a line: CODES: code1, code2`;

    try {
        const res = await axios.post(
            url,
            {
                contents: [
                    {
                        role: 'user',
                        parts: [
                            { text: catalogHint },
                            {
                                inline_data: {
                                    mime_type: mime,
                                    data: buf.toString('base64'),
                                },
                            },
                        ],
                    },
                ],
                generationConfig: { temperature: 0.2, maxOutputTokens: 800 },
            },
            {
                headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
                timeout: 60000,
                validateStatus: () => true,
            },
        );
        if (res.status >= 400) return null;
        return (res.data?.candidates || [])
            .flatMap((c) => c?.content?.parts || [])
            .map((p) => p.text || '')
            .join('')
            .trim();
    } catch {
        return null;
    }
}

function scoreProductMatch(product, analysisText, codeHints) {
    let score = 0;
    const sku = normalizeStem(product.sku);
    const barcode = normalizeStem(product.barcode);
    const dg = normalizeStem(product.design_group);
    const name = String(product.name || '').toLowerCase();
    const sub = String(product.subcategory_name || '').toLowerCase();
    const analysis = String(analysisText || '').toLowerCase();

    for (const code of codeHints) {
        const c = normalizeStem(code);
        if (c && (sku === c || barcode === c || dg === c)) score += 100;
        else if (c && (sku.includes(c) || barcode.includes(c) || dg.includes(c))) score += 60;
    }
    if (sku && analysis.includes(sku.replace(/-/g, ''))) score += 40;
    if (dg && analysis.includes(dg)) score += 25;
    if (name && analysis.includes(name.slice(0, 12))) score += 15;
    if (sub && analysis.includes(sub)) score += 10;
    return score;
}

function registerResellerImageSearchRoutes(app, deps) {
    const { query, checkAuth, pool } = deps;
    const uploadsDir = path.join(deps.uploadsRoot || path.join(__dirname, '..', 'uploads'), 'image-search');
    fs.mkdirSync(uploadsDir, { recursive: true });
    const upload = multer({
        storage: multer.diskStorage({
            destination: (_req, _file, cb) => cb(null, uploadsDir),
            filename: (_req, file, cb) => {
                const ext = path.extname(file.originalname || '') || '.jpg';
                cb(null, `search-${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`);
            },
        }),
        limits: { fileSize: 12 * 1024 * 1024 },
    });

    app.get('/api/reseller/image-search/status', checkAuth, async (req, res) => {
        try {
            const rows = await query(
                `SELECT COALESCE(reseller_image_search_enabled, false) AS enabled FROM users WHERE id = $1`,
                [req.user.id],
            );
            res.json({ enabled: !!rows[0]?.enabled });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    app.post('/api/reseller/image-search/match', checkAuth, async (req, res) => {
        try {
            await assertImageSearchAccess(query, req.user.id);
            await new Promise((resolve, reject) => {
                upload.single('image')(req, res, (err) => (err ? reject(err) : resolve()));
            });
            if (!req.file) return res.status(400).json({ error: 'image file required' });

            let apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_GEMINI_API_KEY || null;
            try {
                const aiRows = await query(
                    `SELECT gemini_api_key FROM reseller_enhanced_ai_settings WHERE reseller_user_id = $1 LIMIT 1`,
                    [req.user.id],
                );
                if (aiRows[0]?.gemini_api_key) apiKey = aiRows[0].gemini_api_key;
            } catch {
                /* optional */
            }

            const analysis = (await analyzeImageWithGemini(req.file.path, apiKey)) || '';
            const codeHints = extractCodesFromText(analysis);
            const catalog = await loadResellerCatalogForImageSearch(query, req.user.id);
            const ranked = catalog
                .map((p) => ({ product: p, score: scoreProductMatch(p, analysis, codeHints) }))
                .filter((r) => r.score > 0)
                .sort((a, b) => b.score - a.score)
                .slice(0, 12);

            try {
                fs.unlinkSync(req.file.path);
            } catch {
                /* ignore */
            }

            res.json({
                success: true,
                analysis: analysis.slice(0, 2000),
                code_hints: codeHints,
                matches: ranked.map((r) => ({
                    score: r.score,
                    id: r.product.id,
                    sku: r.product.sku,
                    barcode: r.product.barcode,
                    name: r.product.name,
                    design_group: r.product.design_group,
                    size: r.product.size,
                    net_weight: r.product.net_weight,
                    subcategory_name: r.product.subcategory_name,
                    style_name: r.product.style_name,
                    image_url: r.product.image_url,
                    make_to_order_only: r.product.make_to_order_only,
                })),
            });
        } catch (e) {
            if (req.file?.path) {
                try {
                    fs.unlinkSync(req.file.path);
                } catch {
                    /* ignore */
                }
            }
            const status = e.status || 500;
            res.status(status).json({ error: e.message || 'Image search failed' });
        }
    });
}

module.exports = { registerResellerImageSearchRoutes };

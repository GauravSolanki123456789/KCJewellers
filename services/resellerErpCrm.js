/**
 * CRM campaigns (birthday / anniversary WhatsApp) and savings schemes.
 */

const fs = require('fs');
const path = require('path');
const multer = require('multer');
const {
    sendWhatsAppTextToCustomer,
    sendWhatsAppImageToCustomer,
    loadResellerWhatsAppCloud,
    normalizeMobile10,
} = require('./resellerWhatsApp');

const OCCASIONS = ['birthday', 'anniversary', 'custom'];

async function ensureCrmSchema(pool) {
    await pool.query(`
        CREATE TABLE IF NOT EXISTS reseller_erp_crm_campaigns (
            id SERIAL PRIMARY KEY,
            reseller_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            occasion VARCHAR(32) NOT NULL DEFAULT 'custom',
            name VARCHAR(255) NOT NULL,
            message TEXT NOT NULL DEFAULT '',
            image_url TEXT,
            discount_pct NUMERIC(6, 2) NOT NULL DEFAULT 0,
            coupon_code VARCHAR(64),
            uses_per_year INTEGER NOT NULL DEFAULT 1,
            is_active BOOLEAN NOT NULL DEFAULT true,
            created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_erp_crm_campaigns_owner
            ON reseller_erp_crm_campaigns (reseller_user_id, is_active, occasion);

        CREATE TABLE IF NOT EXISTS reseller_erp_crm_coupon_uses (
            id SERIAL PRIMARY KEY,
            reseller_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            campaign_id INTEGER NOT NULL REFERENCES reseller_erp_crm_campaigns(id) ON DELETE CASCADE,
            customer_id INTEGER NOT NULL REFERENCES reseller_erp_customers(id) ON DELETE CASCADE,
            used_year INTEGER NOT NULL,
            used_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_erp_crm_coupon_uses_year
            ON reseller_erp_crm_coupon_uses (campaign_id, customer_id, used_year);

        CREATE TABLE IF NOT EXISTS reseller_erp_schemes (
            id SERIAL PRIMARY KEY,
            reseller_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            name VARCHAR(255) NOT NULL,
            details TEXT,
            sort_order INTEGER NOT NULL DEFAULT 0,
            is_active BOOLEAN NOT NULL DEFAULT true,
            created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_erp_schemes_owner
            ON reseller_erp_schemes (reseller_user_id, is_active, sort_order);

        CREATE TABLE IF NOT EXISTS reseller_erp_visit_scheme_logs (
            id SERIAL PRIMARY KEY,
            reseller_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            visit_id INTEGER REFERENCES reseller_erp_customer_visits(id) ON DELETE SET NULL,
            interaction_id INTEGER REFERENCES reseller_erp_visit_interactions(id) ON DELETE SET NULL,
            operator_id INTEGER REFERENCES reseller_erp_operators(id) ON DELETE SET NULL,
            scheme_id INTEGER NOT NULL REFERENCES reseller_erp_schemes(id) ON DELETE CASCADE,
            explained BOOLEAN NOT NULL DEFAULT true,
            interested BOOLEAN NOT NULL DEFAULT false,
            joined BOOLEAN NOT NULL DEFAULT false,
            created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_erp_visit_scheme_logs_owner
            ON reseller_erp_visit_scheme_logs (reseller_user_id, created_at DESC);
    `);
}

function mapCampaign(row) {
    if (!row) return null;
    return {
        id: row.id,
        occasion: row.occasion,
        name: row.name,
        message: row.message || '',
        image_url: row.image_url || null,
        discount_pct: Number(row.discount_pct || 0),
        coupon_code: row.coupon_code || null,
        uses_per_year: Math.min(2, Math.max(1, Number(row.uses_per_year || 1))),
        is_active: row.is_active !== false,
        created_at: row.created_at,
        updated_at: row.updated_at,
    };
}

function mapScheme(row) {
    if (!row) return null;
    return {
        id: row.id,
        name: row.name,
        details: row.details || '',
        sort_order: Number(row.sort_order || 0),
        is_active: row.is_active !== false,
        created_at: row.created_at,
        updated_at: row.updated_at,
    };
}

function fillTemplate(message, vars) {
    const name = String(vars.name || 'Customer').trim() || 'Customer';
    const discount = vars.discount_pct ? `${Number(vars.discount_pct)}%` : '';
    const coupon = String(vars.coupon_code || '').trim();
    return String(message || '')
        .replace(/\{\{\s*name\s*\}\}/gi, name)
        .replace(/\{\{\s*discount\s*\}\}/gi, discount)
        .replace(/\{\{\s*coupon\s*\}\}/gi, coupon)
        .trim();
}

function defaultMessage(occasion, name) {
    const n = name || '{{name}}';
    if (occasion === 'birthday') {
        return `Dear ${n}, wishing you a very Happy Birthday from all of us! Celebrate with {{discount}} off using coupon {{coupon}}. We look forward to seeing you.`;
    }
    if (occasion === 'anniversary') {
        return `Dear ${n}, Happy Anniversary! Enjoy {{discount}} off with coupon {{coupon}}. Visit us to pick a special piece.`;
    }
    return `Dear ${n}, a special offer for you — {{discount}} off with coupon {{coupon}}.`;
}

function waMeHref(mobile, text) {
    const d = normalizeMobile10(mobile);
    if (!d) return null;
    const params = new URLSearchParams();
    params.set('phone', `91${d}`);
    params.set('type', 'phone_number');
    params.set('app_absent', '0');
    if (text) params.set('text', text);
    return `https://api.whatsapp.com/send/?${params.toString()}`;
}

async function seedDefaultCampaigns(query, userId) {
    const existing = await query(
        `SELECT COUNT(*)::int AS n FROM reseller_erp_crm_campaigns WHERE reseller_user_id = $1`,
        [userId],
    );
    if (existing[0]?.n > 0) return;
    await query(
        `INSERT INTO reseller_erp_crm_campaigns
            (reseller_user_id, occasion, name, message, discount_pct, coupon_code, uses_per_year, is_active)
         VALUES
            ($1, 'birthday', 'Birthday greeting', $2, 5, 'BDAY', 1, true),
            ($1, 'anniversary', 'Anniversary greeting', $3, 5, 'ANNIV', 1, true)`,
        [
            userId,
            defaultMessage('birthday', '{{name}}'),
            defaultMessage('anniversary', '{{name}}'),
        ],
    );
}

function parseUsesPerYear(raw) {
    const n = parseInt(String(raw ?? '1'), 10);
    if (n >= 2) return 2;
    return 1;
}

function registerResellerErpCrmRoutes(app, deps) {
    const { query, pool, checkAuth, requireJson, erpGate, getPublicApiBaseUrl } = deps;
    const uploadsDir = path.join(__dirname, '..', 'public', 'uploads', 'erp-crm');
    fs.mkdirSync(uploadsDir, { recursive: true });
    const upload = multer({
        storage: multer.memoryStorage(),
        limits: { fileSize: 8 * 1024 * 1024 },
        fileFilter: (_req, file, cb) => {
            if (/^image\/(jpeg|jpg|png|webp|gif)$/i.test(file.mimetype)) cb(null, true);
            else cb(new Error('Image must be JPEG, PNG, WebP or GIF'));
        },
    });

    const publicBase = () => {
        const base =
            typeof getPublicApiBaseUrl === 'function' ? String(getPublicApiBaseUrl() || '') : '';
        return base.replace(/\/$/, '');
    };

    app.get('/api/reseller/erp/crm/campaigns', checkAuth, erpGate, async (req, res) => {
        try {
            await ensureCrmSchema(pool);
            await seedDefaultCampaigns(query, req.user.id);
            const rows = await query(
                `SELECT * FROM reseller_erp_crm_campaigns
                 WHERE reseller_user_id = $1
                 ORDER BY CASE occasion WHEN 'birthday' THEN 0 WHEN 'anniversary' THEN 1 ELSE 2 END, id`,
                [req.user.id],
            );
            res.json({ campaigns: rows.map(mapCampaign) });
        } catch (e) {
            console.error('crm campaigns list:', e);
            res.status(500).json({ error: e.message || 'Failed to load campaigns' });
        }
    });

    app.post('/api/reseller/erp/crm/campaigns', checkAuth, erpGate, requireJson, async (req, res) => {
        try {
            await ensureCrmSchema(pool);
            const occasion = OCCASIONS.includes(String(req.body.occasion || ''))
                ? String(req.body.occasion)
                : 'custom';
            const name = String(req.body.name || '').trim().slice(0, 255);
            if (!name) return res.status(400).json({ error: 'Campaign name is required' });
            const message = String(req.body.message || '').trim().slice(0, 4000) || defaultMessage(occasion);
            const discount = Number(req.body.discount_pct || 0);
            const coupon = String(req.body.coupon_code || '').trim().slice(0, 64) || null;
            const uses = parseUsesPerYear(req.body.uses_per_year);
            const rows = await query(
                `INSERT INTO reseller_erp_crm_campaigns
                    (reseller_user_id, occasion, name, message, discount_pct, coupon_code, uses_per_year, is_active)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
                 RETURNING *`,
                [
                    req.user.id,
                    occasion,
                    name,
                    message,
                    Number.isFinite(discount) ? Math.max(0, Math.min(100, discount)) : 0,
                    coupon,
                    uses,
                    req.body.is_active !== false,
                ],
            );
            res.json({ campaign: mapCampaign(rows[0]) });
        } catch (e) {
            console.error('crm campaign create:', e);
            res.status(500).json({ error: e.message || 'Failed to save campaign' });
        }
    });

    app.put('/api/reseller/erp/crm/campaigns/:id', checkAuth, erpGate, requireJson, async (req, res) => {
        try {
            const id = parseInt(String(req.params.id), 10);
            const occasion = OCCASIONS.includes(String(req.body.occasion || ''))
                ? String(req.body.occasion)
                : 'custom';
            const name = String(req.body.name || '').trim().slice(0, 255);
            if (!name) return res.status(400).json({ error: 'Campaign name is required' });
            const message = String(req.body.message || '').trim().slice(0, 4000);
            const discount = Number(req.body.discount_pct || 0);
            const coupon = String(req.body.coupon_code || '').trim().slice(0, 64) || null;
            const uses = parseUsesPerYear(req.body.uses_per_year);
            const rows = await query(
                `UPDATE reseller_erp_crm_campaigns SET
                    occasion = $3, name = $4, message = $5, discount_pct = $6, coupon_code = $7,
                    uses_per_year = $8, is_active = $9, updated_at = NOW()
                 WHERE id = $1 AND reseller_user_id = $2
                 RETURNING *`,
                [
                    id,
                    req.user.id,
                    occasion,
                    name,
                    message,
                    Number.isFinite(discount) ? Math.max(0, Math.min(100, discount)) : 0,
                    coupon,
                    uses,
                    req.body.is_active !== false,
                ],
            );
            if (!rows.length) return res.status(404).json({ error: 'Campaign not found' });
            res.json({ campaign: mapCampaign(rows[0]) });
        } catch (e) {
            console.error('crm campaign update:', e);
            res.status(500).json({ error: e.message || 'Failed to update campaign' });
        }
    });

    app.delete('/api/reseller/erp/crm/campaigns/:id', checkAuth, erpGate, async (req, res) => {
        try {
            const id = parseInt(String(req.params.id), 10);
            await query(
                `DELETE FROM reseller_erp_crm_campaigns WHERE id = $1 AND reseller_user_id = $2`,
                [id, req.user.id],
            );
            res.json({ success: true });
        } catch (e) {
            console.error('crm campaign delete:', e);
            res.status(500).json({ error: e.message || 'Failed to delete campaign' });
        }
    });

    app.post(
        '/api/reseller/erp/crm/campaigns/:id/image',
        checkAuth,
        erpGate,
        upload.single('image'),
        async (req, res) => {
            try {
                const id = parseInt(String(req.params.id), 10);
                if (!req.file?.buffer) return res.status(400).json({ error: 'Image file required' });
                const owned = await query(
                    `SELECT id FROM reseller_erp_crm_campaigns WHERE id = $1 AND reseller_user_id = $2`,
                    [id, req.user.id],
                );
                if (!owned.length) return res.status(404).json({ error: 'Campaign not found' });
                const mime = String(req.file.mimetype || 'image/jpeg');
                const ext = mime.includes('png') ? '.png' : mime.includes('webp') ? '.webp' : mime.includes('gif') ? '.gif' : '.jpg';
                const destDir = path.join(uploadsDir, String(req.user.id));
                fs.mkdirSync(destDir, { recursive: true });
                const filename = `${id}-${Date.now()}${ext}`;
                fs.writeFileSync(path.join(destDir, filename), req.file.buffer);
                const rel = `/uploads/erp-crm/${req.user.id}/${filename}`;
                const url = `${publicBase()}${rel}` || rel;
                const rows = await query(
                    `UPDATE reseller_erp_crm_campaigns SET image_url = $3, updated_at = NOW()
                     WHERE id = $1 AND reseller_user_id = $2 RETURNING *`,
                    [id, req.user.id, url],
                );
                res.json({ campaign: mapCampaign(rows[0]) });
            } catch (e) {
                console.error('crm campaign image:', e);
                res.status(500).json({ error: e.message || 'Failed to upload image' });
            }
        },
    );

    async function resolveCampaignForSend(userId, body) {
        const campaignId = parseInt(String(body.campaign_id || ''), 10);
        const occasion = String(body.occasion || '').trim();
        if (Number.isFinite(campaignId)) {
            const rows = await query(
                `SELECT * FROM reseller_erp_crm_campaigns WHERE id = $1 AND reseller_user_id = $2 LIMIT 1`,
                [campaignId, userId],
            );
            return rows[0] || null;
        }
        if (OCCASIONS.includes(occasion)) {
            const rows = await query(
                `SELECT * FROM reseller_erp_crm_campaigns
                 WHERE reseller_user_id = $1 AND occasion = $2 AND is_active = true
                 ORDER BY id LIMIT 1`,
                [userId, occasion],
            );
            return rows[0] || null;
        }
        return null;
    }

    async function sendCampaign(req, res) {
        try {
            await ensureCrmSchema(pool);
            const customerId = parseInt(String(req.body.customer_id), 10);
            if (!Number.isFinite(customerId)) {
                return res.status(400).json({ error: 'customer_id required' });
            }
            const custRows = await query(
                `SELECT id, name, mobile FROM reseller_erp_customers
                 WHERE id = $1 AND reseller_user_id = $2 LIMIT 1`,
                [customerId, req.user.id],
            );
            if (!custRows.length) return res.status(404).json({ error: 'Customer not found' });
            const customer = custRows[0];
            const campaign = await resolveCampaignForSend(req.user.id, req.body);
            if (!campaign) return res.status(404).json({ error: 'No active campaign for this occasion' });
            const year = new Date().getFullYear();
            const usesAllowed = parseUsesPerYear(campaign.uses_per_year);
            if (campaign.coupon_code) {
                const used = await query(
                    `SELECT COUNT(*)::int AS n FROM reseller_erp_crm_coupon_uses
                     WHERE campaign_id = $1 AND customer_id = $2 AND used_year = $3`,
                    [campaign.id, customer.id, year],
                );
                if ((used[0]?.n || 0) >= usesAllowed) {
                    return res.status(409).json({
                        error: `Coupon already used ${usesAllowed} time(s) this year`,
                        uses_left: 0,
                    });
                }
            }
            const bodyText = fillTemplate(campaign.message || defaultMessage(campaign.occasion, customer.name), {
                name: customer.name,
                discount_pct: campaign.discount_pct,
                coupon_code: campaign.coupon_code,
            });
            const waHref = waMeHref(customer.mobile, bodyText);
            if (!normalizeMobile10(customer.mobile)) {
                return res.status(400).json({ error: 'Customer has no valid mobile number' });
            }
            let sentVia = 'wa_link';
            let cloudError = null;
            try {
                const cfg = await loadResellerWhatsAppCloud(query, req.user.id);
                if (cfg.enabled) {
                    if (campaign.image_url) {
                        const imgPath = String(campaign.image_url).replace(/^https?:\/\/[^/]+/i, '');
                        const local = path.join(__dirname, '..', 'public', imgPath.replace(/^\/+/, ''));
                        if (fs.existsSync(local)) {
                            const buf = fs.readFileSync(local);
                            const ext = path.extname(local).toLowerCase();
                            const mime =
                                ext === '.png'
                                    ? 'image/png'
                                    : ext === '.webp'
                                      ? 'image/webp'
                                      : ext === '.gif'
                                        ? 'image/gif'
                                        : 'image/jpeg';
                            await sendWhatsAppImageToCustomer(query, req.user.id, {
                                mobile: customer.mobile,
                                buffer: buf,
                                filename: path.basename(local),
                                mimeType: mime,
                                caption: bodyText,
                            });
                            sentVia = 'cloud_image';
                        } else {
                            await sendWhatsAppTextToCustomer(query, req.user.id, {
                                mobile: customer.mobile,
                                body: bodyText,
                            });
                            sentVia = 'cloud_text';
                        }
                    } else {
                        await sendWhatsAppTextToCustomer(query, req.user.id, {
                            mobile: customer.mobile,
                            body: bodyText,
                        });
                        sentVia = 'cloud_text';
                    }
                }
            } catch (e) {
                cloudError = e.message || 'WhatsApp Cloud send failed';
                sentVia = 'wa_link';
            }
            if (campaign.coupon_code && sentVia !== 'wa_link') {
                await query(
                    `INSERT INTO reseller_erp_crm_coupon_uses
                        (reseller_user_id, campaign_id, customer_id, used_year)
                     VALUES ($1,$2,$3,$4)`,
                    [req.user.id, campaign.id, customer.id, year],
                );
            }
            res.json({
                success: true,
                sent_via: sentVia,
                message: bodyText,
                wa_href: waHref,
                cloud_error: cloudError,
                campaign: mapCampaign(campaign),
            });
        } catch (e) {
            console.error('crm campaign send:', e);
            res.status(500).json({ error: e.message || 'Failed to send WhatsApp' });
        }
    }

    app.post('/api/reseller/erp/crm/campaigns/send', checkAuth, erpGate, requireJson, sendCampaign);

    app.get('/api/reseller/erp/crm/schemes', checkAuth, erpGate, async (req, res) => {
        try {
            await ensureCrmSchema(pool);
            const activeOnly = String(req.query.active || '') === '1';
            const rows = await query(
                `SELECT * FROM reseller_erp_schemes
                 WHERE reseller_user_id = $1 ${activeOnly ? 'AND is_active = true' : ''}
                 ORDER BY sort_order, id`,
                [req.user.id],
            );
            res.json({ schemes: rows.map(mapScheme) });
        } catch (e) {
            console.error('crm schemes list:', e);
            res.status(500).json({ error: e.message || 'Failed to load schemes' });
        }
    });

    app.post('/api/reseller/erp/crm/schemes', checkAuth, erpGate, requireJson, async (req, res) => {
        try {
            await ensureCrmSchema(pool);
            const name = String(req.body.name || '').trim().slice(0, 255);
            if (!name) return res.status(400).json({ error: 'Scheme name is required' });
            const details = String(req.body.details || '').trim().slice(0, 4000) || null;
            const sort = parseInt(String(req.body.sort_order ?? '0'), 10) || 0;
            const rows = await query(
                `INSERT INTO reseller_erp_schemes (reseller_user_id, name, details, sort_order, is_active)
                 VALUES ($1,$2,$3,$4,$5) RETURNING *`,
                [req.user.id, name, details, sort, req.body.is_active !== false],
            );
            res.json({ scheme: mapScheme(rows[0]) });
        } catch (e) {
            console.error('crm scheme create:', e);
            res.status(500).json({ error: e.message || 'Failed to save scheme' });
        }
    });

    app.put('/api/reseller/erp/crm/schemes/:id', checkAuth, erpGate, requireJson, async (req, res) => {
        try {
            const id = parseInt(String(req.params.id), 10);
            const name = String(req.body.name || '').trim().slice(0, 255);
            if (!name) return res.status(400).json({ error: 'Scheme name is required' });
            const details = String(req.body.details || '').trim().slice(0, 4000) || null;
            const sort = parseInt(String(req.body.sort_order ?? '0'), 10) || 0;
            const rows = await query(
                `UPDATE reseller_erp_schemes SET
                    name = $3, details = $4, sort_order = $5, is_active = $6, updated_at = NOW()
                 WHERE id = $1 AND reseller_user_id = $2 RETURNING *`,
                [id, req.user.id, name, details, sort, req.body.is_active !== false],
            );
            if (!rows.length) return res.status(404).json({ error: 'Scheme not found' });
            res.json({ scheme: mapScheme(rows[0]) });
        } catch (e) {
            console.error('crm scheme update:', e);
            res.status(500).json({ error: e.message || 'Failed to update scheme' });
        }
    });

    app.delete('/api/reseller/erp/crm/schemes/:id', checkAuth, erpGate, async (req, res) => {
        try {
            const id = parseInt(String(req.params.id), 10);
            await query(
                `DELETE FROM reseller_erp_schemes WHERE id = $1 AND reseller_user_id = $2`,
                [id, req.user.id],
            );
            res.json({ success: true });
        } catch (e) {
            console.error('crm scheme delete:', e);
            res.status(500).json({ error: e.message || 'Failed to delete scheme' });
        }
    });

    app.get('/api/reseller/erp/crm/scheme-stats', checkAuth, erpGate, async (req, res) => {
        try {
            await ensureCrmSchema(pool);
            const from = String(req.query.from || '').trim();
            const to = String(req.query.to || '').trim();
            const params = [req.user.id];
            let dateFilter = '';
            if (/^\d{4}-\d{2}-\d{2}$/.test(from) && /^\d{4}-\d{2}-\d{2}$/.test(to)) {
                params.push(`${from}T00:00:00+05:30`, `${to}T23:59:59+05:30`);
                dateFilter = `AND l.created_at >= $2 AND l.created_at <= $3`;
            }
            const rows = await query(
                `SELECT s.id, s.name,
                        COUNT(*) FILTER (WHERE l.explained)::int AS explained,
                        COUNT(*) FILTER (WHERE l.interested)::int AS interested,
                        COUNT(*) FILTER (WHERE l.joined)::int AS joined
                 FROM reseller_erp_schemes s
                 LEFT JOIN reseller_erp_visit_scheme_logs l
                   ON l.scheme_id = s.id AND l.reseller_user_id = s.reseller_user_id ${dateFilter}
                 WHERE s.reseller_user_id = $1 AND s.is_active = true
                 GROUP BY s.id, s.name
                 ORDER BY s.sort_order, s.id`,
                params,
            );
            const totals = rows.reduce(
                (acc, r) => {
                    acc.explained += Number(r.explained || 0);
                    acc.interested += Number(r.interested || 0);
                    acc.joined += Number(r.joined || 0);
                    return acc;
                },
                { explained: 0, interested: 0, joined: 0 },
            );
            const opParams = [req.user.id];
            let opDateFilter = '';
            if (/^\d{4}-\d{2}-\d{2}$/.test(from) && /^\d{4}-\d{2}-\d{2}$/.test(to)) {
                opParams.push(`${from}T00:00:00+05:30`, `${to}T23:59:59+05:30`);
                opDateFilter = `AND l.created_at >= $2 AND l.created_at <= $3`;
            }
            const byOperator = await query(
                `SELECT l.operator_id,
                        COALESCE(o.display_name, o.username, 'Staff') AS name,
                        COUNT(*) FILTER (WHERE l.explained)::int AS explained,
                        COUNT(*) FILTER (WHERE l.interested)::int AS interested,
                        COUNT(*) FILTER (WHERE l.joined)::int AS joined
                 FROM reseller_erp_visit_scheme_logs l
                 LEFT JOIN reseller_erp_operators o ON o.id = l.operator_id
                 WHERE l.reseller_user_id = $1 ${opDateFilter}
                 GROUP BY l.operator_id, o.display_name, o.username
                 HAVING COUNT(*) FILTER (WHERE l.explained) > 0
                 ORDER BY explained DESC, name ASC
                 LIMIT 50`,
                opParams,
            );
            res.json({
                schemes: rows,
                totals,
                join_rate_pct:
                    totals.explained > 0 ? Math.round((totals.joined / totals.explained) * 1000) / 10 : 0,
                by_operator: byOperator.map((r) => ({
                    operator_id: r.operator_id,
                    name: r.name,
                    explained: Number(r.explained || 0),
                    interested: Number(r.interested || 0),
                    joined: Number(r.joined || 0),
                    join_rate_pct:
                        Number(r.explained || 0) > 0
                            ? Math.round((Number(r.joined || 0) / Number(r.explained || 0)) * 1000) / 10
                            : 0,
                })),
            });
        } catch (e) {
            console.error('crm scheme stats:', e);
            res.status(500).json({ error: e.message || 'Failed to load scheme stats' });
        }
    });
}

module.exports = {
    registerResellerErpCrmRoutes,
    ensureCrmSchema,
};

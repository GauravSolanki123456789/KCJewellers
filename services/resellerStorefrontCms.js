/**
 * Reseller storefront homepage CMS — draft/publish JSON + media uploads.
 */
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { query, pool } = require('../config/database');
const { findResellerByDomain, normalizeDomain } = require('./resellerMetalRates');

const SECTION_TYPES = new Set([
    'shop_by_category',
    'banners',
    'collections',
    'video',
    'rich_text',
    'custom_html',
    'shop_by_gender',
    'cta',
    'brands',
    'instagram',
    'quality',
]);

const ALIGN = new Set(['left', 'center', 'right']);
const MAX_SLIDES = 12;
const MAX_SECTIONS = 40;
const MAX_ITEMS = 24;
const MAX_CSS = 80000;
const MAX_JS = 80000;
const MAX_HTML = 200000;
const MAX_TEXT = 4000;

function clip(s, n) {
    return String(s ?? '').slice(0, n);
}

function safeHref(raw) {
    const t = String(raw || '').trim();
    if (!t) return '';
    if (t.startsWith('/') && !t.startsWith('//')) return t.slice(0, 500);
    if (/^https:\/\//i.test(t)) return t.slice(0, 500);
    if (/^mailto:/i.test(t) || /^tel:/i.test(t)) return t.slice(0, 200);
    return '';
}

function safeMediaUrl(raw) {
    const t = String(raw || '').trim();
    if (!t) return '';
    if (t.startsWith('/uploads/')) return t.slice(0, 800);
    if (/^https:\/\//i.test(t)) return t.slice(0, 800);
    return '';
}

function newId() {
    return `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function sanitizeItem(raw) {
    const o = raw && typeof raw === 'object' ? raw : {};
    return {
        id: clip(o.id, 64) || newId(),
        label: clip(o.label, 120),
        sublabel: clip(o.sublabel, 200),
        href: safeHref(o.href) || '/catalog',
        imageUrl: safeMediaUrl(o.imageUrl || o.image_url),
        videoUrl: safeMediaUrl(o.videoUrl || o.video_url),
        align: ALIGN.has(String(o.align || '')) ? String(o.align) : 'center',
    };
}

function sanitizeSlide(raw) {
    const o = raw && typeof raw === 'object' ? raw : {};
    return {
        id: clip(o.id, 64) || newId(),
        imageUrl: safeMediaUrl(o.imageUrl || o.image_url),
        videoUrl: clip(o.videoUrl || o.video_url, 800),
        headline: clip(o.headline, 160),
        subhead: clip(o.subhead, 400),
        ctaText: clip(o.ctaText, 80),
        ctaHref: safeHref(o.ctaHref) || '/catalog',
        align: ALIGN.has(String(o.align || '')) ? String(o.align) : 'left',
        overlay: o.overlay === false ? false : true,
    };
}

function sanitizeSection(raw) {
    const o = raw && typeof raw === 'object' ? raw : {};
    const type = SECTION_TYPES.has(String(o.type || '')) ? String(o.type) : 'rich_text';
    const items = Array.isArray(o.items) ? o.items.slice(0, MAX_ITEMS).map(sanitizeItem) : [];
    return {
        id: clip(o.id, 64) || newId(),
        type,
        enabled: o.enabled !== false,
        title: clip(o.title, 160),
        subtitle: clip(o.subtitle, 400),
        body: clip(o.body, type === 'custom_html' ? MAX_HTML : MAX_TEXT),
        html: clip(o.html, MAX_HTML),
        css: clip(o.css, MAX_CSS),
        videoUrl: clip(o.videoUrl || o.video_url, 800),
        posterUrl: safeMediaUrl(o.posterUrl || o.poster_url),
        imageUrl: safeMediaUrl(o.imageUrl || o.image_url),
        href: safeHref(o.href),
        ctaText: clip(o.ctaText, 80),
        ctaHref: safeHref(o.ctaHref),
        secondaryText: clip(o.secondaryText, 80),
        secondaryHref: safeHref(o.secondaryHref),
        align: ALIGN.has(String(o.align || '')) ? String(o.align) : 'center',
        columns: Math.min(4, Math.max(1, parseInt(String(o.columns || 3), 10) || 3)),
        items,
    };
}

function defaultSite(branding) {
    const name = clip(branding?.businessName || branding?.business_name || 'Our Jewellery', 120) || 'Our Jewellery';
    const phone = clip(branding?.contactPhone || branding?.contact_phone || '', 20);
    return {
        announcement: {
            enabled: true,
            text: `Welcome to ${name}. Explore gold, silver & diamond jewellery with today's rates.`,
        },
        hero: {
            enabled: true,
            slides: [
                {
                    id: 'hero-1',
                    imageUrl: '',
                    videoUrl: '',
                    headline: name,
                    subhead: 'Crafted for those who wear their brilliance with pride',
                    ctaText: 'Shop now',
                    ctaHref: '/catalog',
                    align: 'left',
                    overlay: true,
                },
            ],
        },
        navLinks: [
            { id: 'nl-1', label: 'New arrivals', href: '/catalog' },
            { id: 'nl-2', label: 'Gold', href: '/catalog/gold' },
            { id: 'nl-3', label: 'Silver', href: '/catalog/silver' },
            { id: 'nl-4', label: 'Diamond', href: '/catalog/diamond' },
            { id: 'nl-5', label: "Today's gold rate", href: '/rates' },
        ],
        sections: [
            {
                id: 'sec-cat',
                type: 'shop_by_category',
                enabled: true,
                title: 'Shop by category',
                subtitle: 'Explore our diverse selections. Find your style.',
                columns: 3,
                items: [
                    { id: 'i-gold', label: 'Gold jewellery', href: '/catalog/gold', imageUrl: '' },
                    { id: 'i-silver', label: 'Silver jewellery', href: '/catalog/silver', imageUrl: '' },
                    { id: 'i-dia', label: 'Diamond jewellery', href: '/catalog/diamond', imageUrl: '' },
                    { id: 'i-gift', label: 'Gift items', href: '/catalog/gifting', imageUrl: '' },
                ],
            },
            {
                id: 'sec-banners',
                type: 'banners',
                enabled: true,
                title: '',
                subtitle: '',
                columns: 2,
                items: [
                    {
                        id: 'bn-1',
                        label: 'Timeless brilliance',
                        sublabel: 'Crafted to shine',
                        href: '/catalog/diamond',
                        imageUrl: '',
                    },
                    {
                        id: 'bn-2',
                        label: 'Wedding collections',
                        sublabel: 'Trusted for generations',
                        href: '/catalog',
                        imageUrl: '',
                    },
                ],
            },
            {
                id: 'sec-gender',
                type: 'shop_by_gender',
                enabled: true,
                title: 'Shop by gender',
                subtitle: 'Find jewellery for women, men, and kids',
                columns: 3,
                items: [
                    { id: 'g-w', label: "Women's jewellery", href: '/catalog?shop_for=women', imageUrl: '' },
                    { id: 'g-m', label: "Men's jewellery", href: '/catalog?shop_for=men', imageUrl: '' },
                    { id: 'g-k', label: "Kids' jewellery", href: '/catalog?shop_for=kids', imageUrl: '' },
                ],
            },
            {
                id: 'sec-cta',
                type: 'cta',
                enabled: true,
                title: 'Need help choosing the best jewellery?',
                body: `${name} is a premium destination for gold and diamond jewellery — dedicated to embellishing everyday moments and milestones.`,
                ctaText: 'Shop catalogue',
                ctaHref: '/catalog',
                secondaryText: phone ? 'Call us' : 'Sign in',
                secondaryHref: phone ? `tel:+91${phone}` : '/login',
                imageUrl: '',
                align: 'left',
            },
            {
                id: 'sec-quality',
                type: 'quality',
                enabled: true,
                title: 'Quality-first service',
                subtitle: 'We assure you that you will get what you can trust. Always.',
                body: '',
                imageUrl: '',
            },
        ],
        footer: {
            tagline: `Every location tells a story of joy`,
            phone,
            email: clip(branding?.email || '', 120),
        },
        customCss: '',
        customJs: '',
        customHeadHtml: '',
    };
}

function sanitizeSite(raw, branding) {
    const base = defaultSite(branding || {});
    const o = raw && typeof raw === 'object' ? raw : {};
    const announcement = o.announcement && typeof o.announcement === 'object' ? o.announcement : {};
    const hero = o.hero && typeof o.hero === 'object' ? o.hero : {};
    const slides = Array.isArray(hero.slides)
        ? hero.slides.slice(0, MAX_SLIDES).map(sanitizeSlide)
        : base.hero.slides;
    const navLinks = Array.isArray(o.navLinks)
        ? o.navLinks.slice(0, 12).map(sanitizeItem)
        : base.navLinks;
    const sections = Array.isArray(o.sections)
        ? o.sections.slice(0, MAX_SECTIONS).map(sanitizeSection)
        : base.sections;
    const footer = o.footer && typeof o.footer === 'object' ? o.footer : {};
    return {
        announcement: {
            enabled: announcement.enabled !== false,
            text: clip(announcement.text, 240) || base.announcement.text,
        },
        hero: {
            enabled: hero.enabled !== false,
            slides: slides.length ? slides : base.hero.slides,
        },
        navLinks,
        sections,
        footer: {
            tagline: clip(footer.tagline, 240) || base.footer.tagline,
            phone: clip(footer.phone, 20),
            email: clip(footer.email, 120),
        },
        customCss: clip(o.customCss, MAX_CSS),
        customJs: clip(o.customJs, MAX_JS),
        customHeadHtml: clip(o.customHeadHtml, MAX_HTML),
    };
}

function isSiteEmpty(site) {
    if (!site || typeof site !== 'object') return true;
    const keys = Object.keys(site);
    return keys.length === 0;
}

async function ensureCmsSchema() {
    await pool.query(`
        CREATE TABLE IF NOT EXISTS reseller_storefront_sites (
            reseller_user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
            draft JSONB NOT NULL DEFAULT '{}'::jsonb,
            published JSONB NOT NULL DEFAULT '{}'::jsonb,
            custom_css TEXT,
            custom_js TEXT,
            custom_head_html TEXT,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            published_at TIMESTAMPTZ
        )
    `);
}

async function brandingForReseller(user) {
    const rawDigits = String(user?.mobile_number || '').replace(/\D/g, '');
    return {
        businessName: user?.business_name || null,
        logoUrl: user?.logo_url || null,
        contactPhone: rawDigits.length >= 10 ? rawDigits.slice(-10) : rawDigits || '',
        email: user?.email || '',
    };
}

async function getSiteRow(resellerUserId) {
    await ensureCmsSchema();
    const rows = await query(
        `SELECT * FROM reseller_storefront_sites WHERE reseller_user_id = $1 LIMIT 1`,
        [resellerUserId],
    );
    return rows[0] || null;
}

async function getEditorPayload(user) {
    const branding = await brandingForReseller(user);
    const fallback = sanitizeSite(defaultSite(branding), branding);
    const row = await getSiteRow(user.id);
    if (!row) {
        return { draft: fallback, published: fallback, published_at: null, has_row: false };
    }
    const draft = isSiteEmpty(row.draft) ? fallback : sanitizeSite(row.draft, branding);
    const published = isSiteEmpty(row.published) ? fallback : sanitizeSite(row.published, branding);
    return {
        draft,
        published,
        published_at: row.published_at,
        has_row: true,
    };
}

async function saveDraft(user, body) {
    const branding = await brandingForReseller(user);
    const draft = sanitizeSite(body?.draft || body || {}, branding);
    await ensureCmsSchema();
    await query(
        `INSERT INTO reseller_storefront_sites (reseller_user_id, draft, updated_at)
         VALUES ($1, $2::jsonb, NOW())
         ON CONFLICT (reseller_user_id) DO UPDATE
           SET draft = EXCLUDED.draft, updated_at = NOW()`,
        [user.id, JSON.stringify(draft)],
    );
    return getEditorPayload(user);
}

async function publishSite(user) {
    const current = await getEditorPayload(user);
    await query(
        `INSERT INTO reseller_storefront_sites (reseller_user_id, draft, published, updated_at, published_at)
         VALUES ($1, $2::jsonb, $2::jsonb, NOW(), NOW())
         ON CONFLICT (reseller_user_id) DO UPDATE
           SET published = reseller_storefront_sites.draft,
               published_at = NOW(),
               updated_at = NOW()`,
        [user.id, JSON.stringify(current.draft)],
    );
    return getEditorPayload(user);
}

async function isStorefrontWebsiteEnabledForUserId(userId) {
    const uid = parseInt(String(userId), 10);
    if (!Number.isFinite(uid) || uid <= 0) return false;
    try {
        const rows = await query(
            `SELECT COALESCE(reseller_storefront_website_enabled, false) AS enabled
             FROM users WHERE id = $1 LIMIT 1`,
            [uid],
        );
        return !!rows[0]?.enabled;
    } catch (e) {
        const msg = String(e.message || '');
        if (msg.includes('reseller_storefront_website_enabled')) {
            await pool.query(
                'ALTER TABLE users ADD COLUMN IF NOT EXISTS reseller_storefront_website_enabled BOOLEAN NOT NULL DEFAULT false',
            );
            return isStorefrontWebsiteEnabledForUserId(uid);
        }
        return false;
    }
}

async function getPublishedForDomain(domain) {
    const d = normalizeDomain(domain);
    if (!d) return { site: defaultSite({}), branding: null, resellerId: null, websiteEnabled: false };
    const reseller = await findResellerByDomain(d);
    if (!reseller?.id) return { site: defaultSite({}), branding: null, resellerId: null, websiteEnabled: false };
    const owner = (
        await query(
            `SELECT id, business_name, logo_url, mobile_number, email, custom_domain,
                    COALESCE(reseller_storefront_website_enabled, false) AS reseller_storefront_website_enabled
             FROM users WHERE id = $1 LIMIT 1`,
            [reseller.id],
        )
    )[0];
    const websiteEnabled = !!owner?.reseller_storefront_website_enabled;
    const branding = await brandingForReseller(owner || reseller);
    if (!websiteEnabled) {
        return { site: defaultSite({}), branding, resellerId: reseller.id, websiteEnabled: false };
    }
    const fallback = sanitizeSite(defaultSite(branding), branding);
    const row = await getSiteRow(reseller.id);
    if (!row || isSiteEmpty(row.published)) {
        return { site: fallback, branding, resellerId: reseller.id, websiteEnabled: true };
    }
    return {
        site: sanitizeSite(row.published, branding),
        branding,
        resellerId: reseller.id,
        websiteEnabled: true,
    };
}

function requireStorefrontWebsiteModule() {
    return async (req, res, next) => {
        try {
            const ok = await isStorefrontWebsiteEnabledForUserId(req.user?.id);
            if (!ok) {
                return res.status(403).json({
                    error:
                        'Your website module is not enabled. Ask KC admin to turn on “Your website” in your reseller profile.',
                    code: 'STOREFRONT_WEBSITE_DISABLED',
                });
            }
            next();
        } catch (error) {
            next(error);
        }
    };
}

function createMediaUploader() {
    const dest = path.join(__dirname, '..', 'public', 'uploads', 'storefront');
    fs.mkdirSync(dest, { recursive: true });
    return multer({
        storage: multer.diskStorage({
            destination: (_req, _file, cb) => cb(null, dest),
            filename: (req, file, cb) => {
                const uid = parseInt(String(req.user?.id || 0), 10) || 0;
                const ext = (file.originalname || '').split('.').pop()?.toLowerCase();
                const safe = ['webp', 'jpg', 'jpeg', 'png', 'gif', 'mp4', 'webm'].includes(ext || '')
                    ? ext
                    : 'jpg';
                cb(null, `sf-${uid}-${Date.now()}.${safe}`);
            },
        }),
        limits: { fileSize: 25 * 1024 * 1024 },
        fileFilter: (_req, file, cb) => {
            const mime = (file.mimetype || '').toLowerCase();
            if (mime.startsWith('image/') || mime.startsWith('video/')) return cb(null, true);
            cb(new Error('Upload an image or video file'));
        },
    });
}

function registerResellerStorefrontRoutes(app, { requireSharedCatalogCreator, getPublicApiBaseUrl }) {
    const upload = createMediaUploader();
    const requireWebsite = requireStorefrontWebsiteModule();

    app.get('/api/public/storefront-page', async (req, res) => {
        try {
            const domain =
                normalizeDomain(req.query.domain || req.query.host) ||
                normalizeDomain(req.headers['x-storefront-domain']) ||
                normalizeDomain(req.headers['x-custom-domain']);
            const payload = await getPublishedForDomain(domain);
            res.setHeader('Cache-Control', 'public, max-age=30');
            res.json({
                storefront_website_enabled: !!payload.websiteEnabled,
                site: payload.websiteEnabled ? payload.site : defaultSite({}),
                business_name: payload.branding?.businessName || null,
                logo_url: payload.branding?.logoUrl || null,
                contact_phone: payload.branding?.contactPhone || null,
            });
        } catch (error) {
            console.error('public storefront-page:', error);
            res.status(500).json({ error: error.message || 'Failed to load storefront' });
        }
    });

    app.get('/api/reseller/storefront-site', requireSharedCatalogCreator, requireWebsite, async (req, res) => {
        try {
            const payload = await getEditorPayload(req.user);
            res.json(payload);
        } catch (error) {
            console.error('reseller storefront get:', error);
            res.status(500).json({ error: error.message || 'Failed to load website editor' });
        }
    });

    app.put('/api/reseller/storefront-site', requireSharedCatalogCreator, requireWebsite, async (req, res) => {
        try {
            const payload = await saveDraft(req.user, req.body || {});
            res.json({ success: true, ...payload });
        } catch (error) {
            console.error('reseller storefront save:', error);
            res.status(500).json({ error: error.message || 'Failed to save website' });
        }
    });

    app.post('/api/reseller/storefront-site/publish', requireSharedCatalogCreator, requireWebsite, async (req, res) => {
        try {
            if (req.body?.draft) {
                await saveDraft(req.user, req.body);
            }
            const payload = await publishSite(req.user);
            res.json({ success: true, ...payload });
        } catch (error) {
            console.error('reseller storefront publish:', error);
            res.status(500).json({ error: error.message || 'Failed to publish website' });
        }
    });

    app.post(
        '/api/reseller/storefront-media',
        requireSharedCatalogCreator,
        requireWebsite,
        (req, res, next) => {
            upload.single('file')(req, res, (err) => {
                if (err) return res.status(400).json({ error: err.message || 'Upload failed' });
                next();
            });
        },
        async (req, res) => {
            try {
                if (!req.file) return res.status(400).json({ error: 'Choose an image or video' });
                const rel = `/uploads/storefront/${req.file.filename}`;
                const api = typeof getPublicApiBaseUrl === 'function' ? getPublicApiBaseUrl() : '';
                res.json({
                    success: true,
                    url: rel,
                    absolute_url: api ? `${api}${rel}` : rel,
                });
            } catch (error) {
                console.error('reseller storefront media:', error);
                res.status(500).json({ error: error.message || 'Upload failed' });
            }
        },
    );
}

module.exports = {
    registerResellerStorefrontRoutes,
    ensureCmsSchema,
    sanitizeSite,
    defaultSite,
    getPublishedForDomain,
};

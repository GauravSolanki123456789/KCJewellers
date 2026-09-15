/**
 * WhatsApp Cloud API (Meta) — send PDF documents from each reseller's business number.
 * Supports manual token setup and Meta Embedded Signup (coexistence with WhatsApp Business app).
 * Docs: https://developers.facebook.com/docs/whatsapp/cloud-api
 */

const GRAPH = 'https://graph.facebook.com/v21.0';

function trimStr(v, max = 500) {
    const s = String(v ?? '').trim();
    return s.length > max ? s.slice(0, max) : s;
}

function normalizeMobile10(raw) {
    const d = String(raw || '').replace(/\D/g, '');
    if (d.length === 10) return d;
    if (d.length === 12 && d.startsWith('91')) return d.slice(2);
    if (d.length === 11 && d.startsWith('0')) return d.slice(1);
    return '';
}

function maskToken(token) {
    const t = String(token || '').trim();
    if (t.length <= 8) return t ? '••••' : '';
    return `${t.slice(0, 4)}••••${t.slice(-4)}`;
}

function readMetaPlatformConfig() {
    const appId =
        trimStr(process.env.META_APP_ID, 64) || trimStr(process.env.FACEBOOK_APP_ID, 64);
    const appSecret =
        trimStr(process.env.META_APP_SECRET, 256) || trimStr(process.env.FACEBOOK_APP_SECRET, 256);
    const configId =
        trimStr(process.env.META_WHATSAPP_CONFIG_ID, 64) ||
        trimStr(process.env.WHATSAPP_EMBEDDED_SIGNUP_CONFIG_ID, 64);
    const defaultTemplateName = trimStr(process.env.WHATSAPP_DOCUMENT_TEMPLATE_NAME, 120);
    const defaultTemplateLang = trimStr(process.env.WHATSAPP_DOCUMENT_TEMPLATE_LANGUAGE, 16) || 'en';
    const webhookVerifyToken =
        trimStr(process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN, 256) ||
        trimStr(process.env.META_WEBHOOK_VERIFY_TOKEN, 256);
    return {
        appId,
        appSecret,
        configId,
        embeddedSignupAvailable: !!(appId && appSecret && configId),
        defaultTemplateName,
        defaultTemplateLang,
        webhookVerifyToken,
    };
}

/** One platform webhook URL serves all reseller WABAs connected to the same Meta app. */
function readWhatsAppWebhookConfig(getPublicApiBaseUrl) {
    const platform = readMetaPlatformConfig();
    const base = typeof getPublicApiBaseUrl === 'function' ? getPublicApiBaseUrl() : '';
    const callbackUrl = base ? `${String(base).replace(/\/$/, '')}/api/webhooks/whatsapp` : null;
    return {
        callbackUrl,
        verifyToken: platform.webhookVerifyToken || null,
        verifyTokenConfigured: !!platform.webhookVerifyToken,
    };
}

function readWhatsAppCloudConfig(settings, userRow) {
    const block =
        settings && typeof settings.whatsappCloud === 'object' ? settings.whatsappCloud : {};
    const accessToken =
        trimStr(block.accessToken, 2000) ||
        trimStr(process.env.WHATSAPP_CLOUD_ACCESS_TOKEN, 2000) ||
        trimStr(process.env.RESELLER_WHATSAPP_CLOUD_ACCESS_TOKEN, 2000);
    const phoneNumberId =
        trimStr(block.phoneNumberId, 64) ||
        trimStr(process.env.WHATSAPP_CLOUD_PHONE_NUMBER_ID, 64) ||
        trimStr(process.env.RESELLER_WHATSAPP_CLOUD_PHONE_NUMBER_ID, 64);
    const displayNumber =
        trimStr(block.displayNumber, 32) ||
        trimStr(block.displayPhoneNumber, 32) ||
        trimStr(userRow?.mobile, 32) ||
        trimStr(process.env.WHATSAPP_CLOUD_DISPLAY_NUMBER, 32);
    const wabaId = trimStr(block.wabaId, 64);
    const documentTemplateName =
        trimStr(block.documentTemplateName, 120) ||
        readMetaPlatformConfig().defaultTemplateName;
    const documentTemplateLanguage =
        trimStr(block.documentTemplateLanguage, 16) ||
        readMetaPlatformConfig().defaultTemplateLang;
    const setupMode = trimStr(block.setupMode, 32) || (wabaId ? 'embedded_signup' : 'manual');
    const enabledFlag = block.enabled;
    const enabledExplicit =
        enabledFlag !== false &&
        enabledFlag !== 'no' &&
        enabledFlag !== 'false' &&
        enabledFlag !== 'off';
    const enabled = enabledExplicit && !!accessToken && !!phoneNumberId;
    return {
        enabled,
        accessToken,
        phoneNumberId,
        displayNumber,
        wabaId,
        documentTemplateName,
        documentTemplateLanguage,
        setupMode,
        accessTokenMasked: maskToken(accessToken),
        coexistence: block.coexistence === true || block.isOnBizApp === true,
    };
}

async function graphGet(path, accessToken) {
    const res = await fetch(`${GRAPH}${path}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
        const err = new Error(data?.error?.message || `Graph API failed (${res.status})`);
        err.status = res.status;
        err.details = data;
        throw err;
    }
    return data;
}

async function fetchPhoneNumberMetadata(accessToken, phoneNumberId) {
    if (!accessToken || !phoneNumberId) return null;
    try {
        const data = await graphGet(
            `/${phoneNumberId}?fields=display_phone_number,verified_name,is_on_biz_app,platform_type,quality_rating`,
            accessToken,
        );
        return {
            displayPhoneNumber: data.display_phone_number || null,
            verifiedName: data.verified_name || null,
            isOnBizApp: data.is_on_biz_app === true,
            platformType: data.platform_type || null,
            qualityRating: data.quality_rating || null,
        };
    } catch (e) {
        console.warn('whatsapp phone metadata:', e.message);
        return null;
    }
}

function isReengagementWhatsAppError(details) {
    const code = details?.error?.code ?? details?.error?.error_subcode;
    const msg = String(details?.error?.message || '').toLowerCase();
    if (code === 131047 || code === 131026 || code === 470) return true;
    return (
        msg.includes('24 hour') ||
        msg.includes('re-engagement') ||
        msg.includes('template') && msg.includes('required')
    );
}

async function uploadWhatsAppMedia({ accessToken, phoneNumberId, buffer, filename, mimeType }) {
    const form = new FormData();
    form.append('messaging_product', 'whatsapp');
    form.append(
        'file',
        new Blob([buffer], { type: mimeType || 'application/pdf' }),
        filename || 'document.pdf',
    );
    form.append('type', mimeType || 'application/pdf');
    const res = await fetch(`${GRAPH}/${phoneNumberId}/media`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}` },
        body: form,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
        const err = new Error(data?.error?.message || `WhatsApp media upload failed (${res.status})`);
        err.status = res.status;
        err.details = data;
        throw err;
    }
    return data.id;
}

async function sendWhatsAppDocument({
    accessToken,
    phoneNumberId,
    toMobile10,
    mediaId,
    caption,
    filename,
}) {
    const to = normalizeMobile10(toMobile10);
    if (!to) throw Object.assign(new Error('Valid 10-digit customer mobile required'), { status: 400 });
    const payload = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: `91${to}`,
        type: 'document',
        document: {
            id: mediaId,
            caption: trimStr(caption, 1024) || undefined,
            filename: trimStr(filename, 120) || 'document.pdf',
        },
    };
    const res = await fetch(`${GRAPH}/${phoneNumberId}/messages`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
        const err = new Error(data?.error?.message || `WhatsApp send failed (${res.status})`);
        err.status = res.status;
        err.details = data;
        throw err;
    }
    return data;
}

async function sendWhatsAppTemplateDocument({
    accessToken,
    phoneNumberId,
    toMobile10,
    mediaId,
    caption,
    filename,
    templateName,
    templateLanguage,
}) {
    const to = normalizeMobile10(toMobile10);
    if (!to) throw Object.assign(new Error('Valid 10-digit customer mobile required'), { status: 400 });
    const name = trimStr(templateName, 120);
    if (!name) {
        throw Object.assign(
            new Error(
                'Customer is outside the 24-hour WhatsApp window. Add an approved document template name in ERP → Integrations → WhatsApp.',
            ),
            { status: 422 },
        );
    }
    const lang = trimStr(templateLanguage, 16) || 'en';
    const bodyText = trimStr(caption, 256) || trimStr(filename, 120) || 'Your document';
    const payload = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: `91${to}`,
        type: 'template',
        template: {
            name,
            language: { code: lang },
            components: [
                {
                    type: 'header',
                    parameters: [
                        {
                            type: 'document',
                            document: {
                                id: mediaId,
                                filename: trimStr(filename, 120) || 'document.pdf',
                            },
                        },
                    ],
                },
                {
                    type: 'body',
                    parameters: [{ type: 'text', text: bodyText }],
                },
            ],
        },
    };
    const res = await fetch(`${GRAPH}/${phoneNumberId}/messages`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
        const err = new Error(data?.error?.message || `WhatsApp template send failed (${res.status})`);
        err.status = res.status;
        err.details = data;
        throw err;
    }
    return data;
}

async function sendWhatsAppPdfWithFallback(cfg, opts) {
    const mediaId = await uploadWhatsAppMedia({
        accessToken: cfg.accessToken,
        phoneNumberId: cfg.phoneNumberId,
        buffer: opts.pdfBuffer,
        filename: opts.filename,
        mimeType: 'application/pdf',
    });
    try {
        const sent = await sendWhatsAppDocument({
            accessToken: cfg.accessToken,
            phoneNumberId: cfg.phoneNumberId,
            toMobile10: opts.mobile,
            mediaId,
            caption: opts.caption,
            filename: opts.filename,
        });
        return { success: true, messageId: sent.messages?.[0]?.id, mediaId, deliveryMode: 'session' };
    } catch (sessionErr) {
        if (!isReengagementWhatsAppError(sessionErr.details)) throw sessionErr;
        const sent = await sendWhatsAppTemplateDocument({
            accessToken: cfg.accessToken,
            phoneNumberId: cfg.phoneNumberId,
            toMobile10: opts.mobile,
            mediaId,
            caption: opts.caption,
            filename: opts.filename,
            templateName: cfg.documentTemplateName,
            templateLanguage: cfg.documentTemplateLanguage,
        });
        return {
            success: true,
            messageId: sent.messages?.[0]?.id,
            mediaId,
            deliveryMode: 'template',
        };
    }
}

async function exchangeEmbeddedSignupCode(code) {
    const platform = readMetaPlatformConfig();
    if (!platform.appId || !platform.appSecret) {
        throw Object.assign(new Error('Platform Meta app is not configured (META_APP_ID / META_APP_SECRET)'), {
            status: 503,
        });
    }
    const url =
        `${GRAPH}/oauth/access_token?` +
        `client_id=${encodeURIComponent(platform.appId)}` +
        `&client_secret=${encodeURIComponent(platform.appSecret)}` +
        `&code=${encodeURIComponent(String(code || '').trim())}`;
    const res = await fetch(url);
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.access_token) {
        throw Object.assign(new Error(data?.error?.message || 'Could not exchange WhatsApp signup code'), {
            status: 400,
            details: data,
        });
    }
    return data.access_token;
}

async function mergeResellerWhatsAppSettings(query, resellerUserId, patch) {
    const settingsRows = await query(
        `SELECT settings FROM reseller_erp_settings WHERE reseller_user_id = $1 LIMIT 1`,
        [resellerUserId],
    );
    let settings = settingsRows[0]?.settings || {};
    if (typeof settings === 'string') {
        try {
            settings = JSON.parse(settings);
        } catch {
            settings = {};
        }
    }
    const prev = settings.whatsappCloud && typeof settings.whatsappCloud === 'object' ? settings.whatsappCloud : {};
    settings.whatsappCloud = { ...prev, ...patch };
    if (settingsRows.length) {
        await query(`UPDATE reseller_erp_settings SET settings = $2::jsonb WHERE reseller_user_id = $1`, [
            resellerUserId,
            JSON.stringify(settings),
        ]);
    } else {
        await query(
            `INSERT INTO reseller_erp_settings (reseller_user_id, settings) VALUES ($1, $2::jsonb)`,
            [resellerUserId, JSON.stringify(settings)],
        );
    }
    return settings.whatsappCloud;
}

async function sendWhatsAppPdfToCustomer(query, resellerUserId, opts) {
    const settingsRows = await query(
        `SELECT settings FROM reseller_erp_settings WHERE reseller_user_id = $1 LIMIT 1`,
        [resellerUserId],
    );
    let settings = settingsRows[0]?.settings || {};
    if (typeof settings === 'string') {
        try {
            settings = JSON.parse(settings);
        } catch {
            settings = {};
        }
    }
    const userRows = await query(`SELECT mobile FROM users WHERE id = $1 LIMIT 1`, [resellerUserId]);
    const cfg = readWhatsAppCloudConfig(settings, userRows[0]);
    if (!cfg.enabled) {
        throw Object.assign(new Error('WhatsApp Cloud API is not configured for this shop'), { status: 503 });
    }
    const buffer = opts.pdfBuffer;
    if (!buffer || !Buffer.isBuffer(buffer) || buffer.length < 32) {
        throw Object.assign(new Error('PDF file is required'), { status: 400 });
    }
    const filename = trimStr(opts.filename, 120) || 'document.pdf';
    const caption = trimStr(opts.caption, 1024);
    return sendWhatsAppPdfWithFallback(cfg, { mobile: opts.mobile, caption, filename, pdfBuffer: buffer });
}

function registerWhatsAppWebhookRoutes(app, deps = {}) {
    const getPublicApiBaseUrl = deps.getPublicApiBaseUrl;

    app.get('/api/webhooks/whatsapp', (req, res) => {
        const mode = String(req.query['hub.mode'] || '');
        const token = String(req.query['hub.verify_token'] || '');
        const challenge = req.query['hub.challenge'];
        const expected = readMetaPlatformConfig().webhookVerifyToken;
        if (mode === 'subscribe' && expected && token === expected && challenge != null) {
            return res.status(200).send(String(challenge));
        }
        if (!expected) {
            console.warn('whatsapp webhook verify: WHATSAPP_WEBHOOK_VERIFY_TOKEN not set');
        }
        return res.sendStatus(403);
    });

    app.post('/api/webhooks/whatsapp', (req, res) => {
        res.sendStatus(200);
        try {
            const body = req.body;
            if (!body || typeof body !== 'object') return;
            const entries = Array.isArray(body.entry) ? body.entry : [];
            for (const entry of entries) {
                const changes = Array.isArray(entry.changes) ? entry.changes : [];
                for (const change of changes) {
                    const value = change.value || {};
                    const phoneNumberId = value.metadata?.phone_number_id;
                    const statuses = Array.isArray(value.statuses) ? value.statuses : [];
                    for (const st of statuses) {
                        if (st.status === 'failed') {
                            console.warn('whatsapp delivery failed', {
                                phoneNumberId,
                                messageId: st.id,
                                errors: st.errors,
                            });
                        }
                    }
                }
            }
        } catch (e) {
            console.warn('whatsapp webhook parse:', e.message);
        }
    });

    if (typeof getPublicApiBaseUrl === 'function') {
        const cfg = readWhatsAppWebhookConfig(getPublicApiBaseUrl);
        if (cfg.callbackUrl) {
            console.log(`WhatsApp webhook URL: ${cfg.callbackUrl}`);
        }
    }
}

function registerResellerWhatsAppRoutes(app, deps) {
    const { query, checkAuth, erpGate, getPublicApiBaseUrl } = deps;
    const multer = require('multer');
    const upload = multer({
        storage: multer.memoryStorage(),
        limits: { fileSize: 16 * 1024 * 1024 },
    });

    app.get('/api/reseller/erp/whatsapp/status', checkAuth, erpGate, async (req, res) => {
        try {
            const settingsRows = await query(
                `SELECT settings FROM reseller_erp_settings WHERE reseller_user_id = $1 LIMIT 1`,
                [req.user.id],
            );
            let settings = settingsRows[0]?.settings || {};
            if (typeof settings === 'string') {
                try {
                    settings = JSON.parse(settings);
                } catch {
                    settings = {};
                }
            }
            const userRows = await query(`SELECT mobile FROM users WHERE id = $1 LIMIT 1`, [req.user.id]);
            const cfg = readWhatsAppCloudConfig(settings, userRows[0]);
            const platform = readMetaPlatformConfig();
            let phoneMeta = null;
            if (cfg.accessToken && cfg.phoneNumberId) {
                phoneMeta = await fetchPhoneNumberMetadata(cfg.accessToken, cfg.phoneNumberId);
            }
            const coexistenceActive =
                phoneMeta?.isOnBizApp === true && phoneMeta?.platformType === 'CLOUD_API';
            const webhook = readWhatsAppWebhookConfig(getPublicApiBaseUrl);
            res.json({
                configured: cfg.enabled,
                displayNumber: phoneMeta?.displayPhoneNumber || cfg.displayNumber || null,
                verifiedName: phoneMeta?.verifiedName || null,
                accessTokenSet: !!cfg.accessToken,
                phoneNumberId: cfg.phoneNumberId || null,
                wabaId: cfg.wabaId || null,
                setupMode: cfg.setupMode,
                coexistenceActive,
                embeddedSignupAvailable: platform.embeddedSignupAvailable,
                documentTemplateName: cfg.documentTemplateName || null,
                webhookCallbackUrl: webhook.callbackUrl,
                webhookVerifyToken: webhook.verifyToken,
                webhookVerifyTokenConfigured: webhook.verifyTokenConfigured,
                sendMode: cfg.enabled
                    ? coexistenceActive
                        ? 'cloud_api_coexistence'
                        : 'cloud_api'
                    : platform.embeddedSignupAvailable
                      ? 'setup_embedded_signup'
                      : 'setup_manual',
            });
        } catch (e) {
            console.error('whatsapp status:', e);
            res.status(500).json({ error: e.message || 'Failed to load WhatsApp status' });
        }
    });

    app.get('/api/reseller/erp/whatsapp/embedded-signup/config', checkAuth, erpGate, (req, res) => {
        const platform = readMetaPlatformConfig();
        res.json({
            available: platform.embeddedSignupAvailable,
            appId: platform.appId || null,
            configId: platform.configId || null,
            featureType: 'whatsapp_business_app_onboarding',
        });
    });

    app.post('/api/reseller/erp/whatsapp/embedded-signup/complete', checkAuth, erpGate, async (req, res) => {
        try {
            const code = trimStr(req.body?.code, 2000);
            const phoneNumberId = trimStr(req.body?.phoneNumberId, 64);
            const wabaId = trimStr(req.body?.wabaId, 64);
            const event = trimStr(req.body?.event, 64);
            if (!code) return res.status(400).json({ error: 'Signup code is required' });
            if (!phoneNumberId) return res.status(400).json({ error: 'Phone number ID is required' });

            const accessToken = await exchangeEmbeddedSignupCode(code);
            const phoneMeta = await fetchPhoneNumberMetadata(accessToken, phoneNumberId);
            const displayDigits = String(phoneMeta?.displayPhoneNumber || '')
                .replace(/\D/g, '')
                .slice(-10);

            await mergeResellerWhatsAppSettings(query, req.user.id, {
                enabled: 'yes',
                accessToken,
                phoneNumberId,
                wabaId: wabaId || undefined,
                displayNumber: displayDigits || undefined,
                displayPhoneNumber: phoneMeta?.displayPhoneNumber || undefined,
                setupMode: 'embedded_signup',
                coexistence:
                    event === 'FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING' ||
                    phoneMeta?.isOnBizApp === true,
                isOnBizApp: phoneMeta?.isOnBizApp === true,
                connectedAt: new Date().toISOString(),
            });

            res.json({
                success: true,
                phoneNumberId,
                wabaId: wabaId || null,
                displayNumber: displayDigits || phoneMeta?.displayPhoneNumber || null,
                coexistenceActive:
                    phoneMeta?.isOnBizApp === true && phoneMeta?.platformType === 'CLOUD_API',
            });
        } catch (e) {
            const status = e.status || 500;
            if (status !== 500) return res.status(status).json({ error: e.message, details: e.details });
            console.error('whatsapp embedded-signup complete:', e);
            res.status(500).json({ error: e.message || 'WhatsApp connect failed' });
        }
    });

    app.post(
        '/api/reseller/erp/whatsapp/send-document',
        checkAuth,
        erpGate,
        upload.single('pdf'),
        async (req, res) => {
            try {
                const mobile = trimStr(req.body.mobile, 32);
                const caption = trimStr(req.body.caption, 1024);
                const filename = trimStr(req.body.filename, 120) || 'document.pdf';
                const pdfBuffer = req.file?.buffer;
                const result = await sendWhatsAppPdfToCustomer(query, req.user.id, {
                    mobile,
                    caption,
                    filename,
                    pdfBuffer,
                });
                res.json(result);
            } catch (e) {
                const status = e.status || 500;
                if (status !== 500) return res.status(status).json({ error: e.message, details: e.details });
                console.error('whatsapp send-document:', e);
                res.status(500).json({ error: e.message || 'WhatsApp send failed' });
            }
        },
    );
}

module.exports = {
    registerResellerWhatsAppRoutes,
    registerWhatsAppWebhookRoutes,
    readWhatsAppCloudConfig,
    readWhatsAppWebhookConfig,
    readMetaPlatformConfig,
    sendWhatsAppPdfToCustomer,
    normalizeMobile10,
    fetchPhoneNumberMetadata,
};

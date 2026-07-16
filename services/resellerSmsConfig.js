/**
 * Per-reseller SMS / OTP settings for shared catalogue links.
 */

const { maskSecret } = require('./smsConfig');

const RESELLER_SMS_COLUMNS = [
    'reseller_shared_catalog_otp_enabled',
    'reseller_sms_provider',
    'reseller_o3sms_api_key',
    'reseller_o3sms_sender_id',
    'reseller_o3sms_route',
    'reseller_o3sms_dlt_template_id',
    'reseller_o3sms_message_template',
];

async function ensureResellerSmsColumns(pool) {
    await pool.query(`
        ALTER TABLE users ADD COLUMN IF NOT EXISTS reseller_shared_catalog_otp_enabled BOOLEAN NOT NULL DEFAULT false;
        ALTER TABLE users ADD COLUMN IF NOT EXISTS reseller_sms_provider VARCHAR(32) DEFAULT '';
        ALTER TABLE users ADD COLUMN IF NOT EXISTS reseller_o3sms_api_key TEXT;
        ALTER TABLE users ADD COLUMN IF NOT EXISTS reseller_o3sms_sender_id VARCHAR(16);
        ALTER TABLE users ADD COLUMN IF NOT EXISTS reseller_o3sms_route VARCHAR(8) DEFAULT '2';
        ALTER TABLE users ADD COLUMN IF NOT EXISTS reseller_o3sms_dlt_template_id VARCHAR(64);
        ALTER TABLE users ADD COLUMN IF NOT EXISTS reseller_o3sms_message_template TEXT;
    `);
}

function publicResellerSmsSettings(row) {
    const key = String(row?.reseller_o3sms_api_key ?? '').trim();
    return {
        shared_catalog_otp_enabled: !!row?.reseller_shared_catalog_otp_enabled,
        sms_provider: String(row?.reseller_sms_provider ?? '').trim() || 'o3sms',
        o3sms_api_key: maskSecret(key),
        o3sms_api_key_set: !!key,
        o3sms_sender_id: String(row?.reseller_o3sms_sender_id ?? '').trim() || 'ALERTS',
        o3sms_route: String(row?.reseller_o3sms_route ?? '').trim() || '2',
        o3sms_dlt_template_id: String(row?.reseller_o3sms_dlt_template_id ?? '').trim(),
        o3sms_message_template:
            String(row?.reseller_o3sms_message_template ?? '').trim() ||
            'Dear {#var#} Your OTP for login is {#var#} It is valid for {#var#} B.N.MARLECHA AND SONS',
    };
}

/** SMS config object for services/smsService.js — reseller credentials only. */
function resellerRowToSmsConfig(row) {
    if (!row) return null;
    const key = String(row.reseller_o3sms_api_key ?? '').trim();
    if (!key) return null;
    return {
        sms_provider: String(row.reseller_sms_provider ?? '').trim() || 'o3sms',
        o3sms_api_key: key,
        o3sms_sender_id: String(row.reseller_o3sms_sender_id ?? '').trim() || 'ALERTS',
        o3sms_route: String(row.reseller_o3sms_route ?? '').trim() || '2',
        o3sms_dlt_template_id: String(row.reseller_o3sms_dlt_template_id ?? '').trim(),
        o3sms_message_template:
            String(row.reseller_o3sms_message_template ?? '').trim() ||
            'Dear {#var#} Your OTP for login is {#var#} It is valid for {#var#} B.N.MARLECHA AND SONS',
    };
}

async function loadResellerSmsRow(query, userId) {
    const id = parseInt(String(userId), 10);
    if (!Number.isFinite(id) || id <= 0) return null;
    const rows = await query(
        `SELECT id, customer_tier,
                COALESCE(reseller_shared_catalog_otp_enabled, false) AS reseller_shared_catalog_otp_enabled,
                reseller_sms_provider, reseller_o3sms_api_key, reseller_o3sms_sender_id,
                reseller_o3sms_route, reseller_o3sms_dlt_template_id, reseller_o3sms_message_template
         FROM users WHERE id = $1`,
        [id],
    );
    return rows[0] ?? null;
}

async function getResellerSmsConfigForSend(query, userId) {
    const row = await loadResellerSmsRow(query, userId);
    return resellerRowToSmsConfig(row);
}

/**
 * Whether shared-catalog customers must verify OTP for this brochure creator.
 * Reseller brochures: per-reseller toggle + API key required.
 * Non-reseller (KC) brochures: admin global setting.
 */
async function getSharedCatalogOtpForCreator(query, creatorUserId, getAdminOtpEnabled) {
    const id = creatorUserId != null ? parseInt(String(creatorUserId), 10) : null;
    if (!Number.isFinite(id) || id <= 0) {
        return { otpEnabled: await getAdminOtpEnabled(), usesResellerConfig: false };
    }
    const row = await loadResellerSmsRow(query, id);
    if (!row) {
        return { otpEnabled: await getAdminOtpEnabled(), usesResellerConfig: false };
    }
    const tier = String(row.customer_tier || '').toUpperCase();
    if (tier !== 'RESELLER') {
        return { otpEnabled: await getAdminOtpEnabled(), usesResellerConfig: false };
    }
    const wantsOtp = !!row.reseller_shared_catalog_otp_enabled;
    const hasKey = !!String(row.reseller_o3sms_api_key ?? '').trim();
    return {
        otpEnabled: wantsOtp && hasKey,
        otpRequested: wantsOtp,
        otpConfigured: hasKey,
        usesResellerConfig: true,
    };
}

async function upsertResellerSmsSettings(query, userId, body) {
    const id = parseInt(String(userId), 10);
    if (!Number.isFinite(id) || id <= 0) {
        const err = new Error('Invalid user id');
        err.status = 400;
        throw err;
    }
    const existing = await loadResellerSmsRow(query, id);
    if (!existing || String(existing.customer_tier || '').toUpperCase() !== 'RESELLER') {
        const err = new Error('SMS settings are only for reseller accounts');
        err.status = 403;
        throw err;
    }

    const updates = [];
    const params = [];
    let idx = 1;

    if (body.shared_catalog_otp_enabled !== undefined || body.reseller_shared_catalog_otp_enabled !== undefined) {
        const raw = body.shared_catalog_otp_enabled ?? body.reseller_shared_catalog_otp_enabled;
        updates.push(`reseller_shared_catalog_otp_enabled = $${idx++}`);
        params.push(!!raw);
    }
    if (body.sms_provider !== undefined || body.reseller_sms_provider !== undefined) {
        const val = String(body.sms_provider ?? body.reseller_sms_provider ?? '').trim().slice(0, 32);
        updates.push(`reseller_sms_provider = $${idx++}`);
        params.push(val);
    }
    const keyRaw = body.o3sms_api_key ?? body.reseller_o3sms_api_key;
    if (keyRaw !== undefined) {
        const val = String(keyRaw ?? '').trim();
        if (val && !val.includes('•')) {
            updates.push(`reseller_o3sms_api_key = $${idx++}`);
            params.push(val);
        }
    }
    if (body.o3sms_sender_id !== undefined || body.reseller_o3sms_sender_id !== undefined) {
        updates.push(`reseller_o3sms_sender_id = $${idx++}`);
        params.push(
            String(body.o3sms_sender_id ?? body.reseller_o3sms_sender_id ?? '')
                .trim()
                .slice(0, 16),
        );
    }
    if (body.o3sms_route !== undefined || body.reseller_o3sms_route !== undefined) {
        updates.push(`reseller_o3sms_route = $${idx++}`);
        params.push(
            String(body.o3sms_route ?? body.reseller_o3sms_route ?? '2')
                .trim()
                .slice(0, 8),
        );
    }
    if (body.o3sms_dlt_template_id !== undefined || body.reseller_o3sms_dlt_template_id !== undefined) {
        updates.push(`reseller_o3sms_dlt_template_id = $${idx++}`);
        params.push(
            String(body.o3sms_dlt_template_id ?? body.reseller_o3sms_dlt_template_id ?? '')
                .trim()
                .slice(0, 64),
        );
    }
    if (body.o3sms_message_template !== undefined || body.reseller_o3sms_message_template !== undefined) {
        updates.push(`reseller_o3sms_message_template = $${idx++}`);
        params.push(
            String(body.o3sms_message_template ?? body.reseller_o3sms_message_template ?? '').trim(),
        );
    }

    if (updates.length) {
        params.push(id);
        await query(`UPDATE users SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = $${idx}`, params);
    }

    const row = await loadResellerSmsRow(query, id);
    return publicResellerSmsSettings(row);
}

module.exports = {
    RESELLER_SMS_COLUMNS,
    ensureResellerSmsColumns,
    publicResellerSmsSettings,
    resellerRowToSmsConfig,
    resellerRowToSmsConfig,
    loadResellerSmsRow,
    getResellerSmsConfigForSend,
    getSharedCatalogOtpForCreator,
    upsertResellerSmsSettings,
};

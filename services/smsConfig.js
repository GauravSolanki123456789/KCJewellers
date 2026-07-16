/**
 * SMS / OTP provider settings — app_settings with .env fallback.
 */

const SMS_SETTING_KEYS = [
    'sms_provider',
    'fast2sms_api_key',
    'msg91_auth_key',
    'msg91_sender_id',
    'o3sms_api_key',
    'o3sms_sender_id',
    'o3sms_route',
    'o3sms_dlt_template_id',
    'o3sms_message_template',
    'twilio_account_sid',
    'twilio_auth_token',
    'twilio_phone_number',
    'shared_catalog_otp_enabled',
];

const ENV_FALLBACK = {
    sms_provider: () => process.env.SMS_PROVIDER || '',
    fast2sms_api_key: () => process.env.FAST2SMS_API_KEY || '',
    msg91_auth_key: () => process.env.MSG91_AUTH_KEY || process.env.SMS_PROVIDER_API_KEY || '',
    msg91_sender_id: () => process.env.MSG91_SENDER_ID || 'KCJEWL',
    o3sms_api_key: () => process.env.O3SMS_API_KEY || process.env.CO3SMS_API_KEY || '',
    o3sms_sender_id: () => process.env.O3SMS_SENDER_ID || process.env.CO3SMS_SENDER_ID || 'ALERTS',
    o3sms_route: () => process.env.O3SMS_ROUTE || process.env.CO3SMS_ROUTE || '2',
    o3sms_dlt_template_id: () => process.env.O3SMS_DLT_TEMPLATE_ID || process.env.CO3SMS_DLT_TEMPLATE_ID || '',
    o3sms_message_template: () =>
        process.env.O3SMS_MESSAGE_TEMPLATE ||
        process.env.CO3SMS_MESSAGE_TEMPLATE ||
        'Your KC Jewellers verification code is {#var#}. Valid for 10 minutes.',
    shared_catalog_otp_enabled: () => process.env.SHARED_CATALOG_OTP_ENABLED || 'true',
    twilio_account_sid: () => process.env.TWILIO_ACCOUNT_SID || '',
    twilio_auth_token: () => process.env.TWILIO_AUTH_TOKEN || '',
    twilio_phone_number: () => process.env.TWILIO_PHONE_NUMBER || '',
};

let cachedConfig = null;
let cacheExpiresAt = 0;
const CACHE_MS = 60_000;

function pickNonEmpty(dbVal, envVal) {
    const d = String(dbVal ?? '').trim();
    if (d) return d;
    return String(envVal ?? '').trim();
}

async function loadSmsSettingsFromDb(query) {
    const rows = await query(
        `SELECT key, value FROM app_settings WHERE key = ANY($1::text[])`,
        [SMS_SETTING_KEYS],
    );
    const map = Object.fromEntries(rows.map((r) => [r.key, r.value ?? '']));
    return {
        sms_provider: pickNonEmpty(map.sms_provider, ENV_FALLBACK.sms_provider()),
        fast2sms_api_key: pickNonEmpty(map.fast2sms_api_key, ENV_FALLBACK.fast2sms_api_key()),
        msg91_auth_key: pickNonEmpty(map.msg91_auth_key, ENV_FALLBACK.msg91_auth_key()),
        msg91_sender_id: pickNonEmpty(map.msg91_sender_id, ENV_FALLBACK.msg91_sender_id()) || 'KCJEWL',
        o3sms_api_key: pickNonEmpty(map.o3sms_api_key, ENV_FALLBACK.o3sms_api_key()),
        o3sms_sender_id: pickNonEmpty(map.o3sms_sender_id, ENV_FALLBACK.o3sms_sender_id()) || 'ALERTS',
        o3sms_route: pickNonEmpty(map.o3sms_route, ENV_FALLBACK.o3sms_route()) || '2',
        o3sms_dlt_template_id: pickNonEmpty(map.o3sms_dlt_template_id, ENV_FALLBACK.o3sms_dlt_template_id()),
        o3sms_message_template:
            pickNonEmpty(map.o3sms_message_template, ENV_FALLBACK.o3sms_message_template()) ||
            'Your KC Jewellers verification code is {#var#}. Valid for 10 minutes.',
        shared_catalog_otp_enabled:
            pickNonEmpty(map.shared_catalog_otp_enabled, ENV_FALLBACK.shared_catalog_otp_enabled()) || 'true',
        twilio_account_sid: pickNonEmpty(map.twilio_account_sid, ENV_FALLBACK.twilio_account_sid()),
        twilio_auth_token: pickNonEmpty(map.twilio_auth_token, ENV_FALLBACK.twilio_auth_token()),
        twilio_phone_number: pickNonEmpty(map.twilio_phone_number, ENV_FALLBACK.twilio_phone_number()),
    };
}

async function getSmsConfig(query) {
    const now = Date.now();
    if (cachedConfig && now < cacheExpiresAt) return cachedConfig;
    const config = await loadSmsSettingsFromDb(query);
    cachedConfig = config;
    cacheExpiresAt = now + CACHE_MS;
    return config;
}

function invalidateSmsConfigCache() {
    cachedConfig = null;
    cacheExpiresAt = 0;
}

function maskSecret(val) {
    const s = String(val ?? '').trim();
    if (!s) return '';
    if (s.length <= 6) return '••••••';
    return `${'•'.repeat(Math.min(28, s.length - 4))}${s.slice(-4)}`;
}

function parseSmsSettingBool(raw) {
    const s = String(raw ?? '').trim().toLowerCase();
    return s === '1' || s === 'true' || s === 'yes' || s === 'on';
}

function publicSmsSettings(config) {
    return {
        sms_provider: config.sms_provider || '',
        shared_catalog_otp_enabled: parseSmsSettingBool(config.shared_catalog_otp_enabled),
        fast2sms_api_key: maskSecret(config.fast2sms_api_key),
        fast2sms_api_key_set: !!String(config.fast2sms_api_key || '').trim(),
        msg91_auth_key: maskSecret(config.msg91_auth_key),
        msg91_auth_key_set: !!String(config.msg91_auth_key || '').trim(),
        msg91_sender_id: config.msg91_sender_id || 'KCJEWL',
        o3sms_api_key: maskSecret(config.o3sms_api_key),
        o3sms_api_key_set: !!String(config.o3sms_api_key || '').trim(),
        o3sms_sender_id: config.o3sms_sender_id || 'ALERTS',
        o3sms_route: config.o3sms_route || '2',
        o3sms_dlt_template_id: config.o3sms_dlt_template_id || '',
        o3sms_message_template: config.o3sms_message_template || '',
        twilio_account_sid: maskSecret(config.twilio_account_sid),
        twilio_account_sid_set: !!String(config.twilio_account_sid || '').trim(),
        twilio_auth_token: maskSecret(config.twilio_auth_token),
        twilio_auth_token_set: !!String(config.twilio_auth_token || '').trim(),
        twilio_phone_number: config.twilio_phone_number || '',
    };
}

async function upsertSmsSettings(query, body) {
    const updates = [];
    const allowed = new Set(SMS_SETTING_KEYS);
    for (const [key, raw] of Object.entries(body || {})) {
        if (!allowed.has(key)) continue;
        if (key === 'shared_catalog_otp_enabled') {
            const on = parseSmsSettingBool(raw);
            updates.push({ key, val: on ? 'true' : 'false' });
            continue;
        }
        const val = String(raw ?? '').trim();
        if (val === '' || val.includes('•')) continue;
        updates.push({ key, val });
    }
    for (const row of updates) {
        await query(
            `INSERT INTO app_settings (key, value, updated_at) VALUES ($1, $2, CURRENT_TIMESTAMP)
             ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = CURRENT_TIMESTAMP`,
            [row.key, row.val],
        );
    }
    invalidateSmsConfigCache();
    return getSmsConfig(query);
}

/** Merge unsaved form fields over saved config for SMS test sends. */
function mergeO3SmsConfigFromBody(base, body) {
    const b = base || {};
    const bodyObj = body || {};
    const keyRaw = String(bodyObj.o3sms_api_key ?? '').trim();
    return {
        sms_provider: String(bodyObj.sms_provider ?? b.sms_provider ?? 'o3sms').trim(),
        o3sms_api_key: keyRaw && !keyRaw.includes('•') ? keyRaw : b.o3sms_api_key,
        o3sms_sender_id: String(bodyObj.o3sms_sender_id ?? b.o3sms_sender_id ?? 'ALERTS').trim(),
        o3sms_route: String(bodyObj.o3sms_route ?? b.o3sms_route ?? '2').trim(),
        o3sms_dlt_template_id: String(bodyObj.o3sms_dlt_template_id ?? b.o3sms_dlt_template_id ?? '').trim(),
        o3sms_message_template: String(
            bodyObj.o3sms_message_template ?? b.o3sms_message_template ?? '',
        ).trim(),
    };
}

module.exports = {
    SMS_SETTING_KEYS,
    getSmsConfig,
    invalidateSmsConfigCache,
    publicSmsSettings,
    upsertSmsSettings,
    maskSecret,
    parseSmsSettingBool,
    mergeO3SmsConfigFromBody,
};

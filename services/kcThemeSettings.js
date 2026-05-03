'use strict';

const { query } = require('../config/database');
const { DEFAULT_KC_THEME_ID, normalizeKcThemeId } = require('./kcThemeCatalog');

async function getAppKcThemeId() {
    try {
        const rows = await query(`SELECT value FROM app_settings WHERE key = 'kc_theme_id' LIMIT 1`);
        if (rows.length && rows[0].value != null) {
            return normalizeKcThemeId(rows[0].value, DEFAULT_KC_THEME_ID);
        }
    } catch (_) {
        /* no table / column */
    }
    return DEFAULT_KC_THEME_ID;
}

async function getResellerDefaultKcThemeId() {
    try {
        const rows = await query(`SELECT value FROM app_settings WHERE key = 'kc_reseller_theme_id' LIMIT 1`);
        if (rows.length && rows[0].value != null) {
            return normalizeKcThemeId(rows[0].value, DEFAULT_KC_THEME_ID);
        }
    } catch (_) {
        /* */
    }
    return DEFAULT_KC_THEME_ID;
}

async function resolveUserKcThemeId(userRow) {
    if (!userRow) return getAppKcThemeId();
    const tier = String(userRow.customer_tier || '').toUpperCase();
    const resellerDefault = await getResellerDefaultKcThemeId();
    if (tier === 'RESELLER') {
        return normalizeKcThemeId(userRow.kc_theme_id, resellerDefault);
    }
    return getAppKcThemeId();
}

module.exports = {
    getAppKcThemeId,
    getResellerDefaultKcThemeId,
    resolveUserKcThemeId,
};

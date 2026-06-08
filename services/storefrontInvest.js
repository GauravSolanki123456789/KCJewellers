/**
 * Invest (SIP) on reseller vanity domains — gated by users.reseller_invest_enabled.
 * KC main site (no storefront domain) always allows Invest.
 */
const { query } = require('../config/database');
const { normalizeDomain, findResellerByDomain } = require('./resellerMetalRates');

function requestStorefrontDomain(req) {
    return (
        normalizeDomain(req.query?.domain) ||
        normalizeDomain(req.headers['x-storefront-domain']) ||
        normalizeDomain(req.headers['x-custom-domain'])
    );
}

async function investEnabledForResellerUserId(userId) {
    const uid = parseInt(String(userId), 10);
    if (!Number.isFinite(uid) || uid <= 0) return false;
    try {
        const rows = await query(
            `SELECT COALESCE(reseller_invest_enabled, false) AS enabled
             FROM users WHERE id = $1`,
            [uid],
        );
        return !!rows[0]?.enabled;
    } catch (e) {
        if (String(e.message || '').includes('reseller_invest_enabled')) {
            await query(
                'ALTER TABLE users ADD COLUMN IF NOT EXISTS reseller_invest_enabled BOOLEAN NOT NULL DEFAULT false',
            );
            return investEnabledForResellerUserId(userId);
        }
        throw e;
    }
}

async function investEnabledForDomain(domain) {
    const d = normalizeDomain(domain);
    if (!d) return true;
    const reseller = await findResellerByDomain(d);
    if (!reseller?.id) return false;
    return investEnabledForResellerUserId(reseller.id);
}

/** True when Invest is allowed for this HTTP request (KC site or enabled reseller host). */
async function isStorefrontInvestAllowed(req) {
    const domain = requestStorefrontDomain(req);
    if (!domain) return true;
    return investEnabledForDomain(domain);
}

async function assertStorefrontInvestAllowed(req) {
    const ok = await isStorefrontInvestAllowed(req);
    if (!ok) {
        const err = new Error('Invest is not available on this storefront');
        err.status = 403;
        throw err;
    }
}

module.exports = {
    requestStorefrontDomain,
    investEnabledForDomain,
    investEnabledForResellerUserId,
    isStorefrontInvestAllowed,
    assertStorefrontInvestAllowed,
};

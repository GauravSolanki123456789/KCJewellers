/**
 * Invest (SIP) — KC main site only. Reseller vanity domains never expose Invest.
 */
const { normalizeDomain } = require('./resellerMetalRates');

function requestStorefrontDomain(req) {
    return (
        normalizeDomain(req.query?.domain) ||
        normalizeDomain(req.headers['x-storefront-domain']) ||
        normalizeDomain(req.headers['x-custom-domain'])
    );
}

async function investEnabledForDomain(domain) {
    const d = normalizeDomain(domain);
    if (!d) return true;
    return false;
}

/** True when Invest is allowed for this HTTP request (KC site only). */
async function isStorefrontInvestAllowed(req) {
    const domain = requestStorefrontDomain(req);
    if (!domain) return true;
    return false;
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
    isStorefrontInvestAllowed,
    assertStorefrontInvestAllowed,
};

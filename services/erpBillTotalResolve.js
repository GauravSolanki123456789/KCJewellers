/**
 * Settlement discount + saved total_inr (matches client erp-billing-display.ts).
 */

function linesNetFromPayload(body, linesRaw) {
    const sessionObj = body.session && typeof body.session === 'object' ? body.session : {};
    const fromSession = Number(sessionObj.netTotalInr);
    if (Number.isFinite(fromSession) && fromSession > 0) {
        return Math.round(fromSession);
    }
    const fromLines = (linesRaw || []).reduce(
        (s, l) => s + (Number(l.lineTotalInr) || 0),
        0,
    );
    if (fromLines > 0) {
        return Math.round(fromLines);
    }
    const fromBody = Number(body.total_inr);
    if (Number.isFinite(fromBody) && fromBody > 0) {
        return Math.round(fromBody);
    }
    return 0;
}

function erpSettledTotalInr(linesNetTotal, explicitCashDiscountInr) {
    const net = Math.round(Number(linesNetTotal) || 0);
    if (
        explicitCashDiscountInr == null ||
        !Number.isFinite(Number(explicitCashDiscountInr))
    ) {
        return net;
    }
    return Math.max(0, net - Math.round(Number(explicitCashDiscountInr)));
}

/**
 * @param {object} body — billing API payload
 * @param {object[]} linesRaw
 * @param {string} billType
 * @param {{ shadowSaleUsesCollected?: boolean }} [opts]
 */
function resolveErpBillTotalFromPayload(body, linesRaw, billType, opts = {}) {
    const sessionObj = body.session && typeof body.session === 'object' ? body.session : {};
    const net = linesNetFromPayload(body, linesRaw);
    const discRaw = sessionObj.cashDiscountInr;
    const explicitDisc =
        discRaw != null && String(discRaw).trim() !== '' && Number.isFinite(Number(discRaw))
            ? Number(discRaw)
            : null;
    if (explicitDisc != null) {
        return erpSettledTotalInr(net, explicitDisc);
    }
    const type = String(billType || body.bill_type || 'sale').toLowerCase();
    const collectedRaw = sessionObj.collectedAmountInr ?? sessionObj.collected_amount_inr;
    const collectedN =
        collectedRaw != null && String(collectedRaw).trim() !== ''
            ? Number(collectedRaw)
            : NaN;
    if (
        opts.shadowSaleUsesCollected !== false &&
        type === 'sale' &&
        Number.isFinite(collectedN) &&
        collectedN > 0
    ) {
        return Math.round(collectedN);
    }
    return net;
}

function ensureSessionNetTotalInr(body, linesRaw) {
    const sessionObj = body.session && typeof body.session === 'object' ? body.session : {};
    const net = linesNetFromPayload(body, linesRaw);
    if (net > 0) {
        sessionObj.netTotalInr = net;
    }
    return sessionObj;
}

module.exports = {
    linesNetFromPayload,
    erpSettledTotalInr,
    resolveErpBillTotalFromPayload,
    ensureSessionNetTotalInr,
};

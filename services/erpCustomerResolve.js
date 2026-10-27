/**
 * Find or create CRM customers without duplicating name + mobile pairs.
 */

const { normalizeCustomerCapsField, normalizeCustomerAddressCaps } = require('./erpCustomerCaps');

function trimStr(v, max = 255) {
    const s = v == null ? '' : String(v).trim();
    return s.length > max ? s.slice(0, max) : s;
}

function normalizeGstin(raw) {
    const s = String(raw || '')
        .trim()
        .toUpperCase()
        .replace(/\s+/g, '');
    return s.length >= 15 ? s.slice(0, 15) : s || null;
}

function normalizePan(raw) {
    const s = String(raw || '')
        .trim()
        .toUpperCase()
        .replace(/\s+/g, '');
    return s.length >= 10 ? s.slice(0, 10) : s || null;
}

function normalizeCustomerRateSlab(raw) {
    const s = String(raw || '')
        .trim()
        .toUpperCase()
        .replace(/^SLAB\s*/, '');
    if (s === 'Q' || s === 'RQUOTE' || s === 'RQ') return 'Q';
    if (s === 'R1') return 'R1';
    if (s === 'W' || s === 'WHOLESALE') return 'W';
    if (s === 'F') return 'F';
    return 'R';
}

function parseDateOrNull(v) {
    const s = trimStr(v, 32);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
    return s;
}

function normalizeCustomerMobileDigits(mobile) {
    const d = String(mobile || '').replace(/\D/g, '');
    if (d.length >= 10) return d.slice(-10);
    return d;
}

function normalizeCustomerNameKey(name) {
    return String(name || '')
        .trim()
        .replace(/\s+/g, ' ')
        .toLowerCase();
}

function customerNamesMatch(a, b) {
    const ka = normalizeCustomerNameKey(a);
    const kb = normalizeCustomerNameKey(b);
    return ka.length > 0 && ka === kb;
}

function mapCustomerRow(row) {
    if (!row) return row;
    return {
        id: row.id,
        name: row.name,
        mobile: row.mobile,
        email: row.email,
        gstin: row.gstin,
        pan: row.pan || null,
        address: row.address,
        state: row.state || null,
        birthdate: row.birthdate,
        anniversary_date: row.anniversary_date,
        notes: row.notes,
        rate_slab: normalizeCustomerRateSlab(row.rate_slab),
        has_shipping_address: row.has_shipping_address === true,
        shipping_address: row.shipping_address,
        created_at: row.created_at,
        updated_at: row.updated_at,
    };
}

async function findErpCustomerByNameAndMobile(query, resellerUserId, name, mobile) {
    const mob = normalizeCustomerMobileDigits(mobile);
    const nameKey = normalizeCustomerNameKey(name);
    if (!nameKey || mob.length !== 10) return null;
    const rows = await query(
        `SELECT * FROM reseller_erp_customers
         WHERE reseller_user_id = $1
           AND RIGHT(regexp_replace(COALESCE(mobile,''), '[^0-9]', '', 'g'), 10) = $2`,
        [resellerUserId, mob],
    );
    return rows.find((r) => customerNamesMatch(r.name, name)) || null;
}

async function findErpCustomerById(query, resellerUserId, id) {
    const cid = parseInt(String(id), 10);
    if (!Number.isFinite(cid) || cid <= 0) return null;
    const rows = await query(
        `SELECT * FROM reseller_erp_customers WHERE id = $1 AND reseller_user_id = $2 LIMIT 1`,
        [cid, resellerUserId],
    );
    return rows[0] || null;
}

function resolveAddressFromBody(body) {
    if (body.address != null && String(body.address).trim()) return body.address;
    return body.billing_address;
}

/**
 * @returns {{ customer: object, created: boolean, matched: boolean } | null}
 */
async function resolveOrCreateErpCustomer(query, resellerUserId, body) {
    const existingId =
        body.customer_id != null ? parseInt(String(body.customer_id), 10) || null : null;
    if (existingId) {
        const row = await findErpCustomerById(query, resellerUserId, existingId);
        if (row) {
            return { customer: mapCustomerRow(row), created: false, matched: true };
        }
    }

    const name = normalizeCustomerCapsField(trimStr(body.name || body.customer_name, 255), 255);
    if (!name) return null;

    const mobileRaw = body.mobile ?? body.customer_mobile ?? '';
    const mobDigits = normalizeCustomerMobileDigits(mobileRaw);

    const found = await findErpCustomerByNameAndMobile(query, resellerUserId, name, mobileRaw);
    if (found) {
        return { customer: mapCustomerRow(found), created: false, matched: true };
    }

    if (mobDigits.length !== 10) {
        return null;
    }

    const billingAddress = normalizeCustomerAddressCaps(resolveAddressFromBody(body));
    const rows = await query(
        `INSERT INTO reseller_erp_customers (
            reseller_user_id, name, mobile, email, gstin, pan, address, state,
            birthdate, anniversary_date, notes, rate_slab,
            has_shipping_address, shipping_address
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
         RETURNING *`,
        [
            resellerUserId,
            name,
            trimStr(mobileRaw, 32),
            trimStr(body.email, 255),
            normalizeGstin(body.gstin || body.customer_gstin),
            normalizePan(body.pan || body.customer_pan),
            billingAddress,
            normalizeCustomerCapsField(trimStr(body.state, 64), 64),
            parseDateOrNull(body.birthdate),
            parseDateOrNull(body.anniversary_date),
            trimStr(body.notes, 2000),
            normalizeCustomerRateSlab(body.rate_slab || body.slab),
            false,
            null,
        ],
    );
    return { customer: mapCustomerRow(rows[0]), created: true, matched: false };
}

function customerFieldsFromBillBody(body) {
    const session =
        body.session && typeof body.session === 'object' ? body.session : {};
    return {
        customer_id: body.customer_id,
        name: body.customer_name,
        customer_name: body.customer_name,
        mobile: session.mobile,
        address: session.address,
        pan: session.pan,
        gstin: session.customerGst,
        birthdate: session.birthdate,
        anniversary_date: session.anniversary_date,
        notes: session.notes,
        rate_slab: session.rateSlab,
    };
}

/** Mutates body.customer_id when a CRM row can be linked or created. */
async function attachResolvedCustomerToBillBody(query, resellerUserId, body) {
    const fields = customerFieldsFromBillBody(body);
    const hasName = trimStr(fields.name || fields.customer_name, 255);
    if (!hasName) return null;
    const resolved = await resolveOrCreateErpCustomer(query, resellerUserId, fields);
    if (resolved?.customer?.id) {
        body.customer_id = resolved.customer.id;
    }
    return resolved;
}

module.exports = {
    normalizeCustomerMobileDigits,
    customerNamesMatch,
    findErpCustomerByNameAndMobile,
    resolveOrCreateErpCustomer,
    attachResolvedCustomerToBillBody,
    mapCustomerRow,
};

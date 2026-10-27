/**
 * Per-reseller website/catalogue and ERP subscription windows.
 * Empty dates + trial off = unlimited (existing accounts keep working).
 * Dates are calendar days in Asia/Kolkata, inclusive of from and to.
 */

const IST = 'Asia/Kolkata';

const MODULES = {
    website: {
        prefix: 'reseller_website',
        label: 'Website & catalogue',
        covers: 'live catalogue, shared catalogue links, and Your website',
    },
    erp: {
        prefix: 'reseller_erp',
        label: 'ERP software',
        covers: 'Jewellery ERP workspace',
    },
};

function todayIstYmd(now = new Date()) {
    return new Intl.DateTimeFormat('en-CA', {
        timeZone: IST,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).format(now);
}

function ymdFromValue(v) {
    if (v == null || v === '') return null;
    if (v instanceof Date && !Number.isNaN(v.getTime())) {
        return v.toISOString().slice(0, 10);
    }
    const s = String(v).trim();
    const m = s.match(/^(\d{4}-\d{2}-\d{2})/);
    return m ? m[1] : null;
}

function parseYmdInput(v) {
    const ymd = ymdFromValue(v);
    if (!ymd) return null;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return null;
    const [y, mo, d] = ymd.split('-').map((n) => parseInt(n, 10));
    if (!y || mo < 1 || mo > 12 || d < 1 || d > 31) return null;
    return ymd;
}

function compareYmd(a, b) {
    if (a === b) return 0;
    return a < b ? -1 : 1;
}

function inInclusiveRange(today, from, to) {
    if (!from || !to) return false;
    return compareYmd(today, from) >= 0 && compareYmd(today, to) <= 0;
}

function formatDisplayDate(ymd) {
    if (!ymd) return '';
    const [y, mo, d] = ymd.split('-').map((n) => parseInt(n, 10));
    if (!y || !mo || !d) return ymd;
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${d} ${months[mo - 1]} ${y}`;
}

function daysBetween(from, to) {
    if (!from || !to) return null;
    const a = Date.parse(`${from}T00:00:00Z`);
    const b = Date.parse(`${to}T00:00:00Z`);
    if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
    return Math.round((b - a) / 86400000);
}

function headlineFor(status, opts) {
    const { paidTo, trialTo, paidFrom, daysLeft } = opts;
    if (status === 'active') {
        if (typeof daysLeft === 'number' && daysLeft >= 0) {
            if (daysLeft === 0) return `Active — last day (${formatDisplayDate(paidTo)})`;
            return `Active — ${daysLeft} day${daysLeft === 1 ? '' : 's'} left`;
        }
        return paidTo ? `Active until ${formatDisplayDate(paidTo)}` : 'Active';
    }
    if (status === 'trial') {
        if (typeof daysLeft === 'number' && daysLeft >= 0) {
            if (daysLeft === 0) return `Free trial — last day (${formatDisplayDate(trialTo)})`;
            return `Free trial — ${daysLeft} day${daysLeft === 1 ? '' : 's'} left`;
        }
        return trialTo ? `Free trial until ${formatDisplayDate(trialTo)}` : 'Free trial';
    }
    if (status === 'trial_over') return 'Free trial expired';
    if (status === 'expired') return 'Subscription expired';
    if (status === 'not_started') {
        return paidFrom ? `Starts ${formatDisplayDate(paidFrom)}` : 'Not started';
    }
    return 'Unlimited';
}

function detailFor(_moduleKey, _status) {
    return '';
}

function publicHeadlineFor(status) {
    if (status === 'trial_over') return 'Free trial expired';
    if (status === 'expired') return 'Subscription expired';
    if (status === 'not_started') return 'Catalogue unavailable';
    return '';
}

function publicDetailFor(_status) {
    return '';
}

function evaluateModule(moduleKey, dates, today = todayIstYmd()) {
    const paidFrom = parseYmdInput(dates.paidFrom);
    const paidTo = parseYmdInput(dates.paidTo);
    const trialEnabled = !!dates.trialEnabled;
    const trialFrom = parseYmdInput(dates.trialFrom);
    const trialTo = parseYmdInput(dates.trialTo);

    const paidConfigured = !!(paidFrom && paidTo);
    const trialConfigured = !!(trialEnabled && trialFrom && trialTo);
    const paidActive = paidConfigured && inInclusiveRange(today, paidFrom, paidTo);
    const trialActive = trialConfigured && inInclusiveRange(today, trialFrom, trialTo);

    let status = 'open';
    let hasAccess = true;
    let daysLeft = null;
    let activeUntil = null;

    if (paidActive) {
        status = 'active';
        hasAccess = true;
        daysLeft = daysBetween(today, paidTo);
        activeUntil = paidTo;
    } else if (trialActive) {
        status = 'trial';
        hasAccess = true;
        daysLeft = daysBetween(today, trialTo);
        activeUntil = trialTo;
    } else if (!paidConfigured && !trialConfigured) {
        status = 'open';
        hasAccess = true;
    } else if (paidConfigured && compareYmd(today, paidTo) > 0) {
        status = 'expired';
        hasAccess = false;
    } else if (trialConfigured && compareYmd(today, trialTo) > 0) {
        status = 'trial_over';
        hasAccess = false;
    } else if (paidConfigured && compareYmd(today, paidFrom) < 0) {
        status = 'not_started';
        hasAccess = false;
    } else if (trialConfigured && compareYmd(today, trialFrom) < 0) {
        status = 'not_started';
        hasAccess = false;
    } else {
        status = 'open';
        hasAccess = true;
    }

    return {
        module: moduleKey,
        label: MODULES[moduleKey].label,
        from_date: paidFrom,
        to_date: paidTo,
        trial_enabled: trialEnabled,
        trial_from_date: trialFrom,
        trial_to_date: trialTo,
        status,
        hasAccess,
        configured: paidConfigured || trialConfigured,
        days_left: daysLeft,
        active_until: activeUntil,
        headline: headlineFor(status, {
            paidTo,
            trialTo,
            paidFrom: paidFrom || trialFrom,
            daysLeft,
        }),
        detail: detailFor(moduleKey, status),
        public_headline: publicHeadlineFor(status),
        public_detail: publicDetailFor(status),
        blocked: !hasAccess,
    };
}

function emptyDates() {
    return {
        paidFrom: null,
        paidTo: null,
        trialEnabled: false,
        trialFrom: null,
        trialTo: null,
    };
}

function datesFromRow(row, prefix) {
    if (!row) return emptyDates();
    return {
        paidFrom: row[`${prefix}_from_date`],
        paidTo: row[`${prefix}_to_date`],
        trialEnabled: !!row[`${prefix}_trial_enabled`],
        trialFrom: row[`${prefix}_trial_from_date`],
        trialTo: row[`${prefix}_trial_to_date`],
    };
}

function evaluateFromRow(row, today = todayIstYmd()) {
    return {
        website: evaluateModule('website', datesFromRow(row, 'reseller_website'), today),
        erp: evaluateModule('erp', datesFromRow(row, 'reseller_erp'), today),
    };
}

const SUBSCRIPTION_COLUMNS_SQL = `
    to_char(reseller_website_from_date, 'YYYY-MM-DD') AS reseller_website_from_date,
    to_char(reseller_website_to_date, 'YYYY-MM-DD') AS reseller_website_to_date,
    COALESCE(reseller_website_trial_enabled, false) AS reseller_website_trial_enabled,
    to_char(reseller_website_trial_from_date, 'YYYY-MM-DD') AS reseller_website_trial_from_date,
    to_char(reseller_website_trial_to_date, 'YYYY-MM-DD') AS reseller_website_trial_to_date,
    to_char(reseller_erp_from_date, 'YYYY-MM-DD') AS reseller_erp_from_date,
    to_char(reseller_erp_to_date, 'YYYY-MM-DD') AS reseller_erp_to_date,
    COALESCE(reseller_erp_trial_enabled, false) AS reseller_erp_trial_enabled,
    to_char(reseller_erp_trial_from_date, 'YYYY-MM-DD') AS reseller_erp_trial_from_date,
    to_char(reseller_erp_trial_to_date, 'YYYY-MM-DD') AS reseller_erp_trial_to_date
`;

async function ensureResellerSubscriptionColumns(pool) {
    if (!pool || typeof pool.query !== 'function') return;
    await pool.query(`
        ALTER TABLE users
            ADD COLUMN IF NOT EXISTS reseller_website_from_date DATE,
            ADD COLUMN IF NOT EXISTS reseller_website_to_date DATE,
            ADD COLUMN IF NOT EXISTS reseller_website_trial_enabled BOOLEAN NOT NULL DEFAULT false,
            ADD COLUMN IF NOT EXISTS reseller_website_trial_from_date DATE,
            ADD COLUMN IF NOT EXISTS reseller_website_trial_to_date DATE,
            ADD COLUMN IF NOT EXISTS reseller_erp_from_date DATE,
            ADD COLUMN IF NOT EXISTS reseller_erp_to_date DATE,
            ADD COLUMN IF NOT EXISTS reseller_erp_trial_enabled BOOLEAN NOT NULL DEFAULT false,
            ADD COLUMN IF NOT EXISTS reseller_erp_trial_from_date DATE,
            ADD COLUMN IF NOT EXISTS reseller_erp_trial_to_date DATE
    `);
}

function openPayload(moduleKey) {
    return evaluateModule(moduleKey, emptyDates());
}

function compactPublic(access) {
    if (!access) {
        return { hasAccess: true, status: 'open', headline: '', detail: '' };
    }
    return {
        hasAccess: !!access.hasAccess,
        status: access.status,
        headline: access.hasAccess ? '' : access.public_headline || access.headline,
        detail: access.hasAccess ? '' : access.public_detail || access.detail,
    };
}

async function loadResellerSubscriptions(query, userId) {
    const id = parseInt(String(userId), 10);
    const fallback = {
        website: openPayload('website'),
        erp: openPayload('erp'),
    };
    if (!Number.isFinite(id) || id <= 0) return fallback;
    try {
        const rows = await query(
            `SELECT ${SUBSCRIPTION_COLUMNS_SQL} FROM users WHERE id = $1 LIMIT 1`,
            [id],
        );
        if (!rows.length) return fallback;
        return evaluateFromRow(rows[0]);
    } catch (e) {
        const msg = String(e.message || '');
        if (msg.includes('reseller_website_') || msg.includes('reseller_erp_from') || msg.includes('reseller_erp_trial')) {
            return fallback;
        }
        throw e;
    }
}

async function getWebsiteModuleAccess(query, userId) {
    const subs = await loadResellerSubscriptions(query, userId);
    return subs.website;
}

async function getErpModuleAccess(query, userId) {
    const subs = await loadResellerSubscriptions(query, userId);
    return subs.erp;
}

function applySubscriptionBody(body, updates, params, paramIndexRef) {
    const pairs = [
        ['reseller_website_from_date', parseYmdInput(body.reseller_website_from_date)],
        ['reseller_website_to_date', parseYmdInput(body.reseller_website_to_date)],
        ['reseller_website_trial_from_date', parseYmdInput(body.reseller_website_trial_from_date)],
        ['reseller_website_trial_to_date', parseYmdInput(body.reseller_website_trial_to_date)],
        ['reseller_erp_from_date', parseYmdInput(body.reseller_erp_from_date)],
        ['reseller_erp_to_date', parseYmdInput(body.reseller_erp_to_date)],
        ['reseller_erp_trial_from_date', parseYmdInput(body.reseller_erp_trial_from_date)],
        ['reseller_erp_trial_to_date', parseYmdInput(body.reseller_erp_trial_to_date)],
    ];
    let wrote = false;
    for (const [col, val] of pairs) {
        if (body[col] === undefined) continue;
        updates.push(`${col} = $${paramIndexRef.value++}`);
        params.push(val);
        wrote = true;
    }
    if (body.reseller_website_trial_enabled !== undefined) {
        updates.push(`reseller_website_trial_enabled = $${paramIndexRef.value++}`);
        params.push(!!body.reseller_website_trial_enabled);
        wrote = true;
    }
    if (body.reseller_erp_trial_enabled !== undefined) {
        updates.push(`reseller_erp_trial_enabled = $${paramIndexRef.value++}`);
        params.push(!!body.reseller_erp_trial_enabled);
        wrote = true;
    }
    return wrote;
}

function attachSubscriptionFields(userRow) {
    if (!userRow) return userRow;
    const evald = evaluateFromRow(userRow);
    return {
        ...userRow,
        reseller_website_from_date: evald.website.from_date,
        reseller_website_to_date: evald.website.to_date,
        reseller_website_trial_enabled: evald.website.trial_enabled,
        reseller_website_trial_from_date: evald.website.trial_from_date,
        reseller_website_trial_to_date: evald.website.trial_to_date,
        reseller_erp_from_date: evald.erp.from_date,
        reseller_erp_to_date: evald.erp.to_date,
        reseller_erp_trial_enabled: evald.erp.trial_enabled,
        reseller_erp_trial_from_date: evald.erp.trial_from_date,
        reseller_erp_trial_to_date: evald.erp.trial_to_date,
        reseller_website_subscription: evald.website,
        reseller_erp_subscription: evald.erp,
    };
}

function denialCode(access) {
    if (!access || access.hasAccess) return null;
    if (access.status === 'trial_over') return 'RESELLER_TRIAL_OVER';
    if (access.status === 'not_started') return 'RESELLER_NOT_STARTED';
    return 'RESELLER_SUBSCRIPTION_EXPIRED';
}

function denialError(access) {
    if (!access || access.hasAccess) return null;
    return {
        error: access.detail || access.headline,
        code: denialCode(access),
        status: access.status,
        headline: access.headline,
        module: access.module,
    };
}

module.exports = {
    MODULES,
    SUBSCRIPTION_COLUMNS_SQL,
    todayIstYmd,
    parseYmdInput,
    ymdFromValue,
    evaluateModule,
    evaluateFromRow,
    ensureResellerSubscriptionColumns,
    loadResellerSubscriptions,
    getWebsiteModuleAccess,
    getErpModuleAccess,
    applySubscriptionBody,
    attachSubscriptionFields,
    compactPublic,
    openPayload,
    denialError,
    denialCode,
};

/**
 * Reseller ERP — silver jewellery / silver article running tags (9-digit barcodes + gram balance).
 */

const { requireErpModule } = require('./resellerErpOperators');

const KINDS = ['jewellery', 'articles'];
const KIND_LABELS = {
    jewellery: 'Silver jewellery',
    articles: 'Silver articles',
};

function roundGm(n) {
    const v = Number(n);
    if (!Number.isFinite(v)) return 0;
    return Math.round(v * 1000) / 1000;
}

function formatGm(n) {
    return `${roundGm(n).toLocaleString('en-IN', { maximumFractionDigits: 3, minimumFractionDigits: 0 })} g`;
}

function normalizeKind(raw) {
    const k = String(raw || '')
        .trim()
        .toLowerCase();
    if (k === 'jewelry' || k === 'silver_jewellery' || k === 'silver-jewellery') return 'jewellery';
    if (k === 'article' || k === 'silver_articles' || k === 'silver-articles') return 'articles';
    return KINDS.includes(k) ? k : null;
}

function randomNineDigit() {
    let s = String(Math.floor(Math.random() * 9) + 1);
    for (let i = 0; i < 8; i += 1) s += String(Math.floor(Math.random() * 10));
    return s;
}

async function ensureRunningTagsSchema(pool) {
    await pool.query(`
        CREATE TABLE IF NOT EXISTS reseller_erp_running_tags (
            id SERIAL PRIMARY KEY,
            reseller_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            kind VARCHAR(24) NOT NULL,
            barcode VARCHAR(16) NOT NULL,
            balance_gm NUMERIC(14, 3) NOT NULL DEFAULT 0,
            generated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
            CONSTRAINT reseller_erp_running_tags_kind_chk
                CHECK (kind IN ('jewellery', 'articles')),
            UNIQUE (reseller_user_id, kind),
            UNIQUE (reseller_user_id, barcode)
        );
        CREATE INDEX IF NOT EXISTS idx_reseller_erp_running_tags_reseller
            ON reseller_erp_running_tags (reseller_user_id);
    `);
}

function mapTag(row) {
    if (!row) return null;
    const balanceGm = roundGm(row.balance_gm);
    return {
        id: row.id,
        kind: row.kind,
        label: KIND_LABELS[row.kind] || row.kind,
        barcode: String(row.barcode || '').trim(),
        balance_gm: balanceGm,
        generated_at: row.generated_at,
        updated_at: row.updated_at,
    };
}

async function listRunningTags(query, resellerUserId) {
    const rows = await query(
        `SELECT * FROM reseller_erp_running_tags
         WHERE reseller_user_id = $1
         ORDER BY kind ASC`,
        [resellerUserId],
    );
    return rows.map(mapTag);
}

async function loadRunningTagBarcodeSet(query, resellerUserId) {
    const rows = await query(
        `SELECT barcode FROM reseller_erp_running_tags WHERE reseller_user_id = $1`,
        [resellerUserId],
    );
    const set = new Set();
    for (const row of rows) {
        const bc = String(row.barcode || '').trim().toLowerCase();
        if (bc) set.add(bc);
    }
    return set;
}

async function loadRunningTagByBarcode(query, resellerUserId, barcode) {
    const bc = String(barcode || '').trim();
    if (!bc) return null;
    const rows = await query(
        `SELECT * FROM reseller_erp_running_tags
         WHERE reseller_user_id = $1 AND lower(trim(barcode)) = lower($2)
         LIMIT 1`,
        [resellerUserId, bc],
    );
    return rows[0] ? mapTag(rows[0]) : null;
}

function lineNetWeightGm(line) {
    const og = Number(line && line.originalWeightGm);
    const wg = Number(line && line.weightGm);
    if (Number.isFinite(og) && og > 0) return roundGm(og);
    if (Number.isFinite(wg) && wg > 0) return roundGm(wg);
    return 0;
}

async function saleWeightOnRunningTagSql() {
    return `COALESCE(SUM(
                CASE
                    WHEN b.bill_type = 'sale' THEN COALESCE(
                        NULLIF(line->>'originalWeightGm', '')::numeric,
                        NULLIF(line->>'weightGm', '')::numeric,
                        0
                    )
                    WHEN b.bill_type = 'sales_return' THEN -COALESCE(
                        NULLIF(line->>'originalWeightGm', '')::numeric,
                        NULLIF(line->>'weightGm', '')::numeric,
                        0
                    )
                    ELSE 0
                END
            ), 0)`;
}

async function gstSoldGmForRunningTag(query, resellerUserId, barcode) {
    const soldRows = await query(
        `SELECT ${await saleWeightOnRunningTagSql()} AS gm
         FROM reseller_erp_bills b,
              jsonb_array_elements(COALESCE(b.lines_json, '[]'::jsonb)) AS line
         WHERE b.reseller_user_id = $1
           AND b.bill_type IN ('sale', 'sales_return')
           AND lower(COALESCE(b.status, '')) IN ('completed', 'paid', 'final', 'issued')
           AND (
                lower(trim(COALESCE(line->>'barcode', ''))) = lower($2)
                OR lower(trim(COALESCE(line->>'code', ''))) = lower($2)
           )`,
        [resellerUserId, barcode],
    );
    return roundGm(soldRows[0]?.gm);
}

const RUNNING_TAG_PIECE_MATCH = `(
    lower(trim(barcode)) = lower($2)
    OR lower(trim(barcode)) LIKE lower($2) || '~%'
    OR lower(COALESCE(payload_json->>'running_tag_barcode', '')) = lower($2)
)`;

/** Jainav / shadow bills on this running tag (draft + final; excludes void). */
async function jainavSoldGmForRunningTag(query, resellerUserId, barcode) {
    try {
        const soldRows = await query(
            `SELECT ${await saleWeightOnRunningTagSql()} AS gm
             FROM reseller_erp_shadow_bills b,
                  jsonb_array_elements(COALESCE(b.lines_json, '[]'::jsonb)) AS line
             WHERE b.reseller_user_id = $1
               AND b.bill_type IN ('sale', 'sales_return')
               AND lower(COALESCE(b.status, '')) NOT IN ('cancelled', 'canceled', 'void')
               AND (
                    lower(trim(COALESCE(line->>'barcode', ''))) = lower($2)
                    OR lower(trim(COALESCE(line->>'code', ''))) = lower($2)
               )`,
            [resellerUserId, barcode],
        );
        return roundGm(soldRows[0]?.gm);
    } catch {
        return 0;
    }
}

async function sumRunningTagIntakeGm(query, resellerUserId, barcode, mode) {
    const statusSql =
        mode === 'shadow'
            ? `status = 'shadow_sold'`
            : `status IN ('in_stock', 'reserved')`;
    const rows = await query(
        `SELECT COALESCE(SUM(avg_weight), 0) AS gm
         FROM reseller_erp_stock_pieces
         WHERE reseller_user_id = $1
           AND ${statusSql}
           AND ${RUNNING_TAG_PIECE_MATCH}`,
        [resellerUserId, barcode],
    );
    return roundGm(rows[0]?.gm);
}

async function recomputeRunningTagBalances(query, resellerUserId, opts = {}) {
    const tags = await query(
        `SELECT * FROM reseller_erp_running_tags WHERE reseller_user_id = $1`,
        [resellerUserId],
    );
    const out = [];
    const jainavBooks = opts.includeAllSales === true;
    for (const tag of tags) {
        const barcode = String(tag.barcode || '').trim();
        if (!barcode) continue;
        const gstSoldGm = await gstSoldGmForRunningTag(query, resellerUserId, barcode);
        const intakeBookGm = await sumRunningTagIntakeGm(query, resellerUserId, barcode, 'book');
        const intakeShadowGm = await sumRunningTagIntakeGm(query, resellerUserId, barcode, 'shadow');
        const jainavSoldGm = jainavBooks
            ? await jainavSoldGmForRunningTag(query, resellerUserId, barcode)
            : 0;
        const normalBalanceGm = roundGm(intakeBookGm - gstSoldGm);
        const jainavBalanceGm = roundGm(
            intakeBookGm + intakeShadowGm - gstSoldGm - jainavSoldGm,
        );
        const storedGm = normalBalanceGm;
        const displayGm = jainavBooks ? jainavBalanceGm : normalBalanceGm;
        const updated = await query(
            `UPDATE reseller_erp_running_tags
             SET balance_gm = $1, updated_at = NOW()
             WHERE id = $2
             RETURNING *`,
            [storedGm, tag.id],
        );
        out.push(mapTag({ ...(updated[0] || tag), balance_gm: displayGm }));
    }
    return out;
}

async function barcodeTaken(query, resellerUserId, barcode) {
    const bc = String(barcode || '').trim();
    if (!bc) return true;
    const tagHit = await query(
        `SELECT 1 FROM reseller_erp_running_tags
         WHERE reseller_user_id = $1 AND barcode = $2 LIMIT 1`,
        [resellerUserId, bc],
    );
    if (tagHit.length) return true;
    const pieceHit = await query(
        `SELECT 1 FROM reseller_erp_stock_pieces
         WHERE reseller_user_id = $1 AND barcode = $2 LIMIT 1`,
        [resellerUserId, bc],
    );
    return pieceHit.length > 0;
}

async function generateUniqueNineDigit(query, resellerUserId) {
    for (let i = 0; i < 80; i += 1) {
        const candidate = randomNineDigit();
        if (!(await barcodeTaken(query, resellerUserId, candidate))) return candidate;
    }
    throw new Error('Could not generate a unique 9-digit running tag. Try again.');
}

async function generateRunningTag(query, resellerUserId, kindRaw) {
    const kind = normalizeKind(kindRaw);
    if (!kind) throw Object.assign(new Error('kind must be jewellery or articles'), { status: 400 });
    const existing = await query(
        `SELECT * FROM reseller_erp_running_tags
         WHERE reseller_user_id = $1 AND kind = $2 LIMIT 1`,
        [resellerUserId, kind],
    );
    if (existing.length) {
        throw Object.assign(
            new Error(`${KIND_LABELS[kind]} running tag is already generated. It can only be created once.`),
            { status: 409, tag: mapTag(existing[0]) },
        );
    }
    const barcode = await generateUniqueNineDigit(query, resellerUserId);
    const rows = await query(
        `INSERT INTO reseller_erp_running_tags (reseller_user_id, kind, barcode, balance_gm)
         VALUES ($1, $2, $3, 0)
         RETURNING *`,
        [resellerUserId, kind, barcode],
    );
    return mapTag(rows[0]);
}

async function findCompletedSaleForBarcode(query, resellerUserId, barcode) {
    const bc = String(barcode || '').trim();
    if (!bc) return null;
    const rows = await query(
        `SELECT b.id, b.bill_number
         FROM reseller_erp_bills b,
              jsonb_array_elements(COALESCE(b.lines_json, '[]'::jsonb)) AS line
         WHERE b.reseller_user_id = $1
           AND b.bill_type = 'sale'
           AND lower(COALESCE(b.status, '')) IN ('completed', 'paid', 'final', 'issued')
           AND (
                lower(trim(COALESCE(line->>'barcode', ''))) = lower($2)
                OR lower(trim(COALESCE(line->>'code', ''))) = lower($2)
           )
         ORDER BY b.created_at DESC
         LIMIT 1`,
        [resellerUserId, bc],
    );
    return rows[0] || null;
}

const RUNNING_TAG_WEIGHT_MATCH_EPS_GM = 0.05;

const BILL_LINE_WEIGHT_SQL = `COALESCE(
    NULLIF(line->>'originalWeightGm', '')::numeric,
    NULLIF(line->>'weightGm', '')::numeric,
    0
)`;

const RUNNING_TAG_LINE_BARCODE_MATCH = `(
    lower(trim(COALESCE(line->>'barcode', ''))) = lower($2)
    OR lower(trim(COALESCE(line->>'code', ''))) = lower($2)
)`;

/**
 * GST / completed sale line on a running tag with matching net weight (±0.05 g).
 */
async function findOfficialRunningTagSaleLine(query, resellerUserId, runningTagBarcode, weightGm) {
    const bc = String(runningTagBarcode || '').trim();
    const targetWt = roundGm(weightGm);
    if (!bc || targetWt <= 0) return null;
    const rows = await query(
        `SELECT b.id, b.bill_number, 'official' AS source
         FROM reseller_erp_bills b,
              jsonb_array_elements(COALESCE(b.lines_json, '[]'::jsonb)) AS line
         WHERE b.reseller_user_id = $1
           AND b.bill_type = 'sale'
           AND lower(COALESCE(b.status, '')) IN ('completed', 'paid', 'final', 'issued')
           AND ${RUNNING_TAG_LINE_BARCODE_MATCH}
           AND ABS(${BILL_LINE_WEIGHT_SQL} - $3::numeric) <= $4::numeric
         ORDER BY b.created_at DESC
         LIMIT 1`,
        [resellerUserId, bc, targetWt, RUNNING_TAG_WEIGHT_MATCH_EPS_GM],
    );
    return rows[0] || null;
}

/**
 * Jainav / shadow sale line on a running tag with matching net weight (±0.05 g).
 */
async function findShadowRunningTagSaleLine(query, resellerUserId, runningTagBarcode, weightGm) {
    const bc = String(runningTagBarcode || '').trim();
    const targetWt = roundGm(weightGm);
    if (!bc || targetWt <= 0) return null;
    const rows = await query(
        `SELECT b.id, b.bill_number, 'jainav' AS source
         FROM reseller_erp_shadow_bills b,
              jsonb_array_elements(COALESCE(b.lines_json, '[]'::jsonb)) AS line
         WHERE b.reseller_user_id = $1
           AND b.bill_type = 'sale'
           AND lower(COALESCE(b.status, '')) NOT IN ('cancelled', 'canceled', 'void')
           AND ${RUNNING_TAG_LINE_BARCODE_MATCH}
           AND ABS(${BILL_LINE_WEIGHT_SQL} - $3::numeric) <= $4::numeric
         ORDER BY b.created_at DESC
         LIMIT 1`,
        [resellerUserId, bc, targetWt, RUNNING_TAG_WEIGHT_MATCH_EPS_GM],
    );
    return rows[0] || null;
}

/**
 * PV Excel running-tag row: mark sold only when bill line uses that tag barcode AND same weight.
 * Never match by weight alone on a different stock barcode (PY-xxxxx).
 */
async function findSaleForRunningTagUpload(query, resellerUserId, runningTagBarcode, weightGm) {
    const bc = String(runningTagBarcode || '').trim();
    if (!bc) return null;
    const official = await findOfficialRunningTagSaleLine(query, resellerUserId, bc, weightGm);
    if (official) return official;
    try {
        const shadow = await findShadowRunningTagSaleLine(query, resellerUserId, bc, weightGm);
        if (shadow) return shadow;
    } catch {
        /* shadow optional */
    }
    return null;
}

/** Any official sale (incl. draft) or Jainav/shadow bill that used this barcode — for marking uploaded stock sold. */
async function findAnySaleForBarcode(query, resellerUserId, barcode) {
    const bc = String(barcode || '').trim();
    if (!bc) return null;
    const official = await query(
        `SELECT b.id, b.bill_number, 'official' AS source
         FROM reseller_erp_bills b,
              jsonb_array_elements(COALESCE(b.lines_json, '[]'::jsonb)) AS line
         WHERE b.reseller_user_id = $1
           AND b.bill_type = 'sale'
           AND lower(COALESCE(b.status, '')) NOT IN ('cancelled', 'canceled', 'void')
           AND (
                lower(trim(COALESCE(line->>'barcode', ''))) = lower($2)
                OR lower(trim(COALESCE(line->>'code', ''))) = lower($2)
           )
         ORDER BY b.created_at DESC
         LIMIT 1`,
        [resellerUserId, bc],
    );
    if (official[0]) return official[0];
    try {
        const shadow = await query(
            `SELECT b.id, b.bill_number, 'jainav' AS source
             FROM reseller_erp_shadow_bills b,
                  jsonb_array_elements(COALESCE(b.lines_json, '[]'::jsonb)) AS line
             WHERE b.reseller_user_id = $1
               AND b.bill_type = 'sale'
               AND lower(COALESCE(b.status, '')) NOT IN ('cancelled', 'canceled', 'void')
               AND (
                    lower(trim(COALESCE(line->>'barcode', ''))) = lower($2)
                    OR lower(trim(COALESCE(line->>'code', ''))) = lower($2)
               )
             ORDER BY b.created_at DESC
             LIMIT 1`,
            [resellerUserId, bc],
        );
        if (shadow[0]) return shadow[0];
    } catch {
        /* shadow table may not exist on a fresh DB */
    }
    return null;
}

function registerResellerErpRunningTagRoutes(app, deps) {
    const { query, pool, checkAuth, requireJson, erpGate } = deps;
    const generateGate = requireErpModule('running-tags');

    ensureRunningTagsSchema(pool).catch((e) => console.warn('erp running tags schema:', e.message));

    app.get('/api/reseller/erp/running-tags', checkAuth, erpGate, async (req, res) => {
        try {
            const refresh = String(req.query.refresh || '') === '1';
            const includeAllSales = req.session?.shadowUnlocked === true;
            const tags = refresh
                ? await recomputeRunningTagBalances(query, req.user.id, { includeAllSales })
                : (includeAllSales
                    ? await recomputeRunningTagBalances(query, req.user.id, { includeAllSales: true })
                    : await listRunningTags(query, req.user.id));
            const byKind = { jewellery: null, articles: null };
            for (const t of tags) {
                if (t && KINDS.includes(t.kind)) byKind[t.kind] = t;
            }
            res.json({ tags: byKind, list: tags });
        } catch (e) {
            console.error('erp running tags list:', e);
            res.status(500).json({ error: e.message || 'Failed to load running tags' });
        }
    });

    app.post('/api/reseller/erp/running-tags/generate', checkAuth, erpGate, generateGate, requireJson, async (req, res) => {
        try {
            const tag = await generateRunningTag(query, req.user.id, req.body.kind);
            res.json({ success: true, tag });
        } catch (e) {
            if (e.status === 409) return res.status(409).json({ error: e.message, tag: e.tag });
            if (e.status === 400) return res.status(400).json({ error: e.message });
            console.error('erp running tags generate:', e);
            res.status(500).json({ error: e.message || 'Failed to generate running tag' });
        }
    });
}

module.exports = {
    KINDS,
    KIND_LABELS,
    ensureRunningTagsSchema,
    registerResellerErpRunningTagRoutes,
    loadRunningTagBarcodeSet,
    loadRunningTagByBarcode,
    recomputeRunningTagBalances,
    findCompletedSaleForBarcode,
    findAnySaleForBarcode,
    findSaleForRunningTagUpload,
    lineNetWeightGm,
    roundGm,
    formatGm,
    mapTag,
};

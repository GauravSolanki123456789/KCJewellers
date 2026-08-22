/**
 * Inbound API for Posh RFID gun — they call YOUR server with API key + store ID.
 * Configure apiKey + storeId in ERP → Hardware → RFID API (same fields you give Posh developer).
 */
const poshRfid = require('./poshRfid');

function piecePayload(row, storeId) {
    return {
        rfid_tag: poshRfid.normalizeRfidTag(row.rfid_tag),
        barcode: String(row.barcode || '').trim(),
        sku: row.sku || null,
        product_name: row.product_name || row.item_code || null,
        item_code: row.item_code || null,
        weight_gm: row.avg_weight != null ? Number(row.avg_weight) : null,
        gross_weight_gm: row.gross_weight != null ? Number(row.gross_weight) : null,
        metal_type: row.metal_type || null,
        status: 'in_stock',
        store_id: storeId,
        floor_name: row.floor_name || null,
        box_code: row.box_code || null,
        box_name: row.box_label || row.box_code || null,
    };
}

async function resolveResellerByPoshCredentials(query, apiKey, storeId) {
    const key = String(apiKey || '').trim();
    const store = String(storeId || '').trim();
    if (!key || !store) return null;
    const rows = await query(
        `SELECT reseller_user_id, settings FROM reseller_erp_settings WHERE settings IS NOT NULL`,
    );
    for (const row of rows) {
        let settings = row.settings;
        if (typeof settings === 'string') {
            try {
                settings = JSON.parse(settings);
            } catch {
                continue;
            }
        }
        const cfg = poshRfid.getPoshConfigFromSettings(settings);
        if (cfg.apiKey && cfg.storeId && cfg.apiKey === key && cfg.storeId === store) {
            return row.reseller_user_id;
        }
    }
    return null;
}

function poshInboundAuth(query) {
    return async (req, res, next) => {
        try {
            const apiKey =
                req.headers['x-api-key'] ||
                (req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
            const storeId = req.headers['x-store-id'] || req.query.store_id || req.query.storeId;
            const resellerUserId = await resolveResellerByPoshCredentials(query, apiKey, storeId);
            if (!resellerUserId) {
                return res.status(401).json({ error: 'Invalid API key or store ID' });
            }
            req.poshResellerUserId = resellerUserId;
            req.poshStoreId = String(storeId).trim();
            next();
        } catch (e) {
            res.status(500).json({ error: e.message || 'Auth failed' });
        }
    };
}

function registerPoshRfidInboundRoutes(app, { query }) {
    const auth = poshInboundAuth(query);

    app.get('/api/external/posh-rfid/v1/inventory', auth, async (req, res) => {
        try {
            const rows = await query(
                `SELECT p.*,
                        f.name AS floor_name,
                        f.code AS floor_code,
                        b.code AS box_code,
                        b.label AS box_label
                 FROM reseller_erp_stock_pieces p
                 LEFT JOIN reseller_erp_floors f ON f.id = p.floor_id
                 LEFT JOIN reseller_erp_boxes b ON b.id = p.box_id
                 WHERE p.reseller_user_id = $1
                   AND p.status = 'in_stock'
                   AND p.rfid_tag IS NOT NULL`,
                [req.poshResellerUserId],
            );
            res.json({
                store_id: req.poshStoreId,
                count: rows.length,
                items: rows.map((r) => piecePayload(r, req.poshStoreId)),
            });
        } catch (e) {
            console.error('posh inbound inventory:', e);
            res.status(500).json({ error: e.message || 'Failed to list inventory' });
        }
    });

    app.get('/api/external/posh-rfid/v1/health', auth, (req, res) => {
        res.json({ ok: true, store_id: req.poshStoreId });
    });
}

module.exports = { registerPoshRfidInboundRoutes, resolveResellerByPoshCredentials };

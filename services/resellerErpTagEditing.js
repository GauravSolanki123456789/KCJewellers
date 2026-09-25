/**
 * Reseller ERP — rapid tag / barcode edit & reprint (stock pieces).
 */

const poshRfid = require('./poshRfid');
const { mapPiece, syncStockAlertCounts } = require('./resellerErpStockPieces');
const { requireErpModule } = require('./resellerErpOperators');

const EDITABLE_KEYS = new Set([
    'status',
    'barcode',
    'sku',
    'style_code',
    'product_name',
    'size',
    'avg_weight',
    'gross_weight',
    'bag_wt',
    'purity',
    'wastage_pct',
    'mc_rate',
    'mc_rate_slab_r',
    'mc_rate_slab_w',
    'mc_rate_slab_f',
    'metal_slab_r_pct',
    'metal_slab_w_pct',
    'metal_slab_f_pct',
    'mc_type',
    'pcs',
    'box_charges',
    'stone_charges',
    'stone_wt',
    'metal_type',
    'item_code',
    'image_url',
    'attr_color',
    'attr_stone',
    'fixed_price',
    'chain_wt_only',
    'pendant_wt_only',
    'earring_wt_only',
    'bags',
    'rfid_tag',
]);

const NUMERIC_KEYS = new Set([
    'avg_weight',
    'gross_weight',
    'bag_wt',
    'purity',
    'wastage_pct',
    'mc_rate',
    'mc_rate_slab_r',
    'mc_rate_slab_w',
    'mc_rate_slab_f',
    'metal_slab_r_pct',
    'metal_slab_w_pct',
    'metal_slab_f_pct',
    'pcs',
    'box_charges',
    'stone_charges',
    'stone_wt',
    'fixed_price',
    'chain_wt_only',
    'pendant_wt_only',
    'earring_wt_only',
]);

const STATUS_VALUES = new Set(['in_stock', 'sold', 'reserved', 'cancelled', 'lane', 'shadow_sold']);

function numOrNull(v) {
    if (v === null || v === undefined || v === '') return null;
    const n = Number(String(v).replace(/,/g, '').trim());
    return Number.isFinite(n) ? n : null;
}

function intPcs(v) {
    const n = parseInt(String(v), 10);
    return Number.isFinite(n) && n > 0 ? n : 1;
}

function strOrNull(v) {
    if (v === null || v === undefined) return null;
    const s = String(v).trim();
    return s || null;
}

function normalizePatch(raw) {
    const patch = {};
    if (!raw || typeof raw !== 'object') return patch;
    for (const [key, val] of Object.entries(raw)) {
        if (!EDITABLE_KEYS.has(key)) continue;
        if (key === 'status') {
            const s = strOrNull(val);
            if (s && STATUS_VALUES.has(s)) patch.status = s;
            continue;
        }
        if (key === 'pcs') {
            patch.pcs = intPcs(val);
            continue;
        }
        if (key === 'rfid_tag') {
            const t = val ? poshRfid.normalizeRfidTag(val) : null;
            patch.rfid_tag = t || null;
            continue;
        }
        if (NUMERIC_KEYS.has(key)) {
            patch[key] = numOrNull(val);
            continue;
        }
        patch[key] = strOrNull(val);
    }
    return patch;
}

async function findPieceByScan(query, resellerUserId, code) {
    const q = String(code || '').trim();
    if (!q) return null;
    const rows = await query(
        `SELECT * FROM reseller_erp_stock_pieces
         WHERE reseller_user_id = $1
           AND (
             lower(trim(barcode)) = lower(trim($2))
             OR lower(trim(COALESCE(rfid_tag, ''))) = lower(trim($2))
           )
         ORDER BY CASE WHEN status = 'in_stock' THEN 0 ELSE 1 END, updated_at DESC
         LIMIT 1`,
        [resellerUserId, q],
    );
    return rows[0] || null;
}

function registerTagEditingRoutes(app, deps) {
    const { query, checkAuth, requireJson, erpGate } = deps;
    const modGate = requireErpModule('tag-editing');

    app.get('/api/reseller/erp/tag-editing/lookup', checkAuth, erpGate, modGate, async (req, res) => {
        try {
            const barcode = String(req.query.barcode || req.query.q || '').trim();
            if (!barcode) return res.status(400).json({ error: 'barcode required' });
            const row = await findPieceByScan(query, req.user.id, barcode);
            if (!row) return res.json({ found: false, piece: null });
            res.json({ found: true, piece: mapPiece(row) });
        } catch (e) {
            console.error('tag-editing lookup:', e);
            res.status(500).json({ error: e.message || 'Lookup failed' });
        }
    });

    app.patch(
        '/api/reseller/erp/tag-editing/:pieceId',
        checkAuth,
        erpGate,
        modGate,
        requireJson,
        async (req, res) => {
            try {
                const pieceId = parseInt(String(req.params.pieceId), 10);
                if (!Number.isFinite(pieceId)) {
                    return res.status(400).json({ error: 'Invalid piece id' });
                }
                const patch = normalizePatch(req.body?.fields || req.body);
                if (!Object.keys(patch).length) {
                    return res.status(400).json({ error: 'No fields to update' });
                }

                const rows = await query(
                    `SELECT * FROM reseller_erp_stock_pieces
                     WHERE id = $1 AND reseller_user_id = $2 LIMIT 1`,
                    [pieceId, req.user.id],
                );
                if (!rows.length) return res.status(404).json({ error: 'Stock piece not found' });
                const existing = rows[0];
                if (existing.status === 'sold') {
                    return res.status(400).json({ error: 'Sold tags cannot be edited here. Use sales return if needed.' });
                }

                if (patch.barcode && String(patch.barcode).trim().toLowerCase() !== String(existing.barcode).trim().toLowerCase()) {
                    const dup = await query(
                        `SELECT id FROM reseller_erp_stock_pieces
                         WHERE reseller_user_id = $1 AND lower(trim(barcode)) = lower(trim($2)) AND id <> $3
                         LIMIT 1`,
                        [req.user.id, patch.barcode, pieceId],
                    );
                    if (dup.length) {
                        return res.status(409).json({ error: 'Barcode already exists on another tag' });
                    }
                }

                const payloadMerge = {};
                if (patch.chain_wt_only !== undefined) payloadMerge.chain_wt_only = patch.chain_wt_only;
                if (patch.pendant_wt_only !== undefined) payloadMerge.pendant_wt_only = patch.pendant_wt_only;
                if (patch.earring_wt_only !== undefined) payloadMerge.earring_wt_only = patch.earring_wt_only;

                const sets = [];
                const params = [];
                let p = 1;
                const assign = (col, val) => {
                    sets.push(`${col} = $${p++}`);
                    params.push(val);
                };

                const simpleCols = [
                    'status',
                    'barcode',
                    'sku',
                    'style_code',
                    'product_name',
                    'size',
                    'avg_weight',
                    'gross_weight',
                    'bag_wt',
                    'purity',
                    'wastage_pct',
                    'mc_rate',
                    'mc_type',
                    'pcs',
                    'box_charges',
                    'stone_charges',
                    'stone_wt',
                    'metal_type',
                    'item_code',
                    'image_url',
                    'attr_color',
                    'attr_stone',
                    'fixed_price',
                    'bags',
                    'mc_rate_slab_r',
                    'mc_rate_slab_w',
                    'mc_rate_slab_f',
                    'metal_slab_r_pct',
                    'metal_slab_w_pct',
                    'metal_slab_f_pct',
                    'rfid_tag',
                ];
                for (const col of simpleCols) {
                    if (patch[col] !== undefined) assign(col, patch[col]);
                }
                if (Object.keys(payloadMerge).length) {
                    sets.push(`payload_json = COALESCE(payload_json, '{}'::jsonb) || $${p++}::jsonb`);
                    params.push(JSON.stringify(payloadMerge));
                }
                sets.push('updated_at = NOW()');

                params.push(pieceId, req.user.id);
                const sql = `UPDATE reseller_erp_stock_pieces SET ${sets.join(', ')}
                     WHERE id = $${p++} AND reseller_user_id = $${p}
                     RETURNING *`;
                const updated = await query(sql, params);
                const piece = mapPiece(updated[0]);
                const itemCode = piece.item_code || existing.item_code;
                if (itemCode) {
                    try {
                        await syncStockAlertCounts(query, req.user.id, itemCode);
                    } catch {
                        /* best-effort */
                    }
                }
                res.json({ success: true, piece });
            } catch (e) {
                console.error('tag-editing patch:', e);
                res.status(500).json({ error: e.message || 'Update failed' });
            }
        },
    );
}

module.exports = { registerTagEditingRoutes };
